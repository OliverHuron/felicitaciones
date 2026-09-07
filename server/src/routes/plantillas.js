'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { loadImage } = require('@napi-rs/canvas');
const config = require('../config');
const db = require('../db');
const imagen = require('../services/imagen');

const router = express.Router();

const DIR = path.join(config.storagePath, 'plantillas');
fs.mkdirSync(DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(file.mimetype.startsWith('image/') ? null : new Error('El archivo debe ser una imagen'), true);
  },
});

// Auth por cabecera Bearer o ?t= (para <img src> en el editor).
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.t;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
router.use(auth);

const num = (v, def) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : def;
};

function limpiar(row) {
  return { ...row, archivo: undefined, es_default: row.id === 0 };
}

// Fuentes disponibles (archivos .ttf en assets/fonts).
router.get('/fuentes', (_req, res) => {
  const fuentes = fs
    .readdirSync(imagen.FONTS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.ttf'))
    .map((f) => f.replace(/\.ttf$/i, ''));
  res.json(fuentes);
});

// Lista de plantillas (incluye la incluida en assets/ si la BD está vacía).
router.get('/', async (_req, res) => {
  const { rows } = await db.query('SELECT * FROM plantillas ORDER BY creado_en');
  if (rows.length === 0) {
    return res.json([{ ...limpiar(imagen.plantillaPorDefecto()), activa: true }]);
  }
  res.json(rows.map(limpiar));
});

// Subir una plantilla nueva.
router.post('/', upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo de imagen' });
    let dims = { width: 0, height: 0 };
    try {
      dims = await loadImage(req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'No se pudo leer la imagen' });
    }
    const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const archivo = path.join(DIR, `${Date.now()}${ext}`);
    fs.writeFileSync(archivo, req.file.buffer);

    const nombre = (req.body.nombre || req.file.originalname || 'Plantilla').toString().slice(0, 120);
    const { rows: existentes } = await db.query('SELECT count(*)::int AS n FROM plantillas');
    const primera = existentes[0].n === 0;

    const { rows } = await db.query(
      `INSERT INTO plantillas (nombre, archivo, ancho, alto, activa)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre, archivo, dims.width, dims.height, primera]
    );
    res.status(201).json(limpiar(rows[0]));
  } catch (err) {
    next(err);
  }
});

// Actualizar nombre y posición del texto.
router.put('/:id', async (req, res) => {
  const b = req.body || {};
  const { rows } = await db.query('SELECT * FROM plantillas WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });

  const { rows: upd } = await db.query(
    `UPDATE plantillas SET
       nombre = $1, nombre_x = $2, nombre_y = $3, nombre_size = $4,
       nombre_color = $5, fuente = $6, actualizado_en = now()
     WHERE id = $7 RETURNING *`,
    [
      (b.nombre ?? p.nombre).toString().slice(0, 120),
      num(b.nombre_x, p.nombre_x),
      num(b.nombre_y, p.nombre_y),
      num(b.nombre_size, p.nombre_size),
      (b.nombre_color ?? p.nombre_color).toString().slice(0, 20),
      (b.fuente ?? p.fuente).toString().slice(0, 60),
      req.params.id,
    ]
  );
  imagen.invalidarCache(upd[0].archivo);
  res.json(limpiar(upd[0]));
});

// Marcar como activa.
router.post('/:id/activar', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE plantillas SET activa = false WHERE activa');
    const { rowCount } = await client.query('UPDATE plantillas SET activa = true WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    if (!rowCount) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM plantillas WHERE id = $1', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(204).end();
  await db.query('DELETE FROM plantillas WHERE id = $1', [req.params.id]);
  try {
    if (p.archivo && p.archivo.startsWith(DIR)) fs.unlinkSync(p.archivo);
  } catch {
    /* noop */
  }
  imagen.invalidarCache(p.archivo);
  // Si borramos la activa, activa otra si queda alguna.
  if (p.activa) {
    await db.query('UPDATE plantillas SET activa = true WHERE id = (SELECT id FROM plantillas ORDER BY creado_en LIMIT 1)');
  }
  res.status(204).end();
});

async function cargarPlantilla(id) {
  if (String(id) === '0') return imagen.plantillaPorDefecto();
  const { rows } = await db.query('SELECT * FROM plantillas WHERE id = $1', [id]);
  return rows[0] || null;
}

// Imagen cruda de la plantilla (fondo del editor).
router.get('/:id/imagen', async (req, res, next) => {
  try {
    const p = await cargarPlantilla(req.params.id);
    if (!p || !fs.existsSync(p.archivo)) return res.status(404).end();
    res.set('Cache-Control', 'no-store');
    res.sendFile(p.archivo);
  } catch (err) {
    next(err);
  }
});

// Render real con el nombre estampado.
router.get('/:id/preview', async (req, res, next) => {
  try {
    const p = await cargarPlantilla(req.params.id);
    if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const merged = {
      ...p,
      nombre_x: req.query.x !== undefined ? num(req.query.x, p.nombre_x) : p.nombre_x,
      nombre_y: req.query.y !== undefined ? num(req.query.y, p.nombre_y) : p.nombre_y,
      nombre_size: req.query.size !== undefined ? num(req.query.size, p.nombre_size) : p.nombre_size,
      nombre_color: req.query.color || p.nombre_color,
      fuente: req.query.fuente || p.fuente,
    };
    const nombre = String(req.query.nombre || 'Nombre del Profesor').slice(0, 120);
    const buf = await imagen.generarConPlantilla(nombre, merged);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
