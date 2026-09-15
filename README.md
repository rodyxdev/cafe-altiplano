# Café Altiplano

Catálogo de productos y carrito de compras para un tostador artesanal de café
de especialidad mexicano (Chiapas, Veracruz y Oaxaca).

**Estado: Fase 1 — scaffolding y frontend estático.** Todavía no hay API,
checkout, panel de administración ni base de datos; los datos son mock.

## Requisitos

- Node.js 18 o superior

## Cómo correrlo

```bash
npm install
npm start
```

El sitio queda en <http://localhost:3000>. `npm run dev` hace lo mismo con
`node --watch` para reiniciar al guardar.

## Estructura

```
cafe-altiplano/
├── data/
│   └── products.json      catálogo mock (11 productos)
├── public/
│   ├── css/styles.css     hoja única, mobile-first
│   ├── img/               SVG generados, uno por producto
│   ├── js/
│   │   ├── tienda.js      núcleo: catálogo, carrito, avisos, contador
│   │   ├── catalogo.js    index.html
│   │   ├── producto.js    producto.html
│   │   └── carrito.js     carrito.html
│   ├── index.html         catálogo con filtro por categoría
│   ├── producto.html      detalle (?id=<id>)
│   ├── carrito.html       carrito
│   ├── checkout.html      placeholder "Próximamente"
│   └── 404.html
├── server.js              servidor estático Express
└── package.json
```

## Esquema de datos

`data/products.json` es un arreglo de objetos con estos campos exactos, que se
reutilizarán como columnas de la tabla `cafe_products` en Supabase en una fase
posterior:

| campo         | tipo          | notas                                            |
|---------------|---------------|--------------------------------------------------|
| `id`          | string        | slug único, también usado como SKU               |
| `name`        | string        |                                                  |
| `description` | string        |                                                  |
| `price`       | number        | MXN sin formatear, ej. `245.00`                  |
| `origin`      | string \| null | región de cultivo del café; `null` en accesorios |
| `category`    | string        | `"cafe"` o `"accesorios"`                        |
| `stock`       | number        | entero                                           |
| `image`       | string        | ruta relativa dentro de `/public/img`            |

`origin` es el único campo nullable: significa estrictamente la región de
cultivo del café, así que los productos de `category: "accesorios"` lo llevan
en `null`. La columna `origin` de `cafe_products` en Supabase se creará
permitiendo NULL. El frontend omite por completo la línea de origen cuando el
valor es `null`, en vez de mostrarla vacía.

No cambiar nombres ni tipos sin avisar: la migración a Supabase depende de
que el esquema siga siendo el mismo.

## Contrato del carrito

- Persistencia en `localStorage` bajo la clave `cafe_altiplano_cart`.
- Valor almacenado: un arreglo de `{ productId, quantity }`. `quantity` es
  siempre un entero mayor o igual a 1; una línea que llega a 0 se elimina en
  lugar de guardarse en 0.
- Agregar un producto que ya está en el carrito incrementa su `quantity`.
- Ninguna operación deja que `quantity` supere el `stock` del producto: se
  recorta al máximo disponible y se muestra un aviso, nunca falla en silencio.
- El contador del header refleja la suma de `quantity` y se actualiza en cada
  cambio, incluso si el cambio viene de otra pestaña (evento `storage`).
- El estado guardado se sanea al leerse: JSON corrupto, entradas mal formadas
  o ids duplicados no rompen la página.

Toda esta lógica vive en `Tienda.Carrito` (`public/js/tienda.js`); las páginas
solo pintan.

## Qué falta (fases posteriores)

- API real en Express (rutas y endpoints)
- Checkout simulado tipo Stripe
- Panel de administración
- Supabase como fuente de datos en lugar de `products.json`
