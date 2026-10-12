package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// OIDCAuthenticator handles OIDC authentication with PKCE support.
type OIDCAuthenticator struct {
	provider     *oidc.Provider
	verifier     *oidc.IDTokenVerifier
	oauth2Config oauth2.Config
	allowedUser  string

	// Random per process: a login pending across a restart simply fails.
	pendingKey []byte
}

const stateMaxAge = 10 * time.Minute

func NewOIDC(ctx context.Context, issuer, clientID, clientSecret, redirectURI string) (*OIDCAuthenticator, error) {
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, fmt.Errorf("oidc provider discovery: %w", err)
	}

	oauth2Config := oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURI,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: clientID})

	pendingKey := make([]byte, 32)
	if _, err := rand.Read(pendingKey); err != nil {
		return nil, fmt.Errorf("generate pending key: %w", err)
	}

	return &OIDCAuthenticator{
		provider:     provider,
		verifier:     verifier,
		oauth2Config: oauth2Config,
		pendingKey:   pendingKey,
	}, nil
}

// SetAllowedUser restricts login to a specific user identity (email or sub claim).
func (a *OIDCAuthenticator) SetAllowedUser(user string) {
	a.allowedUser = user
}

// AuthURL generates an authorization URL with state and PKCE S256 challenge.
// The caller must store pending (state and verifier, signed) in a cookie and
// pass it back to Callback; the server keeps no per-login state.
func (a *OIDCAuthenticator) AuthURL() (authURL, pending string, err error) {
	state, err := randomString(32)
	if err != nil {
		return "", "", fmt.Errorf("generate state: %w", err)
	}
	codeVerifier, err := randomString(64)
	if err != nil {
		return "", "", fmt.Errorf("generate code verifier: %w", err)
	}

	challenge := s256Challenge(codeVerifier)
	url := a.oauth2Config.AuthCodeURL(state,
		oauth2.SetAuthURLParam("code_challenge", challenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
	return url, a.sealPending(state, codeVerifier, time.Now().Add(stateMaxAge)), nil
}

// PendingMaxAge is how long the pending cookie stays valid.
const PendingMaxAge = stateMaxAge

// Callback exchanges the authorization code for tokens and verifies the ID token.
// pending is the cookie value from AuthURL. Returns a user identifier (email or subject claim).
func (a *OIDCAuthenticator) Callback(ctx context.Context, state, code, pending string) (string, error) {
	codeVerifier, err := a.openPending(pending, state)
	if err != nil {
		return "", err
	}

	token, err := a.oauth2Config.Exchange(ctx, code,
		oauth2.SetAuthURLParam("code_verifier", codeVerifier),
	)
	if err != nil {
		return "", fmt.Errorf("token exchange: %w", err)
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return "", fmt.Errorf("no id_token in response")
	}

	idToken, err := a.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return "", fmt.Errorf("verify id_token: %w", err)
	}

	var claims struct {
		Email string `json:"email"`
		Sub   string `json:"sub"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return "", fmt.Errorf("parse claims: %w", err)
	}

	userID := claims.Email
	if userID == "" {
		userID = claims.Sub
	}

	if a.allowedUser != "" && userID != a.allowedUser && claims.Sub != a.allowedUser {
		return "", fmt.Errorf("user %q is not allowed", userID)
	}

	return userID, nil
}

// sealPending encodes "state.verifier.expiry" and appends an HMAC over it.
func (a *OIDCAuthenticator) sealPending(state, codeVerifier string, expires time.Time) string {
	payload := state + "." + codeVerifier + "." + strconv.FormatInt(expires.Unix(), 10)
	return payload + "." + a.mac(payload)
}

func (a *OIDCAuthenticator) openPending(pending, state string) (codeVerifier string, err error) {
	i := strings.LastIndexByte(pending, '.')
	if i < 0 || !hmac.Equal([]byte(a.mac(pending[:i])), []byte(pending[i+1:])) {
		return "", fmt.Errorf("invalid or missing pending login")
	}
	parts := strings.Split(pending[:i], ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid or missing pending login")
	}
	if subtle.ConstantTimeCompare([]byte(parts[0]), []byte(state)) != 1 {
		return "", fmt.Errorf("state mismatch")
	}
	expires, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > expires {
		return "", fmt.Errorf("state expired")
	}
	return parts[1], nil
}

func (a *OIDCAuthenticator) mac(payload string) string {
	m := hmac.New(sha256.New, a.pendingKey)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func randomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func s256Challenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
