# siaf-felicitaciones — Runbook de Despliegue en Producción

Sistema de felicitaciones de cumpleaños para profesores: base de datos + envío
automático diario por **WhatsApp** (Baileys) y, opcionalmente, **Gmail** (SMTP).

Servidor físico compartido con `siaf-nominas`, `siaf-solicitudes`, `siaf-fichatecnica`
y `siaf-justificantes`. Misma arquitectura y mismo runner que esos proyectos; aquí
solo cambian el dominio, el puerto, la base de datos y el nombre del proceso PM2.

```
Internet → Cloudflare Tunnel → cloudflared (systemd) → nginx :80
                                                        ├─ /var/www/siaf-felicitaciones/client/dist   (SPA estática)
                                                        └─ /api → localhost:5007 → PM2 → Express → PostgreSQL (felicitaciones_db)
                                                                                           ├─ node-cron  → job diario de cumpleaños
                                                                                           ├─ Baileys    → WhatsApp Web (sesión en server/storage/whatsapp-auth)
                                                                                           └─ Nodemailer → SMTP Gmail (opcional)
```

Despliegue automático: `push` a `main` → GitHub Actions → runner self-hosted en el
servidor (label `siaf`) → `rsync` + `npm ci` + `npm run migrate` + build del cliente
+ `pm2 restart`.

| Recurso | Valor |
|---|---|
| Dominio | `felicitaciones.siafsystem.online` |
| Puerto local | `5007` |
| Carpeta de deploy | `/var/www/siaf-felicitaciones` |
| `.env` de producción | `/var/www/.env.siaf-felicitaciones` |
| Base de datos | `felicitaciones_db` / usuario `felicitaciones_admin` |
| Proceso PM2 | `siaf-felicitaciones` |
| Sitio nginx | `/etc/nginx/sites-available/siaf-felicitaciones` |

Todos los comandos van por **SSH al servidor**, como usuario `oliver`, salvo que se
indique otra cosa. Ejecuta los pasos en orden.

---

## Paso 1 — Verificar dependencias del sistema

Ya instaladas si hay otro proyecto SIAF en el servidor:

```bash
node -v          # esperado: v20+
psql --version   # esperado: 16
nginx -v
pm2 -v
cloudflared --version
```

No necesita Chromium ni librerías extra. La tarjeta se genera con `@napi-rs/canvas`,
que trae binario precompilado para Linux x64 (glibc) — se instala solo con `npm ci`,
sin dependencias del sistema. La plantilla (`server/assets/feliz-cumpleanos.jpg`) y
las fuentes (`server/assets/fonts/`) están en el repo y se despliegan con el `rsync`.

---

## Paso 2 — Crear la carpeta de despliegue con permisos correctos

```bash
sudo mkdir -p /var/www/siaf-felicitaciones
sudo chown -R oliver:oliver /var/www/siaf-felicitaciones
ls -ld /var/www/siaf-felicitaciones   # debe mostrar "oliver oliver"
```

---

## Paso 3 — Permisos `sudo` sin contraseña (si no se agregaron ya)

```bash
sudo visudo -f /etc/sudoers.d/siaf-felicitaciones
```

```
oliver ALL=(ALL) NOPASSWD: /bin/chown -R oliver\:oliver /var/www/siaf-felicitaciones
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
CREATE DATABASE felicitaciones_db;
CREATE USER felicitaciones_admin WITH ENCRYPTED PASSWORD 'CAMBIA_ESTA_CONTRASEÑA';
GRANT ALL PRIVILEGES ON DATABASE felicitaciones_db TO felicitaciones_admin;
\c felicitaciones_db
GRANT ALL ON SCHEMA public TO felicitaciones_admin;
\q
```

El workflow ejecuta `npm run migrate` en cada deploy. El sembrado inicial
(`npm run seed`) se corre una sola vez, a mano (Paso 11).

---

## Paso 5 — Crear el archivo `.env` de producción (fuera del repo)

```bash
sudo nano /var/www/.env.siaf-felicitaciones
```

`JWT_SECRET` debe ser un string largo y aleatorio, distinto del de otros proyectos:

```
NODE_ENV=production
PORT=5007
CLIENT_URL=https://felicitaciones.siafsystem.online
PUBLIC_URL=https://felicitaciones.siafsystem.online
TZ=America/Mexico_City

DB_HOST=localhost
DB_PORT=5432
DB_USER=felicitaciones_admin
DB_PASSWORD=CAMBIA_ESTA_CONTRASEÑA
DB_NAME=felicitaciones_db

JWT_SECRET=GENERA_UN_STRING_LARGO_Y_ALEATORIO
JWT_EXPIRE=7d
SEED_PASSWORD=123456

STORAGE_PATH=/var/www/siaf-felicitaciones/server/storage

CRON_CUMPLEANOS=0 8 * * *
ENVIAR_WHATSAPP=true
ENVIAR_EMAIL=false
WHATSAPP_PAIS_DEFAULT=52
DRY_RUN=false

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=cuenta@gmail.com
SMTP_PASS=APP_PASSWORD_DE_16_CARACTERES
SMTP_FROM="Felicitaciones FCCA <cuenta@gmail.com>"
```

```bash
sudo chown oliver:oliver /var/www/.env.siaf-felicitaciones
sudo chmod 600 /var/www/.env.siaf-felicitaciones
```

> **Gmail**: `SMTP_PASS` es una *contraseña de aplicación* (Google → Cuenta →
> Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones), no la
> contraseña normal. Deja `ENVIAR_EMAIL=false` hasta tenerla; WhatsApp funciona
> por su cuenta.

---

## Paso 6 — Directorio de almacenamiento (sesión de WhatsApp)

```bash
mkdir -p /var/www/siaf-felicitaciones/server/storage
```

`server/storage/` queda **fuera** del `rsync` del deploy (el workflow lo excluye),
así que la sesión de WhatsApp (`whatsapp-auth/`) y las plantillas de imagen subidas
desde el panel (`plantillas/`) **no** se borran en cada despliegue. Respaldar por
separado (junto con la base de datos, que guarda la posición del nombre por plantilla).

---

## Paso 7 — Runner de GitHub Actions (label `siaf`)

```bash
systemctl list-units --type=service | grep -i actions.runner
```

Ya existe un runner con label `siaf` compartido entre proyectos SIAF: solo agrega
este repo (`siaf-felicitaciones`) a los que atiende. El workflow ya apunta a
`runs-on: [self-hosted, siaf]`.

---

## Paso 8 — Server block de nginx

```bash
sudo nano /etc/nginx/sites-available/siaf-felicitaciones
```

```nginx
server {
    listen 80;
    server_name felicitaciones.siafsystem.online;

    root /var/www/siaf-felicitaciones/client/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5007;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/siaf-felicitaciones /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> `client/dist` aún no existe en este punto (se crea en el Paso 10) — es normal que
> nginx devuelva error hasta entonces.

---

## Paso 9 — Agregar el hostname al Cloudflare Tunnel existente

```bash
sudo nano /etc/cloudflared/config.yml
```

Agregar la línea de `ingress` **antes** de `service: http_status:404`:

```yaml
ingress:
  # ... hostnames de los otros proyectos SIAF ...
  - hostname: felicitaciones.siafsystem.online
    service: http://localhost:80
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <nombre-o-id-del-tunnel> felicitaciones.siafsystem.online
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

---

## Paso 10 — Disparar el primer despliegue

Desde tu máquina local:

```bash
git push origin main
```

Dispara `.github/workflows/deploy.yml`: `rsync` → `npm ci` (server) →
`npm run migrate` → `npm ci && npm run build` (client) → restaura `.env` →
`pm2 start src/index.js --name siaf-felicitaciones` (o `pm2 restart`) → `pm2 save` →
verifica `/api/health`.

Seguir el progreso en la pestaña **Actions** del repo.

---

## Paso 11 — Sembrar el usuario admin (solo la primera vez)

```bash
cd /var/www/siaf-felicitaciones/server
npm run seed
```

Crea el usuario `admin` con la contraseña de `SEED_PASSWORD` (`123456` por defecto).
**Cámbiala** después del primer ingreso (o edítala en la tabla `usuarios`).

Para cargar profesores de golpe, deja un `server/seed/profesores.csv` (mismo formato
que `server/seed/profesores.example.csv`) antes de correr `npm run seed`; solo se
importa si la tabla `profesores` está vacía. Si no, se dan de alta desde el panel.

---

## Paso 12 — Vincular WhatsApp (una sola vez)

La sesión se crea escaneando un QR con el teléfono cuyo WhatsApp enviará las
felicitaciones.

1. Entra a `https://felicitaciones.siafsystem.online`, inicia sesión.
2. En la tarjeta **WhatsApp**, cuando el estado sea `qr`, aparece el código.
   (También se imprime en `pm2 logs siaf-felicitaciones`.)
3. En el teléfono: **WhatsApp → Dispositivos vinculados → Vincular un dispositivo**
   → escanea. El estado pasa a `conectado`.
4. Botón **Probar envío de hoy** para una prueba manual (respeta `DRY_RUN`).

La sesión sobrevive reinicios y despliegues. Solo hay que repetir esto si cierras
la sesión desde el teléfono o borras `server/storage/whatsapp-auth`.

> Baileys usa el protocolo de WhatsApp Web, **no** la API oficial de Meta. Para un
> grupo pequeño de contactos conocidos el riesgo de baneo es bajo, pero existe;
> no lo uses para envíos masivos.

---

## Paso 13 — Verificar

En el servidor:

```bash
pm2 list                                     # siaf-felicitaciones "online"
pm2 logs siaf-felicitaciones --lines 50
curl -s http://localhost:5007/api/health     # {"status":"OK","db":"ok",...}
```

Desde cualquier máquina:

```bash
curl -sI https://felicitaciones.siafsystem.online
curl -s  https://felicitaciones.siafsystem.online/api/health
```

---

## Paso 14 — Persistencia tras reinicio del servidor

```bash
pm2 startup   # ejecutar el comando sudo que imprime, si aún no se hizo
pm2 save
cat ~/.pm2/dump.pm2 | grep siaf-felicitaciones
```

---

## Notas de operación

- **Migraciones**: agregar `server/migrations/00X_*.sql`; el runner las aplica en
  orden en el siguiente deploy y registra cada una en la tabla `_migraciones`.
- **`.env`**: cambios en producción se hacen en `/var/www/.env.siaf-felicitaciones`
  y se aplican con `pm2 restart siaf-felicitaciones --update-env`.
- **Horario del envío**: se ajusta desde el panel (pestaña *Envíos* →
  *Programación del envío automático*) y se guarda en la tabla `ajustes`;
  `node-cron` se reprograma al instante, sin `pm2 restart`. `CRON_CUMPLEANOS`
  del `.env` es solo el valor inicial (cron de 5 campos, en `TZ`).
- **Reenvíos**: el job es idempotente por día gracias al `UNIQUE` de `envios_log`.
  El endpoint `POST /api/jobs/cumpleanos/run?forzar=true` fuerza el reenvío.
- **`server/storage/`**: no se versiona ni se sincroniza. Respaldo aparte
  (incluye la sesión de WhatsApp).
- **Prueba en seco**: `DRY_RUN=true` en el `.env` → el job registra en `envios_log`
  qué haría, sin mandar nada.
- **Plantillas / tarjeta**: se gestionan desde el panel (pestaña *Plantillas*):
  subir imágenes, elegir la activa y colocar el nombre con el editor visual. La
  posición vive en la tabla `plantillas`; las imágenes subidas en
  `server/storage/plantillas/`. La plantilla incluida (`server/assets/…`) se registra
  sola en el primer `npm run seed`.
