const TOKEN_KEY = 'felicitaciones_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function handle401(res) {
  if (res.status === 401) {
    setToken(null);
    location.reload();
    return true;
  }
  return false;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (handle401(res)) return;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

// Subida multipart (FormData). No fija Content-Type: el navegador pone el boundary.
export async function apiUpload(path, formData, method = 'POST') {
  const res = await fetch(`/api${path}`, { method, headers: authHeader(), body: formData });
  if (handle401(res)) return;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

// Descarga un archivo del backend disparando "Guardar como" en el navegador.
export async function descargar(path, nombreArchivo) {
  const res = await fetch(`/api${path}`, { headers: authHeader() });
  if (handle401(res)) return;
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
