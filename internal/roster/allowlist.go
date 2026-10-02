package roster

// DefaultAllowlist is empty: all agents under AGENT_DATA are allowed
// unless listed in DefaultExclude.
var DefaultAllowlist = map[string]struct{}{}

// DefaultExclude hides habitat / Sims side bots from the live bureau roster.
// Open by default otherwise — not a fixed allowlist.
var DefaultExclude = map[string]struct{}{
	"92eb4cb2-b322-465a-8c32-da3d95c2fd0c": {}, // Atelier Sims
	"724c6013-726c-43f9-b2a6-13fb7f039576": {}, // Georges Habitat
	"0f82e5f4-125a-4b4e-afd8-ac73ebe1663b": {}, // Dossiers Habitat
}

// Allowed reports whether id is in the allowlist (nil/empty map = allow all)
// and not in DefaultExclude.
func Allowed(id string, allow map[string]struct{}) bool {
	if _, skip := DefaultExclude[id]; skip {
		return false
	}
	if allow == nil || len(allow) == 0 {
		return true
	}
	_, ok := allow[id]
	return ok
}

// FilterAllowed keeps bots that pass Allowed (allow nil/empty = no allow filter;
// DefaultExclude always applies).
func FilterAllowed(bots []Bot, allow map[string]struct{}) []Bot {
	out := make([]Bot, 0, len(bots))
	for _, b := range bots {
		if Allowed(b.ID, allow) {
			out = append(out, b)
		}
	}
	return out
}
