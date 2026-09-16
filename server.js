/**
 * Café Altiplano — arranque del servidor (Fase 2)
 *
 * Express sirve el frontend de /public y la API de /api. Los datos viven en
 * Supabase; data/products.json solo se conserva como semilla inicial.
 */
'use strict';

const { crearApp } = require('./src/app');
const config = require('./src/config');

const app = crearApp();

app.listen(config.puerto, () => {
  console.log('Café Altiplano escuchando en http://localhost:' + config.puerto);
  console.log('  entorno: ' + (config.esProduccion ? 'production' : 'development'));
  console.log('  trust proxy: ' + (config.confiarEnProxy ? 'sí' : 'no'));
});
