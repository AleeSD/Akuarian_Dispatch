# Akuarian Dispatch — Informe de Estado del Proyecto

> Documento maestro de referencia para guiar la implementación de nuevas funciones y el refresco de diseño.
> **Fecha de análisis inicial:** 26 de junio de 2026 · **Branch:** `master` · **Versión:** 1.0.0
> **Última actualización:** jun-2026 (Fases 0-9 + seguridad + `.xlsx` completas).

---

## 0. Changelog del rediseño (jun-2026)

Se ejecutó el rediseño completo "estilo Beetrack" (ver [PROMPT-IMPLEMENTACION-REDISENO.md](PROMPT-IMPLEMENTACION-REDISENO.md)). Resumen de lo entregado:

- **Fundaciones UX:** top bar persistente (`celeste-900`), sidebar colapsable, componentes `Table`/`FilterBar`/`KpiStrip`/`EmptyState`, tiempo relativo. Paleta pastel intacta.
- **Vistas de tabla densa** (toggle con tarjetas) en Pedidos, Rutas, Clientes.
- **Detalle de pedido** con `EventTimeline` + cards (Resumen/Categorías/Campos/Ítems).
- **Rutas** con detalle por tabs (Despachos/Cobros) y edición; **Inicio/Actividad** con KPIs, unidades y timeline horario; **Reportes** con tabs Envíos/Rutas.
- **Subestados** (columna BD + catálogo de 23 + UI + filtro + gráfico).
- **Importación masiva real** (CSV + `.xlsx`) y **exportación `.xlsx` multi-hoja** (lazy-load).
- **Mapas eliminados por completo** del back-office (decisión explícita; no se implementan).
- **Transversal de seguridad aplicado** (advisors resueltos + RLS de mínimo privilegio — §9).
- **Evidencias en Cloudflare R2** (Edge Function + compresión en cliente; falta cargar credenciales — [FASE9-R2-SETUP.md](FASE9-R2-SETUP.md)).
- **Tests** con Vitest (`npm test`).

> Las secciones siguientes (§1-§14) son el **análisis original del 26-jun** y se conservan como referencia histórica; donde un punto ya se resolvió, está anotado.

---

## 1. Resumen ejecutivo

**Akuarian Dispatch** es una aplicación web SPA para la gestión de despachos de **Akuarian SAC** (cliente final: operación logística de última milla, "TRANSPORTESLIO2" / SLI Logistics en Lima, Perú). El sistema cubre el ciclo completo de un pedido: recepción → preparación → asignación a ruta → recogida → entrega con evidencia fotográfica.

Hay **dos experiencias** en una misma app:
- **Back-office (escritorio):** operadores, supervisores y admin gestionan pedidos, rutas, repartidores, clientes, reportes y configuración.
- **App móvil del repartidor:** vista optimizada para celular donde el repartidor ve su ruta del día y registra recogidas/entregas/no-entregas con foto.

### Estado general

| Dimensión | Estado | Comentario |
|---|---|---|
| Funcionalidad core | 🟢 Operativa | Flujo completo de pedido funciona end-to-end |
| Base de datos | 🟢 Estable | 9 tablas, 3 vistas (`security_invoker`), triggers, **RLS de mínimo privilegio** + columna `subestado` |
| Diseño / UI | 🟢 Refrescado | Top bar + sidebar colapsable, **tablas densas**, KPIs, tiempo relativo — paleta pastel intacta |
| Datos en producción | 🟢 Con uso real | ~103 pedidos, 11 rutas, 6 usuarios, 3 repartidores, 4 clientes |
| Seguridad | 🟢 Endurecida | Advisors resueltos + RLS mínimo privilegio (§9). Pendiente: toggle Leaked Password en panel Auth |
| Tests automatizados | 🟢 Vitest | `npm test` (11 tests de utilidades); build sigue validando tipos |
| Mapas / geolocalización | ⛔ Descartado | Eliminados por completo por decisión de producto (no se implementarán) |
| Integraciones (import/export) | 🟢 Import CSV+`.xlsx` / Export `.xlsx` | WhatsApp/email siguen pendientes (sin lógica aún) |
| Evidencias en la nube | 🟢 R2 (código) | Edge Function + compresión listas; falta cargar credenciales R2 (FASE9-R2-SETUP) |

> **Contexto del refresco:** la carpeta `Beetrack/` contiene 24 capturas de **DispatchTrack | lastmile** (el SaaS que la operación usa hoy). Son la **referencia de UX y de alcance funcional** hacia donde apunta este proyecto. Ver §10.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | React | 18.3.1 |
| Build tool | Vite | 5.4.10 |
| Lenguaje | TypeScript | 5.6.3 (modo `strict`) |
| Estilos | Tailwind CSS | 3.4.15 |
| Routing | React Router DOM | 6.28.0 |
| Backend (BaaS) | Supabase JS | 2.45.4 |
| Formularios | React Hook Form + Zod | 7.53.2 / 3.23.8 |
| Gráficas | Recharts | 2.13.3 |
| Iconos | lucide-react | 0.460.0 |
| Fechas | date-fns | 3.6.0 (locale `es`) |
| Notificaciones | react-hot-toast | 2.4.1 |
| Hosting | Vercel | `vercel.json` configurado (SPA rewrites + cache headers) |

**Observaciones:**
- No hay librería de estado global (Redux/Zustand) — el estado vive en `useState` local + Context de Auth. Adecuado al tamaño actual.
- No hay React Query / SWR — el fetching es manual con `useEffect` + hooks propios (`usePedidos`, `useRutas`, `useRepartidor`). Esto provoca **N+1 queries** en varias páginas (ver §8).
- Sin librería de mapas (Leaflet/Mapbox/Google Maps). DispatchTrack usa Leaflet + HERE.
- `vite.config.ts` ya divide chunks manualmente (react, supabase, charts, forms).
- Vulnerabilidad conocida: `esbuild` (transitiva vía Vite) — solo afecta dev server, no producción.

---

## 3. Estructura del proyecto

```
SLDispatchTrack/
├── src/
│   ├── components/
│   │   ├── ui/              # Primitivos de diseño
│   │   │   ├── Button.tsx       # 5 variantes (primary/secondary/ghost/danger/success), 3 tamaños, loading
│   │   │   ├── Input.tsx        # Input + Select + Textarea con label/error/icon
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx         # Contenedor con hover/onClick opcional
│   │   │   ├── Modal.tsx        # Modal con backdrop, tamaños sm/md/lg
│   │   │   └── Skeleton.tsx     # Skeleton + SkeletonCard
│   │   ├── layout/
│   │   │   ├── Layout.tsx       # Shell: Sidebar + Header + <main>
│   │   │   ├── Sidebar.tsx      # Nav desktop (fija, 240px) — 6 items + Configuración (admin)
│   │   │   └── Header.tsx       # Top bar móvil + drawer hamburguesa
│   │   ├── shared/
│   │   │   ├── EstadoBadge.tsx      # Badge por estado de pedido (9 estilos)
│   │   │   ├── RepartidorAvatar.tsx # Avatar con iniciales, tamaños sm/md/lg
│   │   │   └── Timeline.tsx         # Línea de tiempo del historial de estados
│   │   └── ErrorBoundary.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx        # "Inicio" — métricas del día + recientes + rutas activas
│   │   ├── Pedidos.tsx          # Listado con filtros + drawer de detalle
│   │   ├── PedidoNuevo.tsx      # Wizard de 2 pasos (datos + asignación)
│   │   ├── PedidoDetalle.tsx    # Drawer lateral (NO es ruta propia; se usa embebido)
│   │   ├── Rutas.tsx            # Grid de tarjetas + modal "Nueva ruta"
│   │   ├── RutaDetalle.tsx      # Cabecera de ruta + lista de pedidos
│   │   ├── Repartidores.tsx     # Grid de tarjetas + modal alta
│   │   ├── Clientes.tsx         # Lista + búsqueda + modal alta
│   │   ├── Reportes.tsx         # Bar chart + pie + tabla rendimiento + export CSV
│   │   ├── Configuracion.tsx    # Editor de parámetros del sistema (solo admin)
│   │   └── repartidor/
│   │       ├── MiRuta.tsx       # Vista móvil: pedidos asignados (pendientes/completados)
│   │       └── PedidoAccion.tsx # Vista móvil: registrar recogida/entrega/no-entrega + foto
│   ├── hooks/
│   │   ├── usePedidos.ts        # Fetch v_pedidos_detalle con filtros (fecha/estado/búsqueda)
│   │   ├── useRutas.ts          # Fetch rutas por fecha
│   │   └── useRepartidor.ts     # Fetch v_repartidor_mis_pedidos (RLS por auth.uid)
│   ├── lib/
│   │   ├── supabase.ts          # Cliente Supabase (6 líneas)
│   │   └── utils.ts             # formatFecha/Hora, ESTADO_LABELS, MOTIVO_LABELS, PRIORIDAD_*, cn, iniciales
│   ├── types/
│   │   └── index.ts             # TODAS las interfaces + enums (233 líneas)
│   ├── context/
│   │   └── AuthContext.tsx      # Sesión, rol, repartidorId, nombre, signIn/signOut
│   ├── App.tsx                  # Router + ProtectedRoute + Toaster
│   └── main.tsx
├── docs/
│   ├── DEPLOY-VERCEL.md
│   ├── PLAN-PRODUCCION.md       # Plan previo de hardening a producción
│   └── auditoria/              # 8 documentos de auditoría (14-jun-2026)
├── supabase/                   # config.toml de la CLI (sin migraciones versionadas)
├── Beetrack/                   # 24 capturas de referencia (DispatchTrack lastmile)
├── dist/                       # Build de producción
├── CLAUDE.md / README.md
├── tailwind.config.js / vite.config.ts / vercel.json / tsconfig.json
└── .env (credenciales Supabase)
```

**Métricas de código:** ~4.254 líneas TS/TSX en 37 archivos. Archivos más grandes: `PedidoAccion.tsx` (339), `PedidoNuevo.tsx` (314), `Reportes.tsx` (312), `PedidoDetalle.tsx` (302).

> ⚠️ **No hay migraciones SQL versionadas** en `supabase/`. El esquema vive solo en el proyecto remoto `ajbkzbtmknlmuucotdol`. Recomendación: exportar el esquema a `supabase/migrations/` antes de cambios estructurales.

---

## 4. Modelo de datos (Supabase — verificado en vivo)

**Proyecto:** `ajbkzbtmknlmuucotdol` · `https://ajbkzbtmknlmuucotdol.supabase.co`

### 4.1 Tablas (todas con RLS activado)

| Tabla | Filas | Descripción |
|---|---:|---|
| `pedidos` | 103 | Tabla central. Cada fila = un pedido de despacho |
| `configuracion` | 23 | Parámetros globales editables por admin (clave/valor) |
| `rutas` | 11 | Agrupación de pedidos por conductor y fecha |
| `usuarios` | 6 | Operadores, supervisores, admins (espejo de auth.users) |
| `clientes` | 4 | Clientes del almacén |
| `repartidores` | 3 | Conductores/repartidores |
| `historial_estados` | 2 | Auditoría de cambios de estado (trigger automático) |
| `evidencias` | 0 | Fotos por pedido (recogido/entregado/no_entregado/firma) |
| `notificaciones` | 0 | Alertas internas (sin uso aún) |

### 4.2 Campos clave de `pedidos`

Identidad y relaciones: `id`, `numero_pedido` (autogenerado por `fn_generar_numero_pedido`), `cliente_id`, `ruta_id`, `creado_por`.
Estado: `estado` (enum), `intento_numero`, `prioridad` (0-3).
Entrega: `direccion_entrega`, `distrito_entrega`, `referencia_entrega`, `coordenadas_entrega`, `fecha_programada`, `fecha_entrega_real`, `fecha_reprogramada`.
Carga: `bultos`, `peso_kg`, `descripcion_carga`.
Evidencia: `foto_recogido_url`, `foto_entregado_url`, `foto_no_entregado_url`, `firma_url`, `requiere_foto`, `nombre_receptor`, `dni_receptor`.
No entrega: `motivo_no_entrega` (enum), `detalle_no_entrega`.
Otros: `observaciones`, `codigo_qr`, `recogido_en`, `creado_en`, `actualizado_en`.

### 4.3 Vistas

| Vista | Uso |
|---|---|
| `v_pedidos_detalle` | Pedido + cliente + repartidor + ruta + conteo de evidencias. Base de back-office |
| `v_repartidor_mis_pedidos` | Filtra por `auth.uid()` vía RLS — solo pedidos del repartidor logueado |
| `v_resumen_dia` | Métricas agregadas del día (totales por estado + tasa de entrega) |

### 4.4 Enums

- **`estado_pedido`** (9): `recibido → verificado → en_preparacion → listo_despacho → recogido → en_camino → entregado | no_entregado | reprogramado`
- **`estado_repartidor`**: `disponible`, `en_ruta`, `descanso`, `inactivo`
- **`estado_ruta`**: `pendiente`, `en_curso`, `completada`, `cancelada`
- **`motivo_no_entrega`**: `cliente_ausente`, `direccion_incorrecta`, `rechazo_cliente`, `producto_danado`, `zona_inaccesible`, `otro`
- **`rol_usuario`**: `admin`, `operador`, `supervisor`, `repartidor`

### 4.5 Funciones / triggers

| Función | Rol |
|---|---|
| `fn_registrar_cambio_estado()` | Trigger: registra cada cambio de estado en `historial_estados` |
| `fn_generar_numero_pedido()` | Genera el `numero_pedido` correlativo |
| `fn_actualizar_contadores_ruta()` | Mantiene `total_pedidos`/`entregados`/`no_entregados` en `rutas` |
| `fn_actualizar_timestamp()` | Trigger de `actualizado_en` |
| `current_repartidor_id()`, `es_admin()`, `es_staff()` | Helpers `SECURITY DEFINER` para políticas RLS |

### 4.6 Storage

- Bucket **`evidencias`** (público). Path de subida: `{pedido_id}/{tipo}/{timestamp}.ext`.

---

## 5. Inventario funcional — estado por pantalla

### Back-office

| Pantalla | Ruta | Estado | Qué hace hoy | Brechas vs. objetivo |
|---|---|---|---|---|
| **Login** | `/login` | 🟢 | Email+password (Supabase Auth), redirige por rol | Sin "recuperar contraseña", sin 2FA |
| **Inicio (Dashboard)** | `/dashboard` | 🟢 | 4 métricas del día, pedidos recientes, rutas activas con % | Sin timeline en vivo, sin mapa, sin filtro de rango |
| **Pedidos** | `/pedidos` | 🟢 | Lista filtrable (búsqueda/estado/fecha), tarjetas, drawer detalle | Vista solo de tarjetas (no tabla densa), filtro 1 día, sin subestados, sin export, sin selección masiva |
| **Pedido nuevo** | `/pedidos/nuevo` | 🟢 | Wizard 2 pasos: datos + asignación a ruta | Sin geocodificación de dirección, sin importación masiva |
| **Pedido detalle** | (drawer) | 🟢 | Cliente, carga, repartidor, evidencias (lightbox), timeline, transición de estado | No es URL propia (no compartible), sin mapa, sin "modificar datos" |
| **Rutas** | `/rutas` | 🟢 | Grid de tarjetas por fecha + modal "Nueva ruta" (selección de pedidos) | Sin vista tabla, sin "reordenar/optimizar", sin mapa, sin import/export recaudación |
| **Ruta detalle** | `/rutas/:id` | 🟢 | Cabecera + lista de pedidos de la ruta | Sin tabs Despachos/Mapa/Cobros, sin hora estimada/real, sin reordenar |
| **Repartidores** | `/repartidores` | 🟢 | Grid + alta. Cuenta pedidos del día | **N+1 queries**. Sin edición/baja, sin vínculo a usuario auth desde UI |
| **Clientes** | `/clientes` | 🟢 | Lista + búsqueda + alta | **N+1 queries**. Sin edición, sin import, sin historial, sin "reseñas"/cita |
| **Reportes** | `/reportes` | 🟢 | Bar (por día), pie (estados), tabla rendimiento, export CSV | **N+1 queries**. Sin métricas de tiempo de entrega, sin gráficos por hora/día semana |
| **Configuración** | `/configuracion` | 🟢 (admin) | Editor de 23 parámetros agrupados (Empresa/Operación/Notif./Sistema) | Parámetros guardados pero **no consumidos** por la lógica de la app |

### App móvil del repartidor

| Pantalla | Ruta | Estado | Qué hace hoy | Brechas |
|---|---|---|---|---|
| **Mi ruta** | `/mi-ruta` | 🟢 | Pendientes/Completados, contadores, saludo | Saludo fijo "Buenos días", sin mapa, sin navegación GPS, sin orden de parada |
| **Acción de pedido** | `/mi-ruta/:id/accion` | 🟢 | Recogido/Entregado/No-entregado + foto (cámara) + motivo | Sin firma digital, sin captura de receptor/DNI, sin geolocalización del evento, sin modo offline |

---

## 6. Sistema de diseño actual

### 6.1 Paleta (tailwind.config.js)

Paleta pastel personalizada de 4 familias:

| Token | Significado | Tonos clave |
|---|---|---|
| `celeste` | Primario / acciones | 500 `#5BB8D4`, 700 `#2E86AB`, 900 `#1A5276` |
| `menta` | Éxito / entregado | 500 `#4CAF91`, 700 `#1E8449` |
| `lavanda` | Secundario / estados intermedios | 500 `#9B7FD4`, 700 `#6C3483` |
| `coral` | Error / no entregado / alerta | 500 `#E57373`, 700 `#C0392B` |

Además se usan colores Tailwind por defecto ad-hoc (`yellow`, `orange`, `blue`, `amber`, `gray`) en badges de estado y prioridad — **inconsistencia**: parte de la semántica de color vive fuera de la paleta de marca.

### 6.2 Animaciones

`fadeIn` (0.2s) y `pulseSoft` definidas en config. Uso de `active:scale-95` en botones, transiciones de 200-500ms.

### 6.3 Primitivos UI

- **Button** — 5 variantes × 3 tamaños, estado `loading` con spinner.
- **Input / Select / Textarea** — con `label`, `error`, `icon`.
- **Card** — contenedor blanco redondeado, hover y `onClick` opcionales.
- **Modal** — backdrop con blur, tamaños sm/md/lg.
- **Skeleton / SkeletonCard** — placeholders de carga.
- **EstadoBadge / RepartidorAvatar / Timeline** — compartidos de dominio.

### 6.4 Patrón de layout

- **Desktop:** sidebar fija de 240px (blanca, borde sutil) + contenido. Item activo con borde izquierdo celeste.
- **Móvil:** header fijo de 56px con hamburguesa + drawer.
- **App repartidor:** layout propio (sin sidebar), fondo `#F7F9FC`, header sticky, ancho máximo `lg` centrado.

### 6.5 Lectura de diseño vs. Beetrack/DispatchTrack

| Aspecto | Akuarian hoy | DispatchTrack (referencia) |
|---|---|---|
| Top bar | Solo móvil, blanca | Barra superior **azul marino** con marca, accesos rápidos (apps, notif., chat, ayuda, config, perfil) |
| Sidebar | Texto + icono, 240px | Icono-only colapsable, navy/blanco |
| Densidad de datos | Tarjetas espaciadas | **Tablas densas** con paginación, checkbox de selección, menú ⋮ por fila |
| Estados | 1 badge | **Estado + Subestado** (p.ej. "Entregado / Entrega Exitosa", "No recogido / Recojo anulado") |
| Tiempo | Hora absoluta | **Relativo** ("Estimado para 11 minutos", "Gestionado hace 2 días") |
| Mapas | Ausente | Leaflet + HERE en órdenes, rutas y actividad |
| Acciones masivas | Ausentes | Importar archivo, exportar Excel/recaudación, asignar ruta en lote |

---

## 7. Autenticación, roles y acceso

- **Auth:** Supabase Auth (email/password). `AuthContext` carga sesión, consulta `usuarios` para el rol y, si es repartidor, resuelve `repartidorId` desde `repartidores.auth_user_id`.
- **Resiliencia:** `loadUserProfile` reintenta con backoff (hasta 2) y hace `signOut` si el usuario no existe en `usuarios` (evita estado "limbo").
- **Guard:** `ProtectedRoute` valida `requiredRole`; redirige repartidores a `/mi-ruta` y staff a `/dashboard`.

### Matriz de acceso

| Ruta | admin | operador | supervisor | repartidor |
|---|:--:|:--:|:--:|:--:|
| `/dashboard`, `/pedidos`, `/rutas`, `/repartidores`, `/clientes`, `/reportes` | ✅ | ✅ | ✅ | ❌ → `/mi-ruta` |
| `/configuracion` | ✅ | ❌ | ❌ | ❌ |
| `/mi-ruta`, `/mi-ruta/:id/accion` | ❌ | ❌ | ❌ | ✅ |

> Nota: el guard de frontend trata a operador y supervisor igual. La diferencia "supervisor = solo lectura" descrita en el README **no está implementada** en la UI (cualquiera de los tres puede crear/editar). El control real debe estar en las políticas RLS.

### Credenciales de prueba (password común `Akuarian2026!`)

`admin@akuarian.pe`, `operador@akuarian.pe`, `supervisor@akuarian.pe`, `carlos@akuarian.pe`, `luis@akuarian.pe`, `pedro@akuarian.pe`.

---

## 8. Deuda técnica y limitaciones conocidas

> **Actualización jun-2026:** resueltos los ítems 1 (N+1 en Clientes/Reportes), 6 (migraciones — ahora aplicadas vía Supabase, falta `db pull` local), 7 (tests con Vitest), 11 (subestados implementados). Persisten: 2 (sin React Query), 3 (filtro de 1 día), 4 (detalle sin URL propia), 5 (Configuración desconectada), 8 (coordenadas sin uso), 10 (badges/saludo). El ítem 9 ya no aplica (R2 + evidencias en código).

1. **N+1 queries** en `Repartidores`, `Clientes` y `Reportes`: por cada fila se dispara una consulta de conteo. Con volumen real esto degrada el rendimiento. → Mover a `COUNT` agregado en vista/RPC o `select` con relaciones. *(✅ resuelto en Clientes y Reportes con conteo agregado; Repartidores aún hace N+1.)*
2. **Sin caché de datos** (no React Query): cada navegación re-fetchea; sin invalidación inteligente ni estados optimistas.
3. **Filtro de pedidos limitado a un solo día** (`usePedidos` exige `fecha_programada = X`). No hay rango de fechas ni "ver todos".
4. **`PedidoDetalle` no tiene URL propia** — se monta como drawer dentro de `Pedidos`/`RutaDetalle`. La ruta `/pedidos/:id` existe pero renderiza `Pedidos`, no un detalle dedicado (no se puede compartir enlace a un pedido).
5. **Configuración desconectada**: los 23 parámetros (`foto_requerida_entrega`, `max_intentos_entrega`, `pedido_prefijo`, etc.) se editan pero **no se leen** en ninguna parte del código de la app.
6. **Sin migraciones versionadas** del esquema (riesgo de pérdida/drift).
7. **Sin tests** (unit/e2e). Validación solo por compilación TS.
8. **Coordenadas sin uso**: `coordenadas_entrega` y `coordenadas` (cliente) existen en BD pero no se capturan ni muestran.
9. **Tablas `notificaciones` y `evidencias` vacías** en producción; el flujo de evidencias funciona por código pero aún no hay datos.
10. **Inconsistencia de color** (badges fuera de paleta de marca) y **saludo fijo** "Buenos días" sin lógica horaria.
11. **Sin estados de "subestado"** ni manejo de "recogido vs. recojo anulado / parcial" que sí maneja la operación en DispatchTrack.

---

## 9. Estado de seguridad (Supabase Advisors — en vivo)

> **Transversal de seguridad aplicado el 28-jun-2026** (migraciones `security_advisor_fixes` y `rls_least_privilege`). Estado actualizado abajo.

### ✅ RESUELTO

- **`security_definer_view`** (era 🔴 ERROR ×3) — `v_pedidos_detalle`, `v_resumen_dia`, `v_repartidor_mis_pedidos` migradas a **`security_invoker = true`**. Ahora aplican los permisos del usuario que consulta.
- **`function_search_path_mutable`** (era 🟡 ×4) — `fn_actualizar_timestamp`, `fn_generar_numero_pedido`, `fn_registrar_cambio_estado`, `fn_actualizar_contadores_ruta` recreadas con `SET search_path = ''` y referencias cualificadas (`public.…`).
- **`public_bucket_allows_listing`** (era 🟡) — eliminada la política `evidencias_public_read`; el bucket ya no es **listable** (los URLs públicos siguen funcionando).
- **Endurecimiento RLS adicional (no marcado por el advisor, pero era el hueco real):**
  - `es_staff()` ahora valida `rol IN ('admin','operador','supervisor')` (antes devolvía `true` para cualquier usuario activo, incluidos repartidores).
  - Eliminadas **9 políticas amplias** `"Acceso autenticado / Solo admin"` (ALL para cualquier autenticado). Quedan solo las **granulares de mínimo privilegio**.
  - **Verificado:** un repartidor ahora solo ve sus propios datos (20 pedidos vs 103, 4 rutas vs 11) y conserva las escrituras que la app necesita. Escalada de privilegios cerrada.

### 🟡 PENDIENTE (aceptado / fuera de SQL)

- **`anon/authenticated_security_definer_function_executable`** en `current_repartidor_id()`, `es_admin()`, `es_staff()` — **intencional**: se usan dentro de las políticas RLS, por lo que `authenticated` debe poder ejecutarlas y `anon` las necesita para evaluar RLS sin error (devuelven `false`/`null`). No es seguro revocarlas.
- **`auth_leaked_password_protection`** — toggle del **panel de Auth** (Authentication → Policies), no se puede activar por SQL/migración. **Acción pendiente del admin** (1 clic).

> Nota: las migraciones viven en el historial remoto de Supabase; conviene `supabase db pull` para versionarlas en `supabase/migrations/` local (hoy vacío).

---

## 10. Referencia DispatchTrack/Beetrack — alcance objetivo

Las 24 capturas en `Beetrack/` muestran el sistema que la operación usa hoy. Funciones observadas, ordenadas por relevancia para el roadmap:

### Navegación y módulos (sidebar DispatchTrack)
`Actividad · Rutas · Órdenes · Flota · Estadísticas · Alertas · Clientes · Importar`

### Funciones clave identificadas
1. **Actividad (monitor en vivo):** timeline horario de la ruta con KPIs en barra superior — Asignadas / Recogidas / Entregas / Gestionadas / **% Cumplimiento**.
2. **Órdenes con Estado + Subestado:** `Ingresada`, `Asignada`, `Recogido / Recogida Exitosa`, `Entregado / Entrega Exitosa`, `No recogido / Recojo anulado`. Tiempo relativo ("Estimado para 11 min", "Gestionado hace 2 días"). Acciones: **Bitácora**, **Exportar a Excel**, **Nueva orden**, menú ⋮ por fila, selección múltiple.
3. **Detalle de orden:** panel Resumen (contacto, identificador/DNI, dirección con **alerta de confiabilidad** y "enviar notificación al cliente"), **timeline de eventos con mapa** ("Asignado en vehículo" → "Ingresado al sistema"), **Categorías y grupos**, **Campos personalizados**, acciones "Modificar estado / Modificar datos / Limpiar orden".
4. **Rutas (tabla):** Vehículo, Usuario móvil, Despachos, Fecha de entrega, Hora de inicio, Creado en. Acciones: **Importar Archivo**, **Asignar Ruta**, **Exportar Recaudación**, **Nueva Ruta**, filtros (fecha/vehículo/lugar/usuario).
5. **Detalle de ruta:** tabs **Despachos / Mapa / Cobros**, Inicio/Fin de ruta, **Reordenar ruta** (optimización), por parada: Hora estimada, Hora real, **Ventana de tiempo comprometida**, Dirección, pin de mapa, **Asociar pedido**.
6. **Clientes:** ID de cliente, Correo, Teléfono, **# Órdenes**, **Reseñas**, **Importar**, soporte de **CITA** (ventana horaria, p.ej. "CITA: 08:00 AM").
7. **Estadísticas:** despachos por **Hora del día** y por **Día de la semana**, **minutos promedio de gestión de entrega**, entrega más larga, tabla de últimas órdenes con tiempo de entrega.
8. **Flota:** gestión de vehículos (placa F1Y-927, etc.) vinculados a usuarios móviles.
9. **Transversal:** chat interno, alertas, exportaciones a Excel, geocodificación con mapas (Leaflet + HERE).

---

## 11. Roadmap propuesto de nuevas funciones

> **Actualización jun-2026:** la mayor parte de este roadmap se implementó en el rediseño (Fases 0-9). **Hecho:** A2 (tabla de pedidos), A3 (detalle enriquecido — como drawer), A5 (edición clientes/repartidores parcial), subestados (A1), C1/C2 reemplazados por **R2 + compresión**, D1 (import masivo CSV+`.xlsx`), D3 (estadísticas avanzadas), seguridad transversal. **Descartado:** todo lo de mapas/geolocalización (B1-B5 de mapas, optimización de ruta por mapa). **Pendiente:** A4 (conectar Configuración), D2 (notificaciones WhatsApp/email), D4 (Flota como entidad), módulo Alertas, "reordenar ruta" real, CITA de clientes. El detalle de abajo es el plan original.

> Mapeo directo de las brechas (§5, §8) contra la referencia (§10). Priorizado por impacto/esfuerzo.

### Fase A — Paridad operativa (alto impacto)
- **A1. Subestados de pedido** — añadir `subestado` (o tabla de motivos) para distinguir "Entrega exitosa / parcial / Recojo anulado". Requiere ALTER enum/columna + UI.
- **A2. Vista tabla de Pedidos/Órdenes** — alternativa densa a las tarjetas: columnas, paginación, selección múltiple, menú ⋮, export a Excel/CSV, **tiempo relativo**.
- **A3. Detalle de pedido como página propia** (`/pedidos/:id`) — enlace compartible + timeline de eventos enriquecido.
- **A4. Conectar Configuración a la lógica** — consumir `foto_requerida_*`, `max_intentos_entrega`, `pedido_prefijo`, horarios, etc.
- **A5. Edición/baja** de clientes y repartidores (hoy solo alta).

### Fase B — Geolocalización y rutas (diferenciador)
- **B1. Integrar mapas** (Leaflet + un proveedor de tiles) en detalle de pedido, ruta y dashboard.
- **B2. Geocodificación de direcciones** al crear pedido + **alerta de confiabilidad**.
- **B3. Captura de geolocalización del evento** (recogida/entrega) en la app móvil.
- **B4. Detalle de ruta con tabs Despachos/Mapa**, hora estimada/real, **reordenar/optimizar ruta**.
- **B5. Monitor "Actividad"** en vivo con KPIs y % de cumplimiento.

### Fase C — Evidencia y cobros
- **C1. Firma digital** + captura de receptor/DNI en la app móvil.
- **C2. Restringir bucket `evidencias`** (seguridad §9) y miniaturas.
- **C3. Módulo de Cobros/Recaudación** (tab Cobros + export recaudación) si aplica COD.

### Fase D — Integraciones y volumen
- **D1. Importación masiva** de pedidos/clientes desde archivo (CSV/Excel).
- **D2. Notificaciones al cliente** (WhatsApp/email) — usar tabla `notificaciones` + config.
- **D3. Estadísticas avanzadas** (tiempos de gestión, por hora/día).
- **D4. Gestión de Flota** (vehículos como entidad).

### Transversal — Calidad
- Resolver advisors de seguridad (§9).
- Versionar el esquema en `supabase/migrations/`.
- Introducir React Query + eliminar N+1.
- Suite mínima de tests (Vitest + Testing Library) para flujos críticos.

---

## 12. Plan de refresco de diseño

> 📄 **El plan detallado y accionable vive en un documento aparte:** [PLAN-REFRESCO-DISENO.md](PLAN-REFRESCO-DISENO.md).
> Esta sección queda como resumen alineado con las decisiones tomadas el 26-jun-2026.

**Decisiones que acotan el alcance de esta iteración:**

| Tema | Decisión |
|---|---|
| Paleta de colores | ✅ **Se mantiene la actual** (celeste/menta/lavanda/coral). No se migra a navy. |
| Subestados de pedido | ⏸️ **Pospuesto** — no se tocan enums ni el modelo de estados. |
| Referencia Beetrack | ✅ Adopción **parcial**: solo patrones de UX que dan familiaridad al personal, con nuestra paleta. |
| Dark mode | ⏸️ Pospuesto (no en esta iteración). |
| Mapas / import / notificaciones / cobros | ⏸️ Fuera de alcance del refresco (van en el roadmap funcional §11). |

**Principio rector:** *familiaridad estructural, identidad propia de color* — tomar la disposición y los patrones de interacción de DispatchTrack, vestidos con la paleta pastel existente.

**Cambios incluidos en esta iteración** (detalle, archivos y criterios de aceptación en [PLAN-REFRESCO-DISENO.md](PLAN-REFRESCO-DISENO.md)):

1. **Top bar global** persistente en escritorio (fondo `celeste-900`, no navy). Hoy solo existe en móvil.
2. **Sidebar refinada** — colapsable a icono-only con tooltips.
3. **Componente Tabla** reutilizable (`src/components/ui/Table.tsx`): densidad, orden, paginación, selección y menú de fila — base para Pedidos, Rutas y Clientes (coexiste con las tarjetas actuales).
4. **Barra de filtros horizontal** unificada en los listados.
5. **Tiempo relativo** como utilidad transversal (`date-fns/formatDistanceToNow`).
6. **Tira de KPIs** en el Dashboard (estilo "Actividad" de Beetrack) con colores semánticos actuales.
7. **Timeline de eventos** enriquecido en el detalle de pedido.
8. **Estados vacíos / carga / error** unificados (hoy hay variantes por página).

> La consolidación de badges de estado ad-hoc (`yellow`/`orange`/`blue`) se trata como ajuste de *consistencia* (centralizar el mapa estado→color), **no** como migración forzada a la paleta de marca: prioriza la legibilidad de los 9 estados.

---

## 13. Cómo ejecutar

```bash
npm install              # instala dependencias (aviso esbuild solo afecta dev)
# Configurar .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173
npm run build            # tsc + vite build → dist/
npm run preview          # sirve el build
```

**Despliegue:** Vercel (`vercel.json` listo, SPA rewrites + cache de assets). Ver `docs/DEPLOY-VERCEL.md`.

---

## 14. Riesgos y recomendaciones antes de iterar

| Prioridad | Acción |
|---|---|
| ✅ Hecho | ~~Errores `security_definer_view` + bucket `evidencias` + RLS de mínimo privilegio~~ (resuelto, ver §9) |
| ✅ Hecho | ~~Estrategia de subestados~~ y ~~N+1 en Clientes/Reportes/Repartidores~~ (resueltos) |
| 🟡 Baja | Activar Leaked Password Protection en el panel de Auth (§9) |
| 🔴 Alta | Versionar el esquema actual en `supabase/migrations/` con `supabase db pull` (hoy solo vive en el remoto) |
| 🟡 Baja | Conectar Configuración a la lógica para que los parámetros tengan efecto |
| 🟡 Baja | Añadir tests de humo a los flujos críticos (login, crear pedido, registrar entrega) |

---

*Documento generado a partir del análisis del código fuente, la base de datos en vivo (Supabase) y las capturas de referencia de DispatchTrack. Akuarian SAC © 2026.*
