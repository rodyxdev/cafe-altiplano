#!/usr/bin/env node
/**
 * Restaura la demo pública a su estado original.
 *
 *   node scripts/reset-demo.js
 *
 * El panel de administración es público a propósito (credenciales visibles
 * en el login), así que cualquier visitante puede crear, editar o borrar
 * productos y generar pedidos. Este script deshace todo eso. Lo corre un
 * workflow de GitHub Actions una vez al día.
 *
 * Orden:
 *   a) borrar todos los pedidos (los renglones se van por cascada)
 *   b) borrar los productos que no sean de la semilla
 *   c) upsert de los 11 productos de la semilla con TODOS sus campos, lo
 *      que también revierte ediciones y re-crea originales borrados
 *   d) limpiar contadores de login vencidos
 * y al final comprueba que la base quedó idéntica a la semilla. Si no,
 * sale con código 1 para que el workflow se marque como fallido.
 *
 * Solo necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. No usa
 * src/config.js a propósito: ese módulo exige también las variables del
 * admin y del JWT, que en GitHub Actions no existen ni hacen falta.
 */
'use strict';

require('dotenv').config({ quiet: true });

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SEMILLA = require(path.join(__dirname, '..', 'data', 'products.json'));
const CAMPOS = ['id', 'name', 'description', 'price', 'origin', 'category', 'stock', 'image'];

function falla(mensaje, error) {
  console.error('ERROR: ' + mensaje + (error ? ' -> ' + (error.message || error) : ''));
  process.exit(1);
}

async function main() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const llave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !llave) falla('faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');

  if (!Array.isArray(SEMILLA) || SEMILLA.length === 0) falla('data/products.json está vacío');
  const ids = SEMILLA.map((p) => p.id);

  const db = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });

  // a) Pedidos. supabase-js no permite un delete sin filtro; este abarca todo.
  const pedidos = await db.from('cafe_orders').delete().not('id', 'is', null).select('id');
  if (pedidos.error) falla('borrando pedidos', pedidos.error);
  console.log('a) pedidos borrados: ' + pedidos.data.length + ' (renglones por cascada)');

  // b) Productos que no son de la semilla.
  const lista = '(' + ids.map((id) => '"' + id + '"').join(',') + ')';
  const ajenos = await db.from('cafe_products').delete().not('id', 'in', lista).select('id');
  if (ajenos.error) falla('borrando productos ajenos a la semilla', ajenos.error);
  console.log('b) productos ajenos borrados: ' + ajenos.data.length +
    (ajenos.data.length ? ' (' + ajenos.data.map((p) => p.id).join(', ') + ')' : ''));

  // c) Registro completo de la semilla.
  const filas = SEMILLA.map((p) => Object.fromEntries(CAMPOS.map((c) => [c, p[c]])));
  const upsert = await db.from('cafe_products').upsert(filas, { onConflict: 'id' }).select('id');
  if (upsert.error) falla('restaurando productos de la semilla', upsert.error);
  console.log('c) productos restaurados: ' + upsert.data.length);

  // d) Contadores de login con más de un día y sin bloqueo vigente.
  const ahora = new Date();
  const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const intentos = await db.from('cafe_login_attempts').delete()
    .lt('ventana_inicio', ayer)
    .or('bloqueado_hasta.is.null,bloqueado_hasta.lt.' + ahora.toISOString())
    .select('clave');
  if (intentos.error) falla('limpiando intentos de login vencidos', intentos.error);
  console.log('d) contadores de login vencidos borrados: ' + intentos.data.length);

  // Comprobación final contra la semilla.
  const actual = await db.from('cafe_products').select(CAMPOS.join(', ')).order('id');
  if (actual.error) falla('leyendo productos para comprobar', actual.error);
  const quedan = await db.from('cafe_orders').select('id', { count: 'exact', head: true });
  if (quedan.error) falla('contando pedidos para comprobar', quedan.error);

  const problemas = [];
  if (quedan.count !== 0) problemas.push('quedan ' + quedan.count + ' pedidos');
  if (actual.data.length !== SEMILLA.length) {
    problemas.push('hay ' + actual.data.length + ' productos, se esperaban ' + SEMILLA.length);
  }
  const porId = Object.fromEntries(actual.data.map((p) => [p.id, p]));
  for (const original of SEMILLA) {
    const enBase = porId[original.id];
    if (!enBase) { problemas.push('falta ' + original.id); continue; }
    for (const campo of CAMPOS) {
      const a = campo === 'price' || campo === 'stock' ? Number(enBase[campo]) : enBase[campo];
      if (a !== original[campo]) problemas.push(original.id + '.' + campo + ' no coincide');
    }
  }

  if (problemas.length) falla('la base no quedó igual a la semilla: ' + problemas.join('; '));
  console.log('OK: 0 pedidos y ' + SEMILLA.length + ' productos idénticos a la semilla.');
}

main().catch((e) => falla('inesperado', e));
