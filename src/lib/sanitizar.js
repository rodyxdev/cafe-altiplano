/**
 * Saneamiento de entradas antes de que toquen la base.
 *
 * No sustituye a la parametrización (supabase-js ya manda los valores
 * separados del SQL); esto es para que no entren bytes nulos ni caracteres
 * de control que ensucien los datos o rompan el render después.
 */
'use strict';

// Bytes nulos y caracteres de control C0/C1, excepto tabulador y salto de
// línea, que sí son legítimos en una dirección de envío.
const CONTROL = new RegExp(
  '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]', 'g'
);

/** Texto plano de una línea: sin controles, sin saltos, recortado. */
function texto(valor, maxLargo) {
  if (valor === null || valor === undefined) return '';
  const limpio = String(valor)
    .replace(CONTROL, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return typeof maxLargo === 'number' ? limpio.slice(0, maxLargo) : limpio;
}

/** Texto multilínea (direcciones, descripciones): conserva los saltos. */
function textoLargo(valor, maxLargo) {
  if (valor === null || valor === undefined) return '';
  const limpio = String(valor)
    .replace(CONTROL, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return typeof maxLargo === 'number' ? limpio.slice(0, maxLargo) : limpio;
}

/** Entero acotado. Devuelve null si no es un número utilizable. */
function entero(valor, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (typeof min === 'number' && i < min) return null;
  if (typeof max === 'number' && i > max) return null;
  return i;
}

/** Número con dos decimales. Devuelve null si no es utilizable. */
function decimal(valor, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const d = Math.round(n * 100) / 100;
  if (typeof min === 'number' && d < min) return null;
  if (typeof max === 'number' && d > max) return null;
  return d;
}

/** Validación de correo deliberadamente laxa: solo descarta lo imposible. */
function correo(valor) {
  const limpio = texto(valor, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

// Marcas diacriticas combinantes (U+0300 a U+036F): lo que NFD deja suelto
// al separar cada letra de su acento.
const DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g');

/** Slug para ids de producto: minúsculas, dígitos y guiones. */
function slug(valor, maxLargo) {
  const limpio = texto(valor, maxLargo || 64)
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return limpio || null;
}

module.exports = { texto, textoLargo, entero, decimal, correo, slug };
