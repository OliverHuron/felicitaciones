# siaf-felicitaciones

Mini sistema para felicitar a los profesores en su cumpleaños, automáticamente,
por **WhatsApp** y (opcional) **Gmail**.

- **Base de datos** de profesores (nombre, apellidos, fecha de nacimiento, teléfono,
  correo, activo) en PostgreSQL.
- **Job diario** (`node-cron`) que busca quién cumple años hoy y envía la felicitación.
- **Plantillas**: varias imágenes de fondo; una activa a la vez. Un **editor visual**
  coloca el nombre donde quieras (arrastrar, tamaño, color, fuente). Esa imagen es
  la que se envía, con el texto de felicitación como pie.
- **Alta de profesores**: manual o **importando un Excel/CSV** (con plantilla
  descargable que trae los encabezados correctos).
- **Panel web** (React) con login, en tres pestañas: Profesores · Plantillas · Envíos.
- Bitácora de envíos idempotente: si el proceso se reinicia el mismo día, no vuelve
  a felicitar.

Pensado para correr en el servidor SIAF (Ubuntu 24.04) junto a los demás proyectos:
Node 20+ · Express · PostgreSQL 16 · PM2 · nginx · Cloudflare Tunnel · runner
self-hosted `siaf`. Sin Docker.

## Estructura

```
server/                  API Express
  src/
    index.js             arranque, /api/health, monta rutas, cron, WhatsApp
    config.js             lee server/.env
    db.js                 pool de PostgreSQL
    migrate.js            aplica migrations/*.sql  (npm run migrate)
    seed.js               usuario admin + CSV opcional  (npm run seed)
    auth/                 login JWT
    routes/              profesores (CRUD + importar/plantilla.xlsx), plantillas,
                         whatsapp, jobs, tarjeta
    services/            whatsapp (Baileys), mailer (Nodemailer), plantillas (textos),
                         imagen (tarjeta), excel (importar/plantilla)
    jobs/                cumpleanos (lógica) + scheduler (cron)
  migrations/            001_initial.sql · 002_plantillas.sql
  seed/profesores.example.csv
  assets/                feliz-cumpleanos.jpg (plantilla incluida) + fonts/ (se versionan)
  storage/               sesión de WhatsApp + plantillas subidas (NO se versiona)
client/src/pages/         Login · Profesores · Plantillas · Envios
client/                  SPA React + Vite  (build → client/dist, servido por nginx)
.github/workflows/deploy.yml
DEPLOYMENT.md            runbook de producción paso a paso
```

## Desarrollo local

Requiere Node 20+ y un PostgreSQL accesible.

```bash
# 1. Backend
cd server
cp .env.example .env          # ajusta DB_*, JWT_SECRET; para local puedes quitar STORAGE_PATH
npm install
npm run migrate
npm run seed                  # crea el usuario 'admin' / SEED_PASSWORD
npm start                     # API en http://localhost:5007

# 2. Frontend (otra terminal)
cd client
npm install
npm run dev                   # http://localhost:5173  (proxya /api al 5007)
```

Entra a http://localhost:5173 con `admin` / el valor de `SEED_PASSWORD` (`123456`).

### Pestaña Profesores

- **Nuevo** — alta manual.
- **Descargar plantilla** — baja `plantilla-profesores.xlsx` con los encabezados
  (`nombre, apellidos, fecha_nacimiento, telefono, correo`) y una hoja de instrucciones.
- **Importar Excel** — sube ese archivo (o un `.csv`). Acepta fechas `AAAA-MM-DD` y
  `DD/MM/AAAA`, normaliza teléfonos, omite duplicados y reporta los errores por fila.
- **Enviar** (por fila) — felicita a ese profesor ya, por WhatsApp y/o Gmail según
  sus datos (ignora los interruptores `ENVIAR_*`).

### Pestaña Plantillas

- Sube varias imágenes; marca una como **activa** (la que se envía).
- **Editor**: arrastra el nombre sobre la imagen o usa los controles (fuente, tamaño,
  color, posición X/Y). "Ver render real" muestra el resultado exacto. **Guardar** lo persiste.

### Pestaña Envíos

- Estado de WhatsApp (QR para vincular) y de Gmail.
- **Ejecutar envío de hoy** — corre el job de los cumpleañeros de hoy.
- **Prueba de envío** — manda la tarjeta a un teléfono y/o correo sin registrar nada.

Para probar sin mandar mensajes reales: `DRY_RUN=true` en `server/.env`.

## Variables de entorno

Ver `server/.env.example`. Las que más se tocan:

| Variable | Para qué |
|---|---|
| `CRON_CUMPLEANOS` | Horario del envío (cron 5 campos, en `TZ`). Default `0 8 * * *`. |
| `ENVIAR_WHATSAPP` / `ENVIAR_EMAIL` | Activar cada canal. Email arranca en `false`. |
| `WHATSAPP_PAIS_DEFAULT` | Prefijo para teléfonos de 10 dígitos (México = `52`). |
| `DRY_RUN` | `true` = no envía, solo registra en `envios_log`. |
| `SMTP_*` | Gmail con **contraseña de aplicación** (no la normal). |
| `ENVIAR_IMAGEN` | `true` = envía la tarjeta con el nombre; `false` = solo texto. |
| `FELICITACION_NOMBRE_*` | Solo valores por defecto al sembrar la plantilla incluida. La posición real se edita en el panel (pestaña Plantillas) y vive en la BD. |

## Vincular WhatsApp

Primera vez: entra al panel → tarjeta **WhatsApp** → escanea el QR desde el
teléfono (**Dispositivos vinculados → Vincular un dispositivo**). La sesión queda
en `server/storage/whatsapp-auth/` y sobrevive reinicios y despliegues.

> Baileys usa el protocolo de WhatsApp Web, no la API oficial de Meta. Bajo riesgo
> para un grupo pequeño de contactos conocidos, pero no es un canal soportado:
> nada de envíos masivos.

## Despliegue

`git push origin main` dispara el workflow en el runner del servidor. El primer
despliegue necesita los pasos de infraestructura de **[DEPLOYMENT.md](DEPLOYMENT.md)**
(base de datos, `.env`, nginx, túnel, vinculación de WhatsApp).

## API

Todas bajo `/api`, con `Authorization: Bearer <token>` salvo `login` y `health`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado de DB, WhatsApp y SMTP. |
| `POST` | `/api/auth/login` | `{ usuario, password }` → `{ token }`. |
| `GET/POST` | `/api/profesores` | Listar / crear. |
| `PUT/DELETE` | `/api/profesores/:id` | Editar / borrar. |
| `GET` | `/api/profesores/plantilla.xlsx` | Descargar el Excel plantilla con encabezados. |
| `POST` | `/api/profesores/importar` | Importar Excel/CSV (multipart `archivo`). |
| `GET/POST` | `/api/plantillas` | Listar / subir plantilla de imagen (multipart `archivo`, `nombre`). |
| `PUT` | `/api/plantillas/:id` | Guardar nombre y posición del texto. |
| `POST` | `/api/plantillas/:id/activar` | Marcar como activa. |
| `DELETE` | `/api/plantillas/:id` | Borrar. |
| `GET` | `/api/plantillas/:id/imagen` · `/preview?nombre=…&x=&y=&size=&color=&fuente=` | Imagen cruda · render con el nombre (acepta `?t=<token>`). |
| `GET` | `/api/plantillas/fuentes` | Fuentes disponibles. |
| `GET` | `/api/whatsapp/status` | Estado de la conexión. |
| `GET` | `/api/whatsapp/qr` | QR actual (data URL) si toca vincular. |
| `POST` | `/api/whatsapp/start` | Forzar (re)conexión. |
| `GET` | `/api/jobs/cumpleanos/hoy` | Quién cumple años hoy. |
| `POST` | `/api/jobs/cumpleanos/run` | Ejecuta el envío a los cumpleañeros de hoy (`?forzar=true` reenvía). |
| `POST` | `/api/jobs/enviar/:id` | Envío manual a un profesor concreto, ahora (WhatsApp y/o Gmail; ignora los interruptores `ENVIAR_*`). Body opcional `{ canales: [...] }`. |
| `POST` | `/api/jobs/prueba` | Envío de prueba libre: `{ telefono?, correo?, nombre? }` (al menos uno). No toca la base de datos. |
| `GET` | `/api/jobs/envios` | Últimos envíos registrados. |
| `GET` | `/api/tarjeta?nombre=…` | Vista previa JPEG de la tarjeta (acepta `?t=<token>` para usar en `<img>`). |
