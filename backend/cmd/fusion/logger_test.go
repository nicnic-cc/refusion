package main

import (
	"context"
	"log/slog"
	"testing"

	"github.com/0x2E/fusion/internal/config"
)

// A lower-case log level such as "debug" must enable debug logging.
func TestSetupLoggerAcceptsLowercaseLevel(t *testing.T) {
	prev := slog.Default()
	t.Cleanup(func() { slog.SetDefault(prev) })

	setupLogger(&config.Config{LogLevel: "debug"})
	if !slog.Default().Enabled(context.Background(), slog.LevelDebug) {
		t.Fatal("expected debug level enabled for LogLevel \"debug\"")
	}
}
