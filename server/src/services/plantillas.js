'use strict';

// Plantillas de texto de los mensajes de felicitación. Ajusta el texto a tu gusto.

function nombreCorto(p) {
  return (p.nombre || '').trim().split(/\s+/)[0] || p.nombre || '';
}

function whatsappTexto(p) {
  return (
    `Feliz cumpleaños, ${nombreCorto(p)}.\n\n` +
    `De parte de toda la comunidad de la FCCA te deseamos un excelente día. ` +
    `Gracias por tu dedicación y compromiso.`
  );
}

function correoAsunto(p) {
  return `Feliz cumpleaños, ${nombreCorto(p)}`;
}

function correoHtml(p) {
  return `<div style="font-family:system-ui,'Segoe UI',Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.5">
  <p style="font-size:18px"><strong>Feliz cumpleaños, ${nombreCorto(p)}.</strong></p>
  <p>De parte de toda la comunidad de la FCCA te deseamos un día excelente.
  Gracias por tu dedicación y compromiso.</p>
  <p style="margin-top:24px">Un saludo,<br/>Coordinación FCCA</p>
</div>`;
}

function correoTexto(p) {
  return `Feliz cumpleaños, ${nombreCorto(p)}. De parte de toda la comunidad de la FCCA te deseamos un excelente día.`;
}

module.exports = { nombreCorto, whatsappTexto, correoAsunto, correoHtml, correoTexto };
