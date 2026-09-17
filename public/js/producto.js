/**
 * Café Altiplano — detalle de producto (producto.html)
 *
 * Lee ?id= de la URL, busca el producto en el catálogo y pinta la ficha con
 * selector de cantidad. El selector nunca deja pedir más que el stock, y
 * descuenta lo que ya está en el carrito.
 */
(function () {
  'use strict';

  var T = window.Tienda;

  var contenedor = document.getElementById('detalle-producto');
  var migas = document.getElementById('migas-nombre');

  var params = new URLSearchParams(window.location.search);
  var idBuscado = params.get('id');

  var producto = null;
  var cantidad = 1;

  /** Cuántas piezas más caben en el carrito para este producto. */
  function disponibles() {
    if (!producto) return 0;
    var enCarrito = T.Carrito.cantidadDe(producto.id);
    return Math.max(0, Number(producto.stock) - enCarrito);
  }

  function plantillaEtiquetaStock() {
    var nivel = T.Catalogo.nivelStock(producto.stock);
    if (nivel === 'agotado') return '<span class="etiqueta etiqueta--agotado">Agotado</span>';
    if (nivel === 'pocas') {
      return '<span class="etiqueta etiqueta--pocas">Últimas ' + producto.stock + ' piezas</span>';
    }
    return '<span class="etiqueta etiqueta--ok">Disponible</span>';
  }

  function plantillaAcciones() {
    var cupo = disponibles();
    if (Number(producto.stock) <= 0) {
      return '<p class="etiqueta etiqueta--agotado">Sin existencias por ahora</p>';
    }
    if (cupo <= 0) {
      return '' +
        '<p class="linea__meta">Ya tienes las ' + producto.stock +
        ' piezas disponibles en tu carrito.</p>' +
        '<a class="btn btn--secundario" href="carrito.html">Ver carrito</a>';
    }
    return '' +
      '<div class="acciones-detalle">' +
        '<div class="selector-cantidad">' +
          '<button type="button" class="selector-cantidad__btn" data-paso="-1" ' +
            'aria-label="Quitar uno">&minus;</button>' +
          '<input class="selector-cantidad__entrada" id="cantidad-detalle" type="number" ' +
            'inputmode="numeric" min="1" max="' + cupo + '" value="' + cantidad + '" ' +
            'aria-label="Cantidad">' +
          '<button type="button" class="selector-cantidad__btn" data-paso="1" ' +
            'aria-label="Agregar uno">+</button>' +
        '</div>' +
        '<button type="button" class="btn btn--grande" id="btn-agregar">Agregar al carrito</button>' +
      '</div>' +
      '<p class="linea__meta" id="nota-cupo">Puedes agregar hasta ' + cupo + ' en este momento.</p>';
  }

  function pintar() {
    document.title = producto.name + ' — Café Altiplano';
    if (migas) migas.textContent = producto.name;

    var categoriaLegible = producto.category === 'cafe' ? 'Café' : 'Accesorios';

    // Ficha técnica editorial (fichas.js, solo presentación). Si el producto
    // no tiene ficha, esas líneas simplemente no aparecen.
    var F = window.Fichas;
    var datos = F && F.datos[producto.id] ? F.datos[producto.id] : {};

    contenedor.innerHTML = '' +
      '<figure class="detalle__figura">' +
        '<img class="detalle__imagen" src="' + T.escapar(producto.image) + '" ' +
          'alt="' + T.escapar(producto.name) + '" width="800" height="600">' +
      '</figure>' +
      '<div class="detalle__info">' +
        '<p class="sobretitulo">' + categoriaLegible + '</p>' +
        '<h1>' + T.escapar(producto.name) + '</h1>' +
        (F ? F.lineaFicha(producto) : '') +
        '<p class="detalle__precio">' + T.money(producto.price) + '</p>' +
        plantillaEtiquetaStock() +
        (F ? F.barraTueste(producto) : '') +
        // Acciones arriba de la descripción: la compra queda en la primera
        // pantalla. Solo cambia el orden; zona-acciones mantiene su id.
        '<div id="zona-acciones">' + plantillaAcciones() + '</div>' +
        '<p class="detalle__descripcion">' + T.escapar(producto.description) + '</p>' +
        '<dl class="ficha">' +
          (producto.origin
            ? '<div><dt>Origen</dt><dd>' + T.escapar(producto.origin) + '</dd></div>'
            : '') +
          (datos.altitud ? '<div><dt>Altitud</dt><dd>' + T.escapar(datos.altitud) + '</dd></div>' : '') +
          (datos.proceso ? '<div><dt>Proceso</dt><dd>' + T.escapar(datos.proceso) + '</dd></div>' : '') +
          (datos.tueste ? '<div><dt>Tueste</dt><dd>' + F.niveles[datos.tueste] + '</dd></div>' : '') +
          '<div><dt>Categoría</dt><dd>' + categoriaLegible + '</dd></div>' +
          '<div><dt>Existencias</dt><dd>' + Number(producto.stock) + '</dd></div>' +
          '<div><dt>SKU</dt><dd>' + T.escapar(producto.id) + '</dd></div>' +
        '</dl>' +
      '</div>';
  }

  /** Repinta solo el bloque de acciones tras un cambio en el carrito. */
  function repintarAcciones() {
    var zona = document.getElementById('zona-acciones');
    if (!zona) return;
    var cupo = disponibles();
    if (cantidad > cupo) cantidad = cupo > 0 ? cupo : 1;
    zona.innerHTML = plantillaAcciones();
  }

  function fijarCantidad(valor) {
    var cupo = disponibles();
    var entrada = document.getElementById('cantidad-detalle');
    var pedida = T.entero(valor, 1);

    if (pedida > cupo) {
      T.UI.aviso('Solo puedes agregar ' + cupo + ' piezas más de este producto.', 'alerta');
      pedida = cupo;
    }
    cantidad = pedida < 1 ? 1 : pedida;
    if (entrada) entrada.value = cantidad;
  }

  function agregar() {
    var r = T.Carrito.agregar(producto.id, cantidad, producto.stock);

    if (r.estado === 'agotado') {
      T.UI.aviso('Este producto está agotado.', 'error');
    } else if (r.estado === 'sin-cambio') {
      T.UI.aviso('Ya tienes el máximo disponible (' + r.limite + ') en el carrito.', 'alerta');
    } else if (r.estado === 'limitado') {
      T.UI.aviso(
        'Solo agregamos ' + r.agregado + ': el stock disponible es ' + r.limite + '.',
        'alerta'
      );
    } else {
      T.UI.aviso('Listo, ya tienes ' + r.cantidad + ' en el carrito.', 'ok');
    }

    cantidad = 1;
    repintarAcciones();
  }

  /* --- Eventos --------------------------------------------------------- */

  contenedor.addEventListener('click', function (e) {
    var paso = e.target.closest('[data-paso]');
    if (paso) {
      fijarCantidad(cantidad + parseInt(paso.dataset.paso, 10));
      return;
    }
    if (e.target.closest('#btn-agregar')) agregar();
  });

  contenedor.addEventListener('change', function (e) {
    if (e.target.id === 'cantidad-detalle') fijarCantidad(e.target.value);
  });

  /* --- Carga ----------------------------------------------------------- */

  if (!idBuscado) {
    T.UI.estado(contenedor, {
      icono: '☕',
      titulo: 'Producto no especificado',
      texto: 'Vuelve al catálogo y elige un producto.',
      accion: { href: 'index.html', texto: 'Ver el catálogo' }
    });
    return;
  }

  T.Catalogo.cargar()
    .then(function () {
      producto = T.Catalogo.porId(idBuscado);
      if (!producto) {
        T.UI.estado(contenedor, {
          icono: '☕',
          titulo: 'No encontramos ese producto',
          texto: 'Puede que ya no esté disponible.',
          accion: { href: 'index.html', texto: 'Ver el catálogo' }
        });
        return;
      }
      pintar();
    })
    .catch(function (err) {
      console.error('[producto]', err);
      T.UI.estado(contenedor, {
        icono: '⚠️',
        titulo: 'No pudimos cargar el producto',
        texto: 'Revisa que el servidor esté corriendo y recarga la página.',
        accion: { href: 'index.html', texto: 'Volver al catálogo' }
      });
    });
})();
