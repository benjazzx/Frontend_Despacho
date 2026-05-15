# Frontend Despacho — Innovatech Chile

Aplicación web desarrollada en React + Vite que permite gestionar ventas y órdenes de despacho del sistema Innovatech Chile. Es el componente visual del proyecto, desplegado en AWS EC2 dentro de una subred pública, servido por nginx dentro de un contenedor Docker.

---

## ¿Qué hace esta aplicación?

Permite a los operadores de Innovatech Chile:
- **Ver ventas pendientes** de despacho (consumiendo el microservicio back-ventas)
- **Crear órdenes de despacho** asignando fecha y patente del camión (consumiendo back-despachos)
- **Cerrar despachos** registrando intentos de entrega
- Navegar entre vistas mediante React Router

---

## Tecnologías

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18.2 | Framework UI |
| Vite | 5.2 | Bundler y dev server |
| React Router DOM | 6.24 | Navegación SPA |
| Tailwind CSS | 3.4 | Estilos |
| Axios | 1.6 | Cliente HTTP |
| nginx (nginx-unprivileged) | alpine | Servidor web en producción |
| Docker | multi-stage | Empaquetado y despliegue |

---

## Arquitectura en producción (AWS)

```
Internet
    │
    ▼
┌──────────────────────────────────────────┐
│  ec2-web  (subred pública)               │
│  Elastic IP: 52.73.73.226               │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  Contenedor: frontend           │    │
│  │  nginx escucha en :8080         │    │
│  │  Host mapea 80 → 8080           │    │
│  └───────────────┬─────────────────┘    │
└──────────────────│───────────────────────┘
                   │ (subred privada VPC)
    ┌──────────────▼──────────────┐
    │  ec2-app  (10.0.9.120)      │
    │  back-ventas    :8080       │
    │  back-despachos :8081       │
    └──────────────┬──────────────┘
                   │
    ┌──────────────▼──────────────┐
    │  ec2-datos  (10.0.7.237)    │
    │  MySQL 8.0                  │
    └─────────────────────────────┘
```

El frontend nunca expone directamente las IPs del backend — nginx actúa como intermediario (reverse proxy) dentro del propio contenedor.

---

## Estructura del proyecto

```
front_despacho/
├── src/
│   ├── config/
│   │   └── api.js              # URLs base de los microservicios
│   ├── componentes/
│   │   ├── CrudAdmin/
│   │   │   ├── TableCompras.jsx       # Lista ventas sin despacho
│   │   │   ├── TableDespachos.jsx     # Lista despachos activos
│   │   │   ├── FormDespacho.jsx       # Crear nuevo despacho
│   │   │   └── FormCierreDespacho.jsx # Cerrar despacho
│   │   └── Layouts/            # Navbar, Footer, Carrusel
│   └── Routes/
│       └── AppRoutes.jsx        # Configuración de rutas React Router
├── Dockerfile                   # Multi-stage: node builder + nginx runtime
├── nginx.conf                   # Configuración nginx (SPA + reverse proxy)
├── docker-compose.yml           # Stack de desarrollo local
├── .github/
│   └── workflows/
│       └── deploy.yml          # Pipeline CI/CD → Docker Hub → EC2
└── .env.example                 # Plantilla de variables de entorno
```

---

## Decisiones arquitectónicas

### ¿Por qué Docker con multi-stage build?

El Dockerfile usa dos etapas separadas:

```dockerfile
# Stage 1: Build — imagen pesada solo para compilar
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime — imagen mínima para producción
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

- **Stage 1 (builder):** `node:20-alpine` (~400MB) descarga dependencias con `npm ci` y compila el bundle estático con `npm run build`. Esta imagen pesada **nunca llega a producción**.
- **Stage 2 (runtime):** `nginxinc/nginx-unprivileged:alpine` (~25MB) solo sirve los archivos estáticos compilados. No contiene Node.js, npm, ni código fuente.

**Resultado:** la imagen final es ~95% más pequeña y no expone herramientas de desarrollo en producción.

### ¿Por qué `nginx-unprivileged` y no la imagen oficial `nginx`?

La imagen oficial `nginx` necesita privilegios **root** para bindear el puerto 80. `nginx-unprivileged` está configurada para correr con un usuario sin privilegios en el puerto 8080 (que el host mapea a 80).

Esto aplica el principio de **mínimo privilegio**: si el contenedor fuera comprometido, el atacante no tendría acceso root al sistema host.

### ¿Por qué nginx actúa como reverse proxy hacia el backend?

Esta es la decisión más importante del proyecto. El archivo `nginx.conf` hace dos cosas:

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy hacia microservicio de ventas (subred privada)
    location /api/v1/ventas {
        proxy_pass http://10.0.9.120:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Proxy hacia microservicio de despachos (subred privada)
    location /api/v1/despachos {
        proxy_pass http://10.0.9.120:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Servir la SPA de React
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**¿Por qué no usar `VITE_VENTAS_URL` con la IP del backend directamente?**

Los backends corren en `ec2-app` que está en una **subred privada**: `10.0.9.120`. Esta IP es interna a la VPC y **no es accesible desde Internet**. Si el browser del usuario intentara hacer fetch a `http://10.0.9.120:8080`, la conexión fallaría — el browser corre en el computador del cliente, no dentro de la VPC de AWS.

La solución es que nginx (que SÍ está dentro de la VPC, en `ec2-web`) haga las peticiones al backend en nombre del browser. El browser llama a `/api/v1/ventas` (URL relativa, mismo host), nginx lo recibe y lo reenvía internamente a `10.0.9.120:8080`. El resultado vuelve al browser como si viniera del frontend.

Por eso `src/config/api.js` exporta strings vacíos:

```js
export const VENTAS_API = '';    // URL relativa: /api/v1/ventas
export const DESPACHOS_API = ''; // URL relativa: /api/v1/despachos
```

Las llamadas son relativas al mismo origen (`http://52.73.73.226`), y nginx las redirige internamente.

### ¿Por qué `try_files $uri $uri/ /index.html`?

React Router es una SPA (Single Page Application): solo existe un archivo `index.html`. La navegación entre rutas (`/ventas`, `/despachos`) ocurre en el cliente mediante JavaScript. Si el usuario recarga la página en `/despachos`, nginx buscaría un archivo `/despachos/index.html` que no existe y devolvería 404.

`try_files $uri $uri/ /index.html` resuelve esto: si no encuentra el archivo, devuelve `index.html` para que React Router maneje la ruta desde el cliente.

### ¿Por qué `npm ci` y no `npm install`?

`npm ci` (clean install) instala exactamente las versiones fijadas en `package-lock.json`. `npm install` puede resolver versiones diferentes si hay rangos semánticos. En CI/CD siempre se usa `npm ci` para garantizar builds **reproducibles** (el mismo código produce siempre el mismo resultado).

---

## Docker Compose (desarrollo local)

```yaml
services:
  frontend:
    build:
      context: .
      args:
        VITE_VENTAS_URL: ${VITE_VENTAS_URL:-http://localhost:8080}
        VITE_DESPACHOS_URL: ${VITE_DESPACHOS_URL:-http://localhost:8081}
    container_name: frontend
    restart: unless-stopped
    ports:
      - "80:8080"
    volumes:
      - nginx_logs:/var/log/nginx

volumes:
  nginx_logs:
    driver: local
```

Para ejecutar localmente:

```bash
cp .env.example .env   # ajustar URLs si el backend corre en otro host
docker compose up --build
```

Aplicación disponible en `http://localhost`

### ¿Por qué `build-args` y no variables de entorno normales?

Vite embebe las variables `VITE_*` en el bundle JavaScript **en tiempo de compilación** (`npm run build`). No son variables de entorno de runtime — una vez compilado el bundle, no se pueden cambiar. Por eso se pasan como `build-args` de Docker: están disponibles durante el `RUN npm run build` del stage builder.

En producción, nginx hace el proxy internamente y las variables `VITE_*` no se usan para las llamadas reales al backend. Pero en desarrollo local sí son necesarias para que el dev server de Vite pueda proxy hacia los backends locales.

### ¿Por qué un volumen nombrado para los logs de nginx?

```yaml
volumes:
  nginx_logs:
    driver: local
```

El volumen `nginx_logs` persiste los archivos `access.log` y `error.log` de nginx fuera del contenedor. Ventajas:
- Los logs no se pierden al reiniciar o recrear el contenedor.
- Se pueden inspeccionar desde el host (`docker volume inspect nginx_logs`) sin entrar al contenedor.
- Permite diagnosticar errores de proxying hacia los backends revisando los logs de acceso.

---

## Variables de entorno

| Variable | Descripción | Producción |
|---|---|---|
| `VITE_VENTAS_URL` | URL base del microservicio de ventas | No usada (nginx hace proxy) |
| `VITE_DESPACHOS_URL` | URL base del microservicio de despachos | No usada (nginx hace proxy) |

> En producción las variables `VITE_*` se pasan por consistencia y para desarrollo local, pero la comunicación real con el backend la maneja nginx internamente.

---

## Pipeline CI/CD

El archivo `.github/workflows/deploy.yml` automatiza el despliegue completo al hacer `git push` sobre la rama `deploy`:

```
git push → GitHub Actions → Docker Hub → EC2
```

### Pasos del pipeline

```yaml
1. Checkout del repositorio
2. Login a Docker Hub (benjazzx)
3. Build y Push imagen Docker
   - Pasa VITE_VENTAS_URL y VITE_DESPACHOS_URL como build-args
   - Publica benjazzx/frontend-despacho:latest en Docker Hub
4. Despliegue en ec2-web (Elastic IP 52.73.73.226)
   - docker pull  → descarga nueva imagen
   - docker stop  → para contenedor anterior
   - docker rm    → elimina contenedor anterior
   - docker run   → inicia nuevo contenedor (-p 80:8080)
```

### Por qué la conexión SSH al frontend es directa (sin proxy)

El frontend corre en `ec2-web`, que tiene IP pública. El pipeline se conecta **directamente** a esa IP:

```yaml
- uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.EC2_PROXY_HOST }}   # 52.73.73.226
    username: ${{ secrets.EC2_USER }}
    key: ${{ secrets.EC2_SSH_KEY }}
```

Los backends en cambio están en subred privada y requieren pasar por `ec2-web` como bastion (ver READMEs de back-ventas y back-despachos).

### Secrets requeridos en GitHub

| Secret | Descripción |
|---|---|
| `DOCKERHUB_USERNAME` | Usuario de Docker Hub (`benjazzx`) |
| `DOCKERHUB_TOKEN` | Token de acceso Docker Hub |
| `EC2_PROXY_HOST` | Elastic IP de ec2-web (`52.73.73.226`) |
| `EC2_USER` | Usuario SSH (`ec2-user`) |
| `EC2_SSH_KEY` | Contenido del archivo `.pem` de AWS Academy |
| `VITE_VENTAS_URL` | URL del backend ventas (referencia, nginx hace el proxy real) |
| `VITE_DESPACHOS_URL` | URL del backend despachos (referencia, nginx hace el proxy real) |

### ¿Por qué Elastic IP?

AWS Academy reinicia las instancias EC2 periódicamente, asignando una nueva IP pública cada vez. Con una **Elastic IP** (IP estática) la IP de `ec2-web` es siempre `52.73.73.226`, sin importar cuántas veces se reinicie la instancia. Esto evita tener que actualizar los secrets de GitHub y la URL del sistema en cada reinicio.

---

## Cómo ejecutar en desarrollo (sin Docker)

Requiere Node.js 20+:

```bash
npm install
cp .env.example .env
npm run dev
```

Aplicación disponible en `http://localhost:5173`

En desarrollo Vite actúa como proxy del backend con la configuración de `vite.config.js`.
