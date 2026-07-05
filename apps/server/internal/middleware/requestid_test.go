package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kuku-mom/kuku/apps/server/internal/requestctx"
)

func TestRequestID_HonorsInboundHeader(t *testing.T) {
	t.Parallel()

	var seen string
	handler := RequestID()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = requestctx.RequestID(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set(RequestIDHeader, "trace-abc-123")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if seen != "trace-abc-123" {
		t.Fatalf("context id: got %q, want %q", seen, "trace-abc-123")
	}
	if got := rec.Header().Get(RequestIDHeader); got != "trace-abc-123" {
		t.Fatalf("response header: got %q, want %q", got, "trace-abc-123")
	}
}

func TestRequestID_GeneratesWhenMissing(t *testing.T) {
	t.Parallel()

	var seen string
	handler := RequestID()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = requestctx.RequestID(r.Context())
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if seen == "" {
		t.Fatal("generated id should not be empty")
	}
	if rec.Header().Get(RequestIDHeader) != seen {
		t.Fatalf("response header %q must match ctx value %q",
			rec.Header().Get(RequestIDHeader), seen)
	}
}

func TestRequestID_RejectsOverlongInbound(t *testing.T) {
	t.Parallel()

	var seen string
	handler := RequestID()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = requestctx.RequestID(r.Context())
	}))

	oversized := strings.Repeat("a", maxRequestIDLen+1)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set(RequestIDHeader, oversized)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if seen == oversized {
		t.Fatal("oversized inbound id should be discarded, not propagated")
	}
	if seen == "" {
		t.Fatal("middleware must still produce an id after discarding")
	}
}
