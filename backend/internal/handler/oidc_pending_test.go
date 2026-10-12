package handler

import (
	"context"
	"encoding/json"
	"fmt"
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

func newOIDCTestRouter(t *testing.T) (http.Handler, *auth.OIDCAuthenticator) {
	t.Helper()
	a, err := auth.NewOIDC(context.Background(), newOIDCIssuer(t), "client", "secret", "http://localhost/cb")
	if err != nil {
		t.Fatalf("new oidc: %v", err)
	}
	h := &Handler{oidcAuth: a}
	r := newTestRouter()
	_ = r.SetTrustedProxies(nil)
	r.GET("/api/oidc/login", h.oidcLogin)
	r.GET("/api/oidc/callback", h.oidcCallback)
	return r, a
}

func loginFrom(h http.Handler, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/api/oidc/login", nil)
	req.RemoteAddr = remoteAddr
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// startLogin returns the state from the auth URL and the pending cookie.
func startLogin(t *testing.T, h http.Handler, remoteAddr string) (string, *http.Cookie) {
	t.Helper()
	w := loginFrom(h, remoteAddr)
	var body struct {
		Data struct {
			AuthURL string `json:"auth_url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); w.Code != http.StatusOK || err != nil {
		t.Fatalf("login: code=%d err=%v body=%s", w.Code, err, w.Body.String())
	}
	u, err := url.Parse(body.Data.AuthURL)
	if err != nil {
		t.Fatalf("parse auth url: %v", err)
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == oidcPendingCookie {
			return u.Query().Get("state"), c
		}
	}
	t.Fatal("login set no pending cookie")
	return "", nil
}

// The IdP stub has no token endpoint: failing at the exchange means the
// state check passed.
func pendingAccepted(a *auth.OIDCAuthenticator, state string, c *http.Cookie) bool {
	_, err := a.Callback(context.Background(), state, "code", c.Value)
	return err != nil && strings.Contains(err.Error(), "token exchange")
}

// A real login survives a flood of logins from many IPv4 and IPv6 clients.
func TestOIDCDistributedFloodKeepsRealState(t *testing.T) {
	for _, tc := range []struct {
		name string
		addr func(i int) string
	}{
		{"100 IPv4 x 10", func(i int) string { return fmt.Sprintf("203.0.%d.%d:2000", i/10/250, (i/10)%250+1) }},
		{"one IPv6 /64", func(i int) string { return fmt.Sprintf("[2001:db8::%x]:2000", i+1) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r, a := newOIDCTestRouter(t)
			state, cookie := startLogin(t, r, "198.51.100.1:1000")
			for i := 0; i < 1500; i++ {
				if code := loginFrom(r, tc.addr(i)).Code; code != http.StatusOK {
					t.Fatalf("flood request %d: code %d", i, code)
				}
			}
			if !pendingAccepted(a, state, cookie) {
				t.Fatal("real pending login lost to the flood")
			}
		})
	}
}

// Behind a proxy without trusted proxies every client shares one IP; one
// client's requests must not block another's login.
func TestOIDCBehindProxyDoesNotBlockOthers(t *testing.T) {
	r, _ := newOIDCTestRouter(t)
	viaProxy := func(client string) int {
		req := httptest.NewRequest(http.MethodGet, "/api/oidc/login", nil)
		req.RemoteAddr = "172.18.0.2:4000"
		req.Header.Set("X-Forwarded-For", client)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	for i := 0; i < 50; i++ {
		viaProxy("203.0.113.66")
	}
	if code := viaProxy("198.51.100.7"); code != http.StatusOK {
		t.Fatalf("unrelated client got %d", code)
	}
}

func TestOIDCPendingCookieRejectsForgeryAndMismatch(t *testing.T) {
	r, a := newOIDCTestRouter(t)
	state, cookie := startLogin(t, r, "198.51.100.1:1000")
	otherState, otherCookie := startLogin(t, r, "198.51.100.2:1000")

	if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.MaxAge != 600 {
		t.Fatalf("cookie attributes: %+v", cookie)
	}
	cases := map[string]struct {
		state, value string
	}{
		"no cookie":          {state, ""},
		"other login cookie": {state, otherCookie.Value},
		"wrong state":        {otherState, cookie.Value},
		"tampered verifier":  {state, strings.Replace(cookie.Value, ".", ".x", 1)},
	}
	for name, tc := range cases {
		if _, err := a.Callback(context.Background(), tc.state, "code", tc.value); err == nil || strings.Contains(err.Error(), "token exchange") {
			t.Errorf("%s: accepted (err=%v)", name, err)
		}
	}
}

// The callback clears the pending cookie whatever the outcome.
func TestOIDCCallbackClearsPendingCookie(t *testing.T) {
	r, _ := newOIDCTestRouter(t)
	state, cookie := startLogin(t, r, "198.51.100.1:1000")
	req := httptest.NewRequest(http.MethodGet, "/api/oidc/callback?code=c&state="+url.QueryEscape(state), nil)
	req.AddCookie(cookie)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTemporaryRedirect {
		t.Fatalf("callback code %d", w.Code)
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == oidcPendingCookie && c.MaxAge < 0 {
			return
		}
	}
	t.Fatal("pending cookie not cleared")
}
