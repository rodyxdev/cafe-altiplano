/**
 * Café Altiplano — checkout simulado (checkout.html)
 *
 * Manda el carrito a POST /api/checkout. El servidor recalcula precios y
 * valida stock; aquí solo se pintan el resumen y los errores que devuelva.
 * Los campos de tarjeta son decorativos y nunca salen del navegador.
 */
(function () {
  'use strict';

  var T = window.Tienda;

  var zonaCheckout = document.getElementById('zona-checkout');
  var zonaConfirmacion = document.getElementById('zona-confirmacion');
  var zonaResumen = document.getElementById('zona-resumen');
  var formulario = document.getElementById('form-checkout');
  var botonPagar = document.getElementById('btn-pagar');
  var errorGeneral = document.getElementById('error-general');

  var productos = [];
  var enviando = false;

  /* --- Resumen --------------------------------------------------------- */

  function pintarResumen() {
    var detalle = T.Carrito.detallar(productos);

    if (!detalle.lineas.length) {
      zonaCheckout.classList.add('oculto');
      zonaConfirmacion.classList.remove('oculto');
      T.UI.estado(zonaConfirmacion, {
        icono: '☕',
        titulo: 'Tu carrito está vacío',
        texto: 'Agrega algo antes de pasar por el checkout.',
        accion: { href: 'index.html', texto: 'Ver el catálogo' }
      });
      return false;
    }

    var filas = detalle.lineas.map(function (l) {
      return '<div class="resumen__fila"><span>' +
        T.escapar(l.producto.name) + ' &times; ' + l.quantity +
        '</span><span>' + T.money(l.subtotal) + '</span></div>';
    }).join('');

    zonaResumen.innerHTML =
      '<h2>Tu pedido</h2>' + filas +
      '<div class="resumen__fila"><span>Envío</span><span>Sin costo (demo)</span></div>' +
      '<div class="resumen__fila resumen__fila--total"><span>Total</span><span>' +
        T.money(detalle.total) + '</span></div>' +
      '<p class="resumen__nota">Precios en pesos mexicanos (MXN).</p>';
    return true;
  }

  /* --- Errores --------------------------------------------------------- */

  function limpiarErrores() {
    errorGeneral.textContent = '';
    errorGeneral.classList.add('oculto');
    Array.prototype.forEach.call(
      formulario.querySelectorAll('[data-error]'),
      function (p) { p.textContent = ''; }
    );
    Array.prototype.forEach.call(
      formulario.querySelectorAll('.campo--invalido'),
      function (c) { c.classList.remove('campo--invalido'); }
    );
  }

  function mostrarErrorGeneral(mensaje) {
    errorGeneral.textContent = mensaje;
    errorGeneral.classList.remove('oculto');
    errorGeneral.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function mostrarErroresCampo(campos) {
    Object.keys(campos || {}).forEach(function (nombre) {
      var p = formulario.querySelector('[data-error="' + nombre + '"]');
      if (!p) return;
      p.textContent = campos[nombre];
      var contenedor = p.closest('.campo');
      if (contenedor) contenedor.classList.add('campo--invalido');
    });
  }

  /* --- Envío ----------------------------------------------------------- */

  function datosCliente() {
    return {
      name: formulario.elements.name.value,
      email: formulario.elements.email.value,
      phone: formulario.elements.phone.value,
      address: formulario.elements.address.value
    };
  }

  function pintarConfirmacion(respuesta) {
    zonaCheckout.classList.add('oculto');
    zonaConfirmacion.classList.remove('oculto');
    zonaConfirmacion.innerHTML =
      '<div class="estado estado--exito">' +
        '<div class="estado__icono" aria-hidden="true">✓</div>' +
        '<h1>Pedido confirmado</h1>' +
        '<p class="confirmacion__numero">' + T.escapar(respuesta.orderNumber) + '</p>' +
        '<p>Guardamos tu pedido por <strong>' + T.money(respuesta.total) + '</strong>. ' +
          'Te escribiremos al correo que nos diste para coordinar el envío.</p>' +
        '<p class="confirmacion__nota">' +
          'Estado del pago: <strong>simulado</strong>. Este es un proyecto de ' +
          'demostración: no se realizó ningún cargo.' +
        '</p>' +
        '<a class="btn" href="index.html">Seguir comprando</a>' +
      '</div>';
    zonaConfirmacion.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function describirFaltantes(faltantes) {
    return (faltantes || []).map(function (f) {
      var nombre = f.productName || f.productId;
      if (f.motivo === 'no_existe') return nombre + ' ya no está disponible';
      return nombre + ': pediste ' + f.solicitado + ' y quedan ' + f.disponible;
    }).join('. ') + '.';
  }

  /** Deja el carrito en lo que el servidor dice que hay realmente. */
  function ajustarCarritoATope(faltantes) {
    (faltantes || []).forEach(function (f) {
      if (f.motivo === 'no_existe' || f.disponible <= 0) {
        T.Carrito.eliminar(f.productId);
      } else {
        T.Carrito.fijarCantidad(f.productId, f.disponible, f.disponible);
      }
    });
  }

  function recargarYPintar() {
    return fetch('/api/products', { cache: 'no-cache' })
      .then(function (res) { return res.json(); })
      .then(function (datos) {
        productos = datos;
        pintarResumen();
      })
      .catch(function (err) { console.error('[checkout] recarga', err); });
  }

  formulario.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;

    limpiarErrores();
    enviando = true;
    botonPagar.disabled = true;
    botonPagar.textContent = 'Procesando...';

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: T.Carrito.leer(), customer: datosCliente() })
    })
      .then(function (res) {
        return res.json().then(function (cuerpo) {
          return { estado: res.status, cuerpo: cuerpo };
        });
      })
      .then(function (r) {
        if (r.estado === 201 && r.cuerpo.ok) {
          T.Carrito.vaciar();
          pintarConfirmacion(r.cuerpo);
          return;
        }

        if (r.estado === 409 && r.cuerpo.motivo === 'stock_insuficiente') {
          ajustarCarritoATope(r.cuerpo.faltantes);
          mostrarErrorGeneral(r.cuerpo.error + ' ' + describirFaltantes(r.cuerpo.faltantes) +
            ' Ajustamos tu carrito a lo que hay disponible.');
          return recargarYPintar();
        }

        if (r.cuerpo && r.cuerpo.campos) {
          mostrarErroresCampo(r.cuerpo.campos);
          mostrarErrorGeneral(r.cuerpo.error || 'Revisa los datos del formulario.');
          return;
        }

        mostrarErrorGeneral((r.cuerpo && r.cuerpo.error) ||
          'No pudimos registrar tu pedido. Inténtalo de nuevo.');
      })
      .catch(function (err) {
        console.error('[checkout]', err);
        mostrarErrorGeneral(
          'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      })
      .then(function () {
        enviando = false;
        botonPagar.disabled = false;
        botonPagar.textContent = 'Confirmar pedido (simulación)';
      });
  });

  /* --- Carga ----------------------------------------------------------- */

  T.Catalogo.cargar()
    .then(function (datos) {
      productos = datos;
      pintarResumen();
    })
    .catch(function (err) {
      console.error('[checkout]', err);
      zonaCheckout.classList.add('oculto');
      zonaConfirmacion.classList.remove('oculto');
      T.UI.estado(zonaConfirmacion, {
        icono: '⚠️',
        titulo: 'No pudimos cargar tu pedido',
        texto: 'Necesitamos el catálogo para calcular el total. Recarga la página.',
        accion: { href: 'carrito.html', texto: 'Volver al carrito' }
      });
    });
})();
