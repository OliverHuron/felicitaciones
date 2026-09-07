import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiUpload, getToken } from '../api.js';

const T = () => encodeURIComponent(getToken() || '');
const imgUrl = (id) => `/api/plantillas/${id}/imagen?t=${T()}`;

export default function Plantillas() {
  const [lista, setLista] = useState([]);
  const [fuentes, setFuentes] = useState(['NotoSerif-Bold']);
  const [selId, setSelId] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [ejemplo, setEjemplo] = useState('María López García');
  const [verReal, setVerReal] = useState(false);
  const [msg, setMsg] = useState('');
  const [subNombre, setSubNombre] = useState('');
  const subRef = useRef(null);

  const lienzoRef = useRef(null);
  const [lienzoH, setLienzoH] = useState(0);
  const arrastrando = useRef(false);

  const cargar = useCallback(async () => {
    const l = await api('/plantillas');
    setLista(l);
    setSelId((prev) => prev ?? l.find((p) => p.activa)?.id ?? l[0]?.id ?? null);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setMsg(e.message));
    api('/plantillas/fuentes').then(setFuentes).catch(() => {});
  }, [cargar]);

  // @font-face para que la etiqueta del editor se vea como el render real.
  useEffect(() => {
    const css = fuentes
      .map((f) => `@font-face{font-family:'${f}';src:url('/api/fonts/${f}.ttf');font-display:swap}`)
      .join('\n');
    let tag = document.getElementById('fuentes-editor');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'fuentes-editor';
      document.head.appendChild(tag);
    }
    tag.textContent = css;
  }, [fuentes]);

  const sel = lista.find((p) => p.id === selId) || null;
  useEffect(() => {
    if (!sel) return setCfg(null);
    setCfg({
      nombre: sel.nombre,
      nombre_x: sel.nombre_x,
      nombre_y: sel.nombre_y,
      nombre_size: sel.nombre_size,
      nombre_color: sel.nombre_color,
      fuente: sel.fuente,
    });
    setVerReal(false);
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const medir = () => setLienzoH(lienzoRef.current?.getBoundingClientRect().height || 0);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [selId, verReal]);

  function posDesdeEvento(e) {
    const r = lienzoRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setCfg((c) => ({ ...c, nombre_x: +x.toFixed(4), nombre_y: +y.toFixed(4) }));
  }

  async function guardar() {
    setMsg('Guardando…');
    try {
      await api(`/plantillas/${selId}`, { method: 'PUT', body: cfg });
      await cargar();
      setMsg('Posición guardada.');
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
  }

  async function subir() {
    const archivo = subRef.current?.files?.[0];
    if (!archivo) return;
    setMsg('Subiendo plantilla…');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      if (subNombre.trim()) fd.append('nombre', subNombre.trim());
      const nueva = await apiUpload('/plantillas', fd);
      subRef.current.value = '';
      setSubNombre('');
      await cargar();
      setSelId(nueva.id);
      setMsg('Plantilla subida. Coloca el nombre y guarda.');
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
  }

  async function activar(id) {
    await api(`/plantillas/${id}/activar`, { method: 'POST' });
    cargar();
  }

  async function borrar(p) {
    if (p.es_default) return;
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
    await api(`/plantillas/${p.id}`, { method: 'DELETE' });
    if (selId === p.id) setSelId(null);
    cargar();
  }

  const realUrl =
    cfg && sel
      ? `/api/plantillas/${selId}/preview?t=${T()}` +
        `&nombre=${encodeURIComponent(ejemplo || ' ')}` +
        `&x=${cfg.nombre_x}&y=${cfg.nombre_y}&size=${cfg.nombre_size}` +
        `&color=${encodeURIComponent(cfg.nombre_color)}&fuente=${encodeURIComponent(cfg.fuente)}`
      : '';

  return (
    <div className="pila">
      <section className="card">
        <div className="barra">
          <h2>Plantillas</h2>
        </div>
        <div className="galeria">
          {lista.map((p) => (
            <div
              key={p.id}
              className={`plantilla-card ${p.id === selId ? 'sel' : ''}`}
              onClick={() => setSelId(p.id)}
            >
              <img src={imgUrl(p.id)} alt={p.nombre} />
              <div className="pc-pie">
                <span className="pc-nombre">{p.nombre}</span>
                {p.activa && <span className="badge conectado">activa</span>}
              </div>
              <div className="pc-acciones">
                {!p.activa && (
                  <button className="ghost sm" onClick={(e) => { e.stopPropagation(); activar(p.id); }}>
                    Usar
                  </button>
                )}
                {!p.es_default && (
                  <button className="ghost sm danger" onClick={(e) => { e.stopPropagation(); borrar(p); }}>
                    Borrar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="subir">
          <input ref={subRef} type="file" accept="image/*" />
          <input
            placeholder="Nombre de la plantilla (opcional)"
            value={subNombre}
            onChange={(e) => setSubNombre(e.target.value)}
          />
          <button className="ghost" onClick={subir}>Subir plantilla</button>
        </div>
      </section>

      {cfg && sel && (
        <section className="card editor">
          <div className="barra">
            <h2>Colocar el nombre — {sel.nombre}</h2>
            <button onClick={guardar}>Guardar</button>
          </div>
          <p className="sub">Arrastra el nombre sobre la imagen o usa los controles. La “vista real” es el resultado exacto.</p>

          <div className="editor-cols">
            <div
              className="lienzo"
              ref={lienzoRef}
              onPointerMove={(e) => arrastrando.current && posDesdeEvento(e)}
              onPointerUp={() => (arrastrando.current = false)}
              onPointerLeave={() => (arrastrando.current = false)}
            >
              {verReal ? (
                <img src={realUrl} alt="Vista real" />
              ) : (
                <>
                  <img src={imgUrl(selId)} alt={sel.nombre} draggable={false} onLoad={() =>
                    setLienzoH(lienzoRef.current?.getBoundingClientRect().height || 0)} />
                  <div
                    className="etiqueta"
                    style={{
                      left: `${cfg.nombre_x * 100}%`,
                      top: `${cfg.nombre_y * 100}%`,
                      fontSize: `${Math.max(8, cfg.nombre_size * lienzoH)}px`,
                      color: cfg.nombre_color,
                      fontFamily: `'${cfg.fuente}', serif`,
                    }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      arrastrando.current = true;
                      posDesdeEvento(e);
                    }}
                  >
                    {ejemplo || 'Nombre'}
                  </div>
                </>
              )}
            </div>

            <div className="controles">
              <label>Nombre de ejemplo
                <input value={ejemplo} onChange={(e) => setEjemplo(e.target.value)} />
              </label>
              <label>Fuente
                <select value={cfg.fuente} onChange={(e) => setCfg({ ...cfg, fuente: e.target.value })}>
                  {fuentes.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label>Tamaño: {(cfg.nombre_size * 100).toFixed(1)}%
                <input type="range" min="0.015" max="0.09" step="0.001"
                  value={cfg.nombre_size}
                  onChange={(e) => setCfg({ ...cfg, nombre_size: +e.target.value })} />
              </label>
              <label>Color
                <input type="color" value={cfg.nombre_color}
                  onChange={(e) => setCfg({ ...cfg, nombre_color: e.target.value })} />
              </label>
              <label>Horizontal: {(cfg.nombre_x * 100).toFixed(0)}%
                <input type="range" min="0" max="1" step="0.005"
                  value={cfg.nombre_x}
                  onChange={(e) => setCfg({ ...cfg, nombre_x: +e.target.value })} />
              </label>
              <label>Vertical: {(cfg.nombre_y * 100).toFixed(0)}%
                <input type="range" min="0" max="1" step="0.005"
                  value={cfg.nombre_y}
                  onChange={(e) => setCfg({ ...cfg, nombre_y: +e.target.value })} />
              </label>
              <button className="ghost" onClick={() => setVerReal((v) => !v)}>
                {verReal ? 'Editar posición' : 'Ver render real'}
              </button>
            </div>
          </div>
        </section>
      )}

      {msg && <p className="msg fija">{msg}</p>}
    </div>
  );
}
