/**
 * Autenticación del administrador (single-admin).
 *
 *   POST /api/admin/login
 *   POST /api/admin/logout
 *   GET  /api/admin/session   (para que el panel sepa si sigue vivo)
 *
 * El rate limiting vive en Supabase, no en memoria: en serverless cada
 * invocación puede ser un proceso nuevo y un contador en RAM no serviría de
 * nada. La RPC cafe_login_intento hace el incremento de forma atómica.
 */
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');
const config = require('../config');
const { ErrorHttp, asyncHandler, fallaSupabase } = require('../lib/errores');
const sanitizar = require('../lib/sanitizar');
const { emitirSesion, cerrarSesion, requiereAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Clave del contador. Se usa la IP para que un atacante no pueda dejar
 * bloqueada la cuenta del admin desde fuera simplemente fallando adrede.
 */
function claveIntentos(req) {
  const ip = sanitizar.texto(req.ip || 'desconocida', 64);
  return 'login:' + ip;
}

/**
 * Hash de descarte con el mismo coste que el real. Sirve para gastar el
 * mismo tiempo de CPU cuando el usuario no coincide: si se saltara la
 * comparación, el tiempo de respuesta delataría si el nombre existe.
 *
 * Se genera la primera vez que se necesita y no al cargar el módulo: en
 * serverless cada arranque en frío cargaría este archivo, y un bcrypt de
 * coste 12 (~250 ms) retrasaría también las peticiones del catálogo.
 */
let hashSenuelo = null;
function senuelo() {
  if (!hashSenuelo) hashSenuelo = bcrypt.hashSync('senuelo-que-nadie-usa', 12);
  return hashSenuelo;
}

router.post('/login', asyncHandler(async (req, res) => {
  const usuario = sanitizar.texto(req.body && req.body.username, 64);
  const contrasena = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';

  // El contador se incrementa ANTES de comprobar nada, así un atacante no
  // puede evitarlo mandando peticiones a medias.
  const clave = claveIntentos(req);
  const { data: limite, error: errorLimite } = await supabase.rpc('cafe_login_intento', {
    p_clave: clave,
    p_max: config.rateLimit.maxIntentos,
    p_ventana: config.rateLimit.ventana,
    p_bloqueo: config.rateLimit.bloqueo
  });
  if (errorLimite) throw fallaSupabase('cafe_login_intento', errorLimite);

  if (limite && limite.permitido === false) {
    const hasta = limite.bloqueado_hasta ? new Date(limite.bloqueado_hasta) : null;
    const minutos = hasta ? Math.max(1, Math.ceil((hasta - Date.now()) / 60000)) : 15;
    throw new ErrorHttp(429,
      'Demasiados intentos fallidos. Vuelve a intentarlo en ' + minutos + ' minuto' +
      (minutos === 1 ? '' : 's') + '.',
      { bloqueadoHasta: limite.bloqueado_hasta });
  }

  // Comparar siempre contra un hash, aunque el usuario no coincida, para no
  // revelar por el tiempo de respuesta si el nombre existe.
  const hashEsperado = usuario === config.admin.usuario
    ? config.admin.hashContrasena
    : senuelo();
  const contrasenaOk = await bcrypt.compare(contrasena, hashEsperado);
  const credencialesOk = usuario === config.admin.usuario && contrasenaOk;

  if (!credencialesOk) {
    const restantes = limite ? Number(limite.restantes) : null;
    throw new ErrorHttp(401, 'Usuario o contraseña incorrectos.',
      restantes !== null && restantes >= 0 ? { intentosRestantes: restantes } : null);
  }

  const { error: errorReset } = await supabase.rpc('cafe_login_exito', { p_clave: clave });
  if (errorReset) throw fallaSupabase('cafe_login_exito', errorReset);

  emitirSesion(res, config.admin.usuario);
  res.json({ ok: true, usuario: config.admin.usuario });
}));

router.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

router.get('/session', requiereAdmin, (req, res) => {
  res.json({ ok: true, usuario: req.admin.usuario });
});

module.exports = router;
