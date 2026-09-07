'use strict';

const XLSX = require('xlsx');

const ENCABEZADOS = ['nombre', 'apellidos', 'fecha_nacimiento', 'telefono', 'correo'];

// Normaliza un encabezado: minúsculas, sin acentos, espacios -> guion bajo.
function normKey(k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ALIAS = {
  nombre: 'nombre',
  nombres: 'nombre',
  nombre_s: 'nombre',
  apellidos: 'apellidos',
  apellido: 'apellidos',
  fecha_nacimiento: 'fecha_nacimiento',
  fecha_de_nacimiento: 'fecha_nacimiento',
  nacimiento: 'fecha_nacimiento',
  cumpleanos: 'fecha_nacimiento',
  fecha: 'fecha_nacimiento',
  telefono: 'telefono',
  celular: 'telefono',
  whatsapp: 'telefono',
  tel: 'telefono',
  correo: 'correo',
  correo_electronico: 'correo',
  email: 'correo',
  mail: 'correo',
};

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function aISO(valor) {
  if (valor == null || valor === '') return null;

  if (valor instanceof Date && !isNaN(valor)) {
    const y = valor.getUTCFullYear();
    const m = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(valor.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof valor === 'number' && isFinite(valor)) {
    const o = XLSX.SSF.parse_date_code(valor);
    if (o && o.y) {
      return `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
    }
    return null;
  }

  const s = String(valor).trim();
  if (FECHA_ISO.test(s)) return s;

  // DD/MM/YYYY o DD-MM-YYYY  (también admite YYYY primero)
  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (m) {
    let [, a, b, c] = m;
    if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
    if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * Lee un buffer de Excel/CSV y devuelve filas válidas + errores por fila.
 */
function parseProfesores(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  if (!hoja) return { filas: [], errores: [{ fila: 0, motivo: 'El archivo no tiene hojas' }] };

  const bruto = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
  const filas = [];
  const errores = [];

  bruto.forEach((registro, i) => {
    const fila = i + 2; // +1 por encabezado, +1 porque Excel empieza en 1
    const r = {};
    for (const [k, v] of Object.entries(registro)) {
      const canon = ALIAS[normKey(k)];
      if (canon) r[canon] = v;
    }

    const nombre = String(r.nombre || '').trim();
    const iso = aISO(r.fecha_nacimiento);

    if (!nombre && !r.fecha_nacimiento && !r.apellidos && !r.telefono && !r.correo) return; // fila vacía
    if (!nombre) {
      errores.push({ fila, motivo: 'Falta "nombre"' });
      return;
    }
    if (!iso) {
      errores.push({ fila, motivo: `Fecha de nacimiento inválida: "${r.fecha_nacimiento}" (usa AAAA-MM-DD)` });
      return;
    }

    const tel = soloDigitos(r.telefono);
    filas.push({
      nombre,
      apellidos: String(r.apellidos || '').trim(),
      fecha_nacimiento: iso,
      telefono: tel || null,
      correo: String(r.correo || '').trim() || null,
      activo: true,
    });
  });

  return { filas, errores };
}

/**
 * Genera el archivo .xlsx de plantilla con encabezados y ejemplos.
 */
function plantillaBuffer() {
  const datos = [
    ENCABEZADOS,
    ['María', 'López García', '1985-03-14', '4431234567', 'maria.lopez@umich.mx'],
    ['Juan', 'Pérez Ruiz', '1979-11-02', '4437654321', 'juan.perez@umich.mx'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 28 }];

  const ayuda = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Obligatoria', 'Formato / notas'],
    ['nombre', 'Sí', 'Nombre(s) de pila'],
    ['apellidos', 'No', 'Apellidos'],
    ['fecha_nacimiento', 'Sí', 'AAAA-MM-DD (ej. 1985-03-14). También se acepta DD/MM/AAAA.'],
    ['telefono', 'No', '10 dígitos; se antepone 52 (México) automáticamente'],
    ['correo', 'No', 'Correo electrónico'],
    ['', '', ''],
    ['No cambies la fila de encabezados.', '', ''],
  ]);
  ayuda['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'profesores');
  XLSX.utils.book_append_sheet(wb, ayuda, 'instrucciones');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { parseProfesores, plantillaBuffer, ENCABEZADOS };
