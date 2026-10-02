package hub

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"botvillage/internal/roster"
	"botvillage/internal/snippets"
	"botvillage/internal/tail"

	"github.com/gorilla/websocket"
)

const (
	workDuration = 4 * time.Second // demo / brief pulses; live uses transcriptWorkHold
	talkDuration = 3 * time.Second
)

// Activity is pushed to browsers; Bubble may carry a short sanitized reply snippet.
type Activity struct {
	Type    string       `json:"type"` // state|roster|ping|bubble
	AgentID string       `json:"agentId,omitempty"`
	State   string       `json:"state,omitempty"`
	Role    string       `json:"role,omitempty"`
	Bubble  string       `json:"bubble,omitempty"`
	Bots    []roster.Bot `json:"bots,omitempty"`
}

type botRuntime struct {
	bot         roster.Bot
	lastEvent   time.Time
	until       time.Time
	gatewayHold bool // set while SyncGatewayRunning last saw isRunning for this bot
}

// Hub fans out roster + activity to websocket clients.
type Hub struct {
	Root roster.Root

	mu      sync.Mutex
	bots    map[string]*botRuntime
	clients map[*websocket.Conn]struct{}

	upgrader websocket.Upgrader

	// lastGatewaySig logs when the set of gateway-busy roster names changes
	lastGatewaySig string
}

func New(root roster.Root) *Hub {
	h := &Hub{
		Root:    root,
		bots:    make(map[string]*botRuntime),
		clients: make(map[*websocket.Conn]struct{}),
		upgrader: websocket.Upgrader{
			CheckOrigin: BuildOriginChecker(nil),
		},
	}
	return h
}

func (h *Hub) RefreshRoster() ([]roster.Bot, error) {
	list, err := h.Root.List()
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	seen := make(map[string]struct{}, len(list))
	out := make([]roster.Bot, 0, len(list))
	now := time.Now()
	for _, b := range list {
		seen[b.ID] = struct{}{}
		if rt, ok := h.bots[b.ID]; ok {
			// preserve runtime state / last role
			b.State = rt.bot.State
			b.LastRole = rt.bot.LastRole
			b.X, b.Y = rt.bot.X, rt.bot.Y
			b.Updated = rt.bot.Updated
			rt.bot = b
			out = append(out, b)
		} else {
			b.State = "idle"
			b.Updated = now
			h.bots[b.ID] = &botRuntime{bot: b, lastEvent: now}
			out = append(out, b)
		}
	}
	for id := range h.bots {
		if _, ok := seen[id]; !ok {
			delete(h.bots, id)
		}
	}
	return out, nil
}

func (h *Hub) Bots() []roster.Bot {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]roster.Bot, 0, len(h.bots))
	for _, rt := range h.bots {
		out = append(out, rt.bot)
	}
	return out
}

func (h *Hub) HandleLine(line tail.Line) {
	kind, role := snippets.ClassifyLine(line.Data)
	h.mu.Lock()
	rt, ok := h.bots[line.AgentID]
	if !ok {
		h.mu.Unlock()
		return
	}
	now := time.Now()
	rt.lastEvent = now
	if role != "" {
		rt.bot.LastRole = role
	}
	var state string
	var bubble string
	switch kind {
	case snippets.KindUser:
		state = "talk"
		// brief clean user prompt when extractable; never invent
		bubble = snippets.SnippetText(line.Data)
		rt.until = now.Add(transcriptTalkHold)
	case snippets.KindTool:
		state = "work"
		// concrete tool name when extractable; empty better than "Travaille"
		bubble = snippets.SnippetText(line.Data)
		rt.until = now.Add(transcriptWorkHold)
	case snippets.KindAssist:
		state = "talk"
		// real assistant prose only — never GenericChatter / status filler
		bubble = snippets.SnippetText(line.Data)
		rt.until = now.Add(transcriptTalkHold)
	default:
		state = "walk"
		rt.until = now.Add(5 * time.Second)
	}
	rt.bot.State = state
	rt.bot.Updated = now
	// walk toward a "work" spot near home
	if state == "work" || state == "walk" {
		rt.bot.X = rt.bot.HomeX + 18
		rt.bot.Y = rt.bot.HomeY - 8
	} else if state == "talk" {
		rt.bot.X = rt.bot.HomeX + 6
		rt.bot.Y = rt.bot.HomeY + 4
	}
	act := Activity{
		Type:    "state",
		AgentID: line.AgentID,
		State:   state,
		Role:    rt.bot.LastRole,
		Bubble:  bubble,
	}
	h.mu.Unlock()
	h.broadcast(act)
}

// Tick clears expired transcript holds and syncs gateway isRunning.
// Never invents zzz/walk — busy only from gateway or real transcript lines.
func (h *Hub) Tick() {
	h.SyncGatewayRunning()
	h.mu.Lock()
	now := time.Now()
	var acts []Activity
	for id, rt := range h.bots {
		changed := false
		if !rt.until.IsZero() && now.After(rt.until) {
			rt.until = time.Time{}
			rt.bot.State = "idle"
			rt.bot.X, rt.bot.Y = rt.bot.HomeX, rt.bot.HomeY
			changed = true
		}
		// Kill lingering invented naps: no gateway/transcript signal for zzz.
		if rt.bot.State == "zzz" && !rt.gatewayHold {
			rt.bot.State = "idle"
			rt.bot.X, rt.bot.Y = rt.bot.HomeX, rt.bot.HomeY
			changed = true
		}
		if changed {
			rt.bot.Updated = now
			acts = append(acts, Activity{
				Type:    "state",
				AgentID: id,
				State:   rt.bot.State,
				Role:    rt.bot.LastRole,
			})
		}
	}
	h.mu.Unlock()
	for _, a := range acts {
		h.broadcast(a)
	}
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()

	bots, _ := h.RefreshRoster()
	_ = conn.WriteJSON(Activity{Type: "roster", Bots: bots})

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
		_ = conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			return
		}
	}
}

func (h *Hub) broadcast(a Activity) {
	h.mu.Lock()
	defer h.mu.Unlock()
	dead := make([]*websocket.Conn, 0)
	for c := range h.clients {
		if err := c.WriteJSON(a); err != nil {
			dead = append(dead, c)
		}
	}
	for _, c := range dead {
		delete(h.clients, c)
		_ = c.Close()
	}
}

func (h *Hub) BroadcastRoster() {
	bots := h.Bots()
	h.broadcast(Activity{Type: "roster", Bots: bots})
}

// PromptOptimistic marks a bot as walking/talking after a user prompt.
func (h *Hub) PromptOptimistic(id string) {
	h.mu.Lock()
	rt, ok := h.bots[id]
	if !ok {
		h.mu.Unlock()
		return
	}
	now := time.Now()
	rt.lastEvent = now
	rt.until = now.Add(talkDuration)
	rt.bot.State = "talk"
	rt.bot.X = rt.bot.HomeX + 10
	rt.bot.Y = rt.bot.HomeY
	rt.bot.Updated = now
	act := Activity{Type: "state", AgentID: id, State: "talk", Role: rt.bot.LastRole, Bubble: ""}
	h.mu.Unlock()
	h.broadcast(act)
}

// PromptRollback undoes PromptOptimistic when /api/prompt fails (webhook/grok error).
func (h *Hub) PromptRollback(id string) {
	h.mu.Lock()
	rt, ok := h.bots[id]
	if !ok {
		h.mu.Unlock()
		return
	}
	now := time.Now()
	rt.lastEvent = now
	rt.until = now
	rt.bot.State = "idle"
	rt.bot.X = rt.bot.HomeX
	rt.bot.Y = rt.bot.HomeY
	rt.bot.Updated = now
	act := Activity{Type: "state", AgentID: id, State: "idle", Role: rt.bot.LastRole, Bubble: ""}
	h.mu.Unlock()
	h.broadcast(act)
}

// TrackAll registers transcript paths on the watcher.
func (h *Hub) TrackAll(w *tail.Watcher) error {
	bots, err := h.RefreshRoster()
	if err != nil {
		return err
	}
	for _, b := range bots {
		if b.Transcript != "" {
			if err := w.Track(b.ID, b.Transcript); err != nil {
				log.Printf("track %s: %v", b.ID, err)
			}
		}
	}
	w.AddDir(h.Root.AgentsDir())
	return nil
}

// EncodeBotsJSON helper for /api/bots
func EncodeBotsJSON(w http.ResponseWriter, bots []roster.Bot) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"bots": bots})
}
