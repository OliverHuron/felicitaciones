import { useCallback, useEffect, useState } from 'react';
import { api, getToken } from '../api.js';

const detalleCanal = (c) => (c ? `${c.estado}${c.detalle ? ` (${c.detalle})` : ''}` : '—');

export default function Envios() {
  const [wa, setWa] = useState({ estado: 'desconectado', hayQR: false });
  const [qr, setQr] = useState(null);
  const [smtp, setSmtp] = useState('');
  const [msg, setMsg] = useState('');
  const [previewNombre, setPreviewNombre] = useState('María López García');
  const [tel, setTel] = useState('');
  const [correo, setCorreo] = useState('');
  const [forzar, setForzar] = useState(false);

  const cargarSalud = useCallback(async () => {
    try {
      const h = await api('/health');
      setWa((w) => ({ ...w, estado: h.whatsapp }));
      setSmtp(h.smtp);
    } catch {
      /* noop */
    }
  }, []);

  const cargarWa = useCallback(async () => {
    try {
      setWa(await api('/whatsapp/status'));
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    cargarSalud();
    cargarWa();
    const id = setInterval(cargarWa, 4000);
    return () => clearInterval(id);
  }, [cargarSalud, cargarWa]);

  useEffect(() => {
    if (wa.estado === 'qr' && wa.hayQR) {
      api('/whatsapp/qr').then((r) => setQr(r?.qr || null)).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [wa.estado, wa.hayQR]);

  async function correrJob() {
    setMsg('Ejecutando envío de hoy…');
    try {
      const r = await api(`/jobs/cumpleanos/run${forzar ? '?forzar=true' : ''}`, { method: 'POST' });
      const resumen = (arr) =>
        arr.length
          ? arr.map((x) => (x.detalle ? `${x.estado} (${x.detalle})` : x.estado)).join(', ')
          : 'sin destinatarios';
      setMsg(
        `Hoy (${r.fecha}): ${r.total} cumpleañero(s).\n` +
        `WhatsApp: ${resumen(r.whatsapp)}\nEmail: ${resumen(r.email)}`
      );
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
  }

  async function enviarPrueba() {
    const t = tel.trim();
    const c = correo.trim();
    if (!t && !c) return;
    setMsg('Enviando prueba…');
    try {
      const r = await api('/jobs/prueba', {
        method: 'POST',
        body: { telefono: t || undefined, correo: c || undefined, nombre: previewNombre },
      });
      const partes = [];
      if (r.whatsapp) partes.push(`WhatsApp: ${detalleCanal(r.whatsapp)}`);
      if (r.email) partes.push(`Gmail: ${detalleCanal(r.email)}`);
      setMsg(`Prueba — ${partes.join(' · ') || 'sin destinatarios'}`);
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
  }

  const badge = (txt, tipo) => <span className={`badge ${tipo}`}>{txt}</span>;

  return (
    <div className="pila">
      <section className="card">
        <h2>Conexiones</h2>
        <div className="estado-linea">
          <span>WhatsApp</span>
          {badge(wa.estado, wa.estado)}
          {wa.estado !== 'conectado' && (
            <button className="ghost sm" onClick={() => api('/whatsapp/start', { method: 'POST' }).then(cargarWa)}>
              Reconectar
            </button>
          )}
        </div>
        <div className="estado-linea">
          <span>Gmail (SMTP)</span>
          {badge(smtp === 'ok' ? 'configurado' : 'sin configurar', smtp === 'ok' ? 'conectado' : 'desconectado')}
        </div>

        {qr && (
          <div className="qr">
            <p>Abre WhatsApp → <em>Dispositivos vinculados</em> → <em>Vincular un dispositivo</em> y escanea:</p>
            <img src={qr} alt="Código QR de WhatsApp" />
          </div>
        )}
      </section>

      <section className="card">
        <h2>Envío del día</h2>
        <p className="sub">
          Busca quién cumple años hoy y envía la felicitación por los canales activados.
          Cada persona se felicita una sola vez al día: si ya se le envió, aparece como
          <em> omitido (ya enviado hoy)</em>.
        </p>
        <div className="fila-accion">
          <button onClick={correrJob}>Ejecutar envío de hoy</button>
          <label className="check">
            <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
            Reenviar aunque ya se haya enviado hoy
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Prueba de envío</h2>
        <p className="sub">Manda la tarjeta a un teléfono y/o un correo, sin registrar nada.</p>
        <div className="grid2">
          <label>Nombre en la tarjeta
            <input value={previewNombre} onChange={(e) => setPreviewNombre(e.target.value)} />
          </label>
          <div />
          <label>Teléfono (WhatsApp)
            <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="10 dígitos" />
          </label>
          <label>Correo (Gmail)
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="correo@ejemplo.com" />
          </label>
        </div>
        <button className="ghost" disabled={!tel.trim() && !correo.trim()} onClick={enviarPrueba}>
          Enviar prueba
        </button>
        {tel.trim() && wa.estado !== 'conectado' && <p className="aviso">WhatsApp no está vinculado; esa parte fallará.</p>}
        {correo.trim() && smtp !== 'ok' && <p className="aviso">Gmail sin configurar; esa parte fallará.</p>}

        <div className="preview">
          <img
            src={`/api/tarjeta?t=${encodeURIComponent(getToken() || '')}&nombre=${encodeURIComponent(previewNombre || ' ')}`}
            alt="Vista previa de la tarjeta activa"
          />
        </div>
      </section>

      {msg && <p className="msg fija">{msg}</p>}
    </div>
  );
}
