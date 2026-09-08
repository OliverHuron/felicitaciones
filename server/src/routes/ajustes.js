'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const scheduler = require('../jobs/scheduler');

const router = express.Router();
router.use(requireAuth);

// Programación del envío automático.
router.get('/programacion', (_req, res) => {
  res.json(scheduler.estado());
});

// Body: { hora, minuto, activo }  ó  { cron, activo }
router.put('/programacion', async (req, res) => {
  try {
    res.json(await scheduler.aplicar(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
