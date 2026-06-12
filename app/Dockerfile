# syntax=docker/dockerfile:1.6
# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Vite needs build-time env vars (baked into the bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_N8N_INGESTION_WEBHOOK_URL
ARG VITE_SUPABASE_STORAGE_BUCKET
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_N8N_INGESTION_WEBHOOK_URL=$VITE_N8N_INGESTION_WEBHOOK_URL
ENV VITE_SUPABASE_STORAGE_BUCKET=$VITE_SUPABASE_STORAGE_BUCKET

RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
