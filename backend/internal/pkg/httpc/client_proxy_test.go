package httpc

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A per-feed proxy on loopback is user-configured and must be reachable even when
// private feed targets are disallowed.
func TestNewClientAllowsLoopbackProxy(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	defer proxy.Close()

	client, err := NewClient(5*time.Second, proxy.URL, false)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	resp, err := client.Get("http://feeds.invalid.example/rss")
	if err != nil {
		t.Fatalf("expected request via loopback proxy to succeed, got: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}
