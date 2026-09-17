/**
 * Carga y valida la configuración desde variables de entorno.
 *
 * Falla de inmediato al arrancar si falta algo crítico: es preferible a
 * descubrirlo a media petición con un error opaco.
 */
'use strict';

// En Vercel no hay archivo .env: las variables llegan del entorno y dotenv
// simplemente no encuentra nada. quiet evita su línea de log en cada arranque.
require('dotenv').config({ quiet: true });

const REQUERIDAS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD_HASH',
  'JWT_SECRET'
];

function validar() {
  const faltantes = REQUERIDAS.filter((k) => !process.env[k] || !process.env[k].trim());
  if (faltantes.length) {
    throw new Error(
      'Faltan variables de entorno: ' + faltantes.join(', ') +
      '\nCopia .env.example a .env y llena los valores.'
    );
  }
  if (!/^\$2[aby]\$\d{2}\$/.test(process.env.ADMIN_PASSWORD_HASH)) {
    throw new Error(
      'ADMIN_PASSWORD_HASH no parece un hash bcrypt. ' +
      'Genéralo con: npm run hash -- "tu-contrasena"'
    );
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET es demasiado corto (mínimo 32 caracteres).');
  }
}

validar();

const esProduccion = process.env.NODE_ENV === 'production';

module.exports = {
  puerto: Number(process.env.PORT) || 3000,
  esProduccion,
  // Acepta TRUST_PROXY=1 o TRUST_PROXY=true.
  confiarEnProxy: ['1', 'true'].indexOf(String(process.env.TRUST_PROXY || '').trim().toLowerCase()) !== -1,

  supabase: {
    url: process.env.SUPABASE_URL.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  },

  admin: {
    usuario: process.env.ADMIN_USERNAME.trim(),
    hashContrasena: process.env.ADMIN_PASSWORD_HASH.trim()
  },

  sesion: {
    secreto: process.env.JWT_SECRET,
    // Inactividad máxima. La cookie se vuelve a emitir en cada petición
    // autenticada, así que el reloj se reinicia mientras haya actividad.
    duracionSegundos: 2 * 60 * 60,
    nombreCookie: 'ca_admin'
  },

  rateLimit: {
    maxIntentos: 5,
    ventana: '15 minutes',
    bloqueo: '15 minutes'
  },

  // El checkout es anónimo y cada pedido descuenta stock real: se limita por
  // IP para que nadie genere pedidos en ráfaga. 10 por hora no estorba a
  // quien prueba el flujo un par de veces.
  rateLimitCheckout: {
    pedidosPorVentana: 10,
    ventana: '1 hour',
    bloqueo: '1 hour'
  }
};
