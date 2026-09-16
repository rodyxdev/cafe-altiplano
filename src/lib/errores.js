/**
 * Manejo de errores uniforme.
 *
 * Regla: al cliente nunca le llega el detalle interno. Un fallo de Postgres,
 * de PostgREST o un stack trace se registran completos en el log del servidor
 * y al navegador solo le llega un mensaje genérico con un identificador para
 * poder cruzarlo con el log.
 */
'use strict';

const crypto = require('crypto');

/** Error con código HTTP y mensaje pensado para mostrarse al usuario. */
class ErrorHttp extends Error {
  constructor(estado, mensaje, extra) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.estado = estado;
    this.extra = extra || null;
    this.esPublico = true;
  }
}

/** Envuelve un handler async para que sus rechazos lleguen al middleware. */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** 404 para rutas de API que no existen. */
function noEncontrado(req, res, next) {
  next(new ErrorHttp(404, 'Recurso no encontrado.'));
}

/** Middleware final de errores. Debe registrarse al último. */
function manejadorErrores(err, req, res, _next) {
  if (err && err.esPublico) {
    const cuerpo = { error: err.message };
    if (err.extra) Object.assign(cuerpo, err.extra);
    return res.status(err.estado).json(cuerpo);
  }

  // Todo lo demás es un fallo interno: se registra completo y se responde
  // con un mensaje genérico.
  const id = crypto.randomBytes(6).toString('hex');
  console.error(
    '[error ' + id + '] ' + req.method + ' ' + req.originalUrl + '\n',
    err && err.stack ? err.stack : err
  );
  return res.status(500).json({
    error: 'Ocurrió un error en el servidor. Inténtalo de nuevo más tarde.',
    referencia: id
  });
}

/**
 * Traduce un error de supabase-js a un fallo interno, dejando el detalle
 * en el log. Se usa en cada punto donde hablamos con la base.
 */
function fallaSupabase(contexto, error) {
  const e = new Error(
    'Supabase falló en ' + contexto + ': ' +
    (error && error.message ? error.message : 'sin mensaje') +
    (error && error.code ? ' (code ' + error.code + ')' : '')
  );
  e.causa = error;
  return e;
}

module.exports = { ErrorHttp, asyncHandler, noEncontrado, manejadorErrores, fallaSupabase };
