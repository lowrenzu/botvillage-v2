package avatars

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestPathAndHandler(t *testing.T) {
	root := t.TempDir()
	id := "cb63cb89-8fcf-4dac-b76d-e415c90b4341"
	dir := filepath.Join(root, id)
	_ = os.MkdirAll(dir, 0o755)
	png := filepath.Join(dir, "avatar.png")
	_ = os.WriteFile(png, []byte("\x89PNG\r\n"), 0o644)

	r := Resolver{AgentsDir: root}
	if !r.Has(id) {
		t.Fatal("Has")
	}
	if r.Path(id) != png {
		t.Fatalf("path %s", r.Path(id))
	}
	if r.Path("../etc") != "" {
		t.Fatal("path traversal")
	}

	h := http.StripPrefix("/avatars/", r.Handler())
	req := httptest.NewRequest(http.MethodGet, "/avatars/"+id, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("status %d", rr.Code)
	}
	if got := rr.Body.String(); got != "\x89PNG\r\n" {
		t.Fatalf("body %q", got)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/avatars/missing-not-uuid", nil)
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != 404 {
		t.Fatalf("want 404 got %d", rr2.Code)
	}
}
