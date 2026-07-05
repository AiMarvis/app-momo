package middleware

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
)

func mustPrefix(t *testing.T, s string) netip.Prefix {
	t.Helper()
	p, err := netip.ParsePrefix(s)
	if err != nil {
		t.Fatalf("invalid prefix %q: %v", s, err)
	}
	return p
}

func resolveWith(t *testing.T, trusted []netip.Prefix, remote, xff, xri string) string {
	t.Helper()
	return resolveWithHeaders(t, trusted, remote, xff, xri, "")
}

func resolveWithHeaders(t *testing.T, trusted []netip.Prefix, remote, xff, xri, cf string) string {
	t.Helper()
	mw := ClientIP(trusted)
	var got string
	handler := mw(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got = requestctx.ClientIP(r.Context())
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = remote
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	if xri != "" {
		req.Header.Set("X-Real-IP", xri)
	}
	if cf != "" {
		req.Header.Set("CF-Connecting-IP", cf)
	}
	handler.ServeHTTP(httptest.NewRecorder(), req)
	return got
}

func TestClientIP_DirectConnectionIgnoresHeaders(t *testing.T) {
	// No trusted proxies → spoofed XFF must not win over RemoteAddr.
	got := resolveWith(t, nil, "203.0.113.5:54321", "1.2.3.4", "5.6.7.8")
	if got != "203.0.113.5" {
		t.Fatalf("expected RemoteAddr (203.0.113.5), got %q", got)
	}
}

func TestClientIP_TrustedProxyExtractsRealClient(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "10.0.0.0/8")}
	// Proxy at 10.0.0.5 forwarded original client 198.51.100.7.
	got := resolveWith(t, trusted, "10.0.0.5:8080", "198.51.100.7", "")
	if got != "198.51.100.7" {
		t.Fatalf("expected real client (198.51.100.7), got %q", got)
	}
}

func TestClientIP_SkipsTrustedProxiesInChain(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "10.0.0.0/8"), mustPrefix(t, "192.168.0.0/16")}
	// Chain: [client, edge_proxy, internal_proxy] with two of ours at the
	// tail. Real client is the leftmost non-trusted entry.
	got := resolveWith(t, trusted, "10.0.0.5:8080", "198.51.100.7, 192.168.1.1, 10.0.0.5", "")
	if got != "198.51.100.7" {
		t.Fatalf("expected real client (198.51.100.7), got %q", got)
	}
}

func TestClientIP_RejectsSpoofWhenInjectedThroughTrustedProxy(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "10.0.0.0/8")}
	// Attacker sets `X-Forwarded-For: 9.9.9.9` on a request the LB then
	// appends to: `X-Forwarded-For: 9.9.9.9, 198.51.100.7`. The walk picks
	// the rightmost non-trusted IP — which is the LB-observed real client
	// (198.51.100.7), NOT the attacker-supplied 9.9.9.9.
	got := resolveWith(t, trusted, "10.0.0.5:8080", "9.9.9.9, 198.51.100.7", "")
	if got != "198.51.100.7" {
		t.Fatalf("expected LB-appended IP (198.51.100.7), got %q", got)
	}
}

func TestClientIP_FallsBackToXRealIPWhenNoXFF(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "10.0.0.0/8")}
	got := resolveWith(t, trusted, "10.0.0.5:8080", "", "203.0.113.99")
	if got != "203.0.113.99" {
		t.Fatalf("expected X-Real-IP (203.0.113.99), got %q", got)
	}
}

func TestClientIP_AllProxiesTrustedFallsBackToRemoteAddr(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "10.0.0.0/8")}
	// Pathological: every entry in the chain is trusted. Best we can do is
	// surface the closest hop (RemoteAddr) instead of returning empty.
	got := resolveWith(t, trusted, "10.0.0.5:8080", "10.0.0.6, 10.0.0.5", "")
	if got != "10.0.0.5" {
		t.Fatalf("expected RemoteAddr fallback (10.0.0.5), got %q", got)
	}
}

func TestClientIP_MalformedXFFEntrySkipped(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "10.0.0.0/8")}
	got := resolveWith(t, trusted, "10.0.0.5:8080", "not-an-ip, 198.51.100.7", "")
	if got != "198.51.100.7" {
		t.Fatalf("expected to skip malformed entry and return 198.51.100.7, got %q", got)
	}
}

func TestClientIP_CFConnectingIPTrumpsXFFWhenPeerTrusted(t *testing.T) {
	// Cloudflare Tunnel topology: cloudflared sits in the local Docker
	// network, so its RemoteAddr is private. CF-Connecting-IP carries the
	// real client verbatim and should win over any XFF guesswork.
	trusted := []netip.Prefix{mustPrefix(t, "172.16.0.0/12")}
	got := resolveWithHeaders(t, trusted, "172.18.0.3:12345", "9.9.9.9", "", "198.51.100.42")
	if got != "198.51.100.42" {
		t.Fatalf("expected CF-Connecting-IP (198.51.100.42), got %q", got)
	}
}

func TestClientIP_CFConnectingIPIgnoredWhenPeerUntrusted(t *testing.T) {
	// A direct internet peer can forge CF-Connecting-IP — ignore it when
	// the peer itself isn't in the trusted list.
	got := resolveWithHeaders(t, nil, "203.0.113.5:54321", "", "", "1.2.3.4")
	if got != "203.0.113.5" {
		t.Fatalf("expected RemoteAddr (203.0.113.5), got %q", got)
	}
}

func TestClientIP_CFConnectingIPMalformedFallsBackToXFF(t *testing.T) {
	trusted := []netip.Prefix{mustPrefix(t, "172.16.0.0/12")}
	got := resolveWithHeaders(t, trusted, "172.18.0.3:12345", "198.51.100.7", "", "not-an-ip")
	if got != "198.51.100.7" {
		t.Fatalf("expected XFF fallback (198.51.100.7), got %q", got)
	}
}
