package middleware

import (
	"log/slog"
	"net/http"

	"github.com/throttled/throttled/v2"
	"github.com/throttled/throttled/v2/store/memstore"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
	"github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/auth/v1/authv1connect"
)

// rateLimitStoreKeys caps how many distinct (path|ip) pairs the limiter
// remembers. The underlying store is an LRU, so once we hit the cap the
// oldest entries are evicted automatically — bounded memory without a
// background sweeper. 4096 covers thousands of active IPs across our
// handful of public endpoints with room for noise.
const rateLimitStoreKeys = 4096

// endpointRateLimits caps abuse on the public auth endpoints. Picked to give
// honest users headroom for typos / refresh storms while making automated
// brute-force / OTP-spam expensive enough to surface in logs before
// landing.
//
// Add new entries when introducing a public endpoint. Endpoints not listed
// here pass through with no rate limit applied.
//
// `MaxBurst` is the GCRA "extra requests beyond the steady rate" allowance
// — a `MaxRate=PerHour(5)+MaxBurst=4` quota lets a fresh IP make 5 calls
// up front before throttling kicks in (1 immediate + 4 burst), then 1
// every 12 minutes thereafter.
var endpointRateLimits = map[string]throttled.RateQuota{
	// Email-sending endpoints: tightest limit. Each call costs an SMTP
	// send and an OTP slot for the target email — cheap for an attacker
	// to spam, expensive for us.
	authv1connect.AuthServiceEmailAuthProcedure:   {MaxRate: throttled.PerHour(5), MaxBurst: 4},
	authv1connect.AuthServiceEmailResendProcedure: {MaxRate: throttled.PerHour(5), MaxBurst: 4},
	// Verify: brute-force needs many attempts. 30/hour with burst 4 lets a
	// honest user fix typos quickly while capping the search space an
	// attacker covers before being throttled (out of a 6-digit / 10^6
	// space).
	authv1connect.AuthServiceEmailVerifyProcedure: {MaxRate: throttled.PerHour(30), MaxBurst: 4},
	// Desktop OAuth flow: less abusable but still public.
	authv1connect.AuthServiceDesktopAuthURLProcedure:       {MaxRate: throttled.PerMin(1), MaxBurst: 9},
	authv1connect.AuthServiceExchangeDesktopTokenProcedure: {MaxRate: throttled.PerHour(30), MaxBurst: 4},
	authv1connect.AuthServiceRefreshDesktopTokenProcedure:  {MaxRate: throttled.PerMin(1), MaxBurst: 9},
	authv1connect.AuthServiceGoogleAuthURLProcedure:        {MaxRate: throttled.PerMin(1), MaxBurst: 9},
	authv1connect.AuthServiceGithubAuthURLProcedure:        {MaxRate: throttled.PerMin(1), MaxBurst: 9},
}

// RateLimit applies per-(IP + endpoint) limits to public auth endpoints.
//
// All endpoint limiters share a single LRU-backed store: lazy eviction on
// insert means memory stays bounded without a background sweeper goroutine
// (which would itself need panic recovery and shutdown coordination).
//
// Requests to paths missing from `endpointRateLimits` pass through. When a
// limit is exceeded the response is a Connect-protocol-shaped 429 so
// generated clients surface it as `CodeResourceExhausted` rather than an
// opaque transport error. CORS preflight OPTIONS short-circuits in `CORS`
// before reaching this middleware, so legitimate browser preflights never
// count against the limiter.
func RateLimit(log *slog.Logger) func(http.Handler) http.Handler {
	store, err := memstore.NewCtx(rateLimitStoreKeys)
	if err != nil {
		// memstore.NewCtx only fails on negative size; constant input
		// means a panic here is a programmer error, not runtime.
		panic("failed to create rate limit store: " + err.Error())
	}
	limiters := make(map[string]*throttled.GCRARateLimiterCtx, len(endpointRateLimits))
	for path, quota := range endpointRateLimits {
		limiter, err := throttled.NewGCRARateLimiterCtx(store, quota)
		if err != nil {
			panic("failed to create rate limiter for " + path + ": " + err.Error())
		}
		limiters[path] = limiter
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			limiter, ok := limiters[r.URL.Path]
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			ip := clientIP(r)
			// Multiple limiters share one store so the key must include the
			// path to keep per-endpoint quotas independent on the same IP.
			limited, _, err := limiter.RateLimitCtx(r.Context(), r.URL.Path+"|"+ip, 1)
			requestID := requestctx.RequestID(r.Context())
			if err != nil {
				log.Error("rate limit check failed", "ip", ip, "path", r.URL.Path, "request_id", requestID, "error", err)
				next.ServeHTTP(w, r)
				return
			}
			if limited {
				log.Warn("rate limit exceeded", "ip", ip, "path", r.URL.Path, "request_id", requestID)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"code":"resource_exhausted","message":"rate limit exceeded"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
