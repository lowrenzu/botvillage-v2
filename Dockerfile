# botvillage — multi-stage image (no secrets baked in)
# webhook.json must be mounted at runtime; never COPY it.

# --- frontend (Vite / React / R3F) ---
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# vite.config outDir: ../static
RUN npm run build

# --- Go binary (embeds static/) ---
FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY internal/ ./internal/
COPY --from=web /src/static ./static
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/botvillage .

# --- small runtime ---
FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
  && adduser -D -H -u 10001 village \
  && mkdir -p /app /data \
  && chown -R village:village /app
WORKDIR /app
COPY --from=builder /out/botvillage /app/botvillage
# Intentionally no webhook.json / AGENT_DATA / secrets in the image.
ENV AGENT_DATA=/data
EXPOSE 8040
USER village
CMD ["/app/botvillage", "--listen", "0.0.0.0:8040"]
