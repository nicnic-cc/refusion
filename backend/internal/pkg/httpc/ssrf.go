package httpc

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

func ValidateRequestURL(ctx context.Context, rawURL string, allowPrivate bool) error {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(rawURL))
	if err != nil {
		return fmt.Errorf("invalid url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("unsupported url scheme: %s", parsed.Scheme)
	}

	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("url host is required")
	}

	if !allowPrivate {
		if err := validatePublicHost(ctx, host); err != nil {
			return err
		}
	}

	return nil
}

func validatePublicHost(ctx context.Context, host string) error {
	if strings.EqualFold(host, "localhost") {
		return fmt.Errorf("private host is not allowed")
	}

	if ip := net.ParseIP(host); ip != nil {
		if isPrivateOrLocalIP(ip) {
			return fmt.Errorf("private host is not allowed")
		}
		return nil
	}

	resolveCtx := ctx
	if resolveCtx == nil {
		resolveCtx = context.Background()
	}

	lookupCtx, cancel := context.WithTimeout(resolveCtx, 2*time.Second)
	defer cancel()

	addrs, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
	if err != nil {
		return fmt.Errorf("resolve host: %w", err)
	}
	if len(addrs) == 0 {
		return fmt.Errorf("resolve host: no addresses")
	}

	for _, addr := range addrs {
		if isPrivateOrLocalIP(addr.IP) {
			return fmt.Errorf("private host is not allowed")
		}
	}

	return nil
}

// cgnat is shared address space (RFC 6598), not publicly routable.
var cgnat = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

func isPrivateOrLocalIP(ip net.IP) bool {
	return cgnat.Contains(ip) || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalMulticast() || ip.IsLinkLocalUnicast() || ip.IsMulticast() || ip.IsInterfaceLocalMulticast() || ip.IsUnspecified()
}
