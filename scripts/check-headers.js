#!/usr/bin/env node
/**
 * Las cabeceras de seguridad viven en dos lugares: src/middleware/seguridad.js
 * (respuestas de Express, en local y en /api) y vercel.json (archivos
 * estáticos que Vercel sirve desde su CDN sin pasar por Express). JSON no
 * admite comentarios ni imports, así que este script verifica que no se
 * desincronicen.
 *
 *   npm run check:headers
 */
'use strict';

const vercel = require('../vercel.json');
const { CSP } = require('../src/middleware/seguridad');

const esperadas = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'Content-Security-Policy': CSP
};

const globales = (vercel.headers.find((h) => h.source === '/(.*)') || {}).headers || [];
const enVercel = Object.fromEntries(globales.map((h) => [h.key, h.value]));

let ok = true;
for (const [clave, valor] of Object.entries(esperadas)) {
  if (enVercel[clave] !== valor) {
    ok = false;
    console.error('Desincronizada: ' + clave + '\n  express: ' + valor + '\n  vercel : ' + enVercel[clave]);
  }
}
console.log(ok ? 'Cabeceras de vercel.json y seguridad.js coinciden.' : 'Hay cabeceras desincronizadas.');
process.exit(ok ? 0 : 1);
