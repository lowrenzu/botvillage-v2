package hub

import (
	"net/http"
	"testing"
)

func TestBuildOriginChecker(t *testing.T) {
	check := BuildOriginChecker(nil)
	req := func(origin, host string) *http.Request {
		r, _ := http.NewRequest(http.MethodGet, "http://"+host+"/ws", nil)
		r.Host = host
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return r
	}
	if !check(req("", "127.0.0.1:8040")) {
		t.Fatal("empty origin allowed")
	}
	if !check(req("http://127.0.0.1:8040", "127.0.0.1:8040")) {
		t.Fatal("localhost ip")
	}
	if !check(req("http://localhost:8040", "localhost:8040")) {
		t.Fatal("localhost")
	}
	if check(req("http://evil.example:8040", "127.0.0.1:8040")) {
		t.Fatal("evil origin rejected")
	}
	// same-host fallback
	if !check(req("http://mybox:9000", "mybox:9000")) {
		t.Fatal("same host should pass")
	}
}
