/**
 * Café Altiplano — catálogo (index.html)
 *
 * Pinta la rejilla de productos, aplica el filtro por categoría y agrega al
 * carrito sin salir de la página. El filtro vive en la URL (?categoria=)
 * para que el enlace sea compartible y el botón "atrás" funcione.
 */
(function () {
  'use strict';

  var T = window.Tienda;
  var CATEGORIAS_VALIDAS = ['todos', 'cafe', 'accesorios'];

  var rejilla = document.getElementById('rejilla-productos');
  var filtros = document.getElementById('filtros');
  var conteo = document.getElementById('conteo-resultados');
  var zonaEstado = document.getElementById('zona-estado');

  var productos = [];
  var categoriaActiva = leerCategoriaDeURL();

  function leerCategoriaDeURL() {
    var params = new URLSearchParams(window.location.search);
    var valor = (params.get('categoria') || 'todos').toLowerCase();
    return CATEGORIAS_VALIDAS.indexOf(valor) !== -1 ? valor : 'todos';
  }

  function escribirCategoriaEnURL(categoria) {
    var url = new URL(window.location.href);
    if (categoria === 'todos') url.searchParams.delete('categoria');
    else url.searchParams.set('categoria', categoria);
    window.history.replaceState({ categoria: categoria }, '', url);
  }

  function filtrados() {
    if (categoriaActiva === 'todos') return productos;
    return productos.filter(function (p) { return p.category === categoriaActiva; });
  }

  function etiquetaStock(producto) {
    var nivel = T.Catalogo.nivelStock(producto.stock);
    if (nivel === 'agotado') {
      return '<span class="etiqueta etiqueta--agotado etiqueta--flotante">Agotado</span>';
    }
    if (nivel === 'pocas') {
      return '<span class="etiqueta etiqueta--pocas etiqueta--flotante">Últimas ' +
        producto.stock + '</span>';
    }
    return '';
  }

  /**
   * Eyebrow de origen. Los accesorios tienen origin null (el campo solo
   * aplica a la región de cultivo del café), así que se omite la línea.
   */
  function plantillaOrigen(producto) {
    if (!producto.origin) return '';
    return '<span class="tarjeta__origen">' + T.escapar(producto.origin) + '</span>';
  }

  function plantillaTarjeta(producto) {
    var agotado = Number(producto.stock) <= 0;
    var url = 'producto.html?id=' + encodeURIComponent(producto.id);
    return '' +
      '<li class="tarjeta">' +
        '<a class="tarjeta__enlace" href="' + url + '">' +
          '<figure class="tarjeta__figura">' +
            '<img class="tarjeta__imagen" src="' + T.escapar(producto.image) + '" ' +
              'alt="' + T.escapar(producto.name) + '" loading="lazy" width="400" height="300">' +
            etiquetaStock(producto) +
          '</figure>' +
          '<div class="tarjeta__cuerpo">' +
            plantillaOrigen(producto) +
            '<h3 class="tarjeta__nombre">' + T.escapar(producto.name) + '</h3>' +
            '<span class="tarjeta__precio">' + T.money(producto.price) + '</span>' +
          '</div>' +
        '</a>' +
        '<div class="tarjeta__pie">' +
          '<button type="button" class="btn btn--bloque" data-agregar="' +
            T.escapar(producto.id) + '"' + (agotado ? ' disabled' : '') + '>' +
            (agotado ? 'Sin existencias' : 'Agregar al carrito') +
          '</button>' +
        '</div>' +
      '</li>';
  }

  /** Muestra un bloque de estado en lugar de la rejilla, sin destruirla. */
  function mostrarEstado(opciones) {
    rejilla.classList.add('oculto');
    zonaEstado.classList.remove('oculto');
    T.UI.estado(zonaEstado, opciones);
  }

  function mostrarRejilla() {
    zonaEstado.classList.add('oculto');
    zonaEstado.innerHTML = '';
    rejilla.classList.remove('oculto');
  }

  function pintar() {
    var lista = filtrados();

    if (!lista.length) {
      conteo.textContent = '0 productos';
      mostrarEstado({
        icono: '☕',
        titulo: 'No hay productos en esta categoría',
        texto: 'Prueba con otra categoría del filtro.'
      });
      return;
    }

    mostrarRejilla();
    rejilla.innerHTML = lista.map(plantillaTarjeta).join('');
    conteo.textContent = lista.length === 1 ? '1 producto' : lista.length + ' productos';
  }

  function aplicarFiltro(categoria) {
    categoriaActiva = CATEGORIAS_VALIDAS.indexOf(categoria) !== -1 ? categoria : 'todos';
    Array.prototype.forEach.call(filtros.querySelectorAll('[data-categoria]'), function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.categoria === categoriaActiva ? 'true' : 'false');
    });
    escribirCategoriaEnURL(categoriaActiva);
    pintar();
  }

  function alAgregar(id) {
    var producto = T.Catalogo.porId(id);
    if (!producto) {
      T.UI.aviso('No encontramos ese producto.', 'error');
      return;
    }

    var r = T.Carrito.agregar(producto.id, 1, producto.stock);

    if (r.estado === 'agotado') {
      T.UI.aviso(producto.name + ' está agotado por ahora.', 'error');
    } else if (r.estado === 'sin-cambio' || r.estado === 'limitado') {
      T.UI.aviso(
        'Solo quedan ' + r.limite + ' de ' + producto.name +
        '. Ya tienes el máximo en el carrito.',
        'alerta'
      );
    } else {
      T.UI.aviso(producto.name + ' se agregó al carrito (' + r.cantidad + ').', 'ok');
    }
  }

  /* --- Eventos --------------------------------------------------------- */

  filtros.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-categoria]');
    if (!btn) return;
    aplicarFiltro(btn.dataset.categoria);
  });

  rejilla.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-agregar]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    alAgregar(btn.dataset.agregar);
  });

  /* --- Carga ----------------------------------------------------------- */

  T.Catalogo.cargar()
    .then(function (datos) {
      productos = datos;
      aplicarFiltro(categoriaActiva);
    })
    .catch(function (err) {
      console.error('[catálogo]', err);
      conteo.textContent = '';
      mostrarEstado({
        icono: '⚠️',
        titulo: 'No pudimos cargar el catálogo',
        texto: 'Revisa que el servidor esté corriendo y recarga la página.'
      });
    });
})();
