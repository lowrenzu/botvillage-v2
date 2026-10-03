package hub

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	// liveWorkHold keeps bureau "work" while gateway reports isRunning between polls.
	// Longer than Tick (1s) + HTTP budget so a single slow/failed poll does not drop busy.
	liveWorkHold = 8 * time.Second
	// transcriptWorkHold: real JSONL lines should stick longer than a 4s blink.
	transcriptWorkHold = 45 * time.Second
	transcriptTalkHold = 20 * time.Second
)

type gatewayFile struct {
	Port   int    `json:"port"`
	Token  string `json:"token"`
	Host   string `json:"host"`
	Scheme string `json:"scheme"`
}

type gatewayAgent struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	IsRunning          bool   `json:"isRunning"`
	IsRunningTurn      bool   `json:"isRunningTurn"`
	IsComposingMessage bool   `json:"isComposingMessage"`
	IsRetrying         bool   `json:"isRetrying"`
}

func (h *Hub) gatewayURL() (base string, token string, ok bool) {
	path := filepath.Join(h.Root.AgentData, "gateway.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", false
	}
	var g gatewayFile
	if json.Unmarshal(data, &g) != nil || g.Port == 0 {
		return "", "", false
	}
	scheme := g.Scheme
	if scheme == "" {
		scheme = "http"
	}
	host := g.Host
	if host == "" || host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	return scheme + "://" + host + ":" + strconv.Itoa(g.Port), g.Token, true
}

// decodeGatewayAgents accepts a bare array or {"agents":[...]} / {"data":[...]}.
func decodeGatewayAgents(r io.Reader) ([]gatewayAgent, error) {
	var raw json.RawMessage
	if err := json.NewDecoder(r).Decode(&raw); err != nil {
		return nil, err
	}
	var agents []gatewayAgent
	if err := json.Unmarshal(raw, &agents); err == nil {
		return agents, nil
	}
	var wrap struct {
		Agents []gatewayAgent `json:"agents"`
		Data   []gatewayAgent `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil, err
	}
	if len(wrap.Agents) > 0 {
		return wrap.Agents, nil
	}
	return wrap.Data, nil
}

// findRuntimeLocked resolves a gateway agent onto a roster bot.
// Prefer UUID id; fall back to case-insensitive unique name (uuid vs name mismatch).
// Caller must hold h.mu.
func (h *Hub) findRuntimeLocked(id, name string) *botRuntime {
	id = strings.TrimSpace(id)
	if id != "" {
		if rt, ok := h.bots[id]; ok {
			return rt
		}
		lower := strings.ToLower(id)
		if rt, ok := h.bots[lower]; ok {
			return rt
		}
		for _, rt := range h.bots {
			if strings.EqualFold(rt.bot.ID, id) {
				return rt
			}
		}
	}
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil
	}
	var match *botRuntime
	for _, rt := range h.bots {
		if strings.ToLower(strings.TrimSpace(rt.bot.Name)) == name {
			if match != nil {
				return nil // ambiguous name
			}
			match = rt
		}
	}
	return match
}

func gatewayBusy(a gatewayAgent) bool {
	return a.IsRunning || a.IsRunningTurn || a.IsComposingMessage || a.IsRetrying
}

// SyncGatewayRunning polls Grok Bot gateway listAgents and maps real
// isRunning / isRunningTurn / composing / retrying → bureau state "work"
// for EVERY matching roster bot (id or unique name).
// No fake invention: agents not busy on gateway keep transcript holds, else idle.
func (h *Hub) SyncGatewayRunning() {
	base, token, ok := h.gatewayURL()
	if !ok {
		return
	}
	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest(http.MethodPost, base+"/api/listAgents", bytes.NewReader([]byte("{}")))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return
	}
	agents, err := decodeGatewayAgents(resp.Body)
	if err != nil {
		return
	}

	now := time.Now()
	var acts []Activity
	busyRosterIDs := make(map[string]struct{})
	seenRosterIDs := make(map[string]struct{})
	var matchedNames []string
	var unmatched []string
	var mapLines []string

	h.mu.Lock()
	for _, a := range agents {
		busy := gatewayBusy(a)
		rt := h.findRuntimeLocked(a.ID, a.Name)
		label := a.Name
		if label == "" {
			label = a.ID
		}
		if rt == nil {
			if busy {
				unmatched = append(unmatched, label)
			}
			mapLines = append(mapLines, label+"(unmatched id="+a.ID+" run="+strconv.FormatBool(a.IsRunning)+")")
			continue
		}
		seenRosterIDs[rt.bot.ID] = struct{}{}
		mapped := rt.bot.State
		if busy {
			busyRosterIDs[rt.bot.ID] = struct{}{}
			matchedNames = append(matchedNames, rt.bot.Name)

			prev := rt.bot.State
			rt.gatewayHold = true
			rt.lastEvent = now
			// Extend hold; never shorten a longer transcript-driven until.
			holdUntil := now.Add(liveWorkHold)
			if holdUntil.After(rt.until) {
				rt.until = holdUntil
			}
			rt.bot.State = "work"
			rt.bot.Updated = now
			rt.bot.X = rt.bot.HomeX + 18
			rt.bot.Y = rt.bot.HomeY - 8
			mapped = "work"
			if prev != "work" {
				acts = append(acts, Activity{
					Type:    "state",
					AgentID: rt.bot.ID, // always roster id (not gateway id)
					State:   "work",
					Role:    rt.bot.LastRole,
				})
			}
		}
		mapLines = append(mapLines, rt.bot.Name+" id="+shortID8(rt.bot.ID)+" run="+strconv.FormatBool(a.IsRunning)+" busy="+strconv.FormatBool(busy)+"→"+mapped)
	}

	// Omitted ids are not an idle signal: keep gatewayHold (last isRunning)
	// and any transcript hold. Do not invent work for bots that are neither.
	// Seen and not running: idle only with no transcript hold. until past
	// liveWorkHold is a transcript hold; the 8s gateway bridge is not.
	for id, rt := range h.bots {
		if _, still := busyRosterIDs[id]; still {
			continue
		}
		if _, seen := seenRosterIDs[id]; !seen {
			continue
		}
		rt.gatewayHold = false
		transcriptHold := !rt.until.IsZero() && rt.until.After(now.Add(liveWorkHold))
		if transcriptHold {
			continue
		}
		if rt.bot.State == "zzz" || rt.bot.State == "work" {
			rt.until = time.Time{}
			rt.bot.State = "idle"
			rt.bot.X, rt.bot.Y = rt.bot.HomeX, rt.bot.HomeY
			rt.bot.Updated = now
			acts = append(acts, Activity{Type: "state", AgentID: id, State: "idle", Role: rt.bot.LastRole})
		}
	}

	sig := strings.Join(sortedCopy(matchedNames), ",") + "|" + strings.Join(mapLines, ";")
	changed := sig != h.lastGatewaySig
	if changed {
		h.lastGatewaySig = sig
	}
	h.mu.Unlock()

	if changed {
		log.Printf("gateway map: %s unmatched=%v", strings.Join(mapLines, " | "), unmatched)
	}

	for _, act := range acts {
		h.broadcast(act)
	}
}

func shortID8(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

func sortedCopy(in []string) []string {
	out := append([]string(nil), in...)
	sort.Strings(out)
	return out
}
