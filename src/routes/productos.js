/**
 * Catálogo público.
 *
 *   GET /api/products      lista (filtro opcional ?categoria=)
 *   GET /api/products/:id  detalle
 *
 * Reemplaza al archivo estático data/products.json de la Fase 1: ahora los
 * datos salen de Supabase.
 */
'use strict';

const express = require('express');
const supabase = require('../lib/supabase');
const { ErrorHttp, asyncHandler, fallaSupabase } = require('../lib/errores');
const sanitizar = require('../lib/sanitizar');

const router = express.Router();

// Solo estas columnas salen a la calle. Si algún día se agrega una interna
// (costo, proveedor), no se filtra por olvido.
const COLUMNAS = 'id, name, description, price, origin, category, stock, image';
const CATEGORIAS = ['cafe', 'accesorios'];

/** PostgREST puede devolver numeric como cadena; el frontend espera número. */
function normalizar(fila) {
  return {
    id: fila.id,
    name: fila.name,
    description: fila.description,
    price: Number(fila.price),
    origin: fila.origin === null || fila.origin === '' ? null : fila.origin,
    category: fila.category,
    stock: Number(fila.stock),
    image: fila.image
  };
}

router.get('/', asyncHandler(async (req, res) => {
  let consulta = supabase.from('cafe_products').select(COLUMNAS);

  const categoria = sanitizar.texto(req.query.categoria, 32).toLowerCase();
  if (categoria && categoria !== 'todos') {
    if (CATEGORIAS.indexOf(categoria) === -1) {
      throw new ErrorHttp(400, 'Categoría no válida.');
    }
    consulta = consulta.eq('category', categoria);
  }

  // Orden descendente por categoría: alfabéticamente "cafe" va después de
  // "accesorios", y en una cafetería los cafés deben salir primero.
  const { data, error } = await consulta
    .order('category', { ascending: false })
    .order('id');
  if (error) throw fallaSupabase('GET /api/products', error);

  res.json((data || []).map(normalizar));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = sanitizar.texto(req.params.id, 64);
  if (!id) throw new ErrorHttp(400, 'Id de producto no válido.');

  const { data, error } = await supabase
    .from('cafe_products')
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw fallaSupabase('GET /api/products/:id', error);
  if (!data) throw new ErrorHttp(404, 'No encontramos ese producto.');

  res.json(normalizar(data));
}));

module.exports = router;
