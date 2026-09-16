/**
 * Checkout simulado.
 *
 *   POST /api/checkout  { items: [{productId, quantity}], customer: {...} }
 *
 * El servidor ignora por completo cualquier precio que venga del navegador:
 * la función cafe_crear_pedido relee precio y stock de la base dentro de una
 * transacción con las filas bloqueadas. Lo único que se toma del carrito es
 * qué producto y cuántas piezas.
 *
 * No hay pasarela de pago ni llamada externa de ningún tipo. El pedido se
 * guarda con payment_status = 'simulado'.
 */
'use strict';

const express = require('express');
const supabase = require('../lib/supabase');
const { ErrorHttp, asyncHandler, fallaSupabase } = require('../lib/errores');
const sanitizar = require('../lib/sanitizar');

const router = express.Router();

const MAX_LINEAS = 50;
const MAX_POR_LINEA = 999;

/** Valida y limpia los renglones del carrito. */
function leerItems(bruto) {
  if (!Array.isArray(bruto) || bruto.length === 0) {
    throw new ErrorHttp(400, 'El carrito está vacío.');
  }
  if (bruto.length > MAX_LINEAS) {
    throw new ErrorHttp(400, 'El carrito tiene demasiados productos distintos.');
  }

  const items = [];
  for (const crudo of bruto) {
    if (!crudo || typeof crudo !== 'object') {
      throw new ErrorHttp(400, 'Hay un renglón del carrito con formato inválido.');
    }
    const productId = sanitizar.texto(crudo.productId, 64);
    const quantity = sanitizar.entero(crudo.quantity, 1, MAX_POR_LINEA);
    if (!productId) {
      throw new ErrorHttp(400, 'Hay un renglón del carrito sin producto.');
    }
    if (quantity === null) {
      throw new ErrorHttp(400, 'La cantidad de "' + productId + '" no es válida.');
    }
    items.push({ productId, quantity });
  }
  return items;
}

/** Valida y limpia los datos del cliente. */
function leerCliente(bruto) {
  const c = bruto && typeof bruto === 'object' ? bruto : {};
  const name = sanitizar.texto(c.name, 120);
  const email = sanitizar.correo(c.email);
  const phone = sanitizar.texto(c.phone, 32);
  const address = sanitizar.textoLargo(c.address, 500);

  const errores = {};
  if (name.length < 3) errores.name = 'Escribe tu nombre completo.';
  if (!email) errores.email = 'Escribe un correo electrónico válido.';
  if (address.length < 10) errores.address = 'Escribe la dirección de envío completa.';
  if (phone && phone.replace(/\D/g, '').length < 10) {
    errores.phone = 'El teléfono debe tener al menos 10 dígitos.';
  }

  if (Object.keys(errores).length) {
    throw new ErrorHttp(400, 'Revisa los datos de envío.', { campos: errores });
  }
  return { name, email, phone, address };
}

router.post('/', asyncHandler(async (req, res) => {
  const items = leerItems(req.body && req.body.items);
  const customer = leerCliente(req.body && req.body.customer);

  const { data, error } = await supabase.rpc('cafe_crear_pedido', {
    p_items: items,
    p_cliente: customer
  });

  if (error) throw fallaSupabase('POST /api/checkout', error);
  if (!data) throw fallaSupabase('POST /api/checkout', { message: 'la RPC no devolvió nada' });

  if (data.ok !== true) {
    if (data.motivo === 'stock_insuficiente') {
      throw new ErrorHttp(409, 'Algunos productos ya no tienen suficientes existencias.', {
        motivo: 'stock_insuficiente',
        faltantes: (data.faltantes || []).map((f) => ({
          productId: f.product_id,
          productName: f.product_name || null,
          motivo: f.motivo,
          solicitado: Number(f.solicitado),
          disponible: Number(f.disponible)
        }))
      });
    }
    if (data.motivo === 'carrito_vacio') {
      throw new ErrorHttp(400, 'El carrito está vacío.');
    }
    throw fallaSupabase('POST /api/checkout', { message: 'motivo desconocido: ' + data.motivo });
  }

  res.status(201).json({
    ok: true,
    orderId: data.order_id,
    orderNumber: numeroLegible(data.order_id),
    total: Number(data.total),
    createdAt: data.created_at,
    paymentStatus: 'simulado'
  });
}));

/** Número de pedido legible derivado del uuid, para mostrárselo al cliente. */
function numeroLegible(uuid) {
  return 'CA-' + String(uuid).replace(/-/g, '').slice(0, 8).toUpperCase();
}

module.exports = router;
module.exports.numeroLegible = numeroLegible;
