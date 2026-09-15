/**
 * Café Altiplano — servidor estático (Fase 1)
 *
 * En esta fase Express sirve únicamente archivos: el frontend en /public y el
 * catálogo mock en /data. No hay rutas de API, base de datos ni checkout; eso
 * llega en fases posteriores.
 */
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

// Frontend
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Catálogo mock. Se monta como archivo estático (no como endpoint de API)
// para que el fetch del cliente pueda leerlo durante esta fase.
app.use('/data', express.static(DATA_DIR));

// 404: cualquier ruta desconocida devuelve la página de error del sitio.
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, () => {
  console.log(`Café Altiplano corriendo en http://localhost:${PORT}`);
});
