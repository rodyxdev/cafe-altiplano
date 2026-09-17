/**
 * Gestión de productos desde el panel (rutas protegidas).
 *
 *   POST   /api/admin/products      crear
 *   PUT    /api/admin/products/:id  editar
 *   DELETE /api/admin/products/:id  eliminar
 *
 * El listado lo lee del endpoint público /api/products, que devuelve lo
 * mismo. Aquí solo vive la escritura.
 */
'use strict';

const express = require('express');
const supabase = require('../lib/supabase');
const { ErrorHttp, asyncHandler, fallaSupabase } = require('../lib/errores');
const sanitizar = require('../lib/sanitizar');

const router = express.Router();

const CATEGORIAS = ['cafe', 'accesorios'];
const COLUMNAS = 'id, name, description, price, origin, category, stock, image';

/**
 * Valida el cuerpo de un producto. En creación exige todo; en edición
 * (parcial = true) solo valida los campos presentes.
 */
function leerProducto(cuerpo, parcial) {
  const b = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
  const errores = {};
  const out = {};

  const presente = (campo) => Object.prototype.hasOwnProperty.call(b, campo);

  if (!parcial || presente('name')) {
    const name = sanitizar.texto(b.name, 120);
    // Segunda capa contra XSS almacenado: no entra HTML a la base aunque el
    // render también escape. El panel es público, así que esto importa.
    if (sanitizar.contieneHtml(name)) errores.name = sanitizar.MENSAJE_HTML;
    else if (name.length < 2) errores.name = 'El nombre es obligatorio.';
    else out.name = name;
  }

  if (!parcial || presente('description')) {
    const description = sanitizar.textoLargo(b.description, 2000);
    if (sanitizar.contieneHtml(description)) errores.description = sanitizar.MENSAJE_HTML;
    else out.description = description;
  }

  if (!parcial || presente('price')) {
    const price = sanitizar.decimal(b.price, 0, 999999.99);
    if (price === null) errores.price = 'El precio debe ser un número mayor o igual a 0.';
    else out.price = price;
  }

  if (!parcial || presente('category')) {
    const category = sanitizar.texto(b.category, 32).toLowerCase();
    if (CATEGORIAS.indexOf(category) === -1) {
      errores.category = 'La categoría debe ser "cafe" o "accesorios".';
    } else {
      out.category = category;
    }
  }

  if (!parcial || presente('stock')) {
    const stock = sanitizar.entero(b.stock, 0, 1000000);
    if (stock === null) errores.stock = 'El stock debe ser un entero mayor o igual a 0.';
    else out.stock = stock;
  }

  if (!parcial || presente('image')) {
    const image = sanitizar.rutaImagen(b.image);
    if (image === null) errores.image = 'La imagen debe ser una ruta local como /img/mi-cafe.svg.';
    else out.image = image;
  }

  // origin es nullable a propósito: solo aplica a la región de cultivo del
  // café. Vacío o ausente en un accesorio se guarda como NULL.
  if (!parcial || presente('origin')) {
    const origin = sanitizar.texto(b.origin, 80);
    if (sanitizar.contieneHtml(origin)) errores.origin = sanitizar.MENSAJE_HTML;
    else out.origin = origin === '' ? null : origin;
  }

  const categoriaFinal = out.category;
  if (categoriaFinal === 'accesorios' && out.origin) {
    errores.origin = 'Los accesorios no llevan origen: ese campo es la región de cultivo del café.';
  }
  if (categoriaFinal === 'cafe' && Object.prototype.hasOwnProperty.call(out, 'origin') && !out.origin) {
    errores.origin = 'Un café necesita su región de origen.';
  }

  if (Object.keys(errores).length) {
    throw new ErrorHttp(400, 'Revisa los datos del producto.', { campos: errores });
  }
  return out;
}

router.post('/', asyncHandler(async (req, res) => {
  const datos = leerProducto(req.body, false);
  const id = sanitizar.slug(req.body && req.body.id ? req.body.id : datos.name, 64);
  if (!id) throw new ErrorHttp(400, 'No se pudo generar un id válido para el producto.');

  const { data: yaExiste, error: errorBusca } = await supabase
    .from('cafe_products').select('id').eq('id', id).maybeSingle();
  if (errorBusca) throw fallaSupabase('admin buscar producto', errorBusca);
  if (yaExiste) throw new ErrorHttp(409, 'Ya existe un producto con el id "' + id + '".');

  const { data, error } = await supabase
    .from('cafe_products')
    .insert({ id, ...datos })
    .select(COLUMNAS)
    .single();
  if (error) throw fallaSupabase('admin crear producto', error);

  res.status(201).json(data);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = sanitizar.texto(req.params.id, 64);
  if (!id) throw new ErrorHttp(400, 'Id de producto no válido.');

  const datos = leerProducto(req.body, true);
  if (Object.keys(datos).length === 0) {
    throw new ErrorHttp(400, 'No mandaste ningún campo que cambiar.');
  }

  const { data, error } = await supabase
    .from('cafe_products')
    .update(datos)
    .eq('id', id)
    .select(COLUMNAS)
    .maybeSingle();
  if (error) throw fallaSupabase('admin editar producto', error);
  if (!data) throw new ErrorHttp(404, 'No encontramos ese producto.');

  res.json(data);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = sanitizar.texto(req.params.id, 64);
  if (!id) throw new ErrorHttp(400, 'Id de producto no válido.');

  // Los pedidos ya hechos guardan nombre y precio propios, así que borrar un
  // producto no toca el historial de ventas.
  const { data, error } = await supabase
    .from('cafe_products')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw fallaSupabase('admin eliminar producto', error);
  if (!data) throw new ErrorHttp(404, 'No encontramos ese producto.');

  res.json({ ok: true, id: data.id });
}));

module.exports = router;
