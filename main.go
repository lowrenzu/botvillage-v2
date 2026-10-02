package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"botvillage/internal/avatars"
	"botvillage/internal/demo"
	"botvillage/internal/hub"
	"botvillage/internal/roster"
	"botvillage/internal/tail"
	"botvillage/internal/skills"
	"botvillage/internal/webhook"
)

//go:embed all:static
var staticFS embed.FS

func main() {
	listen := flag.String("listen", "127.0.0.1:8040", "listen address (default loopback; pass 0.0.0.0:8040 only on purpose)")
	demoMode := flag.Bool("demo", false, "seed fake bots and append JSONL")
	agentData := flag.String("agent-data", envOr("AGENT_DATA", "."), "AGENT_DATA root")
	flag.Parse()

	rootDir, _ := os.Getwd()
	webhookPath := filepath.Join(rootDir, "webhook.json")
	wakesPath := filepath.Join(rootDir, "wakes.jsonl")

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	dataRoot := *agentData
	if *demoMode {
		demoRoot := filepath.Join(rootDir, "demo-data")
		n, err := demo.Setup(demoRoot)
		if err != nil {
			log.Fatalf("demo setup: %v", err)
		}
		dataRoot = demoRoot
		log.Printf("demo: %d bots under %s", n, demoRoot)
		go demo.Run(ctx, demoRoot)
	}

	rroot := roster.Root{AgentData: dataRoot}
	h := hub.New(rroot)
	if _, err := h.RefreshRoster(); err != nil {
		log.Printf("roster: %v", err)
	}

	tw := tail.New()
	if err := h.TrackAll(tw); err != nil {
		log.Printf("track: %v", err)
	}
	go func() {
		if err := tw.Run(ctx); err != nil && ctx.Err() == nil {
			log.Printf("tail: %v", err)
		}
	}()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case line := <-tw.Events():
				h.HandleLine(line)
			}
		}
	}()
	go func() {
		t := time.NewTicker(1 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				h.Tick()
			}
		}
	}()
	go func() {
		t := time.NewTicker(5 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if _, err := h.RefreshRoster(); err == nil {
					_ = h.TrackAll(tw)
					h.BroadcastRoster()
				}
			}
		}
	}()

	wh := webhook.New(webhookPath, wakesPath)
	_ = wh.Load()
	wh.EnsureWakesPerms()

	promptTok := resolvePromptToken()
	if promptTok == "" {
		log.Printf("prompt auth: open on this process (set VILLAGE_PROMPT_TOKEN before exposing the port)")
	} else {
		log.Printf("prompt auth: VILLAGE_PROMPT_TOKEN required (webhook key is never sent to the browser)")
	}

	mux := http.NewServeMux()
	registerRoutes(mux, routeDeps{
		demoMode:  *demoMode,
		rroot:     rroot,
		h:         h,
		wh:        wh,
		promptTok: promptTok,
		limiter:   newPromptLimiter(12),
		static:    staticFS,
	})

	srv := &http.Server{Addr: *listen, Handler: withLog(mux)}
	go func() {
		<-ctx.Done()
		shCtx, c := context.WithTimeout(context.Background(), 3*time.Second)
		defer c()
		_ = srv.Shutdown(shCtx)
	}()

	log.Printf("botvillage listening on http://%s (agent-data=%s demo=%v webhook=%v)", *listen, dataRoot, *demoMode, wh.Configured())
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

type routeDeps struct {
	demoMode  bool
	rroot     roster.Root
	h         *hub.Hub
	wh        *webhook.Client
	promptTok string
	limiter   *promptLimiter
	static    embed.FS
}

// promptLimiter caps POST /api/prompt per client address.
type promptLimiter struct {
	mu    sync.Mutex
	max   int
	hits  map[string][]time.Time
}

func newPromptLimiter(maxPerMin int) *promptLimiter {
	return &promptLimiter{max: maxPerMin, hits: map[string][]time.Time{}}
}

func (p *promptLimiter) allow(ip string) bool {
	if p == nil || p.max <= 0 {
		return true
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	cut := now.Add(-time.Minute)
	kept := p.hits[ip][:0]
	for _, t := range p.hits[ip] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= p.max {
		p.hits[ip] = kept
		return false
	}
	p.hits[ip] = append(kept, now)
	return true
}

func hostPort(addr string) (string, string, error) {
	return net.SplitHostPort(addr)
}


func registerRoutes(mux *http.ServeMux, d routeDeps) {
	sub, err := fs.Sub(d.static, "static")
	if err != nil {
		log.Fatal(err)
	}
	fileServer := http.FileServer(http.FS(sub))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			fileServer.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Never inject webhook key or prompt token into HTML.
		b, err := d.static.ReadFile("static/index.html")
		if err != nil {
			http.Error(w, "missing index", 500)
			return
		}
		_, _ = w.Write(b)
	})

	mux.HandleFunc("/ws", d.h.ServeWS)

	mux.HandleFunc("/api/bots", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET only", http.StatusMethodNotAllowed)
			return
		}
		bots, err := d.h.RefreshRoster()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		hub.EncodeBotsJSON(w, bots)
	})

	av := avatars.Resolver{AgentsDir: d.rroot.AgentsDir()}
	mux.Handle("/avatars/", http.StripPrefix("/avatars/", av.Handler()))

	mux.HandleFunc("/api/prompt", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if !d.limiter.allow(clientIP(r)) {
			http.Error(w, `{"error":"rate limit"}`, http.StatusTooManyRequests)
			return
		}
		if !checkPromptAuth(r, d.promptTok) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "unauthorized"})
			return
		}
		var body struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Prompt string `json:"prompt"`
			Action string `json:"action"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "bad json", 400)
			return
		}
		if len(body.Prompt) > 2000 {
			http.Error(w, `{"error":"prompt too long"}`, 400)
			return
		}
		body.ID = strings.TrimSpace(body.ID)
		body.Prompt = strings.TrimSpace(body.Prompt)

		if body.Action == "skip" {
			// skip probes: still require auth; sanitize id if present
			if body.ID != "" && roster.SanitizeID(body.ID) == "" {
				http.Error(w, `{"error":"invalid id"}`, 400)
				return
			}
			status, detail, err := d.wh.Post(webhook.Payload{Action: "skip", ID: body.ID, Name: body.Name, Prompt: body.Prompt})
			writePromptResult(w, status, detail, err)
			return
		}
		if body.ID == "" || body.Prompt == "" {
			http.Error(w, `{"error":"id and prompt required"}`, 400)
			return
		}
		if roster.SanitizeID(body.ID) == "" {
			http.Error(w, `{"error":"invalid id"}`, 400)
			return
		}
		if !d.rroot.Exists(body.ID) {
			http.Error(w, `{"error":"unknown agent"}`, 404)
			return
		}
		d.h.PromptOptimistic(body.ID)
		status, detail, err := d.wh.Post(webhook.Payload{
			ID:     body.ID,
			Name:   body.Name,
			Prompt: body.Prompt,
		})
		writePromptResult(w, status, detail, err)
	})

	mux.HandleFunc("/api/skills", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET only", http.StatusMethodNotAllowed)
			return
		}
		list := skills.Root{AgentData: d.rroot.AgentData}.List()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"skills": list})
	})

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":      true,
			"demo":    d.demoMode,
			"webhook": d.wh.Configured(),
			"bots":    len(d.h.Bots()),
		})
	})
}

// resolvePromptToken reads only VILLAGE_PROMPT_TOKEN.
// The webhook key stays on disk and is never copied into the page.
func resolvePromptToken() string {
	return strings.TrimSpace(os.Getenv("VILLAGE_PROMPT_TOKEN"))
}

func checkPromptAuth(r *http.Request, token string) bool {
	if token == "" {
		return true // local install: the listen address is the boundary
	}
	if h := strings.TrimSpace(r.Header.Get("X-Village-Token")); h != "" && h == token {
		return true
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(auth, "Bearer ") {
		if strings.TrimSpace(strings.TrimPrefix(auth, "Bearer ")) == token {
			return true
		}
	}
	return false
}

func clientIP(r *http.Request) string {
	host, _, err := splitHost(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func splitHost(addr string) (string, string, error) {
	return hostPort(addr)
}

func writePromptResult(w http.ResponseWriter, status int, detail string, err error) {
	w.Header().Set("Content-Type", "application/json")
	ok := err == nil
	code := 200
	if !ok {
		if status == 503 {
			code = 503
		} else {
			code = 502
		}
	}
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":     ok,
		"status": status,
		"detail": detail,
	})
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func withLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if r.URL.Path != "/ws" {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}
