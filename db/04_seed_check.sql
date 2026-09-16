-- ============================================================================
-- Comprobaciones rápidas después de sembrar los datos.
-- ============================================================================
select count(*) as productos, count(origin) as con_origen from public.cafe_products;
select category, count(*) from public.cafe_products group by category order by category;
select id, name, origin, price, stock from public.cafe_products order by category, id;
