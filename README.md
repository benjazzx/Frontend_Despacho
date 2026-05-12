# Frontend Despacho — Innovatech Chile

Aplicación web desarrollada en React + Vite que permite gestionar ventas y órdenes de despacho para el sistema Innovatech Chile. Es el componente visual del proyecto, desplegado en AWS EC2 dentro de una subred pública y servido por nginx.

---

## ¿Qué hace esta aplicación?

Permite a los operadores de Innovatech Chile:
- **Ver ventas pendientes** de despacho (consumiendo el microservicio back-ventas)
- **Crear órdenes de despacho** asignando fecha y patente del camión (consumiendo back-despachos)
- **Cerrar despachos** registrando intentos de entrega
- Navegar entre vistas mediante React Router

---

## Tecnologías

- React 18 + Vite 4
- React Router DOM
- Tailwind CSS
- nginx (producción, imagen `nginxinc/nginx-unprivileged:alpine`)
- Docker (multi-stage build)

---

## Variables de entorno

| Variable | Descripción | Ejemplo producción |
|---|---|---|
| `VITE_VENTAS_URL` | URL base del microservicio de ventas | `http://IP_EC2_BACKEND:8080` |
| `VITE_DESPACHOS_URL` | URL base del microservicio de despachos | `http://IP_EC2_BACKEND:8081` |

> **Importante:** Vite bake las variables de entorno en el bundle estático durante el build. No se pueden cambiar en runtime. Para desarrollo local, crear un archivo `.env`:
> ```
> VITE_VENTAS_URL=http://localhost:8080
> VITE_DESPACHOS_URL=http://localhost:8081
> ```

---

## Cómo ejecutar localmente

### Con Docker Compose (recomendado)

```bash
cp .env.example .env   # ajustar URLs si el backend corre en otro host
docker compose up --build
```

Aplicación disponible en `http://localhost`

### Con Vite (desarrollo)

Requiere Node.js 20+:

```bash
npm install
cp .env.example .env
npm run dev
```

Aplicación disponible en `http://localhost:5173`

---

## Decisiones arquitectónicas

### ¿Por qué Docker con multi-stage build?

El Dockerfile usa dos etapas separadas:

- **Stage 1 (builder):** imagen `node:20-alpine` descarga dependencias con `npm ci` y compila el bundle estático con `npm run build`. Esta imagen pesa ~400MB pero solo se usa en tiempo de build.
- **Stage 2 (runtime):** imagen `nginxinc/nginx-unprivileged:alpine`, imagen mínima (~25MB) que solo sirve archivos estáticos. No incluye Node.js, npm, ni código fuente.

**Beneficio:** la imagen final es ~95% más pequeña que una imagen de una sola etapa, y no expone herramientas de desarrollo en producción.

### ¿Por qué `nginxinc/nginx-unprivileged` y no `nginx`?

La imagen oficial `nginx` requiere privilegios root para bindear el puerto 80. `nginxinc/nginx-unprivileged` está configurada para correr con un usuario sin privilegios en el puerto 8080 (mapeado a 80 en el host).

Esto aplica el **principio de mínimo privilegio**: si la aplicación fuera comprometida, el atacante no tendría acceso root al contenedor ni al sistema operativo del host.

### ¿Por qué se necesita un nginx.conf personalizado?

React Router es una SPA (Single Page Application): solo existe un archivo `index.html` y la navegación entre rutas ocurre en el cliente (JavaScript). Si el usuario navega directamente a `/despachos` o recarga la página, nginx buscaría un archivo `/despachos/index.html` que no existe y devolvería 404.

La directiva `try_files $uri $uri/ /index.html` resuelve esto: si no encuentra el archivo solicitado, devuelve `index.html` para que React Router maneje la ruta desde el cliente.

### ¿Por qué las URLs se pasan como build args y no como variables de entorno runtime?

Vite transforma `import.meta.env.VITE_*` en strings literales durante el proceso de compilación (`npm run build`). Los archivos `.js` resultantes tienen las URLs embebidas directamente, no las leen en runtime.

Esto significa que para cambiar las URLs en producción se necesita recompilar la imagen. El pipeline CI/CD está diseñado para esto: cada push a `deploy` recompila la imagen con las URLs correctas (pasadas como `build-args` desde los secrets de GitHub).

### ¿Por qué `npm ci` y no `npm install`?

`npm ci` (clean install) instala exactamente las versiones fijadas en `package-lock.json`, sin actualizarlas. `npm install` puede resolver versiones diferentes si hay rangos semánticos. En un entorno de producción y CI, siempre se usa `npm ci` para garantizar builds reproducibles.

---

## Estructura del proyecto

```
front_despacho/
├── src/
│   ├── config/
│   │   └── api.js              # URLs centralizadas (VENTAS_API, DESPACHOS_API)
│   ├── componentes/
│   │   ├── CrudAdmin/
│   │   │   ├── TableCompras.jsx     # Lista ventas sin despacho
│   │   │   ├── TableDespachos.jsx   # Lista despachos activos
│   │   │   ├── FormDespacho.jsx     # Crear nuevo despacho
│   │   │   └── FormCierreDespacho.jsx # Cerrar despacho
│   │   └── Layouts/            # Navbar, Footer, Carrusel
│   └── Routes/
│       └── AppRoutes.jsx        # Configuración de rutas React Router
├── Dockerfile                   # Multi-stage: node builder + nginx runtime
├── nginx.conf                   # Configuración nginx con SPA routing
├── docker-compose.yml           # Stack frontend standalone
├── .github/
│   └── workflows/
│       └── deploy.yml          # Pipeline CI/CD → Docker Hub → EC2
└── .env.example                 # Plantilla de variables de entorno
```

---

## Pipeline CI/CD

El archivo `.github/workflows/deploy.yml` automatiza el despliegue al hacer `git push` sobre la rama `deploy`:

1. **Build:** compila la imagen Docker pasando `VITE_VENTAS_URL` y `VITE_DESPACHOS_URL` como build-args
2. **Push:** publica la imagen en Docker Hub como `{usuario}/frontend-despacho:latest`
3. **Deploy:** conecta por SSH a la instancia EC2 pública, descarga la nueva imagen y reinicia el contenedor

### Secrets requeridos en GitHub

| Secret | Descripción |
|---|---|
| `DOCKERHUB_USERNAME` | Usuario de Docker Hub |
| `DOCKERHUB_TOKEN` | Token de acceso Docker Hub |
| `EC2_HOST` | IP pública de la instancia EC2 frontend |
| `EC2_USER` | Usuario SSH (`ec2-user` o `ubuntu`) |
| `EC2_SSH_KEY` | Contenido del archivo `.pem` |
| `VITE_VENTAS_URL` | URL del backend ventas en EC2 (ej: `http://IP_BACKEND:8080`) |
| `VITE_DESPACHOS_URL` | URL del backend despachos en EC2 (ej: `http://IP_BACKEND:8081`) |
