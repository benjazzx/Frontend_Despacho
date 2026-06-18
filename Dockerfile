# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_ENVIRONMENT=production
ARG VITE_LOG_LEVEL=info
ARG VITE_TIMEOUT=10000
ARG VITE_RETRY_ATTEMPTS=3
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT
ENV VITE_LOG_LEVEL=$VITE_LOG_LEVEL
ENV VITE_TIMEOUT=$VITE_TIMEOUT
ENV VITE_RETRY_ATTEMPTS=$VITE_RETRY_ATTEMPTS
RUN npm run build

# Stage 2: Runtime
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
