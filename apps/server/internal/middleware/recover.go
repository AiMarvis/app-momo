package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
)

// Recover traps panics from downstream middleware + handlers, logs them
// with enough context to triage offline, and returns a generic 500 to the
// client. Stack trace is captured inside the deferred func so it reflects
// the panic site rather than this wrapper.
func Recover(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.Error("panic recovered",
						"panic", rec,
						"method", r.Method,
						"path", r.URL.Path,
						"request_id", requestctx.RequestID(r.Context()),
						"stack", string(debug.Stack()),
					)
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
