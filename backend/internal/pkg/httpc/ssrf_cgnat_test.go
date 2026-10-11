package httpc

import (
	"context"
	"testing"
)

// CGNAT space (100.64.0.0/10) is not public and must be rejected.
func TestValidateRequestURLRejectsCGNAT(t *testing.T) {
	if err := ValidateRequestURL(context.Background(), "http://100.100.100.200/", false); err == nil {
		t.Fatal("expected error for CGNAT address, got nil")
	}
}
