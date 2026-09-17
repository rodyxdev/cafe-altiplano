/**
 * Café Altiplano — núcleo compartido del frontend (Fase 1)
 *
 * Expone un único global `Tienda` con cuatro piezas:
 *   Tienda.Catalogo  carga y cachea /data/products.json
 *   Tienda.Carrito   estado del carrito en localStorage
 *   Tienda.UI        helpers de formato, avisos y contador del header
 *   Tienda.money     formateo de precios en MXN
 *
 * Sin dependencias externas. Se carga en todas las páginas antes del script
 * específico de cada una.
 */
(function (global) {
  'use strict';

  /* === Constantes ====================================================== */

  var CLAVE_CARRITO = 'cafe_altiplano_cart';
  var RUTA_CATALOGO = '/api/products'; // Fase 2: sale de Supabase, ya no del JSON local
  var EVENTO_CAMBIO = 'carrito:cambio';
  var UMBRAL_POCAS = 10; // stock por debajo del cual mostramos "últimas piezas"

  /* === Formato ========================================================= */

  var formateadorMXN = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  });

  /**
   * Formatea un número como precio en pesos mexicanos.
   * El valor crudo nunca se toca: products.json guarda números sin formato.
   */
  function money(valor) {
    var n = Number(valor);
    if (!isFinite(n)) return formateadorMXN.format(0);
    return formateadorMXN.format(n);
  }

  /** Redondea a 2 decimales evitando el ruido de punto flotante. */
  function redondear(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  /** Escapa texto antes de inyectarlo en HTML. */
  function escapar(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Entero saneado dentro de [min, max]. Devuelve `min` si no es número. */
  function entero(valor, min, max) {
    var n = parseInt(valor, 10);
    if (!isFinite(n)) return min;
    if (n < min) return min;
    if (typeof max === 'number' && n > max) return max;
    return n;
  }

  /* === Catálogo ======================================================== */

  var promesaCatalogo = null;
  var indicePorId = null;

  var Catalogo = {
    /**
     * Carga products.json una sola vez por carga de página y cachea el
     * resultado. Cualquier llamada posterior reutiliza la misma promesa.
     */
    cargar: function () {
      if (!promesaCatalogo) {
        promesaCatalogo = fetch(RUTA_CATALOGO, { cache: 'no-cache' })
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' al cargar el catálogo');
            return res.json();
          })
          .then(function (datos) {
            if (!Array.isArray(datos)) throw new Error('El catálogo no es un arreglo');
            indicePorId = Object.create(null);
            datos.forEach(function (p) { indicePorId[p.id] = p; });
            return datos;
          })
          .catch(function (err) {
            promesaCatalogo = null; // permite reintentar
            throw err;
          });
      }
      return promesaCatalogo;
    },

    /** Producto por id. Solo válido después de que `cargar()` haya resuelto. */
    porId: function (id) {
      return indicePorId ? indicePorId[id] || null : null;
    },

    /** Nivel de stock: 'agotado' | 'pocas' | 'ok'. */
    nivelStock: function (stock) {
      var n = Number(stock) || 0;
      if (n <= 0) return 'agotado';
      if (n <= UMBRAL_POCAS) return 'pocas';
      return 'ok';
    },

    UMBRAL_POCAS: UMBRAL_POCAS
  };

  /* === Carrito ========================================================= */

  /*
   * Contrato de almacenamiento (fijo, no cambiar sin avisar):
   *   localStorage['cafe_altiplano_cart'] = JSON de [{ productId, quantity }]
   * `quantity` es siempre un entero >= 1: las líneas que llegan a 0 se
   * eliminan en lugar de guardarse.
   */

  // Respaldo en memoria por si localStorage no está disponible (modo privado,
  // almacenamiento bloqueado). El carrito sigue funcionando dentro de la página.
  var respaldoMemoria = null;
  var hayAlmacenamiento = (function () {
    try {
      var prueba = '__ca_test__';
      global.localStorage.setItem(prueba, '1');
      global.localStorage.removeItem(prueba);
      return true;
    } catch (e) {
      return false;
    }
  })();

  /** Deja pasar solo entradas con forma { productId: string, quantity: int>=1 }. */
  function sanear(bruto) {
    if (!Array.isArray(bruto)) return [];
    var vistos = Object.create(null);
    var limpio = [];
    bruto.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var id = item.productId;
      if (typeof id !== 'string' || id === '') return;
      var cant = parseInt(item.quantity, 10);
      if (!isFinite(cant) || cant < 1) return;
      if (vistos[id]) {
        // Duplicados heredados de un estado corrupto: se fusionan.
        vistos[id].quantity += cant;
        return;
      }
      var linea = { productId: id, quantity: cant };
      vistos[id] = linea;
      limpio.push(linea);
    });
    return limpio;
  }

  function leerCrudo() {
    if (!hayAlmacenamiento) return respaldoMemoria || [];
    var texto;
    try {
      texto = global.localStorage.getItem(CLAVE_CARRITO);
    } catch (e) {
      return respaldoMemoria || [];
    }
    if (!texto) return [];
    try {
      return sanear(JSON.parse(texto));
    } catch (e) {
      // JSON corrupto: se descarta en vez de romper la página.
      try { global.localStorage.removeItem(CLAVE_CARRITO); } catch (e2) {}
      return [];
    }
  }

  function escribir(items) {
    var limpio = sanear(items);
    respaldoMemoria = limpio;
    if (hayAlmacenamiento) {
      try {
        global.localStorage.setItem(CLAVE_CARRITO, JSON.stringify(limpio));
      } catch (e) {
        // Cuota llena o almacenamiento revocado: seguimos con el respaldo.
      }
    }
    notificar(limpio);
    return limpio;
  }

  var suscriptores = [];

  function notificar(items) {
    var detalle = { items: items, totalItems: sumar(items) };
    suscriptores.forEach(function (fn) {
      try { fn(detalle); } catch (e) { console.error('[carrito] suscriptor falló:', e); }
    });
    global.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: detalle }));
  }

  function sumar(items) {
    return items.reduce(function (acc, l) { return acc + l.quantity; }, 0);
  }

  function indiceDe(items, productId) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].productId === productId) return i;
    }
    return -1;
  }

  var Carrito = {
    CLAVE: CLAVE_CARRITO,
    EVENTO: EVENTO_CAMBIO,

    /** Copia del contenido actual: [{ productId, quantity }]. */
    leer: function () {
      return leerCrudo();
    },

    /** Cantidad de un producto en el carrito (0 si no está). */
    cantidadDe: function (productId) {
      var items = leerCrudo();
      var i = indiceDe(items, productId);
      return i === -1 ? 0 : items[i].quantity;
    },

    /** Suma de todas las cantidades: lo que muestra el contador del header. */
    totalItems: function () {
      return sumar(leerCrudo());
    },

    /** Número de líneas distintas. */
    totalLineas: function () {
      return leerCrudo().length;
    },

    /**
     * Agrega un producto. Si ya existe, incrementa; si no, lo crea.
     * Nunca deja pasar la cantidad por encima de `stock`.
     *
     * Devuelve { estado, cantidad, anterior, limite, agregado } donde estado es:
     *   'agotado'      stock 0, no se hizo nada
     *   'agregado'     línea nueva
     *   'incrementado' línea existente, se sumó todo lo pedido
     *   'limitado'     se topó contra el stock (se agregó menos de lo pedido)
     *   'sin-cambio'   ya estaba en el máximo disponible
     */
    agregar: function (productId, cantidad, stock) {
      var pedido = entero(cantidad == null ? 1 : cantidad, 1);
      var tope = entero(stock, 0);
      var items = leerCrudo();
      var i = indiceDe(items, productId);
      var anterior = i === -1 ? 0 : items[i].quantity;

      if (tope <= 0) {
        return { estado: 'agotado', cantidad: anterior, anterior: anterior, limite: tope, agregado: 0 };
      }
      if (anterior >= tope) {
        return { estado: 'sin-cambio', cantidad: anterior, anterior: anterior, limite: tope, agregado: 0 };
      }

      var deseada = anterior + pedido;
      var final = Math.min(deseada, tope);

      if (i === -1) {
        items.push({ productId: productId, quantity: final });
      } else {
        items[i].quantity = final;
      }
      escribir(items);

      var estado;
      if (final < deseada) estado = 'limitado';
      else if (anterior === 0) estado = 'agregado';
      else estado = 'incrementado';

      return {
        estado: estado,
        cantidad: final,
        anterior: anterior,
        limite: tope,
        agregado: final - anterior
      };
    },

    /**
     * Fija la cantidad exacta de una línea.
     * Cantidad 0 (o menos) elimina la línea; por encima del stock se recorta.
     *
     * Devuelve { estado, cantidad, limite } con estado:
     *   'eliminado' | 'actualizado' | 'limitado' | 'ausente' | 'sin-cambio'
     */
    fijarCantidad: function (productId, cantidad, stock) {
      var items = leerCrudo();
      var i = indiceDe(items, productId);
      if (i === -1) return { estado: 'ausente', cantidad: 0, limite: entero(stock, 0) };

      var anterior = items[i].quantity;
      var tope = entero(stock, 0);
      var pedida = entero(cantidad, 0);

      if (pedida <= 0 || tope <= 0) {
        items.splice(i, 1);
        escribir(items);
        return { estado: 'eliminado', cantidad: 0, limite: tope, anterior: anterior };
      }

      var final = Math.min(pedida, tope);
      if (final === anterior) {
        // Sin cambio real, pero avisamos si fue por el tope de stock.
        return {
          estado: final < pedida ? 'limitado' : 'sin-cambio',
          cantidad: final, limite: tope, anterior: anterior
        };
      }

      items[i].quantity = final;
      escribir(items);
      return {
        estado: final < pedida ? 'limitado' : 'actualizado',
        cantidad: final, limite: tope, anterior: anterior
      };
    },

    /** Elimina una línea completa. */
    eliminar: function (productId) {
      var items = leerCrudo();
      var i = indiceDe(items, productId);
      if (i === -1) return false;
      items.splice(i, 1);
      escribir(items);
      return true;
    },

    /** Vacía el carrito. */
    vaciar: function () {
      escribir([]);
    },

    /**
     * Cruza el carrito con el catálogo ya cargado y devuelve líneas listas
     * para pintar, más los totales. Las líneas cuyo producto ya no exista en
     * el catálogo se reportan aparte en `huerfanas`.
     */
    detallar: function (productos) {
      var porId = Object.create(null);
      (productos || []).forEach(function (p) { porId[p.id] = p; });

      var items = leerCrudo();
      var lineas = [];
      var huerfanas = [];

      items.forEach(function (item) {
        var producto = porId[item.productId];
        if (!producto) { huerfanas.push(item.productId); return; }
        lineas.push({
          producto: producto,
          quantity: item.quantity,
          subtotal: redondear(producto.price * item.quantity)
        });
      });

      var total = redondear(lineas.reduce(function (acc, l) { return acc + l.subtotal; }, 0));
      return {
        lineas: lineas,
        huerfanas: huerfanas,
        totalItems: sumar(items),
        total: total
      };
    },

    /** Registra un callback para cada cambio. Devuelve la función para cancelar. */
    suscribir: function (fn) {
      if (typeof fn !== 'function') return function () {};
      suscriptores.push(fn);
      return function () {
        var i = suscriptores.indexOf(fn);
        if (i !== -1) suscriptores.splice(i, 1);
      };
    }
  };

  // Cambios hechos en otra pestaña del mismo origen.
  global.addEventListener('storage', function (e) {
    if (e.key !== CLAVE_CARRITO) return;
    var items = leerCrudo();
    respaldoMemoria = items;
    var detalle = { items: items, totalItems: sumar(items), externo: true };
    suscriptores.forEach(function (fn) {
      try { fn(detalle); } catch (err) { console.error('[carrito] suscriptor falló:', err); }
    });
    global.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: detalle }));
  });

  /* === UI compartida =================================================== */

  var contenedorAvisos = null;

  function zonaAvisos() {
    if (contenedorAvisos && document.body.contains(contenedorAvisos)) return contenedorAvisos;
    contenedorAvisos = document.querySelector('.avisos');
    if (!contenedorAvisos) {
      contenedorAvisos = document.createElement('div');
      contenedorAvisos.className = 'avisos';
      contenedorAvisos.setAttribute('role', 'status');
      contenedorAvisos.setAttribute('aria-live', 'polite');
      document.body.appendChild(contenedorAvisos);
    }
    return contenedorAvisos;
  }

  var UI = {
    /**
     * Muestra un aviso efímero. `tipo`: 'ok' | 'error' | 'alerta' | 'info'.
     * Se usa sobre todo para no fallar en silencio al topar con el stock.
     */
    aviso: function (mensaje, tipo, ms) {
      var zona = zonaAvisos();
      var el = document.createElement('div');
      el.className = 'aviso' + (tipo && tipo !== 'info' ? ' aviso--' + tipo : '');
      el.textContent = mensaje;
      zona.appendChild(el);
      global.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, ms || 3200);
    },

    /**
     * Engancha el contador del header al carrito. Se llama en todas las
     * páginas: pinta el valor inicial y se actualiza en cada cambio, venga
     * de esta pestaña o de otra.
     */
    montarContador: function () {
      var nodos = document.querySelectorAll('[data-contador-carrito]');
      if (!nodos.length) return;

      var primeraPintura = true;

      function pintar(total) {
        Array.prototype.forEach.call(nodos, function (nodo) {
          var previo = nodo.textContent;
          nodo.textContent = String(total);
          nodo.setAttribute('data-vacio', total === 0 ? 'true' : 'false');
          var etiqueta = total === 1 ? '1 artículo en el carrito' : total + ' artículos en el carrito';
          var boton = nodo.closest('[data-boton-carrito]') || nodo;
          boton.setAttribute('aria-label', etiqueta);
          if (!primeraPintura && previo !== nodo.textContent) {
            nodo.classList.remove('esta-pulsando');
            void nodo.offsetWidth; // reinicia la animación
            nodo.classList.add('esta-pulsando');
          }
        });
        primeraPintura = false;
      }

      pintar(Carrito.totalItems());
      Carrito.suscribir(function (detalle) { pintar(detalle.totalItems); });
    },

    /** Marca el enlace de navegación correspondiente a la página actual. */
    marcarNavActiva: function () {
      var actual = global.location.pathname.replace(/\/$/, '') || '/index.html';
      if (actual === '') actual = '/index.html';
      var enlaces = document.querySelectorAll('.nav__enlace, .boton-carrito');
      Array.prototype.forEach.call(enlaces, function (a) {
        var destino = a.getAttribute('href');
        if (!destino) return;
        var normalizado = destino === '/' ? '/index.html' : destino;
        if (normalizado === actual) a.setAttribute('aria-current', 'page');
      });
    },

    /** Pinta un bloque de estado (vacío / error) dentro de un contenedor. */
    estado: function (contenedor, opciones) {
      if (!contenedor) return;
      var o = opciones || {};
      contenedor.innerHTML =
        '<div class="estado">' +
          (o.icono ? '<div class="estado__icono" aria-hidden="true">' + escapar(o.icono) + '</div>' : '') +
          '<h2>' + escapar(o.titulo || '') + '</h2>' +
          (o.texto ? '<p>' + escapar(o.texto) + '</p>' : '') +
          (o.accion
            ? '<a class="btn" href="' + escapar(o.accion.href) + '">' + escapar(o.accion.texto) + '</a>'
            : '') +
        '</div>';
    }
  };

  /* === Arranque ======================================================== */

  /**
   * Solo presentación: el header ya es sticky por CSS; esta clase le agrega
   * sombra cuando la página se desplazó, para que se lea sobre el contenido.
   */
  function sombraEncabezado() {
    var encabezado = document.querySelector('.encabezado');
    if (!encabezado) return;
    var pendiente = false;
    function actualizar() {
      pendiente = false;
      encabezado.classList.toggle('encabezado--desplazado', global.scrollY > 8);
    }
    global.addEventListener('scroll', function () {
      if (pendiente) return;
      pendiente = true;
      global.requestAnimationFrame(actualizar);
    }, { passive: true });
    actualizar();
  }

  function iniciar() {
    UI.montarContador();
    UI.marcarNavActiva();
    sombraEncabezado();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  /* === Exportación ===================================================== */

  global.Tienda = {
    Catalogo: Catalogo,
    Carrito: Carrito,
    UI: UI,
    money: money,
    escapar: escapar,
    entero: entero,
    redondear: redondear
  };
})(window);
