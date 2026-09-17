/**
 * Punto de entrada en Vercel.
 *
 * Vercel acepta una app de Express como handler (req, res), así que basta con
 * exportarla: aquí no se llama a listen(), la plataforma maneja el ciclo de
 * vida. La app se construye una vez por instancia y las invocaciones que
 * caen en una instancia caliente la reutilizan.
 *
 * En local se sigue usando `node server.js`, que monta la misma app y sí
 * llama a listen().
 */
'use strict';

const { crearApp } = require('../src/app');

module.exports = crearApp();
