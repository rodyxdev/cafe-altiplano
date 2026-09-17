/**
 * Café Altiplano — fichas técnicas (solo presentación)
 *
 * Altitud, proceso y nivel de tueste de cada lote. No forman parte del
 * esquema de datos (cafe_products no tiene esas columnas y no se modifica):
 * es contenido editorial que el frontend muestra junto a la ficha. Un
 * producto que no esté aquí (p. ej. uno creado desde el panel) simplemente
 * no muestra esas líneas.
 *
 * Altitudes dentro de los rangos de cultivo documentados para cada región
 * (Chiapas 1,200–1,700 m; Veracruz 900–1,300 m; Oaxaca 1,000–1,600 m) y
 * coherentes con lo que ya dicen las descripciones de la semilla.
 *
 * Tueste en 5 niveles: 1 claro · 2 medio-claro · 3 medio · 4 medio-oscuro ·
 * 5 oscuro.
 */
(function (global) {
  'use strict';

  var NIVELES = ['', 'Claro', 'Medio-claro', 'Medio', 'Medio-oscuro', 'Oscuro'];

  var FICHAS = {
    'cafe-jaltenango-chiapas':    { altitud: '1,450 m', proceso: 'Lavado', tueste: 3 },
    'cafe-pluma-hidalgo-oaxaca':  { altitud: '1,300 m', proceso: 'Lavado', tueste: 3 },
    'cafe-coatepec-veracruz':     { altitud: '1,200 m', proceso: 'Lavado', tueste: 2 },
    'cafe-triunfo-honey-chiapas': { altitud: '1,600 m', proceso: 'Honey amarillo', tueste: 2 },
    'cafe-natural-oaxaca':        { altitud: '1,550 m', proceso: 'Natural', tueste: 2 },
    'cafe-blend-altiplano':       { altitud: '1,200–1,450 m', proceso: 'Lavado y honey', tueste: 4 },
    'cafe-descafeinado-veracruz': { altitud: '1,250 m', proceso: 'Lavado, descafeinado en agua', tueste: 3 },

    // Accesorios: sin origen ni tueste; una línea con lo esencial del equipo,
    // tomada de su descripción.
    'acc-v60-ceramica-02':     { detalle: 'Cerámica · 1 a 4 tazas' },
    'acc-prensa-francesa-800': { detalle: 'Vidrio borosilicato · 800 ml' },
    'acc-molino-manual-acero': { detalle: 'Muelas cónicas de acero · 38 ajustes' },
    'acc-balanza-digital':     { detalle: 'Precisión de 0.1 g · Temporizador' }
  };

  function escapar(t) {
    return global.Tienda ? global.Tienda.escapar(t) : String(t == null ? '' : t);
  }

  /** "Chiapas · 1,450 m · Lavado", en oración normal. */
  function lineaFicha(producto) {
    var f = FICHAS[producto.id] || {};
    var partes = [];
    if (producto.category === 'cafe') {
      if (producto.origin) partes.push(producto.origin);
      if (f.altitud) partes.push(f.altitud);
      if (f.proceso) partes.push(f.proceso);
    } else if (f.detalle) {
      partes.push(f.detalle);
    }
    if (!partes.length) return '';
    return '<p class="ficha-linea">' + partes.map(escapar).join(' <span aria-hidden="true">·</span> ') + '</p>';
  }

  /**
   * Barra de tueste de claro a oscuro con un marcador en la posición del lote.
   * La posición va por clase (tueste--1..5) y no por style="left:..": la CSP
   * de producción no permite estilos en línea.
   */
  function barraTueste(producto) {
    var f = FICHAS[producto.id];
    if (!f || !f.tueste || producto.category !== 'cafe') return '';
    var nivel = Math.max(1, Math.min(5, f.tueste));
    return '' +
      '<div class="tueste tueste--' + nivel + '" role="img" aria-label="Tueste ' + NIVELES[nivel].toLowerCase() + '">' +
        '<div class="tueste__barra"><span class="tueste__marca"></span></div>' +
        '<div class="tueste__etiquetas" aria-hidden="true">' +
          '<span>Claro</span><span class="tueste__nivel">' + NIVELES[nivel] + '</span><span>Oscuro</span>' +
        '</div>' +
      '</div>';
  }

  global.Fichas = { lineaFicha: lineaFicha, barraTueste: barraTueste, datos: FICHAS, niveles: NIVELES };
})(window);
