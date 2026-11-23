package handler

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/0x2E/fusion/internal/auth"
	"github.com/gin-gonic/gin"
)

const oidcPendingCookie = "oidc_pending"

// The signed cookie carries the login state so a /login flood cannot evict it.
func (h *Handler) setPendingCookie(c *gin.Context, value string, maxAge int) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     oidcPendingCookie,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   isSecureRequest(c.Request),
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *Handler) authMethods(c *gin.Context) {
	dataResponse(c, gin.H{
		"password": h.passwordEnabled,
		"oidc":     h.oidcAuth != nil,
	})
}

func (h *Handler) oidcLogin(c *gin.Context) {
	if h.oidcAuth == nil {
		badRequestError(c, "OIDC is not configured")
		return
	}

	authURL, pending, err := h.oidcAuth.AuthURL(h.oidcRedirectURI(c.Request))
	if err != nil {
		internalError(c, err, "oidc auth url")
		return
	}
	h.setPendingCookie(c, pending, int(auth.PendingMaxAge.Seconds()))

	dataResponse(c, gin.H{"auth_url": authURL})
}

// oidcRedirectURI resolves the callback URL for one login request. Without an
// explicit FUSION_OIDC_REDIRECT_URI it is derived from the request so the same
// deployment works under any host name or scheme a proxy serves it on. The IdP
// only accepts registered redirect URIs, so a spoofed Host fails there.
func (h *Handler) oidcRedirectURI(r *http.Request) string {
	if redirectURI := strings.TrimSpace(h.config.OIDCRedirectURI); redirectURI != "" {
		return redirectURI
	}

	scheme := "http"
	if isSecureRequest(r) {
		scheme = "https"
	}

	return scheme + "://" + r.Host + "/api/oidc/callback"
}

func (h *Handler) oidcCallback(c *gin.Context) {
	if h.oidcAuth == nil {
		badRequestError(c, "OIDC is not configured")
		return
	}

	pending, _ := c.Cookie(oidcPendingCookie)
	h.setPendingCookie(c, "", -1) // single use, whatever the outcome

	state := c.Query("state")
	code := c.Query("code")
	if state == "" || code == "" {
		c.Redirect(http.StatusTemporaryRedirect, "/login?error=oidc_failed")
		return
	}

	userID, err := h.oidcAuth.Callback(c.Request.Context(), state, code, pending)
	if err != nil {
		slog.Error("OIDC callback failed", "error", err)
		c.Redirect(http.StatusTemporaryRedirect, "/login?error=oidc_failed")
		return
	}

	slog.Info("OIDC login successful", "user", userID)
	h.createSession(c)
	c.Redirect(http.StatusTemporaryRedirect, "/")
}
