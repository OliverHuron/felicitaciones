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

  // Programación
  const [prog, setProg] = useState(null);
  const [hora, setHora] = useState('08:00');
  const [avanzado, setAvanzado] = useState(false);
  const [cronTxt, setCronTxt] = useState('0 8 * * *');

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

  const cargarProg = useCallback(async () => {
    try {
      const p = await api('/ajustes/programacion');
      setProg(p);
      setCronTxt(p.cron);
      if (p.hora != null) {
        setHora(`${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`);
      } else {
        setAvanzado(true);
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    cargarSalud();
    cargarWa();
    cargarProg();
    const id = setInterval(cargarWa, 4000);
    return () => clearInterval(id);
  }, [cargarSalud, cargarWa, cargarProg]);

  useEffect(() => {
    if (wa.estado === 'qr' && wa.hayQR) {
      api('/whatsapp/qr').then((r) => setQr(r?.qr || null)).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [wa.estado, wa.hayQR]);

  async function guardarProgramacion() {
    setMsg('Guardando programación…');
    try {
      const body = avanzado
        ? { cron: cronTxt.trim(), activo: prog.activo }
        : (() => {
            const [h, m] = hora.split(':');
            return { hora: +h, minuto: +m, activo: prog.activo };
          })();
      const p = await api('/ajustes/programacion', { method: 'PUT', body });
      setProg(p);
      setCronTxt(p.cron);
      setMsg(
        p.activo
          ? `Guardado. El envío automático correrá ${p.descripcion} (hora de ${p.tz}).`
          : 'Guardado. El envío automático quedó DESACTIVADO.'
      );
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
  }

  async function ejecutarAhora() {
    setMsg('Ejecutando…');
    try {
      const r = await api('/jobs/cumpleanos/run', { method: 'POST' });
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
        <h2>Programación del envío automático</h2>
        <p className="sub">
          Cada día a la hora indicada, el sistema revisa quién cumple años y envía la
          felicitación por los canales activados. Hora de <strong>{prog?.tz || 'México'}</strong>.
        </p>

        <label className="check">
          <input
            type="checkbox"
            checked={prog?.activo ?? true}
            onChange={(e) => setProg((p) => ({ ...p, activo: e.target.checked }))}
          />
          Envío automático activado
        </label>

        {!avanzado ? (
          <label>Hora del envío diario
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ maxWidth: 140 }} />
          </label>
        ) : (
          <label>Expresión cron <span className="sub">(min hora día-mes mes día-semana)</span>
            <input value={cronTxt} onChange={(e) => setCronTxt(e.target.value)} placeholder="0 8 * * *" />
          </label>
        )}

        <label className="check">
          <input type="checkbox" checked={avanzado} onChange={(e) => setAvanzado(e.target.checked)} />
          Modo avanzado (cron) — p. ej. <code>0 8 * * 1-5</code> = solo días hábiles
        </label>

        <div className="fila-accion">
          <button onClick={guardarProgramacion}>Guardar programación</button>
          <button className="ghost sm" onClick={ejecutarAhora}>Ejecutar ahora</button>
        </div>
        {prog && (
          <p className="msg">
            Ahora mismo: {prog.activo ? prog.descripcion : 'desactivado'} · <code>{prog.cron}</code>
          </p>
        )}
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
