# front-Despacho — Frontend React

Aplicación web desarrollada en **React 18 + Vite 5** que permite gestionar ventas y órdenes de despacho del sistema Innovatech Chile. Desplegada en **AWS ECS Fargate** y servida a través del **Application Load Balancer (ALB)** sobre HTTPS.

---

## Tabla de contenidos

1. [Arquitectura en producción](#1-arquitectura-en-producción)
2. [Funcionalidades](#2-funcionalidades)
3. [Variables de entorno](#3-variables-de-entorno)
4. [Contenedor Docker](#4-contenedor-docker)
5. [Pipeline CI/CD](#5-pipeline-cicd)
6. [Gestión de secretos](#6-gestión-de-secretos)
7. [Monitoreo y logs](#7-monitoreo-y-logs)
8. [Validación funcional](#8-validación-funcional)
9. [Ejecución local](#9-ejecución-local)

---

## 1. Arquitectura en producción

```
Browser del usuario (HTTPS)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Application Load Balancer (ALB)                        │
│  innovatech-alb-516038279.us-east-1.elb.amazonaws.com   │
│                                                         │
│  Regla 1: /api/v1/ventas*    → back-ventas-svc :8080    │
│  Regla 2: /api/v1/despachos* → back-despachos-svc :8081 │
│  Default: /* → frontend-svc :8080                       │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTP interno
                   ▼
    ┌──────────────────────────────┐
    │  ECS Fargate — frontend-svc  │
    │  Cluster: innovatech-ecs-cluster │
    │  nginx-unprivileged          │
    │  Puerto: 8080                │
    │  Subred: privada us-east-1   │
    └──────────────────────────────┘
```

El navegador hace todas las peticiones HTTPS al dominio del ALB. El ALB termina SSL y enruta:
- Rutas `/api/v1/ventas*` y `/api/v1/despachos*` → backends correspondientes
- Todo lo demás → frontend (nginx sirve el bundle React)

**Componentes de infraestructura:**

| Recurso | Nombre / Valor |
|---|---|
| Cluster ECS | `innovatech-ecs-cluster` |
| Servicio ECS | `frontend-svc` |
| ECR Repository | `frontend-despacho` |
| Puerto de contenedor | `8080` |
| Región | `us-east-1` |
| URL pública | `https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com` |
| Tipo de lanzamiento | Fargate (serverless) |

---

## 2. Funcionalidades

La aplicación permite a los operadores de Innovatech Chile:

- **Ver ventas pendientes** de despacho (consumiendo `GET /api/v1/ventas`)
- **Crear órdenes de despacho** asignando fecha y patente del camión (`POST /api/v1/despachos`)
- **Gestionar despachos activos** con vista tabular (`GET /api/v1/despachos`)
- **Cerrar despachos** registrando intentos de entrega y estado final (`PUT /api/v1/despachos/{id}`)
- Navegación entre vistas mediante React Router (SPA)

---

## 3. Variables de entorno

Vite embebe las variables `VITE_*` en el bundle JavaScript **en tiempo de compilación**. No son variables de runtime — una vez generado el bundle, no se pueden cambiar sin recompilar.

### Producción — `.env.production`

El archivo `.env.production` es leído automáticamente por Vite durante `npm run build`. Está commiteado en el repositorio (no contiene secretos — solo la URL pública del ALB):

```env
VITE_API_URL=https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com/api/v1
VITE_ENVIRONMENT=production
VITE_LOG_LEVEL=info
VITE_TIMEOUT=10000
VITE_RETRY_ATTEMPTS=3
```

### Desarrollo local — `.env` (no commiteado)

```bash
cp .env.example .env
# Editar con la URL del backend local
```

```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_ENVIRONMENT=development
VITE_LOG_LEVEL=debug
VITE_TIMEOUT=10000
VITE_RETRY_ATTEMPTS=3
```

### Variables disponibles

| Variable | Descripción | Producción | Local |
|---|---|---|---|
| `VITE_API_URL` | URL base del API incluyendo `/api/v1` | `https://innovatech-alb-...com/api/v1` | `http://localhost:8080/api/v1` |
| `VITE_ENVIRONMENT` | Ambiente de ejecución | `production` | `development` |
| `VITE_LOG_LEVEL` | Nivel de log en consola del browser | `info` | `debug` |
| `VITE_TIMEOUT` | Timeout de requests axios en ms | `10000` | `10000` |
| `VITE_RETRY_ATTEMPTS` | Reintentos en caso de error | `3` | `3` |

**¿Por qué `.env.production` se commitea y `.env` no?**

`.env.production` solo contiene la URL pública del ALB, que no es un secreto. `.env` puede contener credenciales o configuraciones de desarrollo local — por eso está en `.gitignore`.

**¿Por qué Vite no lee `process.env`?**

Vite es un bundler para el browser, no para Node.js. El browser no tiene acceso a `process.env`. Vite reemplaza estáticamente las referencias a `import.meta.env.VITE_*` con sus valores literales durante `npm run build`, leyendo únicamente archivos `.env*`. Variables configuradas con Docker `ENV` o `--build-arg` NO llegan a `import.meta.env` a menos que también se configuren en un archivo `.env*`.

---

## 4. Contenedor Docker

El `Dockerfile` implementa un **build multi-stage**:

```dockerfile
# Stage 1: Build — Node.js compila el bundle React
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci                              # install reproducible (usa package-lock.json)
COPY . .                               # incluye .env.production
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
RUN npm run build                       # genera dist/ con bundle estático

# Stage 2: Runtime — nginx sirve los archivos estáticos
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

**Decisiones de diseño:**

**Multi-stage build:** `node:20-alpine` (~400MB) instala dependencias y compila el bundle. La imagen final solo contiene `nginx-unprivileged:alpine` (~25MB) con los archivos HTML/CSS/JS estáticos. Node.js, npm y el código fuente no llegan a producción.

**`nginx-unprivileged` en lugar de `nginx` oficial:** La imagen oficial de nginx necesita root para bindear el puerto 80. `nginx-unprivileged` corre con un usuario sin privilegios en el puerto 8080 (el ALB mapea externamente el 443 a este contenedor). Aplica el principio de mínimo privilegio: un contenedor comprometido no tiene acceso root al host.

**`npm ci` en lugar de `npm install`:** `npm ci` instala exactamente las versiones fijadas en `package-lock.json`. `npm install` puede resolver versiones diferentes si hay rangos semánticos. En CI/CD se usa `npm ci` para garantizar builds **reproducibles** — el mismo código siempre produce el mismo resultado.

**¿Por qué el ALB y no nginx como reverse proxy?**

La arquitectura anterior usaba nginx como reverse proxy interno hacia los backends (IP privada de EC2). Con ECS Fargate los backends están en subredes privadas dinámicas (IPs de tareas cambian con cada redeploy). El ALB resuelve esto automáticamente: registra las tareas ECS por su IP dinámica y enruta según reglas de path. nginx en el frontend solo sirve el bundle estático.

**Tamaño comparado:**

| Etapa | Imagen base | Tamaño aprox. |
|---|---|---|
| Builder | `node:20-alpine` | ~400 MB |
| Runtime final | `nginx-unprivileged:alpine` | ~25 MB |

---

## 5. Pipeline CI/CD

El archivo `.github/workflows/deploy.yml` automatiza el ciclo completo. Se activa en cada `git push` a la rama `deploy`.

```
git push origin deploy
        │
        ▼
┌────────────────────────────────────────────────────┐
│  GitHub Actions                                    │
│                                                    │
│  1. Checkout del repositorio                       │
│  2. Configurar AWS credentials                     │
│     (ACCESS_KEY_ID + SESSION_TOKEN                 │
│      desde GitHub Secrets)                         │
│  3. Login a Amazon ECR                             │
│  4. docker build \                                 │
│       -t registry/frontend-despacho:sha \          │
│       -t registry/frontend-despacho:latest \       │
│       --build-arg VITE_API_URL=https://...alb/api/v1 │
│       --build-arg VITE_ENVIRONMENT=production \    │
│       --build-arg VITE_LOG_LEVEL=info \            │
│       .                                            │
│  5. docker push ambos tags a ECR                   │
│  6. aws ecs update-service                         │
│     --force-new-deployment                         │
│  7. Verificar rolloutState                         │
│     (COMPLETED o IN_PROGRESS = OK)                 │
└────────────────────────────────────────────────────┘
        │
        ▼
ECS Fargate descarga la nueva imagen
y reemplaza la tarea (rolling update, cero downtime)
```

**Variables del pipeline:**

```yaml
env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: frontend-despacho
  ECS_CLUSTER: innovatech-ecs-cluster
  ECS_SERVICE: frontend-svc
```

**¿Por qué `--build-arg` y `.env.production` a la vez?**

`.env.production` es la fuente primaria que Vite lee durante `npm run build`. Los `--build-arg` del pipeline son un mecanismo de respaldo que además documenta explícitamente en el pipeline cuál URL se está usando, mejorando la trazabilidad de cada deploy.

---

## 6. Gestión de secretos

### GitHub Actions Secrets

Las credenciales AWS para publicar en ECR y desplegar en ECS se almacenan como **GitHub Secrets**:

| Secret | Descripción |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access Key de AWS Academy |
| `AWS_SECRET_ACCESS_KEY` | Secret Access Key de AWS Academy |
| `AWS_SESSION_TOKEN` | Session Token de AWS Academy (STS, temporal) |

**¿Por qué Session Token?** AWS Academy usa AWS STS (Security Token Service): cada sesión genera credenciales temporales que expiran en ~4 horas. GitHub Secrets permite actualizarlas desde la consola web sin modificar código ni exponer valores en el historial de Git.

**¿Qué NO es un secreto aquí?**

La URL del ALB (`VITE_API_URL`) es pública por naturaleza: está en el bundle JavaScript que el browser descarga. No contiene credenciales. Por eso `.env.production` se commitea sin problema.

---

## 7. Monitoreo y logs

### CloudWatch Container Insights

Container Insights está habilitado en el cluster `innovatech-ecs-cluster`. Métricas disponibles para `frontend-svc`:

- **CPU Utilization** por tarea
- **Memory Utilization** por tarea
- **Network I/O**

### Logs del contenedor

Los logs de acceso de nginx se envían a **CloudWatch Logs**:

```
Log Group: /ecs/frontend-despacho
Log Stream: ecs/frontend-despacho/<task-id>
```

Los logs de acceso de nginx muestran cada request con código de respuesta, bytes transferidos y tiempo. Útil para detectar errores 404 (rutas inexistentes) o 502 (proxy fallback).

### Verificar estado del servicio

```bash
aws ecs describe-services \
  --cluster innovatech-ecs-cluster \
  --services frontend-svc \
  --query "services[0].{Running:runningCount,Desired:desiredCount,Rollout:deployments[0].rolloutState}" \
  --output table
```

---

## 8. Validación funcional

### Verificar que el frontend está operativo

```bash
# Página principal
curl -I https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com/
# Respuesta esperada: HTTP/1.1 200 OK, Content-Type: text/html

# Verificar que el JS bundle se sirve correctamente
curl -I https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com/assets/index-*.js
# Respuesta esperada: HTTP/1.1 200 OK, Content-Type: application/javascript
```

### Verificar que los backends son accesibles desde el frontend

```bash
# El ALB enruta /api/v1/ventas al backend de ventas
curl https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com/api/v1/ventas

# El ALB enruta /api/v1/despachos al backend de despachos
curl https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com/api/v1/despachos
```

### Flujo completo de usuario

1. Abrir `https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com` en el browser
2. La tabla de ventas carga datos desde `/api/v1/ventas`
3. Crear un despacho usando la tabla → hace `POST /api/v1/despachos`
4. La tabla de despachos muestra el nuevo registro → `GET /api/v1/despachos`
5. Cerrar un despacho → hace `PUT /api/v1/despachos/{id}`

---

## 9. Ejecución local

Requiere Node.js 20+.

### Sin Docker (Vite dev server)

```bash
# Instalar dependencias
npm install

# Crear .env para desarrollo
cp .env.example .env
# Editar VITE_API_URL=http://localhost:8080/api/v1

# Iniciar dev server
npm run dev
```

Aplicación disponible en `http://localhost:5173`

El dev server de Vite hace hot-reload automático al guardar cambios.

### Con Docker

```bash
docker build \
  --build-arg VITE_API_URL=http://localhost:8080/api/v1 \
  -t frontend-despacho:local \
  .

docker run -p 80:8080 frontend-despacho:local
```

Aplicación disponible en `http://localhost`

### Con Docker Compose (stack completo)

```bash
# Desde la raíz del repositorio
docker compose up --build
```

---

## Estructura del proyecto

```
front_despacho/
├── src/
│   ├── api/
│   │   └── client.js            # Axios: apiVentas, apiDespachos
│   ├── config.js                # Lee import.meta.env.VITE_*
│   ├── componentes/
│   │   ├── CrudAdmin/
│   │   │   ├── TableCompras.jsx       # Lista ventas sin despacho
│   │   │   ├── TableDespachos.jsx     # Lista despachos activos
│   │   │   ├── FormDespacho.jsx       # Crear nuevo despacho
│   │   │   └── FormCierreDespacho.jsx # Cerrar / editar despacho
│   │   └── Layouts/                   # Navbar, Footer
│   └── Routes/
│       └── AppRoutes.jsx         # React Router: /ventas, /despachos
├── .env.production              # Variables de producción (commiteado)
├── .env.example                 # Plantilla para desarrollo local
├── Dockerfile                   # Multi-stage: node builder + nginx runtime
├── nginx.conf                   # nginx: SPA fallback (try_files)
├── docker-compose.yml           # Stack completo para desarrollo
└── .github/
    └── workflows/
        └── deploy.yml           # Pipeline CI/CD → ECR → ECS
```

---

## Tecnologías

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18.2 | Framework UI |
| Vite | 5.2 | Bundler y dev server |
| React Router DOM | 6.24 | Navegación SPA |
| Tailwind CSS | 3.4 | Estilos utility-first |
| Axios | 1.6 | Cliente HTTP |
| React Hook Form | — | Gestión de formularios |
| SweetAlert2 | — | Alertas y confirmaciones |
| nginx-unprivileged | alpine | Servidor web en producción |
| Docker | multi-stage | Empaquetado |
| GitHub Actions | — | CI/CD |
| Amazon ECS Fargate | — | Ejecución en la nube |
| Amazon ECR | — | Registro de imágenes |
| ALB | — | Balanceo, SSL termination y routing |

---

## Incidentes resueltos en producción

Esta sección documenta los problemas reales que se presentaron durante el despliegue y cómo se diagnosticaron y resolvieron. Son parte del trabajo técnico del proyecto.

---

### Incidente 1 — Mixed Content Error (HTTPS bloqueando peticiones HTTP)

**Síntoma:**

El browser mostraba el error `ERR_NETWORK` o `Mixed Content` en la consola. Las peticiones al backend fallaban con `net::ERR_BLOCKED_BY_RESPONSE`. La aplicación no cargaba datos.

**Causa raíz:**

El `Dockerfile` configuraba `ENV VITE_API_URL=http://...` (HTTP). Sin embargo, Vite **no lee `process.env`** — solo lee archivos `.env*` en tiempo de build. Como resultado, `import.meta.env.VITE_API_URL` era `undefined` en el bundle compilado. El `config.js` lanzaba una excepción al detectar que `VITE_API_URL` no estaba definida, lo que impedía que `client.js` se inicializara. ECS detectaba el contenedor como roto y hacía rollback a la imagen anterior, que tenía hardcodeado `http://localhost:8080` — una URL HTTP en una página servida sobre HTTPS. Los browsers modernos bloquean peticiones a HTTP desde páginas HTTPS (Mixed Content Policy).

**Solución:**

Se creó el archivo `.env.production` con la URL HTTPS del ALB:

```
VITE_API_URL=https://innovatech-alb-516038279.us-east-1.elb.amazonaws.com/api/v1
```

Vite lee automáticamente `.env.production` durante `npm run build`. El bundle resultante tiene la URL correcta embebida. El hash del bundle cambió (`index-Cr0KkPlN.js` → `index-C0HeXv09.js`), confirmando que la nueva imagen fue compilada y desplegada correctamente.

**Lección aprendida:**

Variables de entorno en Vite solo funcionan vía archivos `.env*`. `ENV` en Dockerfile afecta a Node.js en el servidor, no al bundle del browser.

---

### Incidente 2 — Timeout de 10 segundos en todas las peticiones al backend

**Síntoma:**

Después de corregir el Mixed Content, las peticiones al backend devolvían `timeout of 10000ms exceeded` y `ECONNABORTED` en consola. La aplicación mostraba los componentes pero sin datos.

**Causa raíz:**

Las reglas del ALB estaban configuradas con los paths incorrectos:

```
Regla incorrecta: /api/ventas*    → back-ventas-svc
Regla incorrecta: /api/despachos* → back-despachos-svc
```

Pero los controllers de Spring Boot exponen:

```java
@RequestMapping("api/v1/ventas")    // path correcto: /api/v1/ventas
@RequestMapping("api/v1/despachos") // path correcto: /api/v1/despachos
```

Las peticiones a `/api/v1/ventas` no coincidían con `/api/ventas*`, caían a la regla `default` del ALB, que enrutaba al `frontend-svc`. nginx del frontend intentaba hacer proxy a una IP de EC2 antigua (`10.0.9.120:8080`) que no existía en la VPC de ECS. Después de 10 segundos, axios devolvía timeout.

**Solución:**

Se actualizaron las reglas del ALB via AWS CLI:

```bash
# Regla de ventas: /api/ventas* → /api/v1/ventas*
aws elbv2 modify-rule \
  --rule-arn arn:aws:elasticloadbalancing:...:rule/492229a1e1291e1f \
  --conditions '[{"Field":"path-pattern","Values":["/api/v1/ventas*"]}]'

# Regla de despachos: /api/despachos* → /api/v1/despachos*
aws elbv2 modify-rule \
  --rule-arn arn:aws:elasticloadbalancing:...:rule/b85d9b7cb9e005ed \
  --conditions '[{"Field":"path-pattern","Values":["/api/v1/despachos*"]}]'
```

El cambio fue inmediato (sin redeploy). Las peticiones comenzaron a enrutarse correctamente.

**Lección aprendida:**

Los paths del ALB deben coincidir exactamente con el `@RequestMapping` del controller Spring Boot, incluyendo el segmento `/v1/`. Una discrepancia de un segmento en el path hace que las peticiones caigan al servicio incorrecto.

---

### Incidente 3 — Métricas ECS sin datos en CloudWatch Dashboard

**Síntoma:**

El dashboard de CloudWatch mostraba "No hay datos disponibles" para CPU y memoria de los servicios ECS.

**Causa raíz:**

El cluster ECS tenía `containerInsights: disabled` (configuración por defecto de AWS). Sin Container Insights activo, ECS no envía métricas detalladas de CPU/memoria por servicio o tarea a CloudWatch.

**Solución:**

```bash
aws ecs update-cluster-settings \
  --cluster innovatech-ecs-cluster \
  --settings name=containerInsights,value=enabled
```

Las métricas comenzaron a aparecer en CloudWatch → Container Insights aproximadamente 5 minutos después.

**Lección aprendida:**

Container Insights no está habilitado por defecto en clusters ECS. Debe activarse explícitamente. Las métricas de CPU/memoria del ALB requieren tráfico real para aparecer (no se generan en idle).
