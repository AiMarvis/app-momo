package middleware

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/throttled/throttled/v2"
)

func newSilentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestRateLimit_NotConfiguredPathsPassThrough(t *testing.T) {
	mw := RateLimit(newSilentLogger())
	called := false
	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if !called {
		t.Fatal("expected handler to be called for non-rate-limited path")
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestRateLimit_BlocksAfterBurst(t *testing.T) {
	// Override one entry with a tight quota so the test is fast and
	// deterministic. Restoring on exit keeps the package-level map clean
	// for any later tests in the same binary.
	//
	// GCRA semantics: PerHour(1) refills 1 token every 60 minutes; MaxBurst
	// of 1 lets a fresh IP make 2 calls back-to-back (1 immediate + 1
	// burst) before throttling.
	const path = "/kuku.auth.v1.AuthService/EmailAuth"
	original, hadOriginal := endpointRateLimits[path]
	endpointRateLimits[path] = throttled.RateQuota{
		MaxRate:  throttled.PerHour(1),
		MaxBurst: 1,
	}
	t.Cleanup(func() {
		if hadOriginal {
			endpointRateLimits[path] = original
		} else {
			delete(endpointRateLimits, path)
		}
	})

	// Chain through ClientIP middleware so the limiter sees the resolved
	// IP, matching the real server-chain order in
	// `internal/server/server.go`.
	handler := ClientIP(nil)(RateLimit(newSilentLogger())(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	send := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte("{}")))
		req.RemoteAddr = "203.0.113.5:12345"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	for i := range 2 {
		if rec := send(); rec.Code != http.StatusOK {
			t.Fatalf("burst[%d]: expected 200, got %d", i, rec.Code)
		}
	}
	rec := send()
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after burst, got %d (body: %q)", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected JSON content type on 429, got %q", got)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("resource_exhausted")) {
		t.Fatalf("expected Connect-shaped error envelope, got %q", rec.Body.String())
	}
}

func TestRateLimit_DistinctIPsHaveSeparateBuckets(t *testing.T) {
	const path = "/kuku.auth.v1.AuthService/EmailAuth"
	original, hadOriginal := endpointRateLimits[path]
	endpointRateLimits[path] = throttled.RateQuota{
		MaxRate:  throttled.PerHour(1),
		MaxBurst: 0,
	}
	t.Cleanup(func() {
		if hadOriginal {
			endpointRateLimits[path] = original
		} else {
			delete(endpointRateLimits, path)
		}
	})

	handler := ClientIP(nil)(RateLimit(newSilentLogger())(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	send := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		req.RemoteAddr = ip + ":12345"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}

	if got := send("203.0.113.5"); got != http.StatusOK {
		t.Fatalf("first ip first call: expected 200, got %d", got)
	}
	if got := send("203.0.113.5"); got != http.StatusTooManyRequests {
		t.Fatalf("first ip second call: expected 429, got %d", got)
	}
	if got := send("203.0.113.6"); got != http.StatusOK {
		t.Fatalf("second ip first call must not inherit first ip's bucket: got %d", got)
	}
}
