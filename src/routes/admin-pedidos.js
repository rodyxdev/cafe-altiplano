/**
 * Pedidos desde el panel (rutas protegidas).
 *
 *   GET   /api/admin/orders?status=...  lista con sus renglones
 *   PATCH /api/admin/orders/:id         cambiar el status
 */
'use strict';

const express = require('express');
const supabase = require('../lib/supabase');
const { ErrorHttp, asyncHandler, fallaSupabase } = require('../lib/errores');
const sanitizar = require('../lib/sanitizar');
const { numeroLegible } = require('./checkout');

const router = express.Router();

const ESTADOS = ['pendiente', 'preparando', 'enviado'];
const MAX_PEDIDOS = 200;

// Los renglones se traen anidados con el pedido: el panel muestra el detalle
// sin una segunda petición.
const SELECCION = `
  id, created_at, customer_name, customer_email, customer_phone,
  shipping_address, status, payment_status, total,
  cafe_order_items ( id, product_id, product_name, unit_price, quantity, subtotal )
`;

function normalizar(fila) {
  return {
    id: fila.id,
    orderNumber: numeroLegible(fila.id),
    createdAt: fila.created_at,
    customer: {
      name: fila.customer_name,
      email: fila.customer_email,
      phone: fila.customer_phone,
      address: fila.shipping_address
    },
    status: fila.status,
    paymentStatus: fila.payment_status,
    total: Number(fila.total),
    items: (fila.cafe_order_items || []).map((i) => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name,
      unitPrice: Number(i.unit_price),
      quantity: Number(i.quantity),
      subtotal: Number(i.subtotal)
    }))
  };
}

router.get('/', asyncHandler(async (req, res) => {
  let consulta = supabase.from('cafe_orders').select(SELECCION);

  const status = sanitizar.texto(req.query.status, 32).toLowerCase();
  if (status && status !== 'todos') {
    if (ESTADOS.indexOf(status) === -1) {
      throw new ErrorHttp(400, 'Status no válido.');
    }
    consulta = consulta.eq('status', status);
  }

  const { data, error } = await consulta
    .order('created_at', { ascending: false })
    .limit(MAX_PEDIDOS);
  if (error) throw fallaSupabase('GET /api/admin/orders', error);

  res.json((data || []).map(normalizar));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = sanitizar.texto(req.params.id, 64);
  const status = sanitizar.texto(req.body && req.body.status, 32).toLowerCase();

  if (!id) throw new ErrorHttp(400, 'Id de pedido no válido.');
  if (ESTADOS.indexOf(status) === -1) {
    throw new ErrorHttp(400, 'El status debe ser: ' + ESTADOS.join(', ') + '.');
  }

  const { data, error } = await supabase
    .from('cafe_orders')
    .update({ status })
    .eq('id', id)
    .select(SELECCION)
    .maybeSingle();

  if (error) throw fallaSupabase('PATCH /api/admin/orders/:id', error);
  if (!data) throw new ErrorHttp(404, 'No encontramos ese pedido.');

  res.json(normalizar(data));
}));

module.exports = router;
