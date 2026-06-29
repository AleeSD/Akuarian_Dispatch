# Akuarian Dispatch — Sistema de Gestión de Despachos

## Descripción del Proyecto
Sistema web para gestión de despachos de Akuarian SAC. Permite a operadores gestionar pedidos, rutas y repartidores, y a los repartidores registrar entregas desde el móvil con fotos de evidencia.

## Stack Tecnológico
- **Frontend**: React 18 + Vite + TypeScript
- **Estilos**: Tailwind CSS con paleta personalizada (celeste, menta, lavanda, coral)
- **Routing**: React Router v6
- **Base de datos**: Supabase (PostgreSQL) — proyecto: `ajbkzbtmknlmuucotdol`
- **Auth**: Supabase Auth
- **Storage de evidencias**: Cloudflare R2 (URL prefirmada vía Edge Function `r2-sign-upload`) + compresión en cliente; fallback a Supabase Storage bucket `evidencias`
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
│   ├── ui/              # Button, Input/Select/Textarea, Badge, Card, Modal, Skeleton,
│   │                   #   Table, FilterBar, KpiStrip, EmptyState  (rediseño)
│   ├── layout/          # Sidebar (colapsable), Header (top bar + móvil), Layout
│   └── shared/          # EstadoBadge, SubestadoBadge, RepartidorAvatar, EventTimeline (Timeline.tsx),
│                        #   ClienteFormModal, RutaEditModal
├── pages/
│   ├── Login, Dashboard (Actividad), Pedidos, PedidoDetalle, PedidoNuevo
│   ├── Rutas, RutaDetalle, Repartidores, Clientes, Reportes, Configuracion, Importar
│   └── repartidor/      # MiRuta, PedidoAccion (vista móvil)
├── hooks/               # usePedidos, useRutas, useRepartidor
├── lib/                 # supabase, utils, subestados, csv, xlsx (lazy), imagen, r2
├── types/               # index.ts (todas las interfaces TypeScript)
└── context/             # AuthContext.tsx
supabase/functions/      # r2-sign-upload (Edge Function: firma subidas a Cloudflare R2)
```

> **Nota (rediseño jun-2026):** UX "estilo Beetrack" con vistas de tabla densas, subestados,
> import CSV/`.xlsx`, export `.xlsx` multi-hoja, RLS de mínimo privilegio y evidencias en R2.
> **Mapas eliminados** por decisión de producto. Ver `docs/ESTADO-DEL-PROYECTO.md`.
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
3. Para fotos: usar `subirEvidencia()` (`src/lib/r2.ts`) → comprime en cliente (`lib/imagen.ts`) → sube a **Cloudflare R2** vía Edge Function `r2-sign-upload` (URL prefirmada); fallback automático a Supabase Storage si R2 no está configurado. Path: `{pedido_id}/{tipo}/{timestamp}.jpg`. Setup R2: `docs/FASE9-R2-SETUP.md`
4. Insertar en tabla `evidencias` y actualizar `foto_{tipo}_url` en pedidos

## Comandos
```bash
npm run dev      # Desarrollo
npm run build    # Producción
npm run preview  # Preview del build
```
