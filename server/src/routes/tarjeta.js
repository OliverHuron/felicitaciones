'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const imagen = require('../services/imagen');

const router = express.Router();

// Vista previa de la tarjeta. Acepta el token por cabecera Bearer o por
// ?t=<token> (para poder usarlo directo en un <img src>).
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.t;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

router.get('/', auth, async (req, res, next) => {
  try {
    const nombre = String(req.query.nombre || 'Nombre del Profesor').slice(0, 120);
    const buffer = await imagen.generarTarjetaActiva(nombre);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
