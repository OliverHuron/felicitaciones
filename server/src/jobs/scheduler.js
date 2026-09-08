'use strict';

const cron = require('node-cron');
const config = require('../config');
const ajustes = require('../services/ajustes');
const { ejecutar } = require('./cumpleanos');

let tarea = null;
let cronActual = config.cronCumpleanos;
let activoActual = true;

const DIAS = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };

// "0 8 * * *"  ->  { hora: 8, minuto: 0 }
// Solo cuando es EXACTAMENTE "todos los días a HH:MM" (para el selector de hora simple).
function partesHora(expr) {
  const p = String(expr || '').trim().split(/\s+/);
  if (
    p.length === 5 && p[2] === '*' && p[3] === '*' && p[4] === '*' &&
    /^\d{1,2}$/.test(p[0]) && /^\d{1,2}$/.test(p[1])
  ) {
    return { hora: +p[1], minuto: +p[0] };
  }
  return null;
}

function nombrarDias(campo) {
  if (campo === '*') return 'todos los días';
  const r = campo.match(/^([0-7])-([0-7])$/);
  if (r) return `de ${DIAS[+r[1]]} a ${DIAS[+r[2]]}`;
  return campo.split(',').map((d) => DIAS[d] || d).join(', ');
}

function describir(expr) {
  const p = String(expr || '').trim().split(/\s+/);
  if (p.length === 5 && p[2] === '*' && p[3] === '*' && /^\d{1,2}$/.test(p[0]) && /^\d{1,2}$/.test(p[1])) {
    const hhmm = `${p[1].padStart(2, '0')}:${p[0].padStart(2, '0')}`;
    return p[4] === '*' ? `todos los días a las ${hhmm}` : `${nombrarDias(p[4])} a las ${hhmm}`;
  }
  return `cron: ${expr}`;
}

function programar(expr, activo) {
  if (tarea) {
    tarea.stop();
    tarea = null;
  }
  cronActual = expr;
  activoActual = Boolean(activo);

  if (!activo) {
    console.log('[scheduler] envío automático DESACTIVADO');
    return;
  }
  if (!cron.validate(expr)) {
    console.error(`[scheduler] expresión cron inválida: "${expr}" — no se programó nada`);
    return;
  }
  tarea = cron.schedule(
    expr,
    () => {
      console.log('[scheduler] disparando job de cumpleaños');
      ejecutar().catch((err) => console.error('[scheduler] error en job:', err.message));
    },
    { timezone: config.tz }
  );
  console.log(`[scheduler] envío programado: ${describir(expr)} (${config.tz})`);
}

async function iniciar() {
  try {
    const { cron: c, activo } = await ajustes.obtenerProgramacion();
    programar(c, activo);
  } catch (err) {
    console.error('[scheduler] no se pudo leer la programación, uso el .env:', err.message);
    programar(config.cronCumpleanos, true);
  }
}

function estado() {
  return {
    cron: cronActual,
    activo: activoActual,
    tz: config.tz,
    descripcion: describir(cronActual),
    ...(partesHora(cronActual) || {}),
  };
}

// Aplica y persiste una nueva programación. Acepta { cron } o { hora, minuto }.
async function aplicar({ cron: nuevoCron, hora, minuto, activo } = {}) {
  let expr = nuevoCron && String(nuevoCron).trim();
  if (!expr && hora != null) {
    const h = Math.min(23, Math.max(0, parseInt(hora, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minuto, 10) || 0));
    expr = `${m} ${h} * * *`;
  }
  expr = (expr || cronActual).trim();
  if (!cron.validate(expr)) {
    throw new Error(`Expresión cron inválida: "${expr}"`);
  }
  const act = activo == null ? activoActual : Boolean(activo);
  await ajustes.guardarProgramacion({ cron: expr, activo: act });
  programar(expr, act);
  return estado();
}

module.exports = { iniciar, estado, aplicar, describir };
