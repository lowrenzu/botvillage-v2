package roster

import (
	"os"
	"strings"
)

// DefaultAllowlist is empty: every agent under the local AGENT_DATA is shown.
// A clone must not inherit someone else's hidden ids.
var DefaultAllowlist = map[string]struct{}{}

// ExcludeSet reads VILLAGE_EXCLUDE (comma-separated agent ids).
// Empty unless the person running this install sets it. Never commit ids.
func ExcludeSet() map[string]struct{} {
	raw := strings.TrimSpace(os.Getenv("VILLAGE_EXCLUDE"))
	if raw == "" {
		return nil
	}
	out := make(map[string]struct{})
	for _, id := range strings.Split(raw, ",") {
		id = strings.TrimSpace(id)
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}


// AllowSet reads VILLAGE_ALLOW (comma-separated agent ids).
// Empty/unset = allow all (DefaultAllowlist). Never commit ids into the repo.
func AllowSet() map[string]struct{} {
	raw := strings.TrimSpace(os.Getenv("VILLAGE_ALLOW"))
	if raw == "" {
		return DefaultAllowlist
	}
	out := make(map[string]struct{})
	for _, id := range strings.Split(raw, ",") {
		id = strings.TrimSpace(id)
		if id != "" {
			out[id] = struct{}{}
		}
	}
	return out
}

// Allowed reports whether id is in the allowlist (nil/empty map = allow all)
// and not in VILLAGE_EXCLUDE.
func Allowed(id string, allow map[string]struct{}) bool {
	if _, skip := ExcludeSet()[id]; skip {
		return false
	}
	if allow == nil || len(allow) == 0 {
		return true
	}
	_, ok := allow[id]
	return ok
}

// FilterAllowed keeps bots that pass Allowed.
func FilterAllowed(bots []Bot, allow map[string]struct{}) []Bot {
	out := make([]Bot, 0, len(bots))
	for _, b := range bots {
		if Allowed(b.ID, allow) {
			out = append(out, b)
		}
	}
	return out
}
