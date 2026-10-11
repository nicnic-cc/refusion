package auth

import (
	"fmt"
	"testing"
)

// A flood of logins must not grow the pending-state map past the cap.
func TestAddStateCapsPendingStates(t *testing.T) {
	a := &OIDCAuthenticator{states: make(map[string]stateEntry)}

	total := maxPendingStates + 500
	for i := 0; i < total; i++ {
		a.addState(fmt.Sprintf("state-%d", i), "verifier")
	}

	if len(a.states) > 1000 {
		t.Fatalf("len(states) = %d, want <= 1000", len(a.states))
	}
	if _, ok := a.states[fmt.Sprintf("state-%d", total-1)]; !ok {
		t.Fatal("newest state was evicted")
	}
}
