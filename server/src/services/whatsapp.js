'use strict';

// Cliente de WhatsApp basado en Baileys (protocolo de WhatsApp Web, no API oficial).
// Se vincula una sola vez escaneando un QR; la sesión se guarda en
// STORAGE_PATH/whatsapp-auth y sobrevive a reinicios y despliegues.
//
// AVISO: Baileys no es una API soportada por Meta. Para felicitar a un grupo
// pequeño de personas conocidas el riesgo de baneo es bajo, pero existe.

const fs = require('fs');
const path = require('path');
const config = require('../config');

const AUTH_DIR = path.join(config.storagePath, 'whatsapp-auth');

let sock = null;
let estado = 'desconectado'; // desconectado | conectando | qr | conectado
let ultimoQR = null;
let arrancando = false;
let reintentos = 0;

async function start() {
  if (arrancando || estado === 'conectando' || estado === 'conectado') return;
  arrancando = true;
  estado = 'conectando';

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      DisconnectReason,
    } = require('@whiskeysockets/baileys');
    const logger = require('pino')({ level: 'silent' });

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['Felicitaciones FCCA', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        ultimoQR = qr;
        estado = 'qr';
        console.log('[whatsapp] QR disponible — escanéalo desde el panel o desde estos logs:');
        try {
          require('qrcode-terminal').generate(qr, { small: true });
        } catch { /* opcional */ }
      }

      if (connection === 'open') {
        estado = 'conectado';
        ultimoQR = null;
        reintentos = 0;
        console.log('[whatsapp] conectado');
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        estado = 'desconectado';
        arrancando = false;
        console.log(`[whatsapp] conexión cerrada (code=${code}, loggedOut=${loggedOut})`);

        if (loggedOut) {
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { /* noop */ }
          console.log('[whatsapp] sesión cerrada desde el teléfono; se requiere volver a escanear el QR');
        } else if (reintentos < 10) {
          const espera = Math.min(30000, 3000 * 2 ** reintentos);
          reintentos++;
          setTimeout(() => start().catch((e) => console.error('[whatsapp] reintento:', e.message)), espera);
        }
      }
    });
  } catch (err) {
    estado = 'desconectado';
    console.error('[whatsapp] error al iniciar:', err.message);
  } finally {
    arrancando = false;
  }
}

function normalizarTelefono(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  d = d.replace(/^0+/, '');
  if (d.length === 10) d = config.whatsappPaisDefault + d; // 10 dígitos -> anteponer país
  return d.length >= 8 ? d : null;
}

async function resolveJid(telefono) {
  const d = normalizarTelefono(telefono);
  if (!d) return null;
  const fallback = `${d}@s.whatsapp.net`;
  if (!sock || estado !== 'conectado') return fallback;
  try {
    const res = await sock.onWhatsApp(d);
    if (res && res[0]?.exists) return res[0].jid;
  } catch { /* usa fallback */ }
  return fallback;
}

async function enviarMensaje(telefono, texto) {
  if (!sock || estado !== 'conectado') throw new Error('WhatsApp no está conectado');
  const jid = await resolveJid(telefono);
  if (!jid) throw new Error(`Teléfono inválido: ${telefono}`);
  await sock.sendMessage(jid, { text: texto });
  return jid;
}

async function enviarImagen(telefono, buffer, caption) {
  if (!sock || estado !== 'conectado') throw new Error('WhatsApp no está conectado');
  const jid = await resolveJid(telefono);
  if (!jid) throw new Error(`Teléfono inválido: ${telefono}`);
  await sock.sendMessage(jid, { image: buffer, caption: caption || undefined });
  return jid;
}

function getEstado() {
  return { estado, hayQR: Boolean(ultimoQR), authDir: AUTH_DIR };
}

async function getQRDataURL() {
  if (!ultimoQR) return null;
  return require('qrcode').toDataURL(ultimoQR);
}

module.exports = {
  start,
  enviarMensaje,
  enviarImagen,
  resolveJid,
  normalizarTelefono,
  getEstado,
  getQRDataURL,
};
