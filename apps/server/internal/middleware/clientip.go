package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
)

// ClientIP attaches the client's source IP to the request context so
// downstream handlers / middleware can audit + rate-limit on it.
//
// Resolution honors the trusted-proxy list:
//
//   - If the immediate TCP peer (`r.RemoteAddr`) is NOT in `trusted`, the
//     forwarding headers are ignored entirely and `RemoteAddr` is used.
//     This is the safe default — anyone on the internet can set
//     `X-Forwarded-For`, so trusting it without filtering hands attackers
//     audit-log poisoning and rate-limit bypass for free.
//
//   - If `RemoteAddr` IS trusted (our load balancer / cloudflared sidecar),
//     headers are consulted in the following order:
//     1. `CF-Connecting-IP` — set by the Cloudflare edge and preserved
//     through cloudflared. It's a single IP (the original client) and
//     Cloudflare overwrites any client-supplied value on ingress, so
//     when the peer is trusted this header is authoritative.
//     2. `X-Forwarded-For` — walked right to left, skipping entries that
//     are themselves in `trusted`. The first non-trusted IP is the
//     real client. If every entry is trusted (rare), fall back to
//     `RemoteAddr`.
//     3. `X-Real-IP` — a single-value alternative when the trusted proxy
//     uses that convention instead of XFF.
//
// `trusted` may be nil/empty — that's the common case for direct exposure
// or local dev. `Config.Validate` warns operators in production if the list
// is empty so a missing `TRUSTED_PROXIES` doesn't silently degrade.
func ClientIP(trusted []netip.Prefix) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := resolveClientIP(r, trusted)
			ctx := requestctx.WithClientIP(r.Context(), ip)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func resolveClientIP(r *http.Request, trusted []netip.Prefix) string {
	remote := remoteAddrIP(r.RemoteAddr)
	remoteAddr, _ := netip.ParseAddr(remote)

	if !addrInPrefixes(remoteAddr, trusted) {
		return remote
	}

	// CF-Connecting-IP is Cloudflare's single-value client-IP header. The
	// edge sets it unconditionally and cloudflared forwards it, so when
	// the peer is trusted we take it verbatim. Using this ahead of XFF
	// skips the chain-walking ambiguity entirely on CF-fronted deployments.
	if cf := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cf != "" {
		if _, err := netip.ParseAddr(cf); err == nil {
			return cf
		}
	}

	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(parts[i])
			if candidate == "" {
				continue
			}
			candidateAddr, err := netip.ParseAddr(candidate)
			if err != nil {
				// Malformed entry: treat as potentially-attacker-injected
				// and keep walking — the trusted proxy never produces
				// malformed entries, so this is either spoofed or noise.
				continue
			}
			if !addrInPrefixes(candidateAddr, trusted) {
				return candidate
			}
		}
	}
	if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}
	return remote
}

func remoteAddrIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

func addrInPrefixes(addr netip.Addr, prefixes []netip.Prefix) bool {
	if !addr.IsValid() {
		return false
	}
	for _, prefix := range prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}
