'use strict';

const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth } = require('../auth/middleware');
const { parseProfesores, plantillaBuffer } = require('../services/excel');

const router = express.Router();
router.use(requireAuth);

const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const SELECT = `
  SELECT id, nombre, apellidos,
         to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
         telefono, correo, activo, creado_en, actualizado_en
  FROM profesores
`;

function parseBody(b = {}) {
  return {
    nombre: String(b.nombre || '').trim(),
    apellidos: String(b.apellidos || '').trim(),
    fecha_nacimiento: String(b.fecha_nacimiento || '').trim(),
    telefono: String(b.telefono || '').trim() || null,
    correo: String(b.correo || '').trim() || null,
    activo: b.activo === undefined ? true : Boolean(b.activo),
  };
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (_req, res) => {
  const { rows } = await db.query(`${SELECT} ORDER BY nombre, apellidos`);
  res.json(rows);
});

// Descargar la plantilla .xlsx con los encabezados correctos.
router.get('/plantilla.xlsx', (_req, res) => {
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', 'attachment; filename="plantilla-profesores.xlsx"');
  res.send(plantillaBuffer());
});

// Importar profesores desde un Excel/CSV.
router.post('/importar', subir.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  let parsed;
  try {
    parsed = parseProfesores(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'No se pudo leer el archivo (¿es un Excel o CSV válido?)' });
  }

  let insertados = 0;
  let omitidos = 0;
  const errores = [...parsed.errores];

  for (const f of parsed.filas) {
    try {
      const dup = await db.query(
        `SELECT 1 FROM profesores WHERE lower(nombre) = lower($1) AND lower(apellidos) = lower($2) AND fecha_nacimiento = $3`,
        [f.nombre, f.apellidos, f.fecha_nacimiento]
      );
      if (dup.rows.length) {
        omitidos++;
        continue;
      }
      await db.query(
        `INSERT INTO profesores (nombre, apellidos, fecha_nacimiento, telefono, correo, activo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [f.nombre, f.apellidos, f.fecha_nacimiento, f.telefono, f.correo]
      );
      insertados++;
    } catch (err) {
      errores.push({ fila: '?', motivo: `${f.nombre}: ${err.message}` });
    }
  }

  res.json({ insertados, omitidos, leidas: parsed.filas.length, errores });
});

router.post('/', async (req, res) => {
  const p = parseBody(req.body);
  if (!p.nombre || !FECHA_RE.test(p.fecha_nacimiento)) {
    return res.status(400).json({ error: 'nombre y fecha_nacimiento (YYYY-MM-DD) son obligatorios' });
  }
  const { rows } = await db.query(
    `INSERT INTO profesores (nombre, apellidos, fecha_nacimiento, telefono, correo, activo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [p.nombre, p.apellidos, p.fecha_nacimiento, p.telefono, p.correo, p.activo]
  );
  const { rows: creado } = await db.query(`${SELECT} WHERE id = $1`, [rows[0].id]);
  res.status(201).json(creado[0]);
});

router.put('/:id', async (req, res) => {
  const p = parseBody(req.body);
  if (!p.nombre || !FECHA_RE.test(p.fecha_nacimiento)) {
    return res.status(400).json({ error: 'nombre y fecha_nacimiento (YYYY-MM-DD) son obligatorios' });
  }
  const { rowCount } = await db.query(
    `UPDATE profesores
     SET nombre = $1, apellidos = $2, fecha_nacimiento = $3,
         telefono = $4, correo = $5, activo = $6, actualizado_en = now()
     WHERE id = $7`,
    [p.nombre, p.apellidos, p.fecha_nacimiento, p.telefono, p.correo, p.activo, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Profesor no encontrado' });
  const { rows } = await db.query(`${SELECT} WHERE id = $1`, [req.params.id]);
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM profesores WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
