-- Fase 0.3: sellar automáticamente los tiempos de gestión en cualquier transición
-- (back-office, app móvil o carga directa). Habilita el timeline "Actividad del día"
-- y las métricas de tiempo de Reportes para todo origen de datos.

create or replace function public.fn_sellar_tiempos_pedido()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.estado = 'recogido' and new.recogido_en is null then
    new.recogido_en := now();
  end if;
  if new.estado = 'entregado' and new.fecha_entrega_real is null then
    new.fecha_entrega_real := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_pedidos_sellar_tiempos on public.pedidos;
create trigger trg_pedidos_sellar_tiempos
  before insert or update on public.pedidos
  for each row execute function public.fn_sellar_tiempos_pedido();

-- Backfill de filas existentes sin timestamp (usa actualizado_en como mejor aproximación)
update public.pedidos
   set recogido_en = coalesce(recogido_en, actualizado_en)
 where estado in ('recogido','en_camino','entregado','no_entregado')
   and recogido_en is null;

update public.pedidos
   set fecha_entrega_real = coalesce(fecha_entrega_real, actualizado_en)
 where estado = 'entregado'
   and fecha_entrega_real is null;
