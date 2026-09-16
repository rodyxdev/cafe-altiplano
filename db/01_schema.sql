-- ============================================================================
-- Café Altiplano — esquema (Fase 2)
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede volver a
-- correr sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Productos
-- Mismo esquema que data/products.json en la Fase 1. `origin` es nullable
-- porque significa estrictamente la región de cultivo del café: los
-- accesorios lo llevan en NULL.
-- ---------------------------------------------------------------------------
create table if not exists public.cafe_products (
  id          text primary key,
  name        text            not null,
  description text            not null default '',
  price       numeric(10,2)   not null check (price >= 0),
  origin      text            null,
  category    text            not null check (category in ('cafe', 'accesorios')),
  stock       integer         not null default 0 check (stock >= 0),
  image       text            not null default ''
);

-- ---------------------------------------------------------------------------
-- Pedidos
-- `payment_status` siempre dice 'simulado': el checkout es una demostración
-- y los datos no deben afirmar que hubo un cobro real.
-- ---------------------------------------------------------------------------
create table if not exists public.cafe_orders (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz   not null default now(),
  customer_name    text          not null,
  customer_email   text          not null,
  customer_phone   text          not null default '',
  shipping_address text          not null,
  status           text          not null default 'pendiente'
                     check (status in ('pendiente', 'preparando', 'enviado')),
  payment_status   text          not null default 'simulado'
                     check (payment_status in ('simulado')),
  total            numeric(10,2) not null check (total >= 0)
);

create index if not exists cafe_orders_created_at_idx on public.cafe_orders (created_at desc);
create index if not exists cafe_orders_status_idx     on public.cafe_orders (status);

-- ---------------------------------------------------------------------------
-- Renglones del pedido
-- `product_name` y `unit_price` son una FOTO del momento de la compra: si el
-- producto se edita después en el panel, los pedidos ya hechos no cambian.
-- Por eso product_id NO es una llave foránea: un producto borrado no debe
-- borrar ni alterar el historial de ventas.
-- ---------------------------------------------------------------------------
create table if not exists public.cafe_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid          not null references public.cafe_orders (id) on delete cascade,
  product_id  text          not null,
  product_name text         not null,
  unit_price  numeric(10,2) not null check (unit_price >= 0),
  quantity    integer       not null check (quantity > 0),
  subtotal    numeric(10,2) not null check (subtotal >= 0)
);

create index if not exists cafe_order_items_order_id_idx on public.cafe_order_items (order_id);

-- ---------------------------------------------------------------------------
-- Intentos de login del admin (rate limiting persistente)
-- Vive en la base y no en memoria porque en serverless cada invocación puede
-- ser un proceso distinto y un contador en RAM se pierde.
-- ---------------------------------------------------------------------------
create table if not exists public.cafe_login_attempts (
  clave           text primary key,
  intentos        integer     not null default 0,
  ventana_inicio  timestamptz not null default now(),
  bloqueado_hasta timestamptz null
);
