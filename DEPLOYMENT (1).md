# SIAF Justificantes — Runbook de Despliegue en Producción

Servidor físico compartido con `siaf-nominas`, `siaf-solicitudes` y `siaf-fichatecnica`.
Arquitectura:

```
Internet → Cloudflare Tunnel → cloudflared (systemd) → nginx :80
                                                          ├─ /var/www/siaf-justificantes/client/dist  (estático, SPA)
                                                          └─ /api → localhost:5004 → PM2 → Express → PostgreSQL (justificantes_db)
                                                                                              └─ SMTP (Gmail) para OTP y avisos
                                                                                              └─ /var/www/siaf-justificantes/server/storage  (adjuntos y PDFs)
```

Despliegue automático: `push` a `main` → GitHub Actions → runner self-hosted en el servidor
(label `siaf`, el mismo de los otros proyectos SIAF) → `rsync` + build + migraciones +
`pm2 restart`. No hay SSH manual en el flujo normal; el setup inicial sí, paso por paso, abajo.

Todos los comandos van por **SSH al servidor**, como usuario `oliver`, salvo que se indique
otra cosa. Ejecuta los pasos en orden.

---

## Paso 1 — Verificar dependencias del sistema

Si ya desplegaste otro proyecto SIAF en este servidor, esto ya está instalado:

```bash
node -v          # esperado: v20+
psql --version   # esperado: 16
nginx -v
pm2 -v
cloudflared --version
```

> **Fase 1**: la generación del PDF del oficio usa Chromium headless (Puppeteer). Cuando se
> llegue a esa fase habrá que instalar las librerías del sistema que Chromium necesita
> (`libnss3`, `libatk-1.0-0`, `libgbm1`, `libasound2`, etc.). En Fase 0 no hace falta.

---

## Paso 2 — Crear la carpeta de despliegue con permisos correctos

```bash
sudo mkdir -p /var/www/siaf-justificantes
sudo chown -R oliver:oliver /var/www/siaf-justificantes
```

```bash
ls -ld /var/www/siaf-justificantes   # debe mostrar "oliver oliver"
```

---

## Paso 3 — Permisos `sudo` sin contraseña (si no se agregaron ya para otro proyecto)

```bash
sudo visudo -f /etc/sudoers.d/siaf-justificantes
```

```
oliver ALL=(ALL) NOPASSWD: /bin/chown -R oliver\:oliver /var/www/siaf-justificantes
oliver ALL=(postgres) NOPASSWD: /usr/bin/psql
```

```bash
sudo visudo -c
```

---

## Paso 4 — Crear la base de datos y el usuario de PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE justificantes_db;
CREATE USER justificantes_admin WITH ENCRYPTED PASSWORD 'CAMBIA_ESTA_CONTRASEÑA';
GRANT ALL PRIVILEGES ON DATABASE justificantes_db TO justificantes_admin;
\c justificantes_db
GRANT ALL ON SCHEMA public TO justificantes_admin;
\q
```

- No hace falta correr `001_initial.sql` a mano: el workflow ejecuta `npm run migrate` en
  cada deploy (Paso 10). El sembrado inicial (`npm run seed`) se corre una sola vez, a mano
  (Paso 11).

---

## Paso 5 — Crear el archivo `.env` de producción (backup fuera del repo)

```bash
sudo nano /var/www/.env.siaf-justificantes
```

- Contenido (ajustar contraseñas y secretos a valores reales; `JWT_SECRET`,
  `CONFIG_ENC_KEY`, `FOLIO_HMAC_SECRET` deben ser strings largos y aleatorios, distintos
  entre sí y distintos de los de otros proyectos SIAF):

```
NODE_ENV=production
PORT=5004
CLIENT_URL=https://justificantes.siafsystem.online
PUBLIC_URL=https://justificantes.siafsystem.online

DB_HOST=localhost
DB_PORT=5432
DB_USER=justificantes_admin
DB_PASSWORD=CAMBIA_ESTA_CONTRASEÑA
DB_NAME=justificantes_db

JWT_SECRET=GENERA_UN_STRING_LARGO_Y_ALEATORIO
JWT_EXPIRE=7d
JWT_ALUMNO_EXPIRE=2h
OTP_TTL_MIN=10
OTP_MAX_INTENTOS=5

PENDIENTES_MAX=2
DIAS_LIMITE_SOLICITUD=10

STORAGE_PATH=/var/www/siaf-justificantes/server/storage
CONFIG_ENC_KEY=GENERA_32_BYTES_EN_BASE64
FOLIO_HMAC_SECRET=GENERA_UN_STRING_LARGO_Y_ALEATORIO

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=cuenta@gmail.com
SMTP_PASS=APP_PASSWORD_DE_16_CARACTERES
SMTP_FROM="Justificantes FCCA <cuenta@gmail.com>"

SEED_PASSWORD=123456
```

```bash
sudo chown oliver:oliver /var/www/.env.siaf-justificantes
sudo chmod 600 /var/www/.env.siaf-justificantes
```

---

## Paso 6 — Directorio de almacenamiento (adjuntos y PDFs)

```bash
mkdir -p /var/www/siaf-justificantes/server/storage/adjuntos
mkdir -p /var/www/siaf-justificantes/server/storage/folios
```

- Vive fuera del `rsync` del deploy (el workflow lo excluye), así que **no** se borra en cada
  despliegue. Respaldar por separado.

---

## Paso 7 — Runner de GitHub Actions (label `siaf`)

```bash
systemctl list-units --type=service | grep -i actions.runner
```

- Si ya existe un runner con label `siaf` (compartido entre proyectos SIAF), solo agrega
  este repo (`siaf-justificantes`) a los que atiende. Si no existe, sigue el procedimiento
  del runbook de `siaf-nominas` cambiando la URL del repo y el `--name` a `siaf-justificantes`.

---

## Paso 8 — Server block de nginx

```bash
sudo nano /etc/nginx/sites-available/siaf-justificantes
```

```nginx
server {
    listen 80;
    server_name justificantes.siafsystem.online;

    root /var/www/siaf-justificantes/client/dist;
    index index.html;

    # Fotos de recetas / tickets / constancias.
    client_max_body_size 15m;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # storage/ NO se expone como estático: los adjuntos se sirven solo por endpoint autorizado.
}
```

```bash
sudo ln -s /etc/nginx/sites-available/siaf-justificantes /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> `client/dist` aún no existe en este punto (se crea en el Paso 10) — es normal que nginx
> devuelva error hasta entonces.

---

## Paso 9 — Agregar el hostname al Cloudflare Tunnel existente

```bash
sudo nano /etc/cloudflared/config.yml
```

- Agregar la línea de `ingress` **antes** de `service: http_status:404`:

```yaml
ingress:
  - hostname: staging.siafsystem.online
    service: http://localhost:80
  - hostname: solicitudes.siafsystem.online
    service: http://localhost:80
  - hostname: nominas.siafsystem.online
    service: http://localhost:80
  - hostname: fichatecnica.siafsystem.online
    service: http://localhost:80
  - hostname: justificantes.siafsystem.online
    service: http://localhost:80
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <nombre-o-id-del-tunnel> justificantes.siafsystem.online
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

---

## Paso 10 — Disparar el primer despliegue

Desde tu máquina local (no en el servidor):

```bash
git push origin main
```

- Dispara `.github/workflows/deploy.yml`: `rsync` → `npm ci` (server) → `npm run migrate` →
  `npm ci && npm run build` (client) → restaura `.env` → `pm2 start src/index.js --name
  siaf-justificantes` (o `pm2 restart` si ya existe) → `pm2 save` → verifica `/api/health`.
- Seguir el progreso en la pestaña **Actions** del repo `siaf-justificantes`.

---

## Paso 11 — Sembrar cuentas y catálogos iniciales (solo la primera vez)

```bash
cd /var/www/siaf-justificantes/server
npm run seed
```

- Crea 4 cuentas de personal con la contraseña temporal de `SEED_PASSWORD` (`123456` por
  defecto) — deben cambiarla al primer ingreso:

  | usuario | rol | correo |
  |---|---|---|
  | `ventanilla` | encargada | ventanilla@umich.mx |
  | `direccion` | supervisor | direccion@umich.mx |
  | `coordinador` | coordinador | coordinador@umich.mx |
  | `enfermeria` | enfermeria | enfermeria@umich.mx |

- Siembra también el catálogo de secciones/semestres, un **horario de prueba** (semestre
  primero, sección 1, lunes y martes → los dos correos de prueba) y las plantillas base.
- Es idempotente: si se corre otra vez, no duplica.

---

## Paso 12 — Verificar que el despliegue funcionó

En el servidor:

```bash
pm2 list                                          # siaf-justificantes debe estar "online"
pm2 logs siaf-justificantes --lines 50
curl -s http://localhost:5004/api/health          # {"status":"OK", "db":"ok", ...}
```

Desde cualquier máquina:

```bash
curl -sI https://justificantes.siafsystem.online
curl -s  https://justificantes.siafsystem.online/api/health
```

---

## Paso 13 — Persistencia tras reinicio del servidor

Como `oliver` (si `pm2 startup` ya se configuró para otro proyecto SIAF, solo hace falta
`pm2 save`):

```bash
pm2 startup   # ejecutar el comando sudo que imprime, si aún no se hizo
pm2 save
cat ~/.pm2/dump.pm2 | grep siaf-justificantes
```

---

## Notas de operación

- **Migraciones**: agregar `server/migrations/00X_*.sql`; el runner las aplica en orden en
  el siguiente deploy y registra cada una en la tabla `_migraciones`.
- **`.env`**: cambios en producción se hacen en `/var/www/.env.siaf-justificantes` y se
  aplican con `pm2 restart siaf-justificantes --update-env`. La UI (Configuración) puede
  sobrescribir el SMTP en la tabla `config`.
- **Adjuntos**: `server/storage/` no se versiona ni se sincroniza. Respaldo aparte.
