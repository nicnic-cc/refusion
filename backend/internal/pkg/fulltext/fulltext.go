// Package fulltext fetches a web page and extracts its readable article.
package fulltext

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	readability "codeberg.org/readeck/go-readability/v2"

	"github.com/0x2E/fusion/internal/pkg/httpc"
)

// maxPageBytes bounds memory per request; larger pages are cut off, not rejected.
const maxPageBytes = 5 << 20

type Article struct {
	Title   string
	Content string
}

// Fetch downloads pageURL with client and returns its extracted article HTML.
// Non-2xx responses are rejected because readability happily "extracts" error pages.
func Fetch(ctx context.Context, client *http.Client, pageURL string) (Article, error) {
	base, err := url.Parse(pageURL)
	if err != nil {
		return Article{}, fmt.Errorf("parse url: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return Article{}, err
	}
	httpc.SetDefaultHeaders(req)

	resp, err := client.Do(req)
	if err != nil {
		return Article{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return Article{}, fmt.Errorf("page fetch failed: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxPageBytes))
	if err != nil {
		return Article{}, err
	}

	parsed, err := readability.FromReader(bytes.NewReader(body), base)
	if err != nil {
		return Article{}, fmt.Errorf("extract article: %w", err)
	}

	var text bytes.Buffer
	if err := parsed.RenderText(&text); err != nil {
		return Article{}, fmt.Errorf("extract article: %w", err)
	}
	if strings.TrimSpace(text.String()) == "" {
		return Article{}, errors.New("no article content found")
	}

	var content bytes.Buffer
	if err := parsed.RenderHTML(&content); err != nil {
		return Article{}, fmt.Errorf("render article: %w", err)
	}

	return Article{Title: parsed.Title(), Content: content.String()}, nil
}
