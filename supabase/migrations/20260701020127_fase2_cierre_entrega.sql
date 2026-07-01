-- Fase 2.4: entrega parcial + exponer datos de cierre de entrega en la vista.

alter table public.pedidos add column if not exists bultos_entregados integer;

comment on column public.pedidos.bultos_entregados is
  'Bultos efectivamente entregados. NULL = no registrado; < bultos = entrega parcial.';

-- Añadir columnas nuevas AL FINAL de la vista (create or replace no permite insertarlas en medio)
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
    p.bultos_entregados, p.firma_url, p.nombre_receptor, p.dni_receptor
   FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN rutas r ON r.id = p.ruta_id
     LEFT JOIN repartidores rep ON rep.id = r.repartidor_id;

-- Parámetro para exigir firma digital en la entrega (consumido por la app móvil)
insert into public.configuracion (clave, valor, descripcion)
values ('requiere_firma_entrega', 'false', 'Exigir firma digital del receptor al confirmar la entrega')
on conflict (clave) do nothing;
