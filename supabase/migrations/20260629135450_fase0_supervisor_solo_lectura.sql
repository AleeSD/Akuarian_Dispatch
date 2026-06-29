-- Fase 0.4: rol supervisor = solo lectura.
-- es_staff() (admin/operador/supervisor) sigue habilitando SELECT.
-- La escritura (INSERT/UPDATE/DELETE) pasa a requerir es_operador_o_admin().

create or replace function public.es_operador_o_admin()
returns boolean
language sql
stable security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and activo = true
      and rol in ('admin','operador')
  )
$function$;

-- ===== pedidos =====
drop policy if exists "pedidos: staff todo" on public.pedidos;
create policy "pedidos: staff lee" on public.pedidos
  for select to authenticated using (public.es_staff());
create policy "pedidos: operador_admin inserta" on public.pedidos
  for insert to authenticated with check (public.es_operador_o_admin());
create policy "pedidos: operador_admin actualiza" on public.pedidos
  for update to authenticated using (public.es_operador_o_admin()) with check (public.es_operador_o_admin());
create policy "pedidos: operador_admin elimina" on public.pedidos
  for delete to authenticated using (public.es_operador_o_admin());

-- ===== rutas =====
drop policy if exists "rutas: staff todo" on public.rutas;
create policy "rutas: staff lee" on public.rutas
  for select to authenticated using (public.es_staff());
create policy "rutas: operador_admin inserta" on public.rutas
  for insert to authenticated with check (public.es_operador_o_admin());
create policy "rutas: operador_admin actualiza" on public.rutas
  for update to authenticated using (public.es_operador_o_admin()) with check (public.es_operador_o_admin());
create policy "rutas: operador_admin elimina" on public.rutas
  for delete to authenticated using (public.es_operador_o_admin());

-- ===== clientes =====
drop policy if exists "clientes: staff todo" on public.clientes;
create policy "clientes: staff lee" on public.clientes
  for select to authenticated using (public.es_staff());
create policy "clientes: operador_admin inserta" on public.clientes
  for insert to authenticated with check (public.es_operador_o_admin());
create policy "clientes: operador_admin actualiza" on public.clientes
  for update to authenticated using (public.es_operador_o_admin()) with check (public.es_operador_o_admin());
create policy "clientes: operador_admin elimina" on public.clientes
  for delete to authenticated using (public.es_operador_o_admin());

-- ===== repartidores =====
drop policy if exists "repartidores: staff todo" on public.repartidores;
create policy "repartidores: staff lee" on public.repartidores
  for select to authenticated using (public.es_staff());
create policy "repartidores: operador_admin inserta" on public.repartidores
  for insert to authenticated with check (public.es_operador_o_admin());
create policy "repartidores: operador_admin actualiza" on public.repartidores
  for update to authenticated using (public.es_operador_o_admin()) with check (public.es_operador_o_admin());
create policy "repartidores: operador_admin elimina" on public.repartidores
  for delete to authenticated using (public.es_operador_o_admin());

-- ===== evidencias =====
drop policy if exists "evidencias: staff todo" on public.evidencias;
create policy "evidencias: staff lee" on public.evidencias
  for select to authenticated using (public.es_staff());
create policy "evidencias: operador_admin inserta" on public.evidencias
  for insert to authenticated with check (public.es_operador_o_admin());
create policy "evidencias: operador_admin actualiza" on public.evidencias
  for update to authenticated using (public.es_operador_o_admin()) with check (public.es_operador_o_admin());
create policy "evidencias: operador_admin elimina" on public.evidencias
  for delete to authenticated using (public.es_operador_o_admin());
