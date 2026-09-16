# Café Altiplano

Catálogo, carrito, checkout simulado y panel de administración para un
tostador artesanal de café de especialidad mexicano (Chiapas, Veracruz y
Oaxaca).

**Estado: Fase 2 — backend real.** Los datos viven en Supabase, la API es de
Express y hay panel de administración con login. Falta el despliegue a Vercel
(Fase 3).

## Requisitos

- Node.js 18 o superior
- Un proyecto de Supabase

## Puesta en marcha

```bash
npm install
cp .env.example .env     # y llenar los valores (ver abajo)
npm run migrate          # crea tablas, RLS y funciones
npm run seed             # siembra los 11 productos
npm start
```

El sitio queda en <http://localhost:3000> y el panel en
<http://localhost:3000/admin/>.

| script | qué hace |
|-----------------|---------------------------------------------------------|
| `npm start`     | arranca el servidor |
| `npm run dev`   | igual, con `node --watch` |
| `npm run migrate` | aplica `db/*.sql` en orden, cada archivo en una transacción |
| `npm run seed`  | upsert de `data/products.json` en `cafe_products` |
| `npm run hash`  | `npm run hash -- "contrasena"` → hash bcrypt cost 12 |

## Variables de entorno

Ver `.env.example`. Ninguna se versiona: `.gitignore` cubre `.env`, `.env.*`
(con excepción de `.env.example`), `env.txt`, `*env*.txt`, `*.key` y
`secrets*`.

| variable | para qué |
|-----------------------------|-------------------------------------------|
| `SUPABASE_URL`              | URL del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | llave del servidor; bypassea RLS, nunca va al frontend |
| `ADMIN_USERNAME`            | usuario del panel |
| `ADMIN_PASSWORD_HASH`       | hash bcrypt cost 12 de la contraseña |
| `JWT_SECRET`                | firma la cookie de sesión |
| `DATABASE_URL`              | solo para `npm run migrate`; el servidor no la usa |
| `PORT`, `NODE_ENV`, `TRUST_PROXY` | operación |

El servidor valida todas las obligatorias al arrancar y se niega a levantar si
falta alguna o si el hash no tiene forma de bcrypt.

## Estructura

```
cafe-altiplano/
├── data/products.json      semilla del catálogo (11 productos)
├── db/
│   ├── 01_schema.sql       tablas
│   ├── 02_rls.sql          RLS y políticas
│   ├── 03_functions.sql    cafe_crear_pedido, rate limiting
│   └── 04_seed_check.sql   consultas de comprobación
├── scripts/
│   ├── migrate.js          aplica db/*.sql
│   ├── seed.js             siembra cafe_products
│   └── hash-password.js    genera ADMIN_PASSWORD_HASH
├── src/
│   ├── app.js              arma la app Express
│   ├── config.js           carga y valida el entorno
│   ├── lib/                supabase, sanitizar, errores
│   ├── middleware/         seguridad (cabeceras), auth (JWT)
│   └── routes/             productos, checkout, admin-*
├── public/
│   ├── admin/              login y panel
│   ├── css/styles.css      hoja única, mobile-first
│   ├── img/                SVG por producto
│   ├── js/                 tienda, catalogo, producto, carrito,
│   │                       checkout, admin-login, admin-panel
│   └── *.html              catálogo, detalle, carrito, checkout, 404
└── server.js               arranque
```

## API

| método | ruta | acceso |
|--------|------------------------------|-----------|
| GET    | `/api/products`              | pública (filtro `?categoria=`) |
| GET    | `/api/products/:id`          | pública |
| POST   | `/api/checkout`              | pública |
| POST   | `/api/admin/login`           | pública (con rate limit) |
| POST   | `/api/admin/logout`          | pública |
| GET    | `/api/admin/session`         | sesión |
| POST   | `/api/admin/products`        | sesión |
| PUT    | `/api/admin/products/:id`    | sesión |
| DELETE | `/api/admin/products/:id`    | sesión |
| GET    | `/api/admin/orders`          | sesión (filtro `?status=`) |
| PATCH  | `/api/admin/orders/:id`      | sesión |

### Checkout

`POST /api/checkout` recibe `{ items: [{productId, quantity}], customer: {...} }`.

El servidor **ignora cualquier precio que venga del navegador**: la función
`cafe_crear_pedido` relee precio y stock desde la base dentro de una sola
transacción, con las filas de los productos bloqueadas por `SELECT … FOR
UPDATE` en orden por id. Así dos personas comprando la última pieza al mismo
tiempo se resuelven en serie y la segunda recibe `409` con el detalle de qué
producto y cuánto queda.

Los pedidos se guardan con `payment_status = 'simulado'`. No hay pasarela de
pago ni llamadas a servicios externos: los campos de tarjeta del formulario
son decorativos y nunca salen del navegador.

## Esquema de datos

`cafe_products` conserva exactamente el esquema del `products.json` de la
Fase 1:

| campo         | tipo          | notas                                            |
|---------------|---------------|--------------------------------------------------|
| `id`          | text (pk)     | slug único, también usado como SKU               |
| `name`        | text          |                                                  |
| `description` | text          |                                                  |
| `price`       | numeric(10,2) | MXN                                              |
| `origin`      | text NULL     | región de cultivo del café; `null` en accesorios |
| `category`    | text          | `"cafe"` o `"accesorios"`                        |
| `stock`       | integer       |                                                  |
| `image`       | text          | ruta relativa dentro de `/public/img`            |

`origin` es el único campo nullable: significa estrictamente la región de
cultivo del café, así que los accesorios lo llevan en `null` y el frontend
omite esa línea por completo cuando no hay valor.

`cafe_order_items` guarda `product_name` y `unit_price` como **foto del
momento de la compra**. Editar o borrar un producto no cambia los pedidos ya
hechos: por eso `product_id` no es llave foránea.

### RLS

Las cuatro tablas tienen RLS habilitada. La única política es `SELECT` de
`cafe_products` para el rol `anon`. Todo lo demás queda sin política, es decir
denegado por defecto. El backend entra con la service role key, que bypassea
RLS siempre, así que esto es defensa en profundidad y no el control de acceso
principal.

## Contrato del carrito

- Persistencia en `localStorage` bajo la clave `cafe_altiplano_cart`.
- Valor almacenado: arreglo de `{ productId, quantity }`, con `quantity`
  entero ≥ 1; una línea que llega a 0 se elimina.
- Agregar un producto que ya está en el carrito incrementa su `quantity`.
- El cliente valida stock para dar aviso inmediato, pero **la validación que
  cuenta es la del servidor**: manipular el `localStorage` no sirve de nada.
- El contador del header se actualiza en cada cambio, incluso desde otra
  pestaña (evento `storage`).

## Seguridad

- **Cabeceras propias**, sin helmet: `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, una CSP estricta
  (`default-src 'self'`, sin `unsafe-inline`) y sin `X-Powered-By`.
- **Sesión** en cookie `httpOnly` + `SameSite=Strict`, con `Secure` cuando
  `NODE_ENV=production`. El JWT dura 2 h y se reemite en cada petición
  autenticada, así que el plazo se mide desde la última actividad.
- **Rate limiting persistente** en el login: 5 intentos por IP cada 15
  minutos, contados con una RPC atómica en Postgres. Vive en la base y no en
  memoria porque en serverless cada invocación puede ser un proceso nuevo.
- **Errores 500**: al cliente le llega siempre un mensaje genérico con un
  identificador; el stack y el error de Postgres solo van al log del servidor.
- **Saneamiento** de entradas: se eliminan bytes nulos y caracteres de control
  antes de insertar.
- **`trust proxy`** se activa solo con `TRUST_PROXY=1`, para que nadie pueda
  falsear su IP con `X-Forwarded-For` en local y saltarse el rate limiting.

## Qué falta (Fase 3)

- Despliegue a Vercel
