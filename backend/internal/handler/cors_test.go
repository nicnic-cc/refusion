package handler

import (
	"net/http"
	"testing"

	"github.com/0x2E/fusion/internal/config"
	"github.com/gin-gonic/gin"
)

func TestCORSMiddleware(t *testing.T) {
	tests := []struct {
		name            string
		method          string
		origin          string
		secFetchSite    string
		allowedOrigins  []string
		wantStatus      int
		wantAllowOrigin string
	}{
		{
			name:            "allows configured origin",
			method:          http.MethodOptions,
			origin:          "https://app.example.com",
			allowedOrigins:  []string{"https://app.example.com"},
			wantStatus:      http.StatusNoContent,
			wantAllowOrigin: "https://app.example.com",
		},
		{
			name:           "rejects disallowed origin",
			method:         http.MethodGet,
			origin:         "https://evil.example.com",
			allowedOrigins: []string{"https://app.example.com"},
			wantStatus:     http.StatusForbidden,
		},
		{
			name:            "allows any origin when not configured",
			method:          http.MethodGet,
			origin:          "https://any.example.com",
			allowedOrigins:  nil,
			wantStatus:      http.StatusOK,
			wantAllowOrigin: "https://any.example.com",
		},
		{
			name:           "allows opaque origin on same-origin request",
			method:         http.MethodPost,
			origin:         "null",
			secFetchSite:   "same-origin",
			allowedOrigins: []string{"https://app.example.com"},
			wantStatus:     http.StatusOK,
		},
		{
			name:           "rejects opaque origin without fetch metadata",
			method:         http.MethodPost,
			origin:         "null",
			allowedOrigins: []string{"https://app.example.com"},
			wantStatus:     http.StatusForbidden,
		},
		{
			name:           "rejects disallowed origin on cross-site request",
			method:         http.MethodPost,
			origin:         "https://evil.example.com",
			secFetchSite:   "cross-site",
			allowedOrigins: []string{"https://app.example.com"},
			wantStatus:     http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := &Handler{config: &config.Config{CORSAllowedOrigins: tt.allowedOrigins}}

			r := newTestRouter()
			r.Use(h.corsMiddleware())
			r.Any("/api/test", func(c *gin.Context) { c.Status(http.StatusOK) })
			headers := map[string]string{"Origin": tt.origin}
			if tt.secFetchSite != "" {
				headers["Sec-Fetch-Site"] = tt.secFetchSite
			}
			w := performRequest(r, tt.method, "/api/test", nil, headers)

			if w.Code != tt.wantStatus {
				t.Fatalf("expected status %d, got %d", tt.wantStatus, w.Code)
			}
			if tt.wantAllowOrigin == "" {
				return
			}
			if got := w.Header().Get("Access-Control-Allow-Origin"); got != tt.wantAllowOrigin {
				t.Fatalf("expected allow-origin header %q, got %q", tt.wantAllowOrigin, got)
			}
		})
	}
}
