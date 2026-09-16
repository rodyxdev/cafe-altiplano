#!/usr/bin/env node
/**
 * Siembra cafe_products en Supabase con los 11 productos de la Fase 1.
 *
 *   npm run seed
 *
 * Usa upsert por id, así que se puede correr varias veces sin duplicar.
 * El esquema del JSON y el de la tabla son el mismo a propósito: origin
 * viaja como null tal cual para los accesorios.
 */
'use strict';

const path = require('path');
const supabase = require('../src/lib/supabase');

const productos = require(path.join(__dirname, '..', 'data', 'products.json'));

const CAMPOS = ['id', 'name', 'description', 'price', 'origin', 'category', 'stock', 'image'];

function validar(lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('data/products.json está vacío o no es un arreglo');
  }
  lista.forEach((p, i) => {
    const claves = Object.keys(p);
    const faltantes = CAMPOS.filter((c) => claves.indexOf(c) === -1);
    if (faltantes.length) {
      throw new Error('producto ' + i + ' (' + p.id + ') sin campos: ' + faltantes.join(', '));
    }
    if (p.category === 'accesorios' && p.origin !== null) {
      throw new Error('el accesorio ' + p.id + ' debería tener origin null');
    }
    if (p.category === 'cafe' && !p.origin) {
      throw new Error('el café ' + p.id + ' no tiene origin');
    }
  });
}

async function main() {
  validar(productos);
  console.log('Sembrando ' + productos.length + ' productos...');

  const filas = productos.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    origin: p.origin,
    category: p.category,
    stock: p.stock,
    image: p.image
  }));

  const { data, error } = await supabase
    .from('cafe_products')
    .upsert(filas, { onConflict: 'id' })
    .select('id, category, origin, price, stock');

  if (error) {
    console.error('Falló el upsert:', error.message, error.details || '');
    process.exit(1);
  }

  const cafes = data.filter((p) => p.category === 'cafe').length;
  const accesorios = data.filter((p) => p.category === 'accesorios').length;
  const sinOrigen = data.filter((p) => p.origin === null).length;

  console.log('Listo: ' + data.length + ' filas (' + cafes + ' cafés, ' +
    accesorios + ' accesorios, ' + sinOrigen + ' con origin null)');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
