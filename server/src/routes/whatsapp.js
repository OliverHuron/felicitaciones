'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const whatsapp = require('../services/whatsapp');

const router = express.Router();
router.use(requireAuth);

router.get('/status', (_req, res) => {
  res.json(whatsapp.getEstado());
});

router.get('/qr', async (_req, res) => {
  const qr = await whatsapp.getQRDataURL();
  if (!qr) return res.status(404).json({ error: 'No hay QR disponible', ...whatsapp.getEstado() });
  res.json({ qr });
});

router.post('/start', async (_req, res) => {
  whatsapp.start().catch(() => {});
  res.json({ ok: true, ...whatsapp.getEstado() });
});

module.exports = router;
