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

// Algoritmo fijado explícitamente al firmar Y al verificar. Si no se pasa en
// verify(), jsonwebtoken decide la lista según el tipo de llave; fijarlo aquí
// hace que la política dependa de este código y no de un valor por defecto,
// y descarta confusión de algoritmo (alg "none", RS256 con la llave como
// secreto, etc.).
const ALGORITMO = 'HS256';

// Un solo mensaje para cualquier fallo de sesión: sin cookie, firma
// inválida, algoritmo distinto, expirado o malformado. Al cliente no se le
// dice cuál fue; el motivo solo se usa internamente.
const SESION_INVALIDA = 'Necesitas iniciar sesión.';

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
    { algorithm: ALGORITMO, expiresIn: config.sesion.duracionSegundos }
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
    return next(new ErrorHttp(401, SESION_INVALIDA));
  }
  let datos;
  try {
    // algorithms: solo HS256. La expiración se verifica por defecto (no se
    // usa ignoreExpiration).
    datos = jwt.verify(token, config.sesion.secreto, { algorithms: [ALGORITMO] });
  } catch (e) {
    cerrarSesion(res);
    return next(new ErrorHttp(401, SESION_INVALIDA));
  }
  if (!datos || datos.rol !== 'admin' || datos.sub !== config.admin.usuario) {
    cerrarSesion(res);
    return next(new ErrorHttp(401, SESION_INVALIDA));
  }

  req.admin = { usuario: datos.sub };
  emitirSesion(res, datos.sub); // renueva la ventana de inactividad
  next();
}

module.exports = { emitirSesion, cerrarSesion, requiereAdmin };
