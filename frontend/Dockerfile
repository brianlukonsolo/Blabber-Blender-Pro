# ---------- Stage 1: build the React app ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm install

# Build the production bundle.
COPY . .
RUN npm run build

# ---------- Stage 2: serve with nginx ----------
FROM nginx:1.27-alpine AS runtime

# SPA-friendly nginx config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled static assets.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Simple healthcheck so docker-compose can report readiness.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
