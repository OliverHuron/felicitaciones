'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function get() {
  if (transporter) return transporter;
  if (!config.smtp.user || !config.smtp.pass) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

async function enviarCorreo(to, asunto, html, texto, attachments) {
  const t = get();
  if (!t) throw new Error('SMTP no configurado (faltan SMTP_USER / SMTP_PASS)');
  await t.sendMail({
    from: config.smtp.from,
    to,
    subject: asunto,
    text: texto,
    html,
    attachments: attachments && attachments.length ? attachments : undefined,
  });
}

module.exports = {
  enviarCorreo,
  smtpConfigurado: () => Boolean(get()),
};
