# syntax=docker/dockerfile:1.7

# Build context is the repo root so the go.mod `replace` directive in
# apps/server (packages/contract => ../../packages/contract) can resolve
# the local contract module at compile time.

FROM golang:1.25-alpine AS builder

WORKDIR /build

# Copy both module manifests first so `go mod download` caches
# independently of source changes. packages/contract is the replace
# target; its manifest must be on disk before download runs.
COPY apps/server/go.mod apps/server/go.sum ./apps/server/
COPY packages/contract/go.mod packages/contract/go.sum ./packages/contract/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd apps/server && go mod download

# Copy sources after modules so edits to .go files don't bust the
# module-download cache layer above.
COPY apps/server ./apps/server
COPY packages/contract ./packages/contract

WORKDIR /build/apps/server

# -trimpath strips local filesystem paths from the binary, -s -w drops
# debug + DWARF info (~30% smaller). CGO off + GOOS=linux gives us a
# fully static binary that runs on distroless/static with no libc.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags="-s -w" \
      -o /server \
      ./cmd/server

# Final image: distroless/static ships ca-certs + tzdata + nonroot user,
# no shell, no package manager. Anything the binary needs at runtime
# has to be copied in explicitly.
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

# main.go reads migrations from the relative path "sql/migrations", so
# the filesystem layout around WORKDIR has to mirror apps/server/.
COPY --from=builder /server /app/server
COPY --from=builder /build/apps/server/sql /app/sql

USER nonroot:nonroot
EXPOSE 8080

# The binary implements its own `healthcheck` subcommand (see cmd/server
# main.go) that hits GET /health via loopback — doesn't need curl.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/app/server", "healthcheck"]

ENTRYPOINT ["/app/server"]
