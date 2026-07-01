-- Fase 3.2: vista de alertas operativas.
-- "Fuera de ventana" solo aplica a pedidos con CITA comprometida (ventana_fin no nula),
-- para no marcar como alerta todo pedido histórico con fecha pasada.
create or replace view public.v_alertas
with (security_invoker = true) as
  with maxint as (
    select coalesce((select valor::int from public.configuracion where clave = 'max_intentos_entrega'), 3) as v
  ),
  hoy as (select (now() at time zone 'America/Lima')::date as d, (now() at time zone 'America/Lima')::time as t)
  select
    p.id, p.numero_pedido, p.estado, p.subestado, p.fecha_programada,
    p.intento_numero, p.bultos, p.bultos_entregados, p.ventana_inicio, p.ventana_fin,
    c.nombre  as cliente_nombre,
    r.nombre  as ruta_nombre,
    rep.nombre as repartidor_nombre,
    (p.estado = 'no_entregado') as alerta_no_entregado,
    (p.bultos_entregados is not null and p.bultos_entregados < p.bultos) as alerta_parcial,
    (p.intento_numero > (select v from maxint)) as alerta_reintentos,
    (
      p.estado in ('recibido','verificado','en_preparacion','listo_despacho','recogido','en_camino')
      and p.ventana_fin is not null
      and (
        p.fecha_programada < (select d from hoy)
        or (p.fecha_programada = (select d from hoy) and p.ventana_fin < (select t from hoy))
      )
    ) as alerta_fuera_ventana
  from public.pedidos p
  left join public.clientes c      on c.id = p.cliente_id
  left join public.rutas r         on r.id = p.ruta_id
  left join public.repartidores rep on rep.id = r.repartidor_id
  where
    p.estado = 'no_entregado'
    or (p.bultos_entregados is not null and p.bultos_entregados < p.bultos)
    or p.intento_numero > (select v from maxint)
    or (
      p.estado in ('recibido','verificado','en_preparacion','listo_despacho','recogido','en_camino')
      and p.ventana_fin is not null
      and (
        p.fecha_programada < (select d from hoy)
        or (p.fecha_programada = (select d from hoy) and p.ventana_fin < (select t from hoy))
      )
    );
