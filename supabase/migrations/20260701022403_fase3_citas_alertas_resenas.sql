-- Fase 3: ventana de entrega (CITA), reseñas/NPS y alertas operativas.

-- ========== 3.1 CITA / ventana horaria ==========
alter table public.pedidos add column if not exists ventana_inicio time;
alter table public.pedidos add column if not exists ventana_fin    time;

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
    p.creado_en, p.actualizado_en, p.subestado, p.codigo_seguimiento,
    p.bultos_entregados, p.firma_url, p.nombre_receptor, p.dni_receptor,
    p.ventana_inicio, p.ventana_fin
   FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN rutas r ON r.id = p.ruta_id
     LEFT JOIN repartidores rep ON rep.id = r.repartidor_id;

-- ========== 3.4 Reseñas / NPS ==========
create table if not exists public.resenas (
  id           uuid primary key default uuid_generate_v4(),
  pedido_id    uuid not null unique references public.pedidos(id) on delete cascade,
  cliente_id   uuid references public.clientes(id) on delete set null,
  calificacion smallint not null check (calificacion between 1 and 5),
  comentario   text,
  creado_en    timestamptz not null default now()
);

alter table public.resenas enable row level security;
drop policy if exists "resenas: staff lee" on public.resenas;
create policy "resenas: staff lee" on public.resenas
  for select to authenticated using (public.es_staff());

create or replace function public.registrar_resena(p_token text, p_calificacion int, p_comentario text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_cliente uuid;
  v_estado public.estado_pedido;
begin
  if p_calificacion < 1 or p_calificacion > 5 then
    return false;
  end if;
  select id, cliente_id, estado into v_id, v_cliente, v_estado
    from public.pedidos where codigo_seguimiento = p_token;
  if v_id is null or v_estado <> 'entregado' then
    return false;
  end if;
  insert into public.resenas (pedido_id, cliente_id, calificacion, comentario)
  values (v_id, v_cliente, p_calificacion, nullif(btrim(p_comentario), ''))
  on conflict (pedido_id) do update
    set calificacion = excluded.calificacion, comentario = excluded.comentario, creado_en = now();
  return true;
end;
$function$;

revoke all on function public.registrar_resena(text, int, text) from public;
grant execute on function public.registrar_resena(text, int, text) to anon, authenticated;

-- seguimiento_pedido: añade ventana (CITA) y calificacion existente
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
    'ventana_inicio',     p.ventana_inicio,
    'ventana_fin',        p.ventana_fin,
    'cliente',            c.nombre,
    'repartidor',         split_part(coalesce(rep.nombre, ''), ' ', 1),
    'empresa',            (select valor from public.configuracion where clave = 'empresa_nombre'),
    'empresa_telefono',   (select valor from public.configuracion where clave = 'empresa_telefono'),
    'calificacion',       (select calificacion from public.resenas where pedido_id = p.id),
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

-- ========== 3.2 Alertas operativas (versión final en la migración de ajuste) ==========
-- Ver 20260701022447_fase3_alertas_ajuste_ventana.sql para la definición vigente de v_alertas.
