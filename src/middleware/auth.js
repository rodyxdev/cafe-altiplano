/**
 * Sesión del administrador: JWT dentro de una cookie httpOnly.
 *
 * La cookie es httpOnly para que ningún script pueda leerla, sameSite=strict
 * para que no viaje en peticiones desde otros sitios (defensa contra CSRF,
 * que aquí basta porque no hay flujos entre orígenes), y Secure cuando se
 * corre en producción.
 */
'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { ErrorHttp } = require('../lib/errores');

function opcionesCookie() {
  return {
    httpOnly: true,
    // En local el servidor habla http, y una cookie Secure no se guardaría,
    // así que no se podría ni entrar al panel. En producción siempre va.
    secure: config.esProduccion,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sesion.duracionSegundos * 1000
  };
}

/** Firma el token y lo deja en la cookie de respuesta. */
function emitirSesion(res, usuario) {
  const token = jwt.sign(
    { sub: usuario, rol: 'admin' },
    config.sesion.secreto,
    { expiresIn: config.sesion.duracionSegundos }
  );
  res.cookie(config.sesion.nombreCookie, token, opcionesCookie());
}

function cerrarSesion(res) {
  res.clearCookie(config.sesion.nombreCookie, { ...opcionesCookie(), maxAge: undefined });
}

/**
 * Exige sesión válida. Además reemite la cookie en cada petición, así el
 * plazo de 2 horas se mide desde la última actividad y no desde el login.
 */
function requiereAdmin(req, res, next) {
  const token = req.cookies ? req.cookies[config.sesion.nombreCookie] : null;
  if (!token) {
    return next(new ErrorHttp(401, 'Necesitas iniciar sesión.'));
  }
  let datos;
  try {
    datos = jwt.verify(token, config.sesion.secreto);
  } catch (e) {
    cerrarSesion(res);
    const expirado = e && e.name === 'TokenExpiredError';
    return next(new ErrorHttp(401, expirado
      ? 'Tu sesión expiró por inactividad. Inicia sesión de nuevo.'
      : 'Sesión inválida. Inicia sesión de nuevo.'));
  }
  if (!datos || datos.rol !== 'admin' || datos.sub !== config.admin.usuario) {
    cerrarSesion(res);
    return next(new ErrorHttp(401, 'Sesión inválida. Inicia sesión de nuevo.'));
  }

  req.admin = { usuario: datos.sub };
  emitirSesion(res, datos.sub); // renueva la ventana de inactividad
  next();
}

module.exports = { emitirSesion, cerrarSesion, requiereAdmin };
