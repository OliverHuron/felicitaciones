import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiUpload, descargar } from '../api.js';

const VACIO = { nombre: '', apellidos: '', fecha_nacimiento: '', telefono: '', correo: '', activo: true };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatoCumple(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1]}`;
}
const detalleCanal = (c) => (c ? `${c.estado}${c.detalle ? ` (${c.detalle})` : ''}` : '—');

export default function Profesores() {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [enviandoId, setEnviandoId] = useState(null);
  const [importe, setImporte] = useState(null);
  const fileRef = useRef(null);

  const cargar = useCallback(async () => {
    setLista(await api('/profesores'));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setMsg(e.message));
  }, [cargar]);

  async function guardar(e) {
    e.preventDefault();
    try {
      if (form.id) await api(`/profesores/${form.id}`, { method: 'PUT', body: form });
      else await api('/profesores', { method: 'POST', body: form });
      setForm(null);
      cargar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function borrar(p) {
    if (!confirm(`¿Eliminar a ${p.nombre} ${p.apellidos}?`)) return;
    await api(`/profesores/${p.id}`, { method: 'DELETE' });
    cargar();
  }

  async function enviarA(p) {
    if (!confirm(`¿Enviar la felicitación a ${p.nombre} ${p.apellidos} ahora?`)) return;
    setEnviandoId(p.id);
    setMsg(`Enviando a ${p.nombre}…`);
    try {
      const r = await api(`/jobs/enviar/${p.id}`, { method: 'POST' });
      setMsg(`${r.nombre} → WhatsApp: ${detalleCanal(r.whatsapp)} · Gmail: ${detalleCanal(r.email)}`);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setEnviandoId(null);
    }
  }

  async function importar(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setMsg('Importando…');
    setImporte(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const r = await apiUpload('/profesores/importar', fd);
      setImporte(r);
      setMsg('');
      cargar();
    } catch (err) {
      setMsg('Error al importar: ' + err.message);
    }
  }

  return (
    <div className="pila">
      <section className="card">
        <div className="barra">
          <h2>Profesores ({lista.length})</h2>
          <div className="acciones-barra">
            <button onClick={() => setForm({ ...VACIO })}>Nuevo</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>Importar Excel</button>
            <button
              className="ghost"
              onClick={() => descargar('/profesores/plantilla.xlsx', 'plantilla-profesores.xlsx').catch((e) => setMsg(e.message))}
            >
              Descargar plantilla
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={importar}
            />
          </div>
        </div>

        {importe && (
          <div className="resumen">
            <p>
              <strong>{importe.insertados}</strong> agregados
              {importe.omitidos ? `, ${importe.omitidos} ya existían` : ''}
              {importe.errores?.length ? `, ${importe.errores.length} con error` : ''}.
            </p>
            {importe.errores?.length > 0 && (
              <ul className="errores">
                {importe.errores.slice(0, 12).map((er, i) => (
                  <li key={i}>Fila {er.fila}: {er.motivo}</li>
                ))}
                {importe.errores.length > 12 && <li>… y {importe.errores.length - 12} más</li>}
              </ul>
            )}
            <button className="ghost sm" onClick={() => setImporte(null)}>Cerrar</button>
          </div>
        )}

        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cumpleaños</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Activo</th>
                <th aria-label="acciones" />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre} {p.apellidos}</td>
                  <td>{formatoCumple(p.fecha_nacimiento)}</td>
                  <td>{p.telefono || '—'}</td>
                  <td>{p.correo || '—'}</td>
                  <td>{p.activo ? 'Sí' : 'No'}</td>
                  <td className="acciones">
                    <button
                      className="ghost sm"
                      disabled={enviandoId === p.id || (!p.telefono && !p.correo)}
                      title={!p.telefono && !p.correo ? 'Sin teléfono ni correo' : 'Enviar felicitación ahora'}
                      onClick={() => enviarA(p)}
                    >
                      {enviandoId === p.id ? 'Enviando…' : 'Enviar'}
                    </button>
                    <button className="ghost sm" onClick={() => setForm({ ...p })}>Editar</button>
                    <button className="ghost sm danger" onClick={() => borrar(p)}>Borrar</button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan="6" className="vacio">Sin profesores todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {msg && <p className="msg">{msg}</p>}
      </section>

      {form && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <form className="card modal-form" onSubmit={guardar}>
            <h2>{form.id ? 'Editar' : 'Nuevo'} profesor</h2>
            <label>Nombre *
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label>Apellidos
              <input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
            </label>
            <label>Fecha de nacimiento *
              <input type="date" required value={form.fecha_nacimiento}
                onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} />
            </label>
            <label>Teléfono (WhatsApp)
              <input value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="10 dígitos (se antepone 52)" />
            </label>
            <label>Correo
              <input type="email" value={form.correo || ''} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
            <div className="barra">
              <button type="button" className="ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button>Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
