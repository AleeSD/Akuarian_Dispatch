# Akuarian Dispatch — Sistema de Gestión de Despachos

## Descripción del Proyecto
Sistema web para gestión de despachos de Akuarian SAC. Permite a operadores gestionar pedidos, rutas y repartidores, y a los repartidores registrar entregas desde el móvil con fotos de evidencia.

## Stack Tecnológico
- **Frontend**: React 18 + Vite + TypeScript
- **Estilos**: Tailwind CSS con paleta personalizada (celeste, menta, lavanda, coral)
- **Routing**: React Router v6
- **Base de datos**: Supabase (PostgreSQL) — proyecto: `ajbkzbtmknlmuucotdol`
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage bucket `evidencias`
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts
- **Fechas**: date-fns (formato peruano dd/MM/yyyy)
- **Notificaciones**: React Hot Toast

## Supabase
- **URL**: `https://ajbkzbtmknlmuucotdol.supabase.co`
- **Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` en `.env`

## Tablas principales
- `pedidos` — tabla central con enum `estado_pedido` (9 estados)
- `clientes`, `repartidores`, `rutas`
- `historial_estados` — trigger automático al cambiar estado
- `evidencias` — fotos subidas a Storage
- `notificaciones`, `configuracion`, `usuarios`

## Vistas
- `v_pedidos_detalle` — pedidos con info de cliente, repartidor, ruta y conteo de evidencias
- `v_repartidor_mis_pedidos` — filtra por `auth.uid()` vía RLS (solo pedidos del repartidor logueado)
- `v_resumen_dia` — métricas del día actual

## Enums
- `estado_pedido`: recibido → verificado → en_preparacion → listo_despacho → recogido → en_camino → entregado | no_entregado | reprogramado
- `estado_repartidor`: disponible, en_ruta, descanso, inactivo
- `estado_ruta`: pendiente, en_curso, completada, cancelada
- `motivo_no_entrega`: cliente_ausente, direccion_incorrecta, rechazo_cliente, producto_danado, zona_inaccesible, otro
- `rol_usuario`: admin, operador, supervisor, repartidor

## Estructura de carpetas
```
src/
├── components/
│   ├── ui/              # Button, Input, Select, Textarea, Badge, Card, Modal, Skeleton
│   ├── layout/          # Sidebar, Header, Layout
│   └── shared/          # EstadoBadge, RepartidorAvatar, Timeline
├── pages/
│   ├── Login, Dashboard, Pedidos, PedidoDetalle, PedidoNuevo
│   ├── Rutas, RutaDetalle, Repartidores, Clientes, Reportes
│   └── repartidor/      # MiRuta, PedidoAccion (vista móvil)
├── hooks/               # usePedidos, useRutas, useRepartidor
├── lib/                 # supabase.ts, utils.ts
├── types/               # index.ts (todas las interfaces TypeScript)
└── context/             # AuthContext.tsx
```

## Roles y Acceso
- **admin/operador/supervisor**: acceso completo — `/dashboard`, `/pedidos`, `/rutas`, `/repartidores`, `/clientes`, `/reportes`
- **repartidor**: solo vista móvil — `/mi-ruta`, `/mi-ruta/:id/accion`

## Colores personalizados
```js
celeste: { 50, 100, 300, 500, 700, 900 }  // Primario azul
menta:   { 50, 100, 500, 700 }             // Éxito verde
lavanda: { 50, 100, 500, 700 }             // Secundario morado
coral:   { 50, 100, 500, 700 }             // Error/alerta rojo
```

## Flujo de Cambio de Estado
1. Cambiar `estado` en tabla `pedidos`
2. El trigger `fn_registrar_cambio_estado()` registra automáticamente en `historial_estados`
3. Para fotos: subir a `supabase.storage.from('evidencias')` → path: `{pedido_id}/{tipo}/{timestamp}.ext`
4. Insertar en tabla `evidencias` y actualizar `foto_{tipo}_url` en pedidos

## Comandos
```bash
npm run dev      # Desarrollo
npm run build    # Producción
npm run preview  # Preview del build
```
