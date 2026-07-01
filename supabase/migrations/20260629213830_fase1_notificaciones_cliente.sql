-- Fase 1.1 / 1.3: notificaciones al cliente (email) con auto-encolado por cambio de estado.

-- 1) Extender la tabla para mensajería al cliente (mantiene compat con avisos internos)
alter table public.notificaciones
  add column if not exists canal        text not null default 'interno',
  add column if not exists destino      text,
  add column if not exists asunto       text,
  add column if not exists estado_envio text not null default 'pendiente',
  add column if not exists enviado_en   timestamptz,
  add column if not exists error        text;

-- 2) Trigger: encola una notificación al cliente cuando el pedido cambia a un estado relevante.
--    Gobernado por configuracion.notificaciones_email_activas. Solo si el cliente tiene email.
create or replace function public.fn_encolar_notificacion_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_activas boolean;
  v_email   text;
  v_empresa text;
  v_asunto  text;
  v_msg     text;
  v_tipo    text;
begin
  if tg_op = 'UPDATE'
     and new.estado is distinct from old.estado
     and new.estado in ('en_camino','entregado','no_entregado','reprogramado') then

    select (valor = 'true') into v_activas
      from public.configuracion where clave = 'notificaciones_email_activas';
    if coalesce(v_activas, false) = false then
      return new;
    end if;

    select c.email into v_email from public.clientes c where c.id = new.cliente_id;
    if v_email is null or btrim(v_email) = '' then
      return new;
    end if;

    select valor into v_empresa from public.configuracion where clave = 'empresa_nombre';

    -- 'en_camino' actúa como notificación pre-entrega (Fase 1.3)
    v_tipo := case when new.estado = 'en_camino' then 'pre_entrega' else 'estado_' || new.estado end;
    v_asunto := coalesce(v_empresa, 'Despacho') || ' — Pedido ' || new.numero_pedido;
    v_msg := case new.estado
      when 'en_camino'    then 'Tu pedido ' || new.numero_pedido || ' está en camino. Puedes seguirlo en línea.'
      when 'entregado'    then 'Tu pedido ' || new.numero_pedido || ' fue entregado. ¡Gracias por tu compra!'
      when 'no_entregado' then 'No pudimos entregar tu pedido ' || new.numero_pedido || '. Nos pondremos en contacto para coordinar.'
      when 'reprogramado' then 'Tu pedido ' || new.numero_pedido || ' fue reprogramado para una nueva fecha.'
      else 'Actualización de tu pedido ' || new.numero_pedido
    end;

    insert into public.notificaciones (pedido_id, tipo, canal, destino, asunto, mensaje, estado_envio)
    values (new.id, v_tipo, 'email', v_email, v_asunto, v_msg, 'pendiente');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_pedidos_notif_cliente on public.pedidos;
create trigger trg_pedidos_notif_cliente
  after update on public.pedidos
  for each row execute function public.fn_encolar_notificacion_cliente();

-- 3) RLS: staff lee notificaciones; operador/admin pueden crearlas manualmente (botón "Enviar notificación")
drop policy if exists "notificaciones: staff lee" on public.notificaciones;
create policy "notificaciones: staff lee" on public.notificaciones
  for select to authenticated using (public.es_staff());
drop policy if exists "notificaciones: operador_admin inserta" on public.notificaciones;
create policy "notificaciones: operador_admin inserta" on public.notificaciones
  for insert to authenticated with check (public.es_operador_o_admin());
drop policy if exists "notificaciones: operador_admin actualiza" on public.notificaciones;
create policy "notificaciones: operador_admin actualiza" on public.notificaciones
  for update to authenticated using (public.es_operador_o_admin()) with check (public.es_operador_o_admin());
