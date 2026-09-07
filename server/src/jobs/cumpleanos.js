'use strict';

const db = require('../db');
const config = require('../config');
const whatsapp = require('../services/whatsapp');
const mailer = require('../services/mailer');
const plantillas = require('../services/plantillas');
const imagen = require('../services/imagen');

function nombreCompleto(p) {
  return `${p.nombre || ''} ${p.apellidos || ''}`.trim().replace(/\s+/g, ' ');
}

// Fecha "de hoy" en la zona horaria configurada (no la del servidor).
function hoyLocal() {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // -> "YYYY-MM-DD"
  const [y, m, d] = s.split('-').map(Number);
  return { iso: s, anio: y, mes: m, dia: d };
}

async function cumpleanerosDeHoy() {
  const { mes, dia } = hoyLocal();
  const { rows } = await db.query(
    `SELECT id, nombre, apellidos,
            to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            telefono, correo
     FROM profesores
     WHERE activo
       AND EXTRACT(MONTH FROM fecha_nacimiento) = $1
       AND EXTRACT(DAY   FROM fecha_nacimiento) = $2
     ORDER BY nombre, apellidos`,
    [mes, dia]
  );
  return rows;
}

async function yaEnviadoOk(profesorId, canal, iso) {
  const { rows } = await db.query(
    `SELECT 1 FROM envios_log
     WHERE profesor_id = $1 AND canal = $2 AND fecha_local = $3 AND estado = 'ok'`,
    [profesorId, canal, iso]
  );
  return rows.length > 0;
}

async function registrar(profesorId, canal, estado, detalle, iso) {
  await db.query(
    `INSERT INTO envios_log (profesor_id, canal, estado, detalle, fecha_local)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (profesor_id, canal, fecha_local)
     DO UPDATE SET estado = EXCLUDED.estado, detalle = EXCLUDED.detalle, enviado_en = now()`,
    [profesorId, canal, estado, detalle ? String(detalle).slice(0, 500) : null, iso]
  );
}

async function procesarCanal(canal, p, iso, forzar, enviarFn) {
  if (!forzar && (await yaEnviadoOk(p.id, canal, iso))) {
    return { profesor: p.id, canal, estado: 'omitido', detalle: 'ya enviado hoy' };
  }
  if (config.dryRun) {
    await registrar(p.id, canal, 'omitido', 'DRY_RUN', iso);
    return { profesor: p.id, canal, estado: 'omitido', detalle: 'DRY_RUN' };
  }
  try {
    const detalle = await enviarFn();
    await registrar(p.id, canal, 'ok', detalle, iso);
    return { profesor: p.id, canal, estado: 'ok', detalle };
  } catch (err) {
    await registrar(p.id, canal, 'error', err.message, iso);
    return { profesor: p.id, canal, estado: 'error', detalle: err.message };
  }
}

// Construye el correo de felicitación (con la tarjeta como adjunto inline si existe).
function correoDeFelicitacion(p, tarjeta) {
  const attachments = tarjeta
    ? [{ filename: 'feliz-cumpleanos.jpg', content: tarjeta, cid: 'tarjeta' }]
    : [];
  const html = tarjeta
    ? `<div style="font-family:system-ui,'Segoe UI',Arial,sans-serif"><img src="cid:tarjeta" alt="Feliz cumpleaños" style="max-width:100%;border-radius:8px"/></div>`
    : plantillas.correoHtml(p);
  return { asunto: plantillas.correoAsunto(p), html, texto: plantillas.correoTexto(p), attachments };
}

// Envía la felicitación a UN profesor. `canales` limita a 'whatsapp' | 'email'.
// `manual` = true ignora los interruptores ENVIAR_WHATSAPP / ENVIAR_EMAIL
// (esos solo gobiernan el job automático diario); el envío manual usa
// cualquier canal para el que el profesor tenga datos.
async function enviarUno(p, { forzar = false, iso, canales, manual = false } = {}) {
  iso = iso || hoyLocal().iso;
  const usarWa = (!canales || canales.includes('whatsapp')) && p.telefono && (manual || config.enviarWhatsapp);
  const usarEmail = (!canales || canales.includes('email')) && p.correo && (manual || config.enviarEmail);
  const res = { profesor: p.id, nombre: nombreCompleto(p), whatsapp: null, email: null };

  // La tarjeta se genera una sola vez y se reutiliza en ambos canales.
  let tarjeta = null;
  if (config.imagen.activa && !config.dryRun && (usarWa || usarEmail)) {
    try {
      tarjeta = await imagen.generarTarjetaActiva(nombreCompleto(p));
    } catch (err) {
      console.error(`[cumpleanos] no se pudo generar la tarjeta de ${nombreCompleto(p)}: ${err.message}`);
    }
  }

  if (usarWa) {
    res.whatsapp = await procesarCanal('whatsapp', p, iso, forzar, () =>
      tarjeta
        ? whatsapp.enviarImagen(p.telefono, tarjeta, plantillas.whatsappTexto(p))
        : whatsapp.enviarMensaje(p.telefono, plantillas.whatsappTexto(p))
    );
  }
  if (usarEmail) {
    res.email = await procesarCanal('email', p, iso, forzar, async () => {
      const c = correoDeFelicitacion(p, tarjeta);
      await mailer.enviarCorreo(p.correo, c.asunto, c.html, c.texto, c.attachments);
      return p.correo;
    });
  }
  return res;
}

async function ejecutar({ forzar = false } = {}) {
  const { iso } = hoyLocal();
  const lista = await cumpleanerosDeHoy();
  const resultado = { fecha: iso, total: lista.length, whatsapp: [], email: [] };

  for (const p of lista) {
    const r = await enviarUno(p, { forzar, iso });
    if (r.whatsapp) resultado.whatsapp.push(r.whatsapp);
    if (r.email) resultado.email.push(r.email);
  }

  console.log(`[cumpleanos] ${iso} — ${lista.length} cumpleañero(s) procesado(s)`);
  return resultado;
}

// Envío de prueba a un número y/o correo arbitrario, sin tocar la base de datos.
// Sirve para verificar que WhatsApp y/o Gmail están bien configurados.
async function enviarPrueba({ telefono, correo, nombre }) {
  if (!telefono && !correo) throw new Error('Indica un teléfono o un correo');
  const p = { nombre: nombre || 'Profesor(a) de prueba', apellidos: '' };
  const tarjeta = config.imagen.activa ? await imagen.generarTarjetaActiva(nombreCompleto(p)) : null;
  const res = { nombre: nombreCompleto(p), whatsapp: null, email: null };

  if (telefono) {
    try {
      const jid = tarjeta
        ? await whatsapp.enviarImagen(telefono, tarjeta, plantillas.whatsappTexto(p))
        : await whatsapp.enviarMensaje(telefono, plantillas.whatsappTexto(p));
      res.whatsapp = { estado: 'ok', detalle: jid };
    } catch (err) {
      res.whatsapp = { estado: 'error', detalle: err.message };
    }
  }
  if (correo) {
    try {
      const c = correoDeFelicitacion(p, tarjeta);
      await mailer.enviarCorreo(correo, c.asunto, c.html, c.texto, c.attachments);
      res.email = { estado: 'ok', detalle: correo };
    } catch (err) {
      res.email = { estado: 'error', detalle: err.message };
    }
  }
  return res;
}

async function obtenerProfesor(id) {
  const { rows } = await db.query(
    `SELECT id, nombre, apellidos,
            to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            telefono, correo
     FROM profesores WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { ejecutar, enviarUno, enviarPrueba, obtenerProfesor, cumpleanerosDeHoy, hoyLocal };
