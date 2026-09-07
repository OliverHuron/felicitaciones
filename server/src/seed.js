'use strict';

// Siembra idempotente:
//  - usuario 'admin' con la contraseña de SEED_PASSWORD
//  - plantilla incluida (server/assets/feliz-cumpleanos.jpg) como plantilla activa
//  - profesores desde server/seed/profesores.csv (solo si la tabla está vacía)

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { loadImage } = require('@napi-rs/canvas');
const db = require('./db');
const { pool } = require('./db');
const config = require('./config');

async function seedAdmin() {
  const hash = await bcrypt.hash(config.seedPassword, 10);
  await db.query(
    `INSERT INTO usuarios (usuario, nombre, password_hash)
     VALUES ('admin', 'Administrador', $1)
     ON CONFLICT (usuario) DO NOTHING`,
    [hash]
  );
  console.log("[seed] usuario 'admin' listo (contraseña = SEED_PASSWORD)");
}

function parseCSV(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return [];
  const cabecera = lineas.shift().split(',').map((s) => s.trim().toLowerCase());
  return lineas.map((linea) => {
    const celdas = linea.split(',').map((s) => s.trim());
    return Object.fromEntries(cabecera.map((h, i) => [h, celdas[i] ?? '']));
  });
}

async function seedPlantilla() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM plantillas');
  if (rows[0].n > 0) {
    console.log(`[seed] ya hay ${rows[0].n} plantilla(s) — omito`);
    return;
  }
  const archivo = config.imagen.plantilla;
  if (!fs.existsSync(archivo)) {
    console.log(`[seed] no existe ${archivo} — omito plantilla`);
    return;
  }
  let dims = { width: 0, height: 0 };
  try {
    dims = await loadImage(archivo);
  } catch {
    /* deja 0x0 */
  }
  await db.query(
    `INSERT INTO plantillas (nombre, archivo, ancho, alto, activa, nombre_x, nombre_y, nombre_size, nombre_color, fuente)
     VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, 'NotoSerif-Bold')`,
    [
      'Plantilla FCCA',
      archivo,
      dims.width,
      dims.height,
      config.imagen.xRel,
      config.imagen.yRel,
      config.imagen.sizeRel,
      config.imagen.color,
    ]
  );
  console.log('[seed] plantilla incluida registrada y activada');
}

async function seedProfesores() {
  const csvPath = path.join(__dirname, '..', 'seed', 'profesores.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('[seed] no hay seed/profesores.csv — omito carga de profesores');
    return;
  }
  const { rows } = await db.query('SELECT count(*)::int AS n FROM profesores');
  if (rows[0].n > 0) {
    console.log(`[seed] ya hay ${rows[0].n} profesor(es) — omito CSV`);
    return;
  }
  const registros = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  let n = 0;
  for (const r of registros) {
    if (!r.nombre || !r.fecha_nacimiento) continue;
    await db.query(
      `INSERT INTO profesores (nombre, apellidos, fecha_nacimiento, telefono, correo)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.nombre, r.apellidos || '', r.fecha_nacimiento, r.telefono || null, r.correo || null]
    );
    n++;
  }
  console.log(`[seed] ${n} profesor(es) insertado(s) desde CSV`);
}

async function main() {
  await seedAdmin();
  await seedPlantilla();
  await seedProfesores();
  await pool.end();
}

main().catch((err) => {
  console.error('[seed] falló:', err.message);
  process.exit(1);
});
