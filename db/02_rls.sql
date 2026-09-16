-- ============================================================================
-- Café Altiplano — Row Level Security (Fase 2)
--
-- El backend usa la service role key, que bypassea RLS siempre. Esto no es
-- el control de acceso principal: es defensa en profundidad para que, si
-- alguna vez se expone la anon key, lo único accesible sea el catálogo.
-- ============================================================================

alter table public.cafe_products       enable row level security;
alter table public.cafe_orders         enable row level security;
alter table public.cafe_order_items    enable row level security;
alter table public.cafe_login_attempts enable row level security;

-- Única política pública: leer el catálogo.
drop policy if exists "catalogo publico" on public.cafe_products;
create policy "catalogo publico"
  on public.cafe_products
  for select
  to anon
  using (true);

-- cafe_orders, cafe_order_items y cafe_login_attempts quedan sin ninguna
-- política: con RLS habilitada eso significa negar todo para anon y
-- authenticated. Solo la service role entra.
