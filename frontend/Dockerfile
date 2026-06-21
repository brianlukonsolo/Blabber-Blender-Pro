# ---------- Stage 1: build the React app ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci

# Build the production bundle.
COPY . .
ARG BUILD_VERSION=local-docker-build
RUN npm run build && \
    printf '{"buildVersion":"%s","builtBy":"docker-vite","builtAt":"%s"}\n' "$BUILD_VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/build-info.json

# ---------- Stage 2: serve with nginx ----------
FROM nginx:1.27-alpine AS runtime
ARG BUILD_VERSION=local-docker-build
LABEL org.opencontainers.image.title="Blabber-Blender Pro" \
      org.opencontainers.image.description="Browser text-to-speech workspace built by Vite inside Docker" \
      org.opencontainers.image.version="$BUILD_VERSION"

# SPA-friendly nginx config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled static assets.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Simple healthcheck so docker-compose can report readiness.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
