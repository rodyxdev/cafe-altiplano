/**
 * Construcción de la aplicación Express.
 *
 * Se separa de server.js para poder montarla en pruebas o en un handler
 * serverless (Fase 3) sin arrancar un listener.
 */
'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { cabecerasSeguridad, sinCache } = require('./middleware/seguridad');
const { requiereAdmin } = require('./middleware/auth');
const { ErrorHttp, noEncontrado, manejadorErrores } = require('./lib/errores');

const rutasProductos = require('./routes/productos');
const rutasCheckout = require('./routes/checkout');
const rutasAdminAuth = require('./routes/admin-auth');
const rutasAdminProductos = require('./routes/admin-productos');
const rutasAdminPedidos = require('./routes/admin-pedidos');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function crearApp() {
  const app = express();

  // Express anuncia su presencia por defecto.
  app.disable('x-powered-by');

  // Detrás de un proxy (Vercel, Nginx) req.ip debe salir de X-Forwarded-For.
  // En local se deja apagado: si no, cualquiera podría falsear su IP con esa
  // cabecera y saltarse el rate limiting.
  if (config.confiarEnProxy) {
    app.set('trust proxy', 1);
  }

  app.use(cabecerasSeguridad);
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  // --- API --------------------------------------------------------------
  const api = express.Router();
  api.use(sinCache);

  api.use('/products', rutasProductos);
  api.use('/checkout', rutasCheckout);
  api.use('/admin', rutasAdminAuth);
  api.use('/admin/products', requiereAdmin, rutasAdminProductos);
  api.use('/admin/orders', requiereAdmin, rutasAdminPedidos);

  api.use(noEncontrado);
  app.use('/api', api);

  // --- Frontend ---------------------------------------------------------
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  // 404 del sitio.
  app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  });

  app.use(manejadorErrores);

  return app;
}

module.exports = { crearApp, ErrorHttp };
