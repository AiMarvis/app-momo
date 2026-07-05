// Package requestctx holds context-key plumbing shared between HTTP
// middleware and downstream handlers. It deliberately has zero
// non-stdlib dependencies and no business logic so any package in the
// service can import it without creating cycles.
package requestctx

import "context"

type clientIPKey struct{}

// WithClientIP returns ctx with the resolved client IP attached. Intended
// for HTTP middleware to call once per request.
func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, clientIPKey{}, ip)
}

// ClientIP returns the client IP attached by `WithClientIP`. Returns ""
// when the middleware did not run (e.g. background goroutines, missing
// wiring) — callers that audit IPs should treat empty as "unknown" rather
// than fabricate a value.
func ClientIP(ctx context.Context) string {
	if ip, ok := ctx.Value(clientIPKey{}).(string); ok {
		return ip
	}
	return ""
}
