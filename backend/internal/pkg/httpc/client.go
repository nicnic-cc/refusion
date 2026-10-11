package httpc

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"syscall"
	"time"
)

type clientPool struct {
	mu      sync.RWMutex
	clients map[string]*http.Client
}

var defaultClientPool = &clientPool{clients: make(map[string]*http.Client)}

// NewClient creates HTTP client with specified timeout and optional proxy.
// Clients are reused by (timeout, proxy, allowPrivate) to keep connections warm.
func NewClient(timeout time.Duration, proxyURL string, allowPrivate bool) (*http.Client, error) {
	key := proxyURL + "|" + strconv.FormatInt(timeout.Milliseconds(), 10) + "|" + strconv.FormatBool(allowPrivate)

	defaultClientPool.mu.RLock()
	if client, ok := defaultClientPool.clients[key]; ok {
		defaultClientPool.mu.RUnlock()
		return client, nil
	}
	defaultClientPool.mu.RUnlock()

	transport := &http.Transport{
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          128,
		MaxIdleConnsPerHost:   16,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: timeout,
	}
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	// Checking the resolved IP at connect time closes the DNS-rebinding window.
	// A configured proxy is admin-trusted, and net/http dials the proxy address, so skip it.
	if !allowPrivate && proxyURL == "" {
		dialer.Control = publicOnlyControl
	}
	transport.DialContext = dialer.DialContext

	if proxyURL != "" {
		proxy, err := url.Parse(proxyURL)
		if err != nil {
			return nil, err
		}
		transport.Proxy = http.ProxyURL(proxy)
	}

	client := &http.Client{
		Timeout:       timeout,
		Transport:     transport,
		CheckRedirect: redirectValidator(allowPrivate),
	}

	defaultClientPool.mu.Lock()
	if existing, ok := defaultClientPool.clients[key]; ok {
		defaultClientPool.mu.Unlock()
		transport.CloseIdleConnections()
		return existing, nil
	}
	defaultClientPool.clients[key] = client
	defaultClientPool.mu.Unlock()

	return client, nil
}

const maxRedirects = 10

func redirectValidator(allowPrivate bool) func(req *http.Request, via []*http.Request) error {
	return func(req *http.Request, via []*http.Request) error {
		// Replaces net/http's default cap, so it has to be re-applied here.
		if len(via) >= maxRedirects {
			return fmt.Errorf("stopped after %d redirects", maxRedirects)
		}
		if req == nil || req.URL == nil {
			return nil
		}

		return ValidateRequestURL(req.Context(), req.URL.String(), allowPrivate)
	}
}

// publicOnlyControl runs on the address the dialer is about to connect to, after DNS resolution.
func publicOnlyControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("invalid dial address: %w", err)
	}
	ip := net.ParseIP(host)
	if ip == nil || isPrivateOrLocalIP(ip) {
		return fmt.Errorf("private host is not allowed")
	}
	return nil
}

func validateDialTarget(ctx context.Context, addr string, allowPrivate bool) error {
	if allowPrivate {
		return nil
	}

	host := addr
	if parsedHost, _, err := net.SplitHostPort(addr); err == nil {
		host = parsedHost
	}

	return validatePublicHost(ctx, host)
}

// SetDefaultHeaders adds default headers required for feed fetching.
func SetDefaultHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "fusion/1.0")
}
