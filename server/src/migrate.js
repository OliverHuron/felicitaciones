'use strict';

// Aplica en orden los archivos server/migrations/*.sql que aún no estén
// registrados en la tabla _migraciones. Cada archivo corre en su propia
// transacción. Lo ejecuta el workflow en cada deploy (npm run migrate).

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migraciones (
        id          SERIAL PRIMARY KEY,
        nombre      TEXT NOT NULL UNIQUE,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT nombre FROM _migraciones');
    const aplicadas = new Set(rows.map((r) => r.nombre));

    const archivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let n = 0;
    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8');
      process.stdout.write(`[migrate] aplicando ${archivo} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
        await client.query('COMMIT');
        console.log('ok');
        n++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('ERROR');
        throw err;
      }
    }

    console.log(n === 0 ? '[migrate] nada que aplicar' : `[migrate] ${n} migración(es) aplicada(s)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] falló:', err.message);
  process.exit(1);
});
