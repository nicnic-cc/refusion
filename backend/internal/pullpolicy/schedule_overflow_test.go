package pullpolicy

import "testing"

// Many consecutive failures must clamp the delay to maxBackoff, not overflow.
func TestComputeNextCheckAtSecondsBackoffNoOverflow(t *testing.T) {
	now := int64(1_700_000_000)
	got := ComputeNextCheckAtSeconds(now, 1800, 172800, 70, 0, "", 0)
	if want := now + 172800; got != want {
		t.Fatalf("ComputeNextCheckAtSeconds() = %d (delay %d), want %d (delay 172800)", got, got-now, want)
	}
}
