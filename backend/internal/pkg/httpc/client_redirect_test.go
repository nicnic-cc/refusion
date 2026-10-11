package httpc

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// A redirect loop must be cut off after a small number of hops (<= 11 requests).
func TestClientCapsRedirects(t *testing.T) {
	var hits atomic.Int64
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Redirect(w, r, srv.URL+"/loop", http.StatusFound)
	}))
	defer srv.Close()

	client, err := NewClient(3*time.Second, "", true)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	resp, err := client.Get(srv.URL + "/loop")
	if resp != nil {
		resp.Body.Close()
	}
	if err == nil {
		t.Fatal("expected redirect loop to error")
	}
	if n := hits.Load(); n > 11 {
		t.Fatalf("expected <= 11 hits, got %d (error: %v)", n, err)
	}
}
