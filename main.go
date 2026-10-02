package main

import (
	"context"
	"crypto/subtle"
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
	"sort"
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
	"botvillage/internal/grokbuild"
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
	gb := grokbuild.FromEnv(xaiPath())
	wh.EnsureWakesPerms()

	promptTok := resolvePromptToken()
	if promptTok == "" {
		log.Printf("prompt auth: loopback only without token (set VILLAGE_PROMPT_TOKEN or .prompt-token before exposing the port)")
	} else {
		log.Printf("prompt auth: non-loopback requires VILLAGE_PROMPT_TOKEN (webhook key is never sent to the browser)")
	}
	if os.Getenv("VILLAGE_LOCAL") == "1" && strings.HasPrefix(*listen, "0.0.0.0") {
		log.Printf("VILLAGE_LOCAL=1 with %s: remotes still need the prompt token (loopback peers only are open)", *listen)
	}

	mux := http.NewServeMux()
	registerRoutes(mux, routeDeps{
		demoMode:  *demoMode,
		rroot:     rroot,
		h:         h,
		wh:        wh,
		grok:      gb,
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
	cert, key := os.Getenv("VILLAGE_TLS_CERT"), os.Getenv("VILLAGE_TLS_KEY")
	var err error
	if cert != "" && key != "" {
		log.Printf("tls on")
		err = srv.ListenAndServeTLS(cert, key)
	} else {
		err = srv.ListenAndServe()
	}
	if err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

type routeDeps struct {
	demoMode  bool
	rroot     roster.Root
	h         *hub.Hub
	wh        *webhook.Client
	grok      grokbuild.Client
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
			if !authorized(r, d.promptTok) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		if !authorized(r, d.promptTok) {
			writeGate(w)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		b, err := d.static.ReadFile("static/index.html")
		if err != nil {
			http.Error(w, "missing index", 500)
			return
		}
		_, _ = w.Write(b)
	})

	mux.HandleFunc("/api/session", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if !d.limiter.allow(clientIP(r)) {
			http.Error(w, "rate limit", http.StatusTooManyRequests)
			return
		}
		if d.promptTok == "" {
			http.Error(w, "no token configured", http.StatusUnauthorized)
			return
		}
		_ = r.ParseForm()
		got := strings.TrimSpace(r.FormValue("token"))
		if got == "" {
			var body struct {
				Token string `json:"token"`
			}
			_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 512)).Decode(&body)
			got = strings.TrimSpace(body.Token)
		}
		if subtle.ConstantTimeCompare([]byte(got), []byte(d.promptTok)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "village_session",
			Value:    d.promptTok,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   60 * 60 * 24 * 30,
		})
		if r.Header.Get("Accept") == "application/json" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		http.Redirect(w, r, "/", http.StatusSeeOther)
	})

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, d.promptTok) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		d.h.ServeWS(w, r)
	})

	mux.HandleFunc("/api/bots", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, d.promptTok) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
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
	avHandler := http.StripPrefix("/avatars/", av.Handler())
	mux.Handle("/avatars/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, d.promptTok) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		avHandler.ServeHTTP(w, r)
	}))

	mux.HandleFunc("/api/prompt", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		if !d.limiter.allow(clientIP(r)) {
			http.Error(w, `{"error":"rate limit"}`, http.StatusTooManyRequests)
			return
		}
		if !authorized(r, d.promptTok) {
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
			Target string `json:"target"`
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
		if body.Target == "grok-build" || strings.EqualFold(body.Name, "grok") {
			text, err := d.grok.Reply(body.Prompt)
			if err != nil {
				d.h.PromptRollback(body.ID)
				writePromptResult(w, 502, err.Error(), err)
				return
			}
			_ = appendGrokLine(d.rroot.TranscriptPath(body.ID), text)
			writePromptResult(w, 200, truncate(text, 400), nil)
			return
		}
		status, detail, err := d.wh.Post(webhook.Payload{
			ID:     body.ID,
			Name:   body.Name,
			Prompt: body.Prompt,
		})
		if err != nil {
			d.h.PromptRollback(body.ID)
		}
		writePromptResult(w, status, detail, err)
	})

	mux.HandleFunc("/api/skills", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, d.promptTok) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
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
		allowed := roster.AllowSet()
		allowedIDs := make([]string, 0, len(allowed))
		for id := range allowed {
			allowedIDs = append(allowedIDs, id)
		}
		sort.Strings(allowedIDs)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":         true,
			"demo":       d.demoMode,
			"webhook":    d.wh.Configured(),
			"grokBuild":  d.grok.Configured(),
			"bots":       len(d.h.Bots()),
			"allowedIds": allowedIDs, // empty ⇒ no client-side filter (all roster bots)
		})
	})
}


func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func xaiPath() string {
	if p := os.Getenv("XAI_JSON"); p != "" {
		return p
	}
	return "xai.json"
}

func appendGrokLine(path, text string) error {
	if path == "" {
		return nil
	}
	line, _ := json.Marshal(map[string]string{"role": "assistant", "content": truncate(text, 500)})
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(line, '\n'))
	return err
}

// resolvePromptToken reads VILLAGE_PROMPT_TOKEN, else optional .prompt-token file.
// The webhook key stays on disk and is never copied into the page.
func resolvePromptToken() string {
	if t := strings.TrimSpace(os.Getenv("VILLAGE_PROMPT_TOKEN")); t != "" {
		return t
	}
	b, err := os.ReadFile(".prompt-token")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func checkPromptAuth(r *http.Request, token string) bool {
	if token == "" {
		return false
	}
	if h := strings.TrimSpace(r.Header.Get("X-Village-Token")); h != "" && subtle.ConstantTimeCompare([]byte(h), []byte(token)) == 1 {
		return true
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(auth, "Bearer ") {
		got := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		if subtle.ConstantTimeCompare([]byte(got), []byte(token)) == 1 {
			return true
		}
	}
	return false
}

// authorized allows loopback without a token.
// Non-loopback clients always need VILLAGE_PROMPT_TOKEN (header or village_session cookie),
// even when VILLAGE_LOCAL=1 (that flag must not open Tailscale/LAN peers).
func authorized(r *http.Request, token string) bool {
	if localRequest(r) {
		return true
	}
	if token == "" {
		return false
	}
	if checkPromptAuth(r, token) {
		return true
	}
	c, err := r.Cookie("village_session")
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(c.Value), []byte(token)) == 1
}

// localRequest is true only for loopback peers.
// VILLAGE_LOCAL=1 never bypasses auth for non-loopback (Tailscale / LAN) clients.
func localRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func writeGate(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Botvillage</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14120f;color:#f3efe6;font:16px/1.4 Georgia,serif}form{width:min(420px,92vw)}input,button{width:100%;box-sizing:border-box;margin-top:10px;padding:12px;border-radius:10px;border:1px solid #3a342c;background:#1c1916;color:inherit}button{background:#e07a3d;color:#1a120c;border:0;font-weight:600}</style><form method="post" action="/api/session"><h1>Bureau des agents</h1><p>Cette install n’est pas sur la machine. Jeton local, pas la clé webhook.</p><input name="token" type="password" autocomplete="off" required placeholder="VILLAGE_PROMPT_TOKEN"><button type="submit">Entrer</button></form>`))
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
