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
const config = require('../config');
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
    // productId solo puede ser texto o número. Un objeto o un arreglo se
    // rechazan antes de convertirlo a cadena: si no, acabaría como
    // "[object Object]" dentro de los mensajes de error.
    const tipoId = typeof crudo.productId;
    const idValido = tipoId === 'string' || (tipoId === 'number' && Number.isFinite(crudo.productId));
    if (!idValido) {
      throw new ErrorHttp(400, 'Hay un renglón del carrito con un producto inválido.');
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

  // Segunda capa contra XSS almacenado: el render ya escapa, pero en la base
  // no debe entrar HTML. El endpoint es anónimo y estos datos se muestran en
  // el panel del admin, así que se rechazan antes de llegar a Supabase.
  const errores = {};
  if (sanitizar.contieneHtml(name)) errores.name = sanitizar.MENSAJE_HTML;
  else if (name.length < 3) errores.name = 'Escribe tu nombre completo.';

  if (sanitizar.contieneHtml(sanitizar.texto(c.email, 254))) errores.email = sanitizar.MENSAJE_HTML;
  else if (!email) errores.email = 'Escribe un correo electrónico válido.';

  if (sanitizar.contieneHtml(address)) errores.address = sanitizar.MENSAJE_HTML;
  else if (address.length < 10) errores.address = 'Escribe la dirección de envío completa.';

  if (sanitizar.contieneHtml(phone)) {
    errores.phone = sanitizar.MENSAJE_HTML;
  } else if (phone && phone.replace(/\D/g, '').length < 10) {
    errores.phone = 'El teléfono debe tener al menos 10 dígitos.';
  }

  if (Object.keys(errores).length) {
    throw new ErrorHttp(400, 'Revisa los datos de envío.', { campos: errores });
  }
  return { name, email, phone, address };
}

/**
 * Rate limiting por IP, persistente en Supabase. Reutiliza la RPC atómica del
 * login (cafe_login_intento) y su tabla, con claves "checkout:<ip>" que no
 * chocan con las "login:<ip>".
 *
 * La RPC bloquea en la misma llamada que alcanza p_max, así que permite
 * p_max - 1 llamadas por ventana; por eso se le pasa pedidosPorVentana + 1.
 */
async function aplicarLimite(req) {
  const ip = sanitizar.texto(req.ip || 'desconocida', 64);
  const { data, error } = await supabase.rpc('cafe_login_intento', {
    p_clave: 'checkout:' + ip,
    p_max: config.rateLimitCheckout.pedidosPorVentana + 1,
    p_ventana: config.rateLimitCheckout.ventana,
    p_bloqueo: config.rateLimitCheckout.bloqueo
  });
  if (error) throw fallaSupabase('cafe_login_intento (checkout)', error);

  if (data && data.permitido === false) {
    const hasta = data.bloqueado_hasta ? new Date(data.bloqueado_hasta) : null;
    const minutos = hasta ? Math.max(1, Math.ceil((hasta - Date.now()) / 60000)) : 60;
    throw new ErrorHttp(429,
      'Hiciste demasiados pedidos en poco tiempo. Vuelve a intentarlo en ' + minutos +
      ' minuto' + (minutos === 1 ? '' : 's') + '.',
      { bloqueadoHasta: data.bloqueado_hasta });
  }
}

router.post('/', asyncHandler(async (req, res) => {
  // Primero la validación, que no toca la base: un error de captura en el
  // formulario no debe gastar intentos. Lo que sí llega a la base (pedidos
  // creados o rechazados por stock) cuenta contra el límite.
  const items = leerItems(req.body && req.body.items);
  const customer = leerCliente(req.body && req.body.customer);

  await aplicarLimite(req);

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
