package hub

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

// DefaultWSOrigins are browser Origins allowed for /ws when no env override expands the set.
var DefaultWSOrigins = []string{
	"http://127.0.0.1:8040",
	"http://localhost:8040",
}

// BuildOriginChecker returns a websocket CheckOrigin that allowlists known village hosts.
// Empty Origin is allowed (non-browser clients). Optional env VILLAGE_WS_ORIGINS is a
// comma-separated list of extra Origins. Same-host (Origin host == request Host) is also allowed.
func BuildOriginChecker(extra []string) func(*http.Request) bool {
	allowed := make(map[string]struct{})
	for _, o := range DefaultWSOrigins {
		allowed[strings.TrimRight(o, "/")] = struct{}{}
	}
	for _, o := range extra {
		o = strings.TrimSpace(o)
		if o != "" {
			allowed[strings.TrimRight(o, "/")] = struct{}{}
		}
	}
	if env := strings.TrimSpace(os.Getenv("VILLAGE_WS_ORIGINS")); env != "" {
		for _, o := range strings.Split(env, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				allowed[strings.TrimRight(o, "/")] = struct{}{}
			}
		}
	}
	return func(r *http.Request) bool {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			return true // non-browser / curl clients
		}
		origin = strings.TrimRight(origin, "/")
		if _, ok := allowed[origin]; ok {
			return true
		}
		u, err := url.Parse(origin)
		if err != nil || u.Host == "" {
			return false
		}
		reqHost := r.Host
		if reqHost == "" {
			return false
		}
		if strings.EqualFold(u.Host, reqHost) {
			return true
		}
		oh, _, _ := strings.Cut(u.Host, ":")
		rh, _, _ := strings.Cut(reqHost, ":")
		return strings.EqualFold(oh, rh) && oh != ""
	}
}
