// Package avatars locates and serves bot profile pictures.
package avatars

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Resolver finds avatar files under agents/{id}/.
type Resolver struct {
	AgentsDir string
}

// Path returns the avatar file path for id, or empty if none.
func (r Resolver) Path(id string) string {
	id = SanitizeID(id)
	if id == "" {
		return ""
	}
	base := filepath.Join(r.AgentsDir, id)
	for _, name := range []string{"avatar.png", "avatar.jpg", "avatar.jpeg", "avatar.webp"} {
		p := filepath.Join(base, name)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

// Has reports whether an avatar file exists.
func (r Resolver) Has(id string) bool {
	return r.Path(id) != ""
}

// Handler serves GET /avatars/{id}.
func (r Resolver) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet && req.Method != http.MethodHead {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(req.URL.Path, "/")
		id = strings.Trim(id, "/")
		// allow /avatars/{id} when mounted at /avatars/
		if i := strings.IndexByte(id, '/'); i >= 0 {
			id = id[:i]
		}
		p := r.Path(id)
		if p == "" {
			http.NotFound(w, req)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=60")
		http.ServeFile(w, req, p)
	})
}

var uuidLike = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// SanitizeID rejects empty ids, path traversal, and non-UUID ids.
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
