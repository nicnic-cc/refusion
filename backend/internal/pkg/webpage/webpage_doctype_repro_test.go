package webpage

import (
	"strings"
	"testing"
)

// The <base> never goes before the doctype, which must stay first.
func TestInjectBaseKeepsDoctypeFirst(t *testing.T) {
	const baseURL = "https://example.com/"

	t.Run("no head or html tag", func(t *testing.T) {
		got := string(InjectBase([]byte("<!doctype html><title>x</title><p>hi"), baseURL))
		if !strings.HasPrefix(got, "<!doctype html>") || !strings.Contains(got, "<base ") {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("control: with head", func(t *testing.T) {
		got := string(InjectBase([]byte("<!doctype html><html><head><title>x</title></head>"), baseURL))
		if !strings.HasPrefix(got, "<!doctype html><html><head><base ") {
			t.Fatalf("got %q", got)
		}
	})
}
