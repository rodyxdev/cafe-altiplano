/**
 * Café Altiplano — panel de administración (admin/panel.html)
 *
 * La sesión vive en una cookie httpOnly: este script no guarda ni ve el
 * token. Si el servidor responde 401 (sesión expirada por inactividad),
 * se manda al login.
 */
(function () {
  'use strict';

  var T = window.Tienda;

  var tbodyProductos = document.getElementById('tbody-productos');
  var tbodyPedidos = document.getElementById('tbody-pedidos');
  var conteoProductos = document.getElementById('conteo-productos');
  var conteoPedidos = document.getElementById('conteo-pedidos');
  var filtrosPedidos = document.getElementById('filtros-pedidos');
  var zonaModal = document.getElementById('zona-modal');

  var productos = [];
  var pedidos = [];
  var statusActivo = 'todos';

  var ESTADOS = ['pendiente', 'preparando', 'enviado'];
  var SIGUIENTE = { pendiente: 'preparando', preparando: 'enviado', enviado: null };

  /* --- Cliente de la API ------------------------------------------------ */

  function api(ruta, opciones) {
    var o = opciones || {};
    var config = {
      method: o.method || 'GET',
      credentials: 'same-origin',
      headers: {}
    };
    if (o.body !== undefined) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(o.body);
    }

    return fetch(ruta, config).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/admin/index.html');
        throw new Error('sesion-expirada');
      }
      return res.json()
        .catch(function () { return {}; })
        .then(function (cuerpo) {
          if (!res.ok) {
            var e = new Error((cuerpo && cuerpo.error) || 'Error ' + res.status);
            e.cuerpo = cuerpo;
            throw e;
          }
          return cuerpo;
        });
    });
  }

  function reportar(err, prefijo) {
    if (err && err.message === 'sesion-expirada') return;
    console.error('[admin]', err);
    var detalle = '';
    if (err && err.cuerpo && err.cuerpo.campos) {
      detalle = ' ' + Object.keys(err.cuerpo.campos)
        .map(function (k) { return err.cuerpo.campos[k]; }).join(' ');
    }
    T.UI.aviso((prefijo ? prefijo + ': ' : '') + (err.message || 'falló') + detalle, 'error', 5000);
  }

  function fecha(iso) {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return iso;
    }
  }

  /* --- Productos -------------------------------------------------------- */

  function filaProducto(p) {
    return '' +
      '<tr data-producto="' + T.escapar(p.id) + '">' +
        '<td><strong>' + T.escapar(p.name) + '</strong><br>' +
          '<span class="campo__ayuda">' + T.escapar(p.id) + '</span></td>' +
        '<td>' + (p.category === 'cafe' ? 'Café' : 'Accesorios') + '</td>' +
        '<td>' + (p.origin ? T.escapar(p.origin) : '<span class="campo__ayuda">—</span>') + '</td>' +
        '<td class="num">' + T.money(p.price) + '</td>' +
        '<td class="num">' + p.stock + '</td>' +
        '<td class="acciones">' +
          '<button type="button" class="btn-mini" data-accion="stock">Stock</button>' +
          '<button type="button" class="btn-mini" data-accion="editar">Editar</button>' +
          '<button type="button" class="btn-mini btn-mini--peligro" data-accion="eliminar">Eliminar</button>' +
        '</td>' +
      '</tr>';
  }

  function pintarProductos() {
    if (!productos.length) {
      tbodyProductos.innerHTML =
        '<tr><td colspan="6">Todavía no hay productos.</td></tr>';
      conteoProductos.textContent = '';
      return;
    }
    tbodyProductos.innerHTML = productos.map(filaProducto).join('');
    conteoProductos.textContent = productos.length + ' productos en el catálogo';
  }

  function cargarProductos() {
    return api('/api/products')
      .then(function (datos) { productos = datos; pintarProductos(); })
      .catch(function (e) { reportar(e, 'Productos'); });
  }

  /* --- Modal genérico --------------------------------------------------- */

  function cerrarModal() {
    zonaModal.innerHTML = '';
    document.removeEventListener('keydown', alEscape);
  }

  function alEscape(e) {
    if (e.key === 'Escape') cerrarModal();
  }

  function abrirModal(titulo, cuerpoHtml, alGuardar, textoGuardar) {
    zonaModal.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + T.escapar(titulo) + '">' +
        '<div class="modal__caja">' +
          '<h2 class="modal__titulo">' + T.escapar(titulo) + '</h2>' +
          '<form id="form-modal" novalidate>' +
            '<p class="formulario__error oculto" id="error-modal" role="alert"></p>' +
            cuerpoHtml +
            '<div class="modal__acciones">' +
              '<button type="button" class="btn btn--secundario" data-cerrar>Cancelar</button>' +
              '<button type="submit" class="btn">' + T.escapar(textoGuardar || 'Guardar') + '</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';

    document.addEventListener('keydown', alEscape);

    var form = document.getElementById('form-modal');
    var primerCampo = form.querySelector('input, select, textarea');
    if (primerCampo) primerCampo.focus();

    zonaModal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
    zonaModal.querySelector('.modal').addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('modal')) cerrarModal();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      Promise.resolve(alGuardar(form))
        .then(function (ok) { if (ok !== false) cerrarModal(); })
        .catch(function (err) {
          var p = document.getElementById('error-modal');
          if (p) {
            var detalle = '';
            if (err && err.cuerpo && err.cuerpo.campos) {
              detalle = ' ' + Object.keys(err.cuerpo.campos)
                .map(function (k) { return err.cuerpo.campos[k]; }).join(' ');
            }
            p.textContent = (err.message || 'No se pudo guardar.') + detalle;
            p.classList.remove('oculto');
          }
          if (err && err.message === 'sesion-expirada') cerrarModal();
        })
        .then(function () { boton.disabled = false; });
    });
  }

  /* --- Alta y edición de producto --------------------------------------- */

  function formularioProducto(p) {
    var v = p || {};
    var esNuevo = !p;
    return '' +
      (esNuevo
        ? '<div class="campo"><label for="m-id">Id (slug)</label>' +
          '<input id="m-id" name="id" type="text" maxlength="64" ' +
          'placeholder="se genera del nombre si lo dejas vacío"></div>'
        : '') +
      '<div class="campo"><label for="m-name">Nombre</label>' +
        '<input id="m-name" name="name" type="text" maxlength="120" required ' +
        'value="' + T.escapar(v.name || '') + '"></div>' +
      '<div class="campo"><label for="m-category">Categoría</label>' +
        '<select id="m-category" name="category">' +
          '<option value="cafe"' + (v.category !== 'accesorios' ? ' selected' : '') + '>Café</option>' +
          '<option value="accesorios"' + (v.category === 'accesorios' ? ' selected' : '') + '>Accesorios</option>' +
        '</select></div>' +
      '<div class="campo"><label for="m-origin">Origen</label>' +
        '<input id="m-origin" name="origin" type="text" maxlength="80" ' +
        'value="' + T.escapar(v.origin || '') + '">' +
        '<p class="campo__ayuda">Región de cultivo del café. Los accesorios lo dejan vacío.</p></div>' +
      '<div class="campo-fila">' +
        '<div class="campo"><label for="m-price">Precio (MXN)</label>' +
          '<input id="m-price" name="price" type="number" step="0.01" min="0" required ' +
          'value="' + (v.price !== undefined ? v.price : '') + '"></div>' +
        '<div class="campo"><label for="m-stock">Stock</label>' +
          '<input id="m-stock" name="stock" type="number" step="1" min="0" required ' +
          'value="' + (v.stock !== undefined ? v.stock : 0) + '"></div>' +
      '</div>' +
      '<div class="campo"><label for="m-image">Imagen (ruta)</label>' +
        '<input id="m-image" name="image" type="text" maxlength="300" ' +
        'value="' + T.escapar(v.image || '/img/') + '"></div>' +
      '<div class="campo"><label for="m-description">Descripción</label>' +
        '<textarea id="m-description" name="description" rows="4" maxlength="2000">' +
        T.escapar(v.description || '') + '</textarea></div>';
  }

  function leerFormularioProducto(form) {
    var origen = form.elements.origin.value.trim();
    return {
      name: form.elements.name.value,
      category: form.elements.category.value,
      origin: origen === '' ? null : origen,
      price: Number(form.elements.price.value),
      stock: Number(form.elements.stock.value),
      image: form.elements.image.value,
      description: form.elements.description.value
    };
  }

  function nuevoProducto() {
    abrirModal('Nuevo producto', formularioProducto(null), function (form) {
      var cuerpo = leerFormularioProducto(form);
      var id = form.elements.id.value.trim();
      if (id) cuerpo.id = id;
      return api('/api/admin/products', { method: 'POST', body: cuerpo })
        .then(function (creado) {
          T.UI.aviso('Producto "' + creado.name + '" creado.', 'ok');
          return cargarProductos();
        });
    }, 'Crear');
  }

  function editarProducto(p) {
    abrirModal('Editar producto', formularioProducto(p), function (form) {
      return api('/api/admin/products/' + encodeURIComponent(p.id), {
        method: 'PUT', body: leerFormularioProducto(form)
      }).then(function (actualizado) {
        T.UI.aviso('Producto "' + actualizado.name + '" actualizado.', 'ok');
        return cargarProductos();
      });
    });
  }

  function ajustarStock(p) {
    var cuerpo =
      '<p class="campo__ayuda">' + T.escapar(p.name) + ' — stock actual: <strong>' +
        p.stock + '</strong></p>' +
      '<div class="campo"><label for="m-stock">Nuevo stock</label>' +
        '<input id="m-stock" name="stock" type="number" step="1" min="0" required ' +
        'value="' + p.stock + '"></div>';
    abrirModal('Ajustar stock', cuerpo, function (form) {
      return api('/api/admin/products/' + encodeURIComponent(p.id), {
        method: 'PUT', body: { stock: Number(form.elements.stock.value) }
      }).then(function (actualizado) {
        T.UI.aviso('Stock de "' + actualizado.name + '": ' + actualizado.stock + '.', 'ok');
        return cargarProductos();
      });
    }, 'Guardar stock');
  }

  function eliminarProducto(p) {
    if (!window.confirm('¿Eliminar "' + p.name + '" del catálogo?\n\n' +
      'Los pedidos que ya lo incluyen conservan su nombre y precio.')) return;
    api('/api/admin/products/' + encodeURIComponent(p.id), { method: 'DELETE' })
      .then(function () {
        T.UI.aviso('Producto eliminado.', 'info');
        return cargarProductos();
      })
      .catch(function (e) { reportar(e, 'Eliminar'); });
  }

  tbodyProductos.addEventListener('click', function (e) {
    var boton = e.target.closest('[data-accion]');
    if (!boton) return;
    var fila = boton.closest('[data-producto]');
    var p = productos.filter(function (x) { return x.id === fila.dataset.producto; })[0];
    if (!p) return;

    if (boton.dataset.accion === 'editar') editarProducto(p);
    else if (boton.dataset.accion === 'stock') ajustarStock(p);
    else if (boton.dataset.accion === 'eliminar') eliminarProducto(p);
  });

  document.getElementById('btn-nuevo-producto').addEventListener('click', nuevoProducto);

  /* --- Pedidos ---------------------------------------------------------- */

  function filaPedido(p) {
    var siguiente = SIGUIENTE[p.status];
    var items = p.items.map(function (i) {
      return '<li>' + i.quantity + ' &times; ' + T.escapar(i.productName) +
        ' — ' + T.money(i.subtotal) + '</li>';
    }).join('');

    return '' +
      '<tr data-pedido="' + T.escapar(p.id) + '">' +
        '<td><strong>' + T.escapar(p.orderNumber) + '</strong>' +
          '<ul class="pedido__items">' + items + '</ul></td>' +
        '<td>' + T.escapar(p.customer.name) + '<br>' +
          '<span class="campo__ayuda">' + T.escapar(p.customer.email) + '</span></td>' +
        '<td>' + T.escapar(fecha(p.createdAt)) + '</td>' +
        '<td class="num">' + T.money(p.total) + '</td>' +
        '<td><span class="chip-status chip-status--' + T.escapar(p.status) + '">' +
          T.escapar(p.status) + '</span><br>' +
          '<span class="campo__ayuda">pago: ' + T.escapar(p.paymentStatus) + '</span></td>' +
        '<td class="acciones">' +
          '<button type="button" class="btn-mini" data-accion="detalle">Detalle</button>' +
          (siguiente
            ? '<button type="button" class="btn-mini" data-accion="avanzar" ' +
              'data-siguiente="' + siguiente + '">Marcar ' + siguiente + '</button>'
            : '') +
        '</td>' +
      '</tr>';
  }

  function pintarPedidos() {
    if (!pedidos.length) {
      tbodyPedidos.innerHTML = '<tr><td colspan="6">No hay pedidos con este filtro.</td></tr>';
      conteoPedidos.textContent = '0 pedidos';
      return;
    }
    tbodyPedidos.innerHTML = pedidos.map(filaPedido).join('');
    conteoPedidos.textContent = pedidos.length === 1 ? '1 pedido' : pedidos.length + ' pedidos';
  }

  function cargarPedidos() {
    var ruta = '/api/admin/orders' +
      (statusActivo === 'todos' ? '' : '?status=' + encodeURIComponent(statusActivo));
    return api(ruta)
      .then(function (datos) { pedidos = datos; pintarPedidos(); })
      .catch(function (e) { reportar(e, 'Pedidos'); });
  }

  function alternarDetalle(fila, p) {
    var abierto = fila.nextElementSibling &&
      fila.nextElementSibling.classList.contains('fila-detalle');
    if (abierto) {
      fila.nextElementSibling.remove();
      return;
    }
    var items = p.items.map(function (i) {
      return '<li>' + i.quantity + ' &times; ' + T.escapar(i.productName) +
        ' a ' + T.money(i.unitPrice) + ' = ' + T.money(i.subtotal) + '</li>';
    }).join('');

    var tr = document.createElement('tr');
    tr.className = 'fila-detalle';
    tr.innerHTML =
      '<td colspan="6"><div class="pedido-detalle">' +
        '<dl>' +
          '<div><dt>Cliente</dt><dd>' + T.escapar(p.customer.name) + '</dd></div>' +
          '<div><dt>Correo</dt><dd>' + T.escapar(p.customer.email) + '</dd></div>' +
          '<div><dt>Teléfono</dt><dd>' +
            (p.customer.phone ? T.escapar(p.customer.phone) : '—') + '</dd></div>' +
          '<div><dt>Dirección</dt><dd>' + T.escapar(p.customer.address) + '</dd></div>' +
          '<div><dt>Estado del pago</dt><dd>' + T.escapar(p.paymentStatus) + '</dd></div>' +
          '<div><dt>Total</dt><dd>' + T.money(p.total) + '</dd></div>' +
        '</dl>' +
        '<ul class="pedido__items">' + items + '</ul>' +
        '<div class="modal__acciones">' +
          ESTADOS.map(function (s) {
            return '<button type="button" class="btn-mini" data-accion="status" ' +
              'data-status="' + s + '"' + (s === p.status ? ' disabled' : '') + '>' + s + '</button>';
          }).join('') +
        '</div>' +
      '</div></td>';
    fila.after(tr);
  }

  function cambiarStatus(p, status) {
    api('/api/admin/orders/' + encodeURIComponent(p.id), {
      method: 'PATCH', body: { status: status }
    })
      .then(function (actualizado) {
        T.UI.aviso('Pedido ' + actualizado.orderNumber + ' → ' + actualizado.status + '.', 'ok');
        return cargarPedidos();
      })
      .catch(function (e) { reportar(e, 'Cambiar status'); });
  }

  tbodyPedidos.addEventListener('click', function (e) {
    var boton = e.target.closest('[data-accion]');
    if (!boton) return;
    var fila = boton.closest('tr');
    var filaPadre = fila.classList.contains('fila-detalle')
      ? fila.previousElementSibling : fila;
    var p = pedidos.filter(function (x) { return x.id === filaPadre.dataset.pedido; })[0];
    if (!p) return;

    if (boton.dataset.accion === 'detalle') alternarDetalle(filaPadre, p);
    else if (boton.dataset.accion === 'avanzar') cambiarStatus(p, boton.dataset.siguiente);
    else if (boton.dataset.accion === 'status') cambiarStatus(p, boton.dataset.status);
  });

  filtrosPedidos.addEventListener('click', function (e) {
    var boton = e.target.closest('[data-status]');
    if (!boton) return;
    statusActivo = boton.dataset.status;
    Array.prototype.forEach.call(filtrosPedidos.querySelectorAll('[data-status]'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.status === statusActivo ? 'true' : 'false');
    });
    cargarPedidos();
  });

  /* --- Pestañas, sesión y arranque -------------------------------------- */

  document.querySelector('.pestanas').addEventListener('click', function (e) {
    var boton = e.target.closest('[data-panel]');
    if (!boton) return;
    var destino = boton.dataset.panel;

    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (b) {
      b.setAttribute('aria-selected', b.dataset.panel === destino ? 'true' : 'false');
    });
    document.getElementById('panel-productos').classList.toggle('oculto', destino !== 'productos');
    document.getElementById('panel-pedidos').classList.toggle('oculto', destino !== 'pedidos');

    if (destino === 'pedidos') cargarPedidos();
    else cargarProductos();
  });

  document.getElementById('btn-salir').addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () { window.location.replace('/admin/index.html'); })
      .catch(function () { window.location.replace('/admin/index.html'); });
  });

  // Comprobar la sesión antes de pintar nada: si expiró, al login.
  api('/api/admin/session')
    .then(function (s) {
      document.getElementById('admin-usuario').textContent = s.usuario;
      return Promise.all([cargarProductos(), cargarPedidos()]);
    })
    .catch(function (e) { reportar(e, 'Sesión'); });
})();
