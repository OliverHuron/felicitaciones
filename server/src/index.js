'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const db = require('./db');
const whatsapp = require('./services/whatsapp');
const mailer = require('./services/mailer');
const scheduler = require('./jobs/scheduler');

const app = express();
app.use(express.json());
app.use(cors({ origin: config.nodeEnv === 'production' ? config.clientUrl : true }));

app.get('/api/health', async (_req, res) => {
  let dbEstado = 'ok';
  try {
    await db.query('SELECT 1');
  } catch {
    dbEstado = 'error';
  }
  res.json({
    status: 'OK',
    db: dbEstado,
    whatsapp: whatsapp.getEstado().estado,
    smtp: mailer.smtpConfigurado() ? 'ok' : 'sin-configurar',
    ts: new Date().toISOString(),
  });
});

// Fuentes para el editor de plantillas (previsualización fiel en el navegador).
app.use('/api/fonts', express.static(require('./services/imagen').FONTS_DIR, {
  setHeaders: (res) => res.set('Access-Control-Allow-Origin', '*'),
}));

app.use('/api/auth', require('./auth/routes'));
app.use('/api/profesores', require('./routes/profesores'));
app.use('/api/plantillas', require('./routes/plantillas'));
app.use('/api/ajustes', require('./routes/ajustes'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/tarjeta', require('./routes/tarjeta'));

// En producción nginx sirve client/dist directamente; esto es un respaldo
// para correr el build de forma local sin nginx.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo es demasiado grande' });
  }
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: 'Error interno', detalle: err.message });
});

app.listen(config.port, () => {
  console.log(`[felicitaciones] API en :${config.port} (${config.nodeEnv}, TZ=${config.tz})`);
  scheduler.iniciar().catch((e) => console.error('[scheduler] iniciar:', e.message));
  if (config.enviarWhatsapp) {
    whatsapp.start().catch((e) => console.error('[whatsapp] start:', e.message));
  }
});
