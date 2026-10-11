package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/0x2E/fusion/internal/auth"
	"github.com/0x2E/fusion/internal/config"
)

func newOIDCOnlyHandler(t *testing.T) *Handler {
	t.Helper()
	hash, err := auth.HashPassword("")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	return &Handler{
		config:       &config.Config{Password: "", FeverUsername: "fusion", OIDCIssuer: "https://idp.invalid.example"},
		passwordHash: hash,
		feverAPIKey:  deriveFeverAPIKey("fusion", ""),
		allowAnonAPI: false,
		oidcAuth:     &auth.OIDCAuthenticator{},
		sessions:     make(map[string]int64),
		limiter:      newLoginLimiter(10, 60, 300),
	}
}

// With OIDC-only config (empty password), password login must be rejected.
func TestOIDCOnlyRejectsEmptyPasswordLogin(t *testing.T) {
	h := newOIDCOnlyHandler(t)
	r := newTestRouter()
	r.POST("/api/sessions", h.login)

	w := performRequest(r, http.MethodPost, "/api/sessions", strings.NewReader(`{"password":""}`),
		map[string]string{"Content-Type": "application/json"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", w.Code)
	}
}

// With OIDC-only config, the guessable Fever key md5("fusion:") must not authenticate.
func TestOIDCOnlyRejectsGuessableFeverKey(t *testing.T) {
	h := newOIDCOnlyHandler(t)
	r := newTestRouter()
	r.POST("/fever", h.fever)

	w := performRequest(r, http.MethodPost, "/fever",
		strings.NewReader(feverRequestBody(deriveFeverAPIKey("fusion", ""), nil)),
		map[string]string{"Content-Type": "application/x-www-form-urlencoded"})
	var payload map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if payload["auth"] != float64(0) {
		t.Fatalf("expected auth=0, got %#v", payload["auth"])
	}
}
