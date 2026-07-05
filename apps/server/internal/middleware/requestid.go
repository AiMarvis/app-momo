package middleware

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
)

// RequestIDHeader is the canonical header both clients and upstream proxies
// (LB, CDN) use to carry a correlation ID.
const RequestIDHeader = "X-Request-ID"

// maxRequestIDLen bounds inbound header values so a malicious client cannot
// pad log lines. 128 chars covers UUIDs, trace spans, and short prefixes
// with headroom; anything larger is discarded and we generate our own.
const maxRequestIDLen = 128

// RequestID attaches a stable correlation ID to every request context and
// echoes it back in the response header. Honors a client-supplied
// `X-Request-ID` so log lines stitch with whatever upstream trace set it;
// falls back to a fresh UUIDv4 otherwise.
//
// Placed at the outermost edge of the middleware chain (only inside
// recovery-adjacent plumbing) so every downstream log entry — access log,
// rate-limit warnings, auth refresh events, panic recovery — can tag the
// same request_id and operators can correlate across middleware.
func RequestID() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get(RequestIDHeader)
			if id == "" || len(id) > maxRequestIDLen {
				id = uuid.NewString()
			}
			w.Header().Set(RequestIDHeader, id)
			ctx := requestctx.WithRequestID(r.Context(), id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
