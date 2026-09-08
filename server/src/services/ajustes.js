'use strict';

// Ajustes editables desde el panel, guardados en la tabla `ajustes` (clave/valor).

const db = require('../db');
const config = require('../config');

async function get(clave, porDefecto = null) {
  try {
    const { rows } = await db.query('SELECT valor FROM ajustes WHERE clave = $1', [clave]);
    return rows[0] ? rows[0].valor : porDefecto;
  } catch {
    return porDefecto;
  }
}

async function set(clave, valor) {
  await db.query(
    `INSERT INTO ajustes (clave, valor) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [clave, String(valor)]
  );
}

async function obtenerProgramacion() {
  const cron = (await get('cron_cumpleanos')) || config.cronCumpleanos;
  const activo = (await get('envio_automatico', 'true')) !== 'false';
  return { cron, activo };
}

async function guardarProgramacion({ cron, activo }) {
  if (cron != null) await set('cron_cumpleanos', cron);
  if (activo != null) await set('envio_automatico', activo ? 'true' : 'false');
}

module.exports = { get, set, obtenerProgramacion, guardarProgramacion };
