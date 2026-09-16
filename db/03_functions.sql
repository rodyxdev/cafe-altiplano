-- ============================================================================
-- Café Altiplano — funciones (Fase 2)
--
-- Todo lo que tiene que ser atómico vive aquí: una función de plpgsql corre
-- dentro de una sola transacción, así que o se aplica completa o no se
-- aplica nada. Eso nos da la transacción del checkout y el contador de
-- intentos de login sin depender de estado en memoria del servidor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- cafe_crear_pedido
--
-- Recibe los renglones del carrito y los datos del cliente. El precio y el
-- stock SIEMPRE se leen de la base: lo que mande el navegador solo sirve para
-- saber qué producto y cuántas piezas quiere.
--
-- Bloquea las filas de los productos involucrados con SELECT ... FOR UPDATE,
-- en orden por id para no provocar interbloqueos entre dos compras
-- simultáneas. Mientras el bloqueo está tomado, nadie más puede decrementar
-- el mismo stock, así que dos personas comprando la última pieza al mismo
-- tiempo se resuelven en serie y la segunda recibe "sin stock".
--
-- Devuelve jsonb:
--   { ok: true,  order_id, total, created_at }
--   { ok: false, motivo: 'carrito_vacio' }
--   { ok: false, motivo: 'stock_insuficiente', faltantes: [...] }
-- ---------------------------------------------------------------------------
create or replace function public.cafe_crear_pedido(p_items jsonb, p_cliente jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_norm      jsonb;
  v_faltantes jsonb := '[]'::jsonb;
  v_lineas    jsonb := '[]'::jsonb;
  v_total     numeric(10,2) := 0;
  v_order_id  uuid;
  v_created   timestamptz;
  v_p         public.cafe_products%rowtype;
  r           record;
  v_sub       numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'carrito_vacio');
  end if;

  -- Normaliza: agrupa ids repetidos y descarta cantidades no positivas.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', qty) order by pid), '[]'::jsonb)
    into v_norm
  from (
    select btrim(e->>'productId') as pid,
           sum(greatest(coalesce((e->>'quantity')::int, 0), 0)) as qty
    from jsonb_array_elements(p_items) e
    group by 1
  ) t
  where t.pid <> '' and t.qty > 0;

  if jsonb_array_length(v_norm) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'carrito_vacio');
  end if;

  -- Bloqueo en orden determinista.
  perform p.id
  from public.cafe_products p
  where p.id in (select x->>'product_id' from jsonb_array_elements(v_norm) x)
  order by p.id
  for update;

  -- Validación completa antes de tocar nada.
  for r in
    select x->>'product_id' as pid, (x->>'quantity')::int as qty
    from jsonb_array_elements(v_norm) x
    order by 1
  loop
    select * into v_p from public.cafe_products where id = r.pid;

    if not found then
      v_faltantes := v_faltantes || jsonb_build_object(
        'product_id', r.pid, 'motivo', 'no_existe',
        'solicitado', r.qty, 'disponible', 0);
    elsif v_p.stock < r.qty then
      v_faltantes := v_faltantes || jsonb_build_object(
        'product_id', r.pid, 'product_name', v_p.name, 'motivo', 'stock_insuficiente',
        'solicitado', r.qty, 'disponible', v_p.stock);
    else
      v_sub := round(v_p.price * r.qty, 2);
      v_total := v_total + v_sub;
      v_lineas := v_lineas || jsonb_build_object(
        'product_id', v_p.id, 'product_name', v_p.name,
        'unit_price', v_p.price, 'quantity', r.qty, 'subtotal', v_sub);
    end if;
  end loop;

  if jsonb_array_length(v_faltantes) > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'stock_insuficiente', 'faltantes', v_faltantes);
  end if;

  -- A partir de aquí ya no puede fallar por stock: seguimos con el bloqueo.
  insert into public.cafe_orders (
    customer_name, customer_email, customer_phone, shipping_address, total
  ) values (
    btrim(coalesce(p_cliente->>'name', '')),
    btrim(coalesce(p_cliente->>'email', '')),
    btrim(coalesce(p_cliente->>'phone', '')),
    btrim(coalesce(p_cliente->>'address', '')),
    v_total
  )
  returning id, created_at into v_order_id, v_created;

  for r in
    select x->>'product_id' as pid, x->>'product_name' as pname,
           (x->>'unit_price')::numeric as precio, (x->>'quantity')::int as qty,
           (x->>'subtotal')::numeric as sub
    from jsonb_array_elements(v_lineas) x
  loop
    insert into public.cafe_order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal
    ) values (v_order_id, r.pid, r.pname, r.precio, r.qty, r.sub);

    update public.cafe_products
       set stock = stock - r.qty
     where id = r.pid and stock >= r.qty;

    if not found then
      -- No debería ocurrir con el bloqueo tomado; si ocurre, se cancela todo.
      raise exception 'stock cambió durante el pedido para el producto %', r.pid;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id, 'total', v_total, 'created_at', v_created);
end;
$$;

-- ---------------------------------------------------------------------------
-- cafe_login_intento
--
-- Incremento atómico del contador de intentos de login. El INSERT ... ON
-- CONFLICT DO UPDATE es una sola operación, así que dos peticiones
-- simultáneas no se pisan el contador.
--
-- Devuelve jsonb: { permitido, intentos, restantes, bloqueado_hasta }
-- ---------------------------------------------------------------------------
create or replace function public.cafe_login_intento(
  p_clave    text,
  p_max      integer  default 5,
  p_ventana  interval default '15 minutes',
  p_bloqueo  interval default '15 minutes'
)
returns jsonb
language plpgsql
as $$
declare
  v_fila public.cafe_login_attempts%rowtype;
begin
  insert into public.cafe_login_attempts as a (clave, intentos, ventana_inicio)
  values (p_clave, 1, now())
  on conflict (clave) do update
    set
      -- La ventana se reinicia si ya venció y no hay bloqueo activo.
      ventana_inicio = case
        when a.bloqueado_hasta is not null and a.bloqueado_hasta > now() then a.ventana_inicio
        when now() - a.ventana_inicio > p_ventana then now()
        else a.ventana_inicio
      end,
      intentos = case
        when a.bloqueado_hasta is not null and a.bloqueado_hasta > now() then a.intentos
        when now() - a.ventana_inicio > p_ventana then 1
        else a.intentos + 1
      end,
      bloqueado_hasta = case
        when a.bloqueado_hasta is not null and a.bloqueado_hasta > now() then a.bloqueado_hasta
        when now() - a.ventana_inicio <= p_ventana and a.intentos + 1 >= p_max then now() + p_bloqueo
        else null
      end
  returning a.* into v_fila;

  return jsonb_build_object(
    'permitido', (v_fila.bloqueado_hasta is null or v_fila.bloqueado_hasta <= now()),
    'intentos', v_fila.intentos,
    'restantes', greatest(p_max - v_fila.intentos, 0),
    'bloqueado_hasta', v_fila.bloqueado_hasta
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cafe_login_exito — limpia el contador tras una autenticación correcta.
-- ---------------------------------------------------------------------------
create or replace function public.cafe_login_exito(p_clave text)
returns void
language sql
as $$
  delete from public.cafe_login_attempts where clave = p_clave;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: estas funciones solo las llama el backend con la service role.
-- Por defecto Postgres da EXECUTE a public, así que se revoca explícitamente
-- para que no queden expuestas como RPC de PostgREST para anon.
-- ---------------------------------------------------------------------------
revoke all on function public.cafe_crear_pedido(jsonb, jsonb)                from public, anon, authenticated;
revoke all on function public.cafe_login_intento(text, integer, interval, interval) from public, anon, authenticated;
revoke all on function public.cafe_login_exito(text)                         from public, anon, authenticated;

grant execute on function public.cafe_crear_pedido(jsonb, jsonb)                to service_role;
grant execute on function public.cafe_login_intento(text, integer, interval, interval) to service_role;
grant execute on function public.cafe_login_exito(text)                         to service_role;
