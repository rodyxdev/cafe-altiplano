#!/usr/bin/env node
/**
 * Genera el hash bcrypt (cost 12) de una contraseña para ADMIN_PASSWORD_HASH.
 *
 *   npm run hash -- "mi contrasena"
 *
 * Solo el hash se guarda en .env; la contraseña en texto plano no se escribe
 * en ningún archivo.
 */
'use strict';

const bcrypt = require('bcryptjs');

const COSTO = 12;
const contrasena = process.argv[2];

if (!contrasena) {
  console.error('Uso: npm run hash -- "la-contrasena"');
  process.exit(1);
}
if (contrasena.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

const hash = bcrypt.hashSync(contrasena, COSTO);
console.log(hash);
