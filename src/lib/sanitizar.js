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

/**
 * Segunda capa contra XSS almacenado: indica si un texto trae los caracteres
 * con los que se abre o cierra una etiqueta HTML. Los campos de texto libre
 * que se guardan en la base se RECHAZAN si los contienen.
 *
 * Se rechaza en lugar de escapar a propósito: si se guardara "&amp;" o
 * "&lt;", el render (que también escapa) mostraría esas entidades literales
 * y un nombre legítimo como "Café & Co." aparecería roto. Rechazar evita que
 * entre HTML y deja intactos acentos, ñ, & y comillas.
 *
 * Debe evaluarse sobre el valor ya limpio de caracteres de control, para que
 * algo como "<" + byte nulo + "script>" no se cuele.
 */
const HTML = /[<>]/;
function contieneHtml(valor) {
  return HTML.test(String(valor == null ? '' : valor));
}
const MENSAJE_HTML = 'No puede contener los caracteres < ni >.';

/** Validación de correo deliberadamente laxa: solo descarta lo imposible. */
function correo(valor) {
  const limpio = texto(valor, 254).toLowerCase();
  if (contieneHtml(limpio)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

/**
 * Ruta de imagen del catálogo: solo archivos locales bajo /img/. El servidor
 * nunca descarga esta ruta (solo la guarda y la devuelve como texto), pero
 * restringirla evita que se use para romper el atributo src o para apuntar a
 * otro origen. Vacío se permite. Devuelve null si no es válida.
 */
const RUTA_IMAGEN = /^\/img\/[A-Za-z0-9._-]+\.(svg|png|jpe?g|webp|avif)$/;
function rutaImagen(valor) {
  const limpio = texto(valor, 300);
  if (limpio === '') return '';
  return RUTA_IMAGEN.test(limpio) ? limpio : null;
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

module.exports = {
  texto, textoLargo, entero, decimal, correo, slug,
  contieneHtml, MENSAJE_HTML, rutaImagen
};
