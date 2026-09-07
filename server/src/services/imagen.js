'use strict';

// Genera la tarjeta de felicitación: toma una plantilla (imagen) y escribe el
// nombre del profesor en la posición configurada para esa plantilla.

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const config = require('../config');
const db = require('../db');

const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const fuentesRegistradas = new Set();
const imagenCache = new Map(); // archivo -> Promise<Image>

// Registra una fuente por su nombre de archivo (sin extensión) en assets/fonts.
function registrarFuente(nombreFuente) {
  const fam = String(nombreFuente || 'NotoSerif-Bold').replace(/[^\w.-]/g, '');
  if (fuentesRegistradas.has(fam)) return fam;
  const ruta = path.join(FONTS_DIR, `${fam}.ttf`);
  if (fs.existsSync(ruta)) {
    GlobalFonts.registerFromPath(ruta, fam);
    fuentesRegistradas.add(fam);
    return fam;
  }
  // Fallback a la fuente por defecto.
  const def = 'NotoSerif-Bold';
  if (!fuentesRegistradas.has(def) && fs.existsSync(path.join(FONTS_DIR, `${def}.ttf`))) {
    GlobalFonts.registerFromPath(path.join(FONTS_DIR, `${def}.ttf`), def);
    fuentesRegistradas.add(def);
  }
  return def;
}

function cargarImagen(archivo) {
  if (!imagenCache.has(archivo)) {
    imagenCache.set(
      archivo,
      loadImage(archivo).catch((err) => {
        imagenCache.delete(archivo);
        throw new Error(`No se pudo cargar la plantilla ${archivo}: ${err.message}`);
      })
    );
  }
  return imagenCache.get(archivo);
}

function invalidarCache(archivo) {
  if (archivo) imagenCache.delete(archivo);
  else imagenCache.clear();
}

function repartirLineas(ctx, texto, maxAncho, maxLineas) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(tentativa).width <= maxAncho || !actual) {
      actual = tentativa;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= maxLineas) return lineas;
  return [...lineas.slice(0, maxLineas - 1), lineas.slice(maxLineas - 1).join(' ')];
}

/**
 * Dibuja `nombre` sobre la plantilla dada.
 * @param {string} nombre
 * @param {{archivo:string, nombre_x?:number, nombre_y?:number, nombre_size?:number,
 *          nombre_color?:string, fuente?:string}} plantilla
 * @returns {Promise<Buffer>} JPEG
 */
async function generarConPlantilla(nombre, plantilla) {
  const base = await cargarImagen(plantilla.archivo);
  const W = base.width;
  const H = base.height;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0, W, H);

  const texto = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!texto) return canvas.encode('jpeg', 92);

  const xRel = Number.isFinite(plantilla.nombre_x) ? plantilla.nombre_x : 0.5;
  const yRel = Number.isFinite(plantilla.nombre_y) ? plantilla.nombre_y : 0.7;
  const sizeRel = Number.isFinite(plantilla.nombre_size) ? plantilla.nombre_size : 0.04;
  const color = plantilla.nombre_color || '#1b2a6b';
  const fam = registrarFuente(plantilla.fuente);

  const cx = W * xRel;
  const cy = H * yRel;
  const maxAncho = W * 0.9;
  let size = Math.round(H * sizeRel);
  const sizeMin = Math.round(H * 0.018);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;

  let lineas = [texto];
  for (;;) {
    ctx.font = `${size}px "${fam}"`;
    if (ctx.measureText(texto).width <= maxAncho || size <= sizeMin) break;
    size -= 2;
  }
  ctx.font = `${size}px "${fam}"`;
  if (ctx.measureText(texto).width > maxAncho) {
    lineas = repartirLineas(ctx, texto, maxAncho, 2);
  }

  const interlineado = size * 1.15;
  const yInicial = cy - ((lineas.length - 1) * interlineado) / 2;
  lineas.forEach((linea, i) => ctx.fillText(linea, cx, yInicial + i * interlineado));

  return canvas.encode('jpeg', 92);
}

// Plantilla por defecto (la incluida en assets/) si aún no hay ninguna en la BD.
function plantillaPorDefecto() {
  return {
    id: 0,
    nombre: 'Plantilla incluida',
    archivo: config.imagen.plantilla,
    nombre_x: config.imagen.xRel,
    nombre_y: config.imagen.yRel,
    nombre_size: config.imagen.sizeRel,
    nombre_color: config.imagen.color,
    fuente: 'NotoSerif-Bold',
  };
}

async function plantillaActiva() {
  try {
    const { rows } = await db.query('SELECT * FROM plantillas WHERE activa LIMIT 1');
    if (rows[0]) return rows[0];
  } catch {
    /* tabla aún no migrada: usa la de assets/ */
  }
  return plantillaPorDefecto();
}

async function generarTarjetaActiva(nombre) {
  return generarConPlantilla(nombre, await plantillaActiva());
}

module.exports = {
  generarConPlantilla,
  generarTarjetaActiva,
  plantillaActiva,
  plantillaPorDefecto,
  invalidarCache,
  FONTS_DIR,
};
