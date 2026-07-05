package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
)

// Logging emits a structured access log per request at Info level. Wraps
// ResponseWriter to capture status + bytes so operators can distinguish
// success from failure in production logs. Depends on ClientIP + RequestID
// running earlier in the chain — empty values indicate a wiring bug rather
// than a valid fallback.
func Logging(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			lw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(lw, r)
			log.Info("request handled",
				"method", r.Method,
				"path", r.URL.Path,
				"status", lw.status,
				"bytes", lw.bytes,
				"duration_ms", time.Since(start).Milliseconds(),
				"client_ip", requestctx.ClientIP(r.Context()),
				"user_agent", r.UserAgent(),
				"request_id", requestctx.RequestID(r.Context()),
			)
		})
	}
}

// loggingResponseWriter records status + body size without altering the
// write path. `wroteHeader` mirrors net/http's own WriteHeader guard so
// double-calls (common when handlers use both Write and WriteHeader) don't
// desync our captured status from the actual one on the wire.
type loggingResponseWriter struct {
	http.ResponseWriter
	status      int
	bytes       int
	wroteHeader bool
}

func (w *loggingResponseWriter) WriteHeader(status int) {
	if !w.wroteHeader {
		w.status = status
		w.wroteHeader = true
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *loggingResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.wroteHeader = true
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

// Flush preserves streaming semantics for handlers (Connect server-streaming,
// SSE) that type-assert the ResponseWriter into http.Flusher. Without this
// wrapper, chunks would buffer until the handler returns.
func (w *loggingResponseWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
