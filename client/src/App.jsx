import { useState } from 'react';
import { getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Profesores from './pages/Profesores.jsx';
import Plantillas from './pages/Plantillas.jsx';
import Envios from './pages/Envios.jsx';

const TABS = [
  { id: 'profesores', label: 'Profesores', comp: Profesores },
  { id: 'plantillas', label: 'Plantillas', comp: Plantillas },
  { id: 'envios', label: 'Envíos', comp: Envios },
];

export default function App() {
  const [autenticado, setAutenticado] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('profesores');

  if (!autenticado) return <Login onLogin={() => setAutenticado(true)} />;

  const Activa = TABS.find((t) => t.id === tab).comp;

  return (
    <div className="app">
      <header className="top">
        <div className="marca">Felicitaciones FCCA</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? 'tab activa' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={() => { setToken(null); setAutenticado(false); }}>
          Salir
        </button>
      </header>
      <main className="contenido">
        <Activa />
      </main>
    </div>
  );
}
