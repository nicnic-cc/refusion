package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/0x2E/fusion/internal/auth"
)

func newOIDCIssuer(t *testing.T) string {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                 srv.URL,
			"authorization_endpoint": srv.URL + "/auth",
			"token_endpoint":         srv.URL + "/token",
			"jwks_uri":               srv.URL + "/jwks",
		})
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func loginFrom(h http.Handler, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/oidc/login", nil)
	req.RemoteAddr = remoteAddr
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// A flood of /oidc/login from one client is throttled with 429 before it can
// evict another user's pending login state.
func TestOIDCLoginFloodIsRateLimitedAndKeepsRealState(t *testing.T) {
	a, err := auth.NewOIDC(context.Background(), newOIDCIssuer(t), "client", "secret", "http://localhost/cb")
	if err != nil {
		t.Fatalf("new oidc: %v", err)
	}
	h := &Handler{oidcAuth: a, oidcLimiter: newLoginLimiter(10, 60, 300)}
	r := newTestRouter()
	r.GET("/api/oidc/login", h.oidcLoginLimit(), h.oidcLogin)

	w := loginFrom(r, "198.51.100.1:1000")
	var body struct {
		Data struct {
			AuthURL string `json:"auth_url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); w.Code != http.StatusOK || err != nil {
		t.Fatalf("real login: code=%d err=%v body=%s", w.Code, err, w.Body.String())
	}
	u, err := url.Parse(body.Data.AuthURL)
	if err != nil {
		t.Fatalf("parse auth url: %v", err)
	}
	realState := u.Query().Get("state")

	limited := false
	for i := 0; i < 1500; i++ {
		if loginFrom(r, "203.0.113.9:2000").Code == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Fatal("flood from one client was never rate limited")
	}

	// The IdP is a stub without a token endpoint: failing at the exchange
	// step means the state was still pending.
	_, err = a.Callback(context.Background(), realState, "code")
	if err == nil || strings.Contains(err.Error(), "invalid or expired state") {
		t.Fatalf("real pending state lost: %v", err)
	}
}
