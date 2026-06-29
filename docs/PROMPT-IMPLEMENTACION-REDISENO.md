# Prompt de implementación — Rediseño "estilo Beetrack" para Akuarian Dispatch

> Pegar este documento completo como contexto al iniciar la sesión de implementación
> (Claude Code / Claude Chat). Está pensado para ejecutarse por **fases**: pedir una fase,
> validarla con `npm run build`, y recién pasar a la siguiente.
>
> **Fecha:** 26 de junio de 2026 · **Branch base:** `master` · **Versión:** 1.0.0

---

## ✅ Estado de implementación (actualizado jun-2026)

Todas las fases del rediseño están **implementadas y verificadas** (`npm run build` + `npm test` en verde):

| Fase | Estado | Notas |
|---|---|---|
| 0 — Fundaciones (top bar, sidebar colapsable, `Table`, `FilterBar`, `KpiStrip`, `EmptyState`, tiempo relativo) | ✅ | |
| 1 — Pedidos/Órdenes (tabla, filtros, export) | ✅ | |
| 2 — Detalle de pedido (`EventTimeline` + cards) | ✅ | |
| 3 — Rutas (tabla, detalle con tabs, editar) | ✅ | tabs Despachos/Cobros — **mapa eliminado** |
| 4 — Clientes (tabla, editar, sin N+1) | ✅ | |
| 5 — Inicio/Actividad (KpiStrip, unidades, timeline horario, filtros) | ✅ | sin mapa |
| 6 — Reportes/Estadísticas (tabs Envíos/Rutas) | ✅ | sin tab Mapa |
| 7 — Subestados | ✅ | columna BD + catálogo + UI + datos de prueba |
| 8 — Importación masiva | ✅ | **real** (CSV + `.xlsx`), no placeholder |
| 9 — Imágenes Cloudflare R2 | ✅ código / ⏳ config | Edge Function desplegada + compresión; falta cargar credenciales R2 (ver [FASE9-R2-SETUP.md](FASE9-R2-SETUP.md)) |
| Export `.xlsx` multi-hoja | ✅ | write-excel-file (lazy-load) |
| Transversal de seguridad | ✅ | advisors resueltos + RLS mínimo privilegio (ver [ESTADO-DEL-PROYECTO.md](ESTADO-DEL-PROYECTO.md) §9) |

**Decisiones aplicadas:** paleta pastel intacta · **mapas eliminados por completo** del back-office · subestados implementados · `.xlsx` con `write-excel-file`/`read-excel-file` (no SheetJS) · R2 con Edge Function + dominio público + lifecycle 4 días.

---

## 0. Contexto del proyecto

**Akuarian Dispatch** es una SPA de gestión de despachos para Akuarian SAC (logística de última milla en Lima, Perú). Hoy tiene dos experiencias en una misma app: back-office de escritorio (admin/operador/supervisor) y app móvil del repartidor.

**Stack (no cambiar versiones sin justificación):**

| Capa | Tecnología |
|---|---|
| Framework | React 18.3.1 + Vite 5.4.10 + TypeScript 5.6.3 (`strict`) |
| Estilos | Tailwind CSS 3.4.15 (paleta personalizada) |
| Routing | React Router DOM 6.28.0 |
| Backend | Supabase JS 2.45.4 (proyecto `ajbkzbtmknlmuucotdol`) |
| Formularios | React Hook Form 7.53.2 + Zod 3.23.8 |
| Gráficas | Recharts 2.13.3 |
| Iconos | lucide-react 0.460.0 |
| Fechas | date-fns 3.6.0 (locale `es`) |
| Notif. UI | react-hot-toast 2.4.1 |
| Hosting | Vercel |

**Estructura relevante:**

```
src/
├── components/ui/      Button, Input/Select/Textarea, Badge, Card, Modal, Skeleton
├── components/layout/  Layout, Sidebar, Header
├── components/shared/  EstadoBadge, RepartidorAvatar, Timeline
├── pages/              Login, Dashboard, Pedidos, PedidoNuevo, PedidoDetalle (drawer),
│                       Rutas, RutaDetalle, Repartidores, Clientes, Reportes, Configuracion
│   └── repartidor/     MiRuta, PedidoAccion
├── hooks/              usePedidos, useRutas, useRepartidor
├── lib/                supabase.ts, utils.ts
├── types/              index.ts
└── context/            AuthContext.tsx
```

---

## 1. Objetivo y principio rector

**Objetivo:** que un operador que hoy usa **DispatchTrack | lastmile (Beetrack)** reconozca la estructura de Akuarian Dispatch —barra superior, navegación, vistas de tabla densas, lectura de estados y tiempos relativos, detalle de orden con timeline— **sin cambiar la identidad visual pastel**.

**Principio rector:** **familiaridad estructural, identidad propia de color.**
Tomamos de Beetrack la disposición y los patrones de interacción (lo que el personal ya tiene memorizado) y los vestimos con la paleta celeste/menta/lavanda/coral. Donde Beetrack usa azul marino corporativo, usamos `celeste-900` / `celeste-700`.

---

## 2. Restricciones DURAS (no negociables)

1. **Paleta de colores:** se mantiene **idéntica** (`tailwind.config.js`). NO migrar a navy ni a otra marca de color. Top bar y acentos van en `celeste-900`/`celeste-700`.
2. **Simpleza:** mantener el espíritu actual. No introducir librerías de estado global, ni dependencias pesadas, salvo lo que se indique explícitamente.
3. **Sin mapas ni GPS en tiempo real.** Donde Beetrack muestra mapa (detalle de orden, tab "Mapa" de ruta, panel de Actividad, "Alertas GPS"), **se omite el panel de mapa** o se deja un placeholder neutro "Mapa no disponible en esta versión". NO integrar Leaflet/HERE/Mapbox/Google Maps.
4. **Responsive:** las tablas densas degradan a tarjetas en móvil. La app móvil del repartidor (`/mi-ruta`) **no se toca** en este rediseño salvo que se indique.
5. **No romper el build:** cada fase debe pasar `npm run build` (que corre `tsc`) sin errores de tipos. No hay suite de tests; el build ES la validación.
6. **Reutilizar lo existente:** apoyarse en los primitivos actuales (`Button`, `Input`, `Card`, `Modal`, `Skeleton`, `EstadoBadge`, `RepartidorAvatar`, `Timeline`) antes de crear nuevos.

---

## 3. Sistema de diseño — ajustes (sin tocar la paleta)

La paleta se mantiene. Los ajustes son de **consistencia y densidad**:

- **Tokens de superficie:** formalizar como clases/tokens reutilizables el gris de fondo `#F7F9FC` (ya usado en móvil), bordes `gray-100`, sombras suaves y radios, para que tablas y tarjetas se vean homogéneas.
- **Escala de densidad para tablas:** padding/tamaños más compactos que las tarjetas (filas ~44–48px, texto `text-sm`).
- **Mapa estado→color centralizado:** hoy `EstadoBadge` mezcla colores de marca con Tailwind por defecto (`yellow`, `orange`, `blue`, `amber`). Centralizar y documentar el mapa de los 9 estados en un solo lugar; priorizar **legibilidad** sobre pureza de marca (no forzar los 9 estados a 4 colores si rompe contraste).
- **Estados vacíos / carga / error unificados:** crear un patrón común (`EmptyState`) y reutilizar `Skeleton`. Hoy cada página los implementa distinto.

---

## 4. Componentes nuevos / refinados (habilitadores transversales)

> Construir estos PRIMERO (Fase 0). Habilitan todo lo demás.

| Componente | Ruta | Descripción |
|---|---|---|
| **Top bar global** | `src/components/layout/Header.tsx` + `Layout.tsx` | Barra superior **persistente en escritorio** (hoy solo existe en móvil). Fondo `celeste-900`, texto blanco. Izquierda: logo "Akuarian Dispatch" + nombre del módulo actual. Derecha: campana de notificaciones (placeholder ok), avatar con menú (perfil / cerrar sesión). |
| **Sidebar refinada** | `src/components/layout/Sidebar.tsx` | Icono + label, item activo claramente marcado (`celeste-50`/`celeste-700`), **colapsable a solo iconos** con tooltips. |
| **Table** (nuevo) | `src/components/ui/Table.tsx` | Tabla reutilizable: header **ordenable**, **checkbox de selección por fila** + selección masiva en header, **menú ⋮ por fila** (slot de acciones), **paginación** al pie, slot de "barra de filtros" arriba, estados loading/empty integrados. Base de Pedidos, Rutas, Clientes, Alertas, Importaciones. |
| **FilterBar** (nuevo) | `src/components/ui/FilterBar.tsx` | Fila horizontal de controles (`Input`/`Select` actuales dentro de un `Card` blanco) + botones "Filtrar" y "Limpiar filtros". |
| **KpiStrip** (nuevo) | `src/components/ui/KpiStrip.tsx` | Tira compacta de píldoras/chips de métricas con colores semánticos actuales (menta=entregado, celeste=en camino/en ruta, coral=fallo/pendiente). |
| **EmptyState** (nuevo) | `src/components/ui/EmptyState.tsx` | Estado vacío unificado (icono + título + descripción + acción opcional). |
| **EventTimeline** (refinar) | `src/components/shared/Timeline.tsx` | Timeline de eventos vertical estilo Beetrack: encabezados por fecha, cada evento con hora, autor y estado ("Asignado en vehículo", "Ingresado al sistema", "Entregado"). **Sin mapa** dentro del evento. |
| **`formatRelativo()`** (util) | `src/lib/utils.ts` | Helper con `formatDistanceToNow` (date-fns, locale `es`). Dos modos: futuro → "Estimado para 11 minutos / un día"; pasado → "Gestionado hace 17 horas / 2 días". Mostrar siempre junto a la fecha absoluta. |

---

## 5. Mapeo pantalla por pantalla (Beetrack → Akuarian)

> Cada bloque referencia las capturas. Replicar **layout y patrón de interacción**, con paleta pastel y **sin mapas**.

### 5.1 Top bar + Sidebar (todas las capturas)
- **Beetrack:** top bar navy con logo "DispatchTrack | lastmile" a la izquierda; a la derecha grid de apps, campana, chat, ayuda, engranaje, perfil. Sidebar icono-only colapsable: `Actividad · Rutas · Órdenes · Flota · Estadísticas · Alertas · Clientes · Importar`.
- **Akuarian:** top bar `celeste-900` con "Akuarian Dispatch". A la derecha solo lo que existe: **campana** (placeholder) + **avatar/menú**. Omitir grid de apps, chat y ayuda si no hay backend.
- **Mapa de navegación (sidebar):**
  - Actividad → **Inicio / Dashboard**
  - Rutas → **Rutas**
  - Órdenes → **Pedidos**
  - Flota → **Repartidores** (renombrable a "Flota" si se añade entidad vehículos, ver 5.9)
  - Estadísticas → **Reportes**
  - Alertas → **Alertas** (módulo nuevo, fase 6)
  - Clientes → **Clientes**
  - Importar → **Importar** (fase futura, 5.10)

### 5.2 Pedidos / "Órdenes" — vista de tabla densa (capturas: Órdenes 18, 19)
- **Toggle Tarjetas / Tabla:** conservar las tarjetas actuales (buenas en móvil) y **añadir vista tabla** (mejor densidad en escritorio). El usuario elige; recordar preferencia en estado local.
- **Cabecera (arriba a la derecha):** `Bitácora` · `Exportar a excel` (reusar el CSV de Reportes) · `+ Nueva orden` (= Nuevo pedido actual).
- **Barra de filtros horizontal:** Código de orden · Tipo de fecha para filtrar · Seleccionar fecha · Estado · (Subestado — solo si se hace fase 7) · Nombre del contacto · Identificador de contacto · Vehículo · botón **Filtrar** · Limpiar. Checkbox "Filtrar por último despacho".
- **Columnas:** `☐` · Orden · Estado · (Subestado) · Vehículo · Cliente · **Fecha de ruta** (con **tiempo relativo**: "Estimado para 11 minutos" / "Gestionado hace 17 horas") · `⋮`.
- **Pie:** paginación.
- **Importante (alcance):** las columnas con **Subestado** solo aplican si se ejecuta la **Fase 7** (toca BD). Si no, omitir esa columna y dejar solo Estado.

### 5.3 Detalle de pedido — página con timeline de eventos (capturas: 5, 22)
- **Mantener el drawer actual** pero **enriquecer el timeline** y, **opcionalmente**, habilitar URL propia `/pedidos/:id` para enlace compartible (mejora, no bloqueante; hoy `/pedidos/:id` renderiza `Pedidos`, no un detalle dedicado).
- **Encabezado:** breadcrumb "Pedidos > #001-00001722" con icono copiar. A la derecha: `Limpiar orden` · `Modificar datos` · `Modificar estado` (este último = la transición de estado que ya existe).
- **Columna izquierda (cards):**
  - **Resumen:** Nombre, Identificador de contacto (DNI), Teléfono, Dirección, **alerta de baja confiabilidad de dirección** + "Enviar notificación" (placeholder, sin backend real), Núm. Intentos, Último estado.
  - **Categorías y grupos:** CLIENTE.
  - **Campos personalizados:** CLIENTE, DISTRITO, ORDEN DE COMPRA, marketplaceId, REFERENCIA DIRECCIÓN, CLIENT UBIGEO. Mapear a campos existentes en `pedidos`/`clientes`; los que no existan, mostrar "N/A" (NO crear columnas en BD en esta iteración).
  - **Ítems:** Nombre, Código, Cantidad, Precio (usar `descripcion_carga`/`bultos`/`peso_kg` disponibles; si no hay modelo de ítems, mostrar lo que haya).
- **Columna derecha (eventos):** `EventTimeline` con encabezado de fecha ("jueves 25 de junio de 2026") y eventos verticales ("Asignado en vehículo — Registrado: 17:12 | Luis Burga | F1Y-927", "Ingresado al sistema — Registrado: 16:45"). Alimentar desde `historial_estados`. **Sin mapa** en el evento (Beetrack lo muestra; nosotros lo omitimos).

### 5.4 Rutas — vista de tabla (capturas: 23, 24)
- **Toggle Tarjetas / Tabla.** Conservar el grid de tarjetas actual + añadir tabla.
- **Cabecera:** `Importar Archivo` (fase futura, deshabilitado/placeholder) · `Asignar Ruta` · `Exportar Recaudación` (placeholder si no hay COD) · `+ Nueva Ruta` (modal actual).
- **Filtros:** Seleccionar fecha · Vehículo · Lugar · Usuarios móviles · Filtrar.
- **Columnas:** `☐` · Vehículo · Usuario móvil (repartidor) · Despachos (conteo) · Fecha de entrega · Hora de inicio · Creado en · `⋮`.
- **Menú ⋮ por fila:** Imprimir etiquetas (placeholder) · Abrir rutas · Cerrar rutas · Mostrar · Editar · Eliminar. Implementar Editar / Eliminar / Mostrar reales; el resto como placeholder con toast "Próximamente".
- **Cuidado N+1:** el conteo de "Despachos" por ruta NO debe disparar una query por fila. Resolver con `COUNT` agregado en la vista/consulta.

### 5.5 Detalle de ruta — tabs Despachos / Cobros (captura: 13)
- **Encabezado:** breadcrumb "Rutas > 43981825". Derecha: `Editar ruta` · `Asociar pedido`.
- **Tabs:** **Despachos** (principal) · **Mapa** (placeholder "no disponible") · **Cobros** (opcional/placeholder si no aplica COD).
- **Sub-header:** @Repartidor · Inicio de ruta · Fin de ruta · "Pedidos: N" · "Gestionados: N" · botón `Reordenar ruta` (drag para reordenar paradas; **sin optimización por mapa**, solo orden manual).
- **Tabla de despachos:** `☐` · # · Pedido (con icono de pin, **sin** abrir mapa) · Estado · Contacto (nombre + teléfono) · Hora estimada · Hora real · Ventana de tiempo comprometida · Dirección.
- "Hora estimada / Hora real / Ventana comprometida": si no existen en BD, mostrar lo disponible y dejar vacíos los demás (no crear columnas nuevas en esta iteración).

### 5.6 Editar ruta — formulario (captura: 4)
- **Información de usuario:** Usuario móvil (repartidor) · Vehículo.
- **Información de despacho:** Fecha despacho · Hora inicio · Fecha máxima de entrega · Tiempo mínimo entre entregas.
- Botón `Actualizar`. Reusar React Hook Form + Zod. Campos que no existan en `rutas` → omitir del form (no alterar enum/BD).

### 5.7 Clientes — vista de tabla (captura: 10)
- **Cabecera:** `Importar` (placeholder) · `Reseñas` (placeholder).
- **Filtros:** Fecha · Nombre · ID de Cliente · Correo Electrónico · Teléfono · Filtrar.
- **Columnas:** Nombre (link) · ID de Cliente · Correo Electrónico · Teléfono · **Órdenes** (conteo) · `⋮`. Soportar mostrar **CITA** (ventana horaria, p.ej. "CITA: 08:00 AM") en la fila si el cliente la tiene.
- **Cuidado N+1:** el conteo de "Órdenes" por cliente debe ser agregado, no una query por fila.
- Añadir **Editar** cliente (hoy solo hay alta).

### 5.8 Inicio / "Actividad" — monitor con KPIs (capturas: 2, 3, 9, 17 — **sin** el mapa de la 17)
- **Tira de KPIs superior** (`KpiStrip`): Cumplimiento total % · Asignadas · Gestionadas · Entregadas · Parciales · No Entregadas. Con colores semánticos actuales.
- **Tarjeta por vehículo/repartidor:** F1Y-927 / Repartidor, mini-stats (Asignadas · Recogidas · Entregas · Gestionadas), barra de **Cumplimiento %**.
- **Timeline horario** (09:15 → 10:00) con puntos por evento — versión simple con Recharts o CSS, **sin mapa**.
- **Panel de filtros lateral** (drawer derecho, captura 9): Buscar · rango de fechas · Centro de distribución · Agrupaciones · Filtro de despacho · Grupos de órdenes · Filtro de rutas · toggles "Actualización automática" y "Modo comprimido". Implementar los filtros que mapeen a datos reales; el resto, deshabilitados.
- Esto **refuerza el Dashboard actual**; no es una pantalla nueva separada.

### 5.9 Reportes / "Estadísticas" — tabs (capturas: 6, 7, 8, 11, 12, 14 — **omitir tab Mapa**)
- **Tabs:** ~~Mapa~~ · **Envíos** · **Rutas** · Formularios (opcional) · Artículos (opcional).
- **Tab Envíos:** donut "Total de Despachos" (Pendiente/Entregado/No Entregado/Entrega Parcial) · "Número de despachos por subestado" (solo si Fase 7) · Despachos entregados por días · Número de despachos por usuarios móviles y vehículo · Principales Clientes (barras) · Rendimiento de Entrega + Entregado en Cliente (pies) · Número de despachos por tiempo/min · por Hora del día · por Día de la semana · Minutos promedio de gestión · "Tabla resumen, últimas órdenes ingresadas" (Orden · Fecha de entrega · Usuario móvil asignado · Tiempo de entrega (min) · Detalles).
- **Tab Rutas:** Total de rutas · Promedio de despachos por ruta · Cumplimiento de rutas planificadas · Mín/Máx de despachos por ruta · Número de rutas por usuario móvil / por vehículo.
- Todo con Recharts (ya está). **Cuidado N+1** en los conteos.
- **Flota:** si se decide tratar vehículos como entidad propia (placa F1Y-927 ↔ usuario móvil), renombrar "Repartidores" → "Flota" o añadir sub-sección. Opcional en esta iteración.

### 5.10 Alertas — módulo nuevo (capturas: 15, 20, 21 — **omitir "Alertas GPS"**)
- **Tabs:** Alertas · Alertas de reseñas (placeholder) · ~~Alertas GPS~~ · Alertas de tiempo extra · Alertas de retraso en entrega.
- **Tabla Alertas:** Orden · Vehículo · Fecha · **Estado con transición** (p.ej. "Cliente Ausente → Entrega Exitosa", coloreado: origen en coral, destino en menta).
- **Tiempo extra / Retraso:** tablas basadas en tiempo (Orden · Usuario móvil · Fecha · Vehículo). OK porque no dependen de GPS.
- Alimentar desde `historial_estados` / `notificaciones`. Si no hay datos, `EmptyState`.

### 5.11 Importar (captura: 16) — **fase futura**
- "Últimas Importaciones": Descargar plantilla · Importar · tabla (Identificador · Estado [Importado / Importado con observaciones] · Nombre de archivo · Usuario · Fecha de carga).
- Requiere backend de parseo CSV/Excel. **Dejar la UI armada como placeholder** y la lógica para una fase posterior.

---

## 6. Items que TOCAN la base de datos (decidir antes de ejecutar)

> El plan original (`PLAN-REFRESCO-DISENO.md`) **pospuso** estos. Como ahora se busca máxima semejanza con Beetrack, quedan como **fases opcionales y aisladas**. NO ejecutarlas mezcladas con el refresco de UI puro.

### Fase 7 (opcional) — Subestados de pedido
- Beetrack muestra **Estado + Subestado** en Órdenes, Alertas y Estadísticas (p.ej. "Entregado / Entrega Exitosa", "No recogido / Recojo anulado", "Recogido / Recogida Exitosa").
- **Implica:** `ALTER` de enum o nueva columna `subestado` (o tabla de motivos) en `pedidos`, más UI en transición de estado, columnas y filtros.
- **Requisito previo (del informe de estado):** versionar el esquema en `supabase/migrations/` antes de cualquier cambio estructural (hoy el esquema solo vive en el remoto).
- **Decisión pendiente:** ¿se ejecuta o se mantiene pospuesto? Si se pospone, omitir todas las columnas/filtros de "Subestado" del rediseño.

### Antes de abrir cualquier fase con BD — resolver seguridad (Supabase Advisors)
- 🔴 `security_definer_view` en `v_pedidos_detalle`, `v_resumen_dia`, `v_repartidor_mis_pedidos` → recrear con `security_invoker = true` o filtrado explícito por `auth.uid()`.
- 🟡 `function_search_path_mutable` → añadir `SET search_path = ''` a las 4 funciones.
- 🟡 Bucket `evidencias` público listable → restringir `SELECT` (relevante para la fase de imágenes, ver §8).
- 🟡 Revocar `EXECUTE` a `anon` en helpers `SECURITY DEFINER` si no es intencional.
- 🟡 Activar protección de contraseñas filtradas en Auth.

---

## 7. Fuera de alcance de este rediseño (NO hacer)

- ❌ Migrar la paleta a navy / cambiar la marca de color.
- ❌ Mapas, geocodificación, pin por parada, tab "Mapa", "Alertas GPS", optimización de ruta por mapa.
- ❌ Importación masiva real (solo UI placeholder).
- ❌ Notificaciones reales a cliente (WhatsApp/email), chat interno.
- ❌ Tocar la app móvil del repartidor (`/mi-ruta`, `/mi-ruta/:id/accion`) salvo indicación.
- ❌ Subestados si NO se aprueba explícitamente la Fase 7.

---

## 8. ✅ HECHO — Subida de imágenes de pedidos con Cloudflare R2

> ✅ **Implementado.** Edge Function `r2-sign-upload` desplegada (firma URLs prefirmadas PUT,
> auth por JWT), compresión en cliente (`lib/imagen.ts`), helper `lib/r2.ts` con fallback a
> Supabase Storage, e integrado en `PedidoAccion`. Falta solo cargar las credenciales R2 y
> configurar el bucket (CORS + lifecycle 4 días) — **guía completa en [FASE9-R2-SETUP.md](FASE9-R2-SETUP.md)**.
> El patrón original previsto se conserva abajo como referencia.

**Objetivo:** reemplazar/complementar Supabase Storage (bucket `evidencias`, hoy público y listable) con **Cloudflare R2** para las fotos de pedidos (recogido / entregado / no_entregado / firma).

**Patrón recomendado (subida directa con URL prefirmada, sin exponer credenciales en el cliente):**
1. **Bucket R2** privado (sin listado público). Definir convención de path: `{pedido_id}/{tipo}/{timestamp}.ext` (igual a la actual para migración limpia).
2. **Endpoint de firma** (Supabase Edge Function o Cloudflare Worker) que reciba `{pedido_id, tipo, contentType}`, valide auth (sesión Supabase / rol repartidor), y devuelva una **URL prefirmada (PUT)** de R2 con expiración corta.
3. **Cliente** (vista móvil del repartidor): comprime la imagen, pide la URL firmada, hace `PUT` directo a R2, y guarda la **URL/clave resultante** en el campo correspondiente de `pedidos` (`foto_recogido_url`, `foto_entregado_url`, `foto_no_entregado_url`, `firma_url`).
4. **Lectura:** servir vía dominio público de R2 (o un Worker que firme GET) según se haya decidido. Para evidencias sensibles, preferir GET firmado, no acceso público listable.
5. **Migración:** script para copiar lo que haya en el bucket Supabase `evidencias` a R2 y actualizar URLs (las tablas `evidencias`/`pedidos` hoy tienen pocas o cero filas, así que el costo es bajo).
6. **Seguridad:** mantener RLS sobre `pedidos`; el endpoint de firma es el único que conoce las credenciales R2 (en variables de entorno del servidor/worker, nunca en el front).

**Variables de entorno a definir (servidor/worker, NO en el cliente):**
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=   # si se sirve por dominio público
```

**[Cuando se retome esta fase: definir Worker vs Edge Function, dominio público vs GET firmado, compresión/tamaño máximo, y si se elimina Supabase Storage o conviven. Revisar primero las decisiones de la conversación previa "Sistema de almacenamiento de imágenes para pedidos".]**

---

## 9. Orden de implementación sugerido

1. **Fase 0 — Fundaciones:** tokens de superficie, `Header` (top bar global), `Sidebar` colapsable, `Table.tsx`, `FilterBar.tsx`, `KpiStrip.tsx`, `EmptyState.tsx`, `formatRelativo()`. *(Bajo riesgo, alto impacto percibido; habilita el resto.)*
2. **Fase 1 — Pedidos/Órdenes:** toggle tarjetas/tabla, barra de filtros, tiempo relativo, cabecera de acciones, export reusando CSV.
3. **Fase 2 — Detalle de pedido:** `EventTimeline` enriquecido + cards (Resumen/Categorías/Campos/Ítems) + (opcional) URL propia.
4. **Fase 3 — Rutas:** tabla + filtros + menú de fila; detalle de ruta con tabs Despachos/(Cobros) y "Reordenar ruta" manual; editar ruta.
5. **Fase 4 — Clientes:** tabla + CITA + conteo de órdenes (sin N+1) + editar.
6. **Fase 5 — Inicio/Actividad:** `KpiStrip`, tarjeta por vehículo, timeline horario (sin mapa), panel de filtros.
7. **Fase 6 — Reportes/Estadísticas:** tabs Envíos/Rutas con gráficas ampliadas (sin tab Mapa).
8. **Fase 7 (opcional, BD) — Subestados.** Solo si se aprueba; precedida por versionar esquema y resolver advisors.
9. **Fase 8 (futura) — Importación masiva real.**
10. **Fase 9 (futura) — Subida de imágenes con Cloudflare R2** (§8).
11. **Transversal (al final):** unificar estados vacíos/carga/error; eliminar N+1 en Reportes/Clientes/Repartidores.

---

## 10. Criterios de aceptación

- [ ] La paleta pastel actual **no cambia** (mismo `tailwind.config.js`).
- [ ] Existe una **barra superior persistente en escritorio** con la marca Akuarian (fondo `celeste-900`).
- [ ] La **sidebar** es colapsable a icono-only con tooltips.
- [ ] Pedidos, Rutas y Clientes ofrecen **vista de tabla** (selección, paginación, menú ⋮, filtros horizontales) **además** de las tarjetas.
- [ ] Los listados muestran **tiempo relativo** ("Estimado para…", "Gestionado hace…") junto a la fecha absoluta.
- [ ] El Inicio/Dashboard muestra una **tira de KPIs** legible de un vistazo.
- [ ] El detalle de pedido tiene un **timeline de eventos** enriquecido (sin mapa).
- [ ] Reportes tiene tabs **Envíos/Rutas** con las gráficas de referencia (sin tab Mapa).
- [ ] (Si se hizo) Existe módulo **Alertas** con transiciones de estado (sin "Alertas GPS").
- [ ] **No** se introducen mapas, GPS, importación real ni notificaciones reales.
- [ ] **No** se modifican enums ni el modelo de estados, salvo Fase 7 aprobada explícitamente.
- [ ] La app sigue **responsive** (tablas → tarjetas en móvil); `/mi-ruta` intacto.
- [ ] `npm run build` pasa sin errores de tipos al cerrar cada fase.

---

## 11. Bloque corto para pegar en cada sesión (resumen operativo)

```
Proyecto: Akuarian Dispatch (React 18 + Vite + TS + Tailwind + Supabase + Recharts).
Tarea: rediseño de UX para asemejarlo a DispatchTrack/Beetrack.

REGLAS DURAS:
- NO tocar la paleta (celeste/menta/lavanda/coral en tailwind.config.js). Top bar = celeste-900.
- NO mapas ni GPS (omitir paneles de mapa, tab "Mapa", "Alertas GPS"). Placeholder neutro donde Beetrack muestra mapa.
- NO tocar enums/BD ni la app móvil /mi-ruta (salvo fase aprobada).
- Mantener simpleza; reusar Button/Input/Card/Modal/Skeleton/EstadoBadge.
- Cada fase debe pasar `npm run build` (tsc).

ADOPTAR de Beetrack, con paleta pastel:
1. Top bar global persistente en escritorio + sidebar colapsable icono+label.
2. Vista de TABLA densa (selección, menú ⋮, paginación, filtros horizontales) en Pedidos, Rutas, Clientes — como alternativa a las tarjetas. Crear src/components/ui/Table.tsx.
3. Tiempo relativo ("Estimado para 11 min" / "Gestionado hace 2 días") con date-fns, helper en src/lib/utils.ts.
4. Tira de KPIs en Inicio (Asignadas/Recogidas/Entregas/% Cumplimiento) con colores semánticos actuales.
5. Detalle de pedido con timeline de eventos enriquecido (sin mapa) + cards Resumen/Categorías/Campos/Ítems.
6. Reportes con tabs Envíos/Rutas (sin tab Mapa).

Empezar por la Fase 0 (fundaciones) y pausar para validar antes de seguir.
```

---

*Documento de prompt generado a partir de README.md, ESTADO-DEL-PROYECTO.md, PLAN-REFRESCO-DISENO.md y las 24 capturas de DispatchTrack/Beetrack. La fase de Cloudflare R2 requiere completar el contexto de la conversación previa. Akuarian SAC © 2026.*
