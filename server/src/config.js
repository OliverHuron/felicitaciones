'use strict';

const path = require('path');
require('dotenv').config();

const bool = (v, def = false) => {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true' || v === '1';
};
const int = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const num = (v, def) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};

const ASSETS = path.join(__dirname, '..', 'assets');

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 5007),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5007',
  tz: process.env.TZ || 'America/Mexico_City',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 5432),
    user: process.env.DB_USER || 'felicitaciones_admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'felicitaciones_db',
  },

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-cambia-esto',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  seedPassword: process.env.SEED_PASSWORD || '123456',

  storagePath: process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage'),

  cronCumpleanos: process.env.CRON_CUMPLEANOS || '0 8 * * *',
  enviarWhatsapp: bool(process.env.ENVIAR_WHATSAPP, true),
  enviarEmail: bool(process.env.ENVIAR_EMAIL, false),
  whatsappPaisDefault: (process.env.WHATSAPP_PAIS_DEFAULT || '52').replace(/\D/g, ''),
  dryRun: bool(process.env.DRY_RUN, false),

  // Tarjeta personalizada: se estampa el nombre sobre la plantilla y esa imagen
  // es la que se envía (con el texto de felicitación como pie / cuerpo).
  imagen: {
    activa: bool(process.env.ENVIAR_IMAGEN, true),
    plantilla: process.env.FELICITACION_IMAGEN || path.join(ASSETS, 'feliz-cumpleanos.jpg'),
    fuente: process.env.FELICITACION_FUENTE || path.join(ASSETS, 'fonts', 'NotoSerif-Bold.ttf'),
    color: process.env.FELICITACION_NOMBRE_COLOR || '#1b2a6b',
    // Posiciones relativas al tamaño de la plantilla (0..1). Ajustables sin tocar código.
    xRel: num(process.env.FELICITACION_NOMBRE_X, 0.5), // centro horizontal
    yRel: num(process.env.FELICITACION_NOMBRE_Y, 0.7), // debajo del logo FCCA
    sizeRel: num(process.env.FELICITACION_NOMBRE_SIZE, 0.04),
    sizeMinRel: 0.022,
    anchoMaxRel: 0.74,
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: int(process.env.SMTP_PORT, 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
};

module.exports = config;
