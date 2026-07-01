-- Fase 1.4: portal público de seguimiento de pedidos
-- Token unívoco por pedido + RPC de solo lectura accesible por anon.

-- 1) Token de seguimiento (sin dependencia de pgcrypto: usa gen_random_uuid del core)
alter table public.pedidos add column if not exists codigo_seguimiento text;
update public.pedidos
   set codigo_seguimiento = replace(gen_random_uuid()::text, '-', '')
 where codigo_seguimiento is null;
alter table public.pedidos
  alter column codigo_seguimiento set default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists ux_pedidos_codigo_seguimiento
  on public.pedidos(codigo_seguimiento);
alter table public.pedidos alter column codigo_seguimiento set not null;

-- 2) Exponer el token en la vista de detalle (preserva security_invoker)
create or replace view public.v_pedidos_detalle
with (security_invoker = true) as
 SELECT p.id, p.numero_pedido, p.estado, p.prioridad, p.fecha_programada,
    p.recogido_en, p.fecha_entrega_real, p.bultos, p.peso_kg, p.descripcion_carga,
    p.direccion_entrega, p.distrito_entrega, p.referencia_entrega,
    p.motivo_no_entrega, p.detalle_no_entrega, p.intento_numero, p.requiere_foto,
    p.foto_recogido_url, p.foto_entregado_url, p.foto_no_entregado_url, p.observaciones,
    c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.email AS cliente_email,
    r.nombre AS ruta_nombre, r.fecha AS ruta_fecha,
    rep.nombre AS repartidor_nombre, rep.telefono AS repartidor_telefono, rep.vehiculo AS repartidor_vehiculo,
    ( SELECT count(*) FROM evidencias e WHERE e.pedido_id = p.id) AS total_evidencias,
    ( SELECT count(*) FROM evidencias e WHERE e.pedido_id = p.id AND e.tipo::text = 'entregado'::text) AS fotos_entrega,
    p.creado_en, p.actualizado_en, p.subestado, p.codigo_seguimiento
   FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN rutas r ON r.id = p.ruta_id
     LEFT JOIN repartidores rep ON rep.id = r.repartidor_id;

-- 3) RPC público de solo lectura (devuelve solo campos seguros para el destinatario)
create or replace function public.seguimiento_pedido(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select case when p.id is null then null else jsonb_build_object(
    'numero_pedido',      p.numero_pedido,
    'estado',             p.estado,
    'subestado',          p.subestado,
    'distrito',           p.distrito_entrega,
    'direccion',          p.direccion_entrega,
    'referencia',         p.referencia_entrega,
    'fecha_programada',   p.fecha_programada,
    'fecha_entrega_real', p.fecha_entrega_real,
    'recogido_en',        p.recogido_en,
    'bultos',             p.bultos,
    'cliente',            c.nombre,
    'repartidor',         split_part(coalesce(rep.nombre, ''), ' ', 1),
    'empresa',            (select valor from public.configuracion where clave = 'empresa_nombre'),
    'empresa_telefono',   (select valor from public.configuracion where clave = 'empresa_telefono'),
    'eventos', coalesce((
        select jsonb_agg(jsonb_build_object('estado', h.estado_nuevo, 'en', h.cambiado_en) order by h.cambiado_en)
          from public.historial_estados h
         where h.pedido_id = p.id
      ), '[]'::jsonb)
  ) end
  from public.pedidos p
  left join public.clientes c     on c.id  = p.cliente_id
  left join public.rutas r        on r.id  = p.ruta_id
  left join public.repartidores rep on rep.id = r.repartidor_id
  where p.codigo_seguimiento = p_token
$function$;

revoke all on function public.seguimiento_pedido(text) from public;
grant execute on function public.seguimiento_pedido(text) to anon, authenticated;
