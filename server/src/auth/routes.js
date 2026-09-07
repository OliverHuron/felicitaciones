'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('./middleware');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }
  const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = jwt.sign(
    { sub: u.id, usuario: u.usuario, nombre: u.nombre },
    config.jwtSecret,
    { expiresIn: config.jwtExpire }
  );
  res.json({ token, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

module.exports = router;
