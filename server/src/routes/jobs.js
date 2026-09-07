'use strict';

const express = require('express');
const { requireAuth } = require('../auth/middleware');
const db = require('../db');
const {
  ejecutar,
  enviarUno,
  enviarPrueba,
  obtenerProfesor,
  cumpleanerosDeHoy,
} = require('../jobs/cumpleanos');

const router = express.Router();
router.use(requireAuth);

// Quién cumple años hoy (sin enviar nada).
router.get('/cumpleanos/hoy', async (_req, res) => {
  res.json(await cumpleanerosDeHoy());
});

// Dispara el envío a todos los cumpleañeros de hoy. ?forzar=true reenvía.
router.post('/cumpleanos/run', async (req, res) => {
  const forzar = req.query.forzar === 'true' || req.body?.forzar === true;
  res.json(await ejecutar({ forzar }));
});

// Envío manual a UN profesor concreto (aunque hoy no sea su cumpleaños).
// Body opcional: { canales: ['whatsapp'|'email'] }
router.post('/enviar/:id', async (req, res) => {
  const p = await obtenerProfesor(req.params.id);
  if (!p) return res.status(404).json({ error: 'Profesor no encontrado' });
  const canales = Array.isArray(req.body?.canales) ? req.body.canales : undefined;
  const r = await enviarUno(p, { forzar: true, manual: true, canales });
  res.json(r);
});

// Prueba a un número libre, sin base de datos. Body: { telefono, nombre? }
router.post('/prueba', async (req, res) => {
  try {
    res.json(await enviarPrueba(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Últimos envíos registrados.
router.get('/envios', async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite, 10) || 50, 200);
  const { rows } = await db.query(
    `SELECT e.id, e.canal, e.estado, e.detalle,
            to_char(e.fecha_local, 'YYYY-MM-DD') AS fecha_local, e.enviado_en,
            p.nombre, p.apellidos
     FROM envios_log e
     JOIN profesores p ON p.id = e.profesor_id
     ORDER BY e.enviado_en DESC
     LIMIT $1`,
    [limite]
  );
  res.json(rows);
});

module.exports = router;
