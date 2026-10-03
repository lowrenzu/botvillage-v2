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
	// fakeOptimistic is set only when PromptOptimistic invents a state.
	// PromptRollback may undo that and nothing else (never clobber gateway work).
	fakeOptimistic bool
	preOptimistic  string
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
		bubble = snippets.ActionLine(line.Data)
		rt.until = now.Add(transcriptTalkHold)
	case snippets.KindTool:
		state = "work"
		// Lit/Modifie/Consulte/Recherche only — never a chat sentence or a status word
		bubble = snippets.ActionLine(line.Data)
		rt.until = now.Add(transcriptWorkHold)
	case snippets.KindAssist:
		state = "talk"
		// action form only; a chat sentence is not a file read
		bubble = snippets.ActionLine(line.Data)
		rt.until = now.Add(transcriptTalkHold)
	default:
		// Unclassified JSONL must not invent walk/work/talk.
		// Idle only for an explicit idle signal, and never over gateway isRunning.
		if !snippets.IsExplicitIdle(line.Data) || rt.gatewayHold || rt.bot.State == "idle" {
			h.mu.Unlock()
			return
		}
		state = "idle"
		rt.until = time.Time{}
		rt.bot.X, rt.bot.Y = rt.bot.HomeX, rt.bot.HomeY
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
		// Gateway isRunning wins over an expired transcript hold.
		// A failed poll must not flash Idle while gatewayHold is still set.
		if rt.gatewayHold {
			if rt.until.IsZero() || !rt.until.After(now) {
				rt.until = now.Add(liveWorkHold)
			}
			if rt.bot.State != "work" {
				rt.bot.State = "work"
				rt.bot.X = rt.bot.HomeX + 18
				rt.bot.Y = rt.bot.HomeY - 8
				changed = true
			}
		} else if !rt.until.IsZero() && now.After(rt.until) {
			rt.until = time.Time{}
			if rt.bot.State != "idle" {
				rt.bot.State = "idle"
				rt.bot.X, rt.bot.Y = rt.bot.HomeX, rt.bot.HomeY
				changed = true
			}
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
	// No historical seed. A bubble is set only by HandleLine when a new
	// jsonl line arrives after tailing started (snippets.ActionLine).

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

// PromptOptimistic is a no-op: do not broadcast fake talk before gateway/transcript proof.
// Client tracks promptPhase (sent/acked) without inventing bvState=talk.
func (h *Hub) PromptOptimistic(id string) {
	_ = id
}

// PromptRollback undoes a fake PromptOptimistic state when /api/prompt fails.
// If nothing fake was applied, it is a no-op. Gateway isRunning=work is never overridden.
func (h *Hub) PromptRollback(id string) {
	h.mu.Lock()
	rt, ok := h.bots[id]
	if !ok || !rt.fakeOptimistic {
		h.mu.Unlock()
		return
	}
	rt.fakeOptimistic = false
	now := time.Now()
	rt.lastEvent = now
	var act Activity
	if rt.gatewayHold {
		rt.bot.State = "work"
		holdUntil := now.Add(liveWorkHold)
		if holdUntil.After(rt.until) {
			rt.until = holdUntil
		}
		rt.bot.X = rt.bot.HomeX + 18
		rt.bot.Y = rt.bot.HomeY - 8
		rt.bot.Updated = now
		act = Activity{Type: "state", AgentID: id, State: "work", Role: rt.bot.LastRole}
	} else {
		prev := rt.preOptimistic
		if prev != "work" && prev != "talk" && prev != "idle" {
			prev = "idle"
		}
		rt.bot.State = prev
		if prev == "idle" {
			rt.until = time.Time{}
			rt.bot.X, rt.bot.Y = rt.bot.HomeX, rt.bot.HomeY
		}
		rt.bot.Updated = now
		act = Activity{Type: "state", AgentID: id, State: prev, Role: rt.bot.LastRole, Bubble: ""}
	}
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
