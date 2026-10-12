package handler

import (
	"time"

	"github.com/gin-gonic/gin"
)

// oidcLoginLimit rate-limits GET /oidc/login per client IP. Every request
// stores a pending state, and the store evicts the oldest at its cap, so an
// unthrottled flood would evict real logins. It reuses loginLimiter, counting
// each request as an attempt, on its own instance so password logins are
// unaffected.
func (h *Handler) oidcLoginLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if h.oidcLimiter == nil {
			return
		}
		ip := c.ClientIP()
		now := time.Now()
		if allowed, retryAfter := h.oidcLimiter.allow(ip, now); !allowed {
			tooManyRequestsError(c, retryAfter)
			c.Abort()
			return
		}
		h.oidcLimiter.recordFailure(ip, now)
	}
}
