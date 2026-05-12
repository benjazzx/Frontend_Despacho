# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
ARG VITE_VENTAS_URL=http://localhost:8080
ARG VITE_DESPACHOS_URL=http://localhost:8081
ENV VITE_VENTAS_URL=$VITE_VENTAS_URL
ENV VITE_DESPACHOS_URL=$VITE_DESPACHOS_URL
RUN npm run build

# Stage 2: Runtime
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
