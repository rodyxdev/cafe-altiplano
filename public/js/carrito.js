/**
 * Café Altiplano — carrito (carrito.html)
 *
 * Pinta las líneas guardadas en localStorage cruzadas con el catálogo,
 * permite cambiar cantidades y eliminar líneas, y calcula el total.
 * Toda la lógica de estado vive en Tienda.Carrito; aquí solo se pinta.
 */
(function () {
  'use strict';

  var T = window.Tienda;

  var zonaLineas = document.getElementById('zona-lineas');
  var zonaResumen = document.getElementById('zona-resumen');
  var zonaVacio = document.getElementById('zona-vacio');
  var contenedor = document.getElementById('carrito');

  var productos = [];

  /* --- Plantillas ------------------------------------------------------ */

  function plantillaLinea(linea) {
    var p = linea.producto;
    var url = 'producto.html?id=' + encodeURIComponent(p.id);
    var tope = Number(p.stock);
    var alTope = linea.quantity >= tope;

    return '' +
      '<li class="linea" data-linea="' + T.escapar(p.id) + '">' +
        '<figure class="linea__figura">' +
          '<a href="' + url + '">' +
            '<img class="linea__imagen" src="' + T.escapar(p.image) + '" ' +
              'alt="' + T.escapar(p.name) + '" loading="lazy" width="96" height="96">' +
          '</a>' +
        '</figure>' +
        '<div class="linea__info">' +
          '<h2 class="linea__nombre"><a href="' + url + '">' + T.escapar(p.name) + '</a></h2>' +
          '<p class="linea__meta">' +
            (p.origin ? T.escapar(p.origin) + ' · ' : '') +
            T.money(p.price) + ' c/u</p>' +
          '<p class="linea__meta">' +
            (tope <= 0
              ? '<span class="etiqueta etiqueta--agotado">Sin existencias</span>'
              : 'Disponibles: ' + tope) +
          '</p>' +
        '</div>' +
        '<div class="linea__control">' +
          '<div class="selector-cantidad">' +
            '<button type="button" class="selector-cantidad__btn" data-paso="-1" ' +
              'aria-label="Quitar uno de ' + T.escapar(p.name) + '">&minus;</button>' +
            '<input class="selector-cantidad__entrada" type="number" inputmode="numeric" ' +
              'min="0" max="' + tope + '" value="' + linea.quantity + '" ' +
              'data-cantidad aria-label="Cantidad de ' + T.escapar(p.name) + '">' +
            '<button type="button" class="selector-cantidad__btn" data-paso="1" ' +
              (alTope ? 'disabled ' : '') +
              'aria-label="Agregar uno de ' + T.escapar(p.name) + '">+</button>' +
          '</div>' +
          '<span class="linea__subtotal">' + T.money(linea.subtotal) + '</span>' +
          '<button type="button" class="linea__eliminar" data-eliminar ' +
            'aria-label="Eliminar ' + T.escapar(p.name) + ' del carrito">Eliminar</button>' +
        '</div>' +
      '</li>';
  }

  function plantillaResumen(detalle) {
    var piezas = detalle.totalItems === 1 ? '1 artículo' : detalle.totalItems + ' artículos';
    return '' +
      '<h2>Resumen</h2>' +
      '<div class="resumen__fila"><span>Productos</span><span>' + piezas + '</span></div>' +
      '<div class="resumen__fila"><span>Subtotal</span><span>' + T.money(detalle.total) + '</span></div>' +
      '<div class="resumen__fila"><span>Envío</span><span>Se calcula al pagar</span></div>' +
      '<div class="resumen__fila resumen__fila--total"><span>Total</span><span>' +
        T.money(detalle.total) + '</span></div>' +
      '<a class="btn btn--bloque btn--grande" href="checkout.html">Proceder al pago</a>' +
      '<button type="button" class="btn btn--secundario btn--bloque" id="btn-vaciar">' +
        'Vaciar carrito</button>' +
      '<p class="resumen__nota">Precios en pesos mexicanos (MXN).</p>';
  }

  /* --- Pintado --------------------------------------------------------- */

  function pintar() {
    var detalle = T.Carrito.detallar(productos);

    // Líneas que apuntan a productos ya inexistentes en el catálogo: se
    // limpian solas para que el total nunca quede descuadrado.
    if (detalle.huerfanas.length) {
      detalle.huerfanas.forEach(function (id) { T.Carrito.eliminar(id); });
      T.UI.aviso('Quitamos productos que ya no están disponibles.', 'alerta');
      detalle = T.Carrito.detallar(productos);
    }

    if (!detalle.lineas.length) {
      contenedor.classList.add('oculto');
      zonaLineas.innerHTML = '';
      zonaResumen.innerHTML = '';
      zonaVacio.classList.remove('oculto');
      T.UI.estado(zonaVacio, {
        icono: '☕',
        titulo: 'Tu carrito está vacío',
        texto: 'Aún no has agregado nada. Los cafés recién tostados te esperan.',
        accion: { href: 'index.html', texto: 'Ver el catálogo' }
      });
      return;
    }

    zonaVacio.classList.add('oculto');
    zonaVacio.innerHTML = '';
    contenedor.classList.remove('oculto');
    zonaLineas.innerHTML = detalle.lineas.map(plantillaLinea).join('');
    zonaResumen.innerHTML = plantillaResumen(detalle);
  }

  /* --- Acciones -------------------------------------------------------- */

  function cambiarCantidad(productId, nuevaCantidad) {
    var producto = T.Catalogo.porId(productId);
    if (!producto) return;

    var r = T.Carrito.fijarCantidad(productId, nuevaCantidad, producto.stock);

    if (r.estado === 'eliminado') {
      T.UI.aviso(producto.name + ' se quitó del carrito.', 'info');
    } else if (r.estado === 'limitado') {
      T.UI.aviso(
        'Solo tenemos ' + r.limite + ' piezas de ' + producto.name + '. Ajustamos la cantidad.',
        'alerta'
      );
    }
    pintar();
  }

  function eliminar(productId) {
    var producto = T.Catalogo.porId(productId);
    T.Carrito.eliminar(productId);
    T.UI.aviso((producto ? producto.name : 'El producto') + ' se quitó del carrito.', 'info');
    pintar();
  }

  /* --- Eventos --------------------------------------------------------- */

  zonaLineas.addEventListener('click', function (e) {
    var li = e.target.closest('[data-linea]');
    if (!li) return;
    var id = li.dataset.linea;

    if (e.target.closest('[data-eliminar]')) {
      eliminar(id);
      return;
    }

    var paso = e.target.closest('[data-paso]');
    if (paso && !paso.disabled) {
      var actual = T.Carrito.cantidadDe(id);
      cambiarCantidad(id, actual + parseInt(paso.dataset.paso, 10));
    }
  });

  zonaLineas.addEventListener('change', function (e) {
    if (!e.target.matches('[data-cantidad]')) return;
    var li = e.target.closest('[data-linea]');
    if (!li) return;
    cambiarCantidad(li.dataset.linea, e.target.value);
  });

  zonaResumen.addEventListener('click', function (e) {
    if (!e.target.closest('#btn-vaciar')) return;
    if (!window.confirm('¿Vaciar todo el carrito?')) return;
    T.Carrito.vaciar();
    T.UI.aviso('Carrito vacío.', 'info');
    pintar();
  });

  // Si el carrito cambia en otra pestaña, esta se repinta sola.
  window.addEventListener(T.Carrito.EVENTO, function (e) {
    if (e.detail && e.detail.externo) pintar();
  });

  /* --- Carga ----------------------------------------------------------- */

  T.Catalogo.cargar()
    .then(function (datos) {
      productos = datos;
      pintar();
    })
    .catch(function (err) {
      console.error('[carrito]', err);
      contenedor.classList.add('oculto');
      zonaLineas.innerHTML = '';
      zonaResumen.innerHTML = '';
      zonaVacio.classList.remove('oculto');
      T.UI.estado(zonaVacio, {
        icono: '⚠️',
        titulo: 'No pudimos cargar tu carrito',
        texto: 'Necesitamos el catálogo para mostrar los precios. Recarga la página.',
        accion: { href: 'index.html', texto: 'Volver al catálogo' }
      });
    });
})();
