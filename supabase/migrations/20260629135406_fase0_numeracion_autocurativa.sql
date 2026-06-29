-- Fase 0.1 + 0.6: numeración de pedidos robusta y configurable
-- - Lee el prefijo desde configuracion.pedido_prefijo (fallback 'AKU')
-- - Auto-cura la secuencia si quedó por detrás de los números existentes del año
--   (evita el error de clave duplicada detectado en el reporte pre-deploy)

create or replace function public.fn_generar_numero_pedido()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_prefix text;
  v_year   text := to_char(now(), 'YYYY');
  v_next   bigint;
  v_max    bigint;
begin
  if new.numero_pedido is null or new.numero_pedido = '' then
    select coalesce(nullif(trim(valor), ''), 'AKU')
      into v_prefix
      from public.configuracion
     where clave = 'pedido_prefijo';
    if v_prefix is null then
      v_prefix := 'AKU';
    end if;

    v_next := nextval('public.seq_pedido_numero');

    -- Auto-curación: si la secuencia quedó por detrás del mayor correlativo del año, salta el hueco
    select coalesce(max(substring(numero_pedido from '^' || v_prefix || '-\d{4}-(\d+)$')::bigint), 0)
      into v_max
      from public.pedidos
     where numero_pedido like v_prefix || '-' || v_year || '-%';

    if v_max >= v_next then
      v_next := v_max + 1;
      perform setval('public.seq_pedido_numero', v_next);
    end if;

    new.numero_pedido := v_prefix || '-' || v_year || '-' || lpad(v_next::text, 5, '0');
  end if;
  return new;
end;
$function$;

-- Resincronización idempotente de la secuencia con los datos existentes
select setval('public.seq_pedido_numero',
  greatest(
    (select coalesce(max(substring(numero_pedido from '^AKU-\d{4}-(\d+)$')::bigint), 0)
       from public.pedidos where numero_pedido like 'AKU-%'),
    1
  ), true);
