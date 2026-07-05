package requestctx

import "context"

type requestIDKey struct{}

// WithRequestID returns ctx with the per-request correlation ID attached.
// Intended for the RequestID middleware to call once per request.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestID returns the ID attached by `WithRequestID`. Returns "" when the
// middleware did not run (e.g. background goroutines, missing wiring) —
// log call sites should emit the empty string rather than fabricate a value.
func RequestID(ctx context.Context) string {
	if id, ok := ctx.Value(requestIDKey{}).(string); ok {
		return id
	}
	return ""
}
