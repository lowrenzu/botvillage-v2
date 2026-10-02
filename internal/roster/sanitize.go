package roster

import (
	"regexp"
	"strings"
)

// uuidLike matches standard UUID form (any version / variant hex).
var uuidLike = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// SanitizeID rejects empty, path traversal, separators, and non-UUID-like ids.
// Returns "" when invalid (same spirit as avatars.sanitizeID, plus UUID shape).
func SanitizeID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || strings.Contains(id, "..") || strings.ContainsAny(id, `/\`) {
		return ""
	}
	if !uuidLike.MatchString(id) {
		return ""
	}
	return id
}

// ValidID reports whether id passes SanitizeID.
func ValidID(id string) bool {
	return SanitizeID(id) != ""
}
