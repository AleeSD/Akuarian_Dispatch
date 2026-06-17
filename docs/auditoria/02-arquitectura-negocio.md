# Auditoría — 02. Arquitectura y Lógica de Negocio

**Proyecto:** Akuarian Dispatch  
**Fecha:** 2026-06-14  
**Base:** hallazgos de Fase 1 + lectura completa de código fuente + consulta directa a BD  
**Archivos revisados:** todos los `.tsx/.ts` de `src/`, las 4 funciones PL/pgSQL, las 3 vistas, los 10 triggers

---

## Índice de hallazgos

| ID | Severidad | Categoría | Título abreviado |
|---|---|---|---|
| A-01 | **CRÍTICA** | Arquitectura | RLS configurado pero sin enforcement real de roles |
| A-02 | **ALTA** | Arquitectura | Máquina de estados del pedido fragmentada en tres capas sin contrato |
| A-03 | **ALTA** | Arquitectura | Acceso directo a Supabase desde 6 páginas — patrón inconsistente |
| A-04 | **ALTA** | Arquitectura | `NAV_ITEMS` duplicado entre Sidebar y Header |
| A-05 | **ALTA** | Arquitectura | `PedidoDetalle` en `/pages` pero actúa como componente drawer |
| A-06 | **MEDIA** | Arquitectura | Estilos de prioridad definidos dos veces con valores distintos |
| A-07 | **MEDIA** | Arquitectura | Ruta `/configuracion` en sidebar pero sin página ni route |
| A-08 | **MEDIA** | Arquitectura | Separación de responsabilidades rota: reglas de negocio en JSX |
| A-09 | **BAJA** | Arquitectura | Seis campos de schema preparados pero nunca usados por la UI |
| B-01 | **CRÍTICA** | Negocio | Timestamps de eventos críticos controlados por el reloj del cliente |
| B-02 | **CRÍTICA** | Negocio | Upload de foto + insert de evidencia + update de pedido no son atómicos |
| B-03 | **ALTA** | Negocio | Estado `en_camino` inalcanzable: ningún flujo de UI lo produce |
| B-04 | **ALTA** | Negocio | Máquina de estados sin enforcement en la base de datos |
| B-05 | **ALTA** | Negocio | `fn_registrar_cambio_estado` nunca registra quién cambió el estado |
| B-06 | **ALTA** | Negocio | `fn_actualizar_contadores_ruta` ignora la ruta anterior al reasignar |
| B-07 | **ALTA** | Negocio | `intento_numero` nunca se incrementa aunque está diseñado para eso |
| B-08 | **ALTA** | Negocio | `fecha_reprogramada` nunca se captura al reprogramar un pedido |
| B-09 | **ALTA** | Negocio | Estado inicial del pedido no queda registrado en `historial_estados` |
| B-10 | **MEDIA** | Negocio | No existe flujo de cancelación de pedidos |
| B-11 | **MEDIA** | Negocio | Sin validación de disponibilidad del repartidor al crear una ruta |
| B-12 | **MEDIA** | Negocio | `v_resumen_dia` sin filtro de rol: todos ven métricas globales |
| B-13 | **MEDIA** | Negocio | Pedido creado con ruta salta directamente a `listo_despacho` |
| B-14 | **BAJA** | Negocio | Ruta puede existir sin repartidor asignado sin advertencia |
| B-15 | **BAJA** | Negocio | `requiere_foto` validado solo en frontend, bypasseable vía API |

---

## SECCIÓN A — Arquitectura y Estructura

---

### A-01 · CRÍTICA — RLS habilitado pero sin enforcement real de roles

**Ubicación:** Supabase dashboard — todas las políticas de las 9 tablas  
**Verificado con:** `pg_policies` (consultado en Fase 1)

**Descripción:**  
Row Level Security está activado en las 9 tablas del schema `public`. Sin embargo, **todas las políticas tienen exactamente la misma forma**:

```sql
-- Ejemplo representativo (igual en clientes, pedidos, rutas, repartidores, etc.)
CREATE POLICY "Acceso autenticado – pedidos" ON public.pedidos
  FOR ALL USING (auth.role() = 'authenticated');
```

La condición `auth.role() = 'authenticated'` solo distingue entre "usuario anónimo" y "usuario con sesión activa". No diferencia entre admin, operador, supervisor y repartidor. Resultado:

- Un **repartidor** autenticado puede leer y modificar pedidos de otros repartidores, ver todos los clientes, alterar rutas ajenas y leer la tabla `usuarios` completa — directamente desde la consola del navegador o con `curl`.
- La **tabla `configuracion`** tiene el comentario "Solo admin" en su política, pero su implementación real permite a cualquier autenticado hacer ALL.
- La única separación real por usuario está en la **vista** `v_repartidor_mis_pedidos`, que filtra por `rep.auth_user_id = auth.uid()`. Pero eso solo afecta a esa vista; la tabla `pedidos` subyacente no tiene restricción.

**El enforcement de roles vive exclusivamente en React (`ProtectedRoute` y condicionales en el frontend), que es bypasseable trivialmente.**

**Recomendación:**  
Reemplazar las políticas genéricas por políticas granulares usando la función `auth.uid()` y una función helper que lea el rol desde `public.usuarios`:

```sql
-- Función helper (crear una vez)
CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS rol_usuario LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid();
$$;

-- Ejemplo: solo admin/operador/supervisor pueden ver todos los pedidos;
-- repartidor solo ve los de sus rutas del día
CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT USING (
  mi_rol() IN ('admin', 'operador', 'supervisor')
  OR EXISTS (
    SELECT 1 FROM rutas r
    JOIN repartidores rep ON rep.id = r.repartidor_id
    WHERE r.id = pedidos.ruta_id
      AND rep.auth_user_id = auth.uid()
      AND r.fecha = CURRENT_DATE
  )
);
```

---

### A-02 · ALTA — Máquina de estados fragmentada en tres capas sin contrato compartido

**Ubicación:**  
- `src/pages/PedidoDetalle.tsx:21-27` — objeto `ACCIONES` (transiciones del operador)  
- `src/pages/repartidor/PedidoAccion.tsx:158-160` — variables `mostrar*` (transiciones del repartidor)  
- Base de datos — ningún trigger valida transiciones

**Descripción:**  
La máquina de estados de un pedido está definida de forma **dispersa e implícita** en tres lugares distintos:

```tsx
// PedidoDetalle.tsx — lo que puede hacer el OPERADOR
const ACCIONES = {
  recibido:       [{ siguiente: 'verificado'     }],
  verificado:     [{ siguiente: 'en_preparacion' }],
  en_preparacion: [{ siguiente: 'listo_despacho' }],
  no_entregado:   [{ siguiente: 'reprogramado'   }],
  reprogramado:   [{ siguiente: 'listo_despacho' }],
  // 'listo_despacho', 'recogido', 'en_camino', 'entregado' → sin acciones
}

// PedidoAccion.tsx — lo que puede hacer el REPARTIDOR
const mostrarRecogido    = ['listo_despacho'].includes(pedido.estado)
const mostrarEntregado   = ['recogido', 'en_camino'].includes(pedido.estado)
const mostrarNoEntregado = ['recogido', 'en_camino'].includes(pedido.estado)
```

No existe ningún objeto o módulo central que declare el grafo completo de transiciones válidas. La BD no rechaza ninguna transición. Un UPDATE directo puede llevar `entregado → recibido` sin ningún error.

**Grafo real de lo que la UI permite hoy:**
```
recibido ──(op)──► verificado ──(op)──► en_preparacion ──(op)──► listo_despacho
                                                                        │
                                                                  (rep: recogido)
                                                                        │
                                                                     recogido ──(rep)──► entregado
                                                                        │
                                                                  (rep: no_entregado)
                                                                        │
                                                               no_entregado ──(op)──► reprogramado ──(op)──► listo_despacho
                                                               
en_camino: alcanzable desde el grafo pero NINGUNA acción lo produce
```

**Recomendación:**  
Centralizar la máquina de estados en `src/lib/stateMachine.ts`:

```ts
export const TRANSICIONES_VALIDAS: Partial<Record<EstadoPedido, EstadoPedido[]>> = {
  recibido:       ['verificado'],
  verificado:     ['en_preparacion'],
  en_preparacion: ['listo_despacho'],
  listo_despacho: ['recogido'],
  recogido:       ['en_camino', 'entregado', 'no_entregado'],
  en_camino:      ['entregado', 'no_entregado'],
  no_entregado:   ['reprogramado'],
  reprogramado:   ['listo_despacho'],
}
```

Y agregar un trigger de validación en PostgreSQL que rechace transiciones no permitidas.

---

### A-03 · ALTA — Acceso directo a Supabase desde 6 páginas, patrón inconsistente

**Ubicación:**  
- `src/pages/Dashboard.tsx:49-54` — `Promise.all([supabase.from(...), ...])`  
- `src/pages/RutaDetalle.tsx:25-49` — fetch secuencial directo  
- `src/pages/Reportes.tsx:62-145` — fetch complejo con múltiples queries  
- `src/pages/Repartidores.tsx:38-70` — fetch + N+1 queries  
- `src/pages/Clientes.tsx:24-45` — fetch + N+1 queries  
- `src/pages/Rutas.tsx:38-46` — fetch adicional dentro del modal  

**Descripción:**  
El proyecto tiene 3 hooks de data-fetching (`usePedidos`, `useRutas`, `useRepartidorPedidos`) que abstraen correctamente el acceso a Supabase. Sin embargo, 6 páginas importan y usan `supabase` directamente, saltando esa capa. Esto crea inconsistencia: cambiar la fuente de datos (por ejemplo, añadir caché, reintentos, o Supabase Realtime) requeriría modificar páginas en lugar de hooks. El patrón varía sin razón aparente entre páginas de la misma categoría.

**Recomendación:**  
Mover toda la lógica de fetching a hooks. Por ejemplo, `Dashboard.tsx` debería usar un `useDashboard()` que devuelva `{ resumen, pedidosRecientes, rutasActivas, loading }`.

---

### A-04 · ALTA — `NAV_ITEMS` duplicado entre `Sidebar.tsx` y `Header.tsx`

**Ubicación:**  
- `src/components/layout/Sidebar.tsx:8-15`  
- `src/components/layout/Header.tsx:6-13`

**Descripción:**  
El mismo array de rutas de navegación está definido dos veces con código idéntico:

```ts
// Sidebar.tsx:8-15  (y Header.tsx:6-13 — exactamente igual)
const NAV_ITEMS = [
  { to: '/dashboard',    icon: Home,      label: 'Inicio' },
  { to: '/pedidos',      icon: Package,   label: 'Pedidos' },
  { to: '/rutas',        icon: MapPin,    label: 'Rutas' },
  { to: '/repartidores', icon: Truck,     label: 'Repartidores' },
  { to: '/clientes',     icon: Users,     label: 'Clientes' },
  { to: '/reportes',     icon: BarChart2, label: 'Reportes' },
]
```

Agregar o renombrar una ruta requiere editar dos archivos. Históricamente este tipo de duplicación produce divergencias silenciosas.

**Recomendación:**  
Mover a `src/components/layout/nav.ts` y exportar desde ahí.

---

### A-05 · ALTA — `PedidoDetalle` vive en `/pages` pero es un componente drawer

**Ubicación:**  
- `src/pages/PedidoDetalle.tsx:1` — archivo  
- `src/App.tsx:84-88` — ruta `/pedidos/:id` que renderiza `<Pedidos />` en vez del detalle

**Descripción:**  
`PedidoDetalle` es un drawer modal que se renderiza encima de la lista de pedidos. No es una página routable. Sin embargo:

1. Vive en `src/pages/` en lugar de `src/components/`.
2. Se exporta como **named export** (no `default`), lo que es el patrón de componentes, no de páginas.
3. La ruta `/pedidos/:id` en `App.tsx` existe pero renderiza `<Pedidos />` (la lista), no el detalle. Navegar directamente a `/pedidos/some-uuid` muestra la lista vacía sin abrir el drawer.
4. Se usa desde dos páginas distintas (`Pedidos.tsx` y `RutaDetalle.tsx`) pasándole `pedidoId` como prop.

Esto rompe el modelo mental del proyecto: las páginas son rutas, los componentes son reutilizables. Un link directo a un pedido no funciona.

**Recomendación:**  
Mover a `src/components/shared/PedidoDetalleDrawer.tsx`. Para los links directos, implementar sincronización URL en `Pedidos.tsx` leyendo el param de la ruta.

---

### A-06 · MEDIA — Estilos de prioridad definidos dos veces con valores distintos

**Ubicación:**  
- `src/lib/utils.ts:59-63` — `PRIORIDAD_COLORS` (para badges)  
- `src/pages/PedidoNuevo.tsx:39-50` — `PRIORIDAD_BTN` + `PRIORIDAD_ACTIVE` (para botones del formulario)

**Descripción:**  
El concepto "prioridad 0–3 con color" está implementado dos veces con clases Tailwind distintas. `utils.ts` usa `bg-gray/blue/orange/red-100` con texto. `PedidoNuevo.tsx` define además variantes activas con fondos sólidos. No hay fuente de verdad única. Agregar un nuevo nivel de prioridad requiere actualizar ambos lugares.

**Recomendación:**  
Consolidar en `utils.ts` como un objeto `PRIORIDAD` con sub-keys `badge`, `btn`, `btnActive`.

---

### A-07 · MEDIA — Ruta `/configuracion` en sidebar sin página ni route

**Ubicación:**  
- `src/components/layout/Sidebar.tsx:62-79` — `NavLink to="/configuracion"` visible para rol `admin`  
- `src/App.tsx` — ruta `/configuracion` inexistente (cae en el catch-all `*` → `/`)

**Descripción:**  
El sidebar muestra un enlace "Configuración" con ícono a los usuarios admin. Al hacer clic, React Router redirige a `/` (regla catch-all), produciendo un comportamiento confuso sin ningún mensaje de error. La tabla `configuracion` existe en BD con 9 filas, pero no hay UI para leerlas ni modificarlas.

**Recomendación:**  
Implementar la página o eliminar el enlace hasta que esté lista. No dejar UI que lleve a ninguna parte.

---

### A-08 · MEDIA — Reglas de negocio embebidas directamente en JSX

**Ubicación:**  
- `src/pages/PedidoDetalle.tsx:21-27` — `ACCIONES` define la máquina de estados  
- `src/pages/repartidor/PedidoAccion.tsx:158-160` — condiciones de visibilidad de acciones  
- `src/pages/Reportes.tsx:87-90` — lógica de agrupación de estados en el render

**Descripción:**  
Reglas como "desde `listo_despacho` el repartidor puede marcar recogido" o "desde `recogido` se puede marcar entregado o no entregado" están codificadas como condicionales dentro de funciones de render. Esto mezcla **qué se puede hacer** (negocio) con **cómo se muestra** (presentación), dificultando testear las reglas de forma aislada y garantizando que cualquier cambio en el flujo requiera tocar plantillas JSX.

**Recomendación:**  
Extraer predicados de negocio a `src/lib/stateMachine.ts` (ver A-02) y llamarlos desde los componentes: `puedeMarcarRecogido(pedido.estado)`, `accionesOperador(pedido.estado)`.

---

### A-09 · BAJA — Seis columnas de schema preparadas pero nunca usadas

**Ubicación:** `src/types/index.ts` — interface `Pedido` y `Repartidor`; tabla `pedidos` y `repartidores` en BD

**Descripción:**  
Los siguientes campos existen en el schema, en los tipos TypeScript y en ningún lugar del frontend:

| Campo | Tabla | Estado |
|---|---|---|
| `foto_evidencia_url` | `pedidos` | Campo legacy — reemplazado por `foto_{recogido,entregado,no_entregado}_url` |
| `firma_url` | `pedidos` | Preparado para firma digital, sin UI |
| `nombre_receptor` | `pedidos` | Preparado para registrar quien recibe, sin UI |
| `dni_receptor` | `pedidos` | Ídem |
| `codigo_qr` | `pedidos` | Preparado para QR, sin UI |
| `pin_acceso` | `repartidores` | Preparado para autenticación alternativa, sin UI |

No causan bugs activos, pero inflan el schema, confunden a nuevos desarrolladores y aumentan el tamaño del payload de las queries que hacen `SELECT *`.

**Recomendación:**  
Documentar cuáles son roadmap real y cuáles son legacy. Deprecar `foto_evidencia_url` explícitamente.

---

## SECCIÓN B — Lógica de Negocio

---

### B-01 · CRÍTICA — Timestamps de eventos críticos controlados por el reloj del cliente

**Ubicación:**  
- `src/pages/repartidor/PedidoAccion.tsx:106` — `recogido_en = new Date().toISOString()`  
- `src/pages/repartidor/PedidoAccion.tsx:109` — `fecha_entrega_real = new Date().toISOString()`  
- BD: `fn_registrar_cambio_estado` — establece estos campos server-side solo `IF IS NULL`

**Descripción:**  
El trigger `fn_registrar_cambio_estado` tiene lógica de fallback server-side:

```sql
IF NEW.estado = 'recogido' AND NEW.recogido_en IS NULL THEN
  NEW.recogido_en := NOW();
END IF;
IF NEW.estado = 'entregado' AND NEW.fecha_entrega_real IS NULL THEN
  NEW.fecha_entrega_real := NOW();
END IF;
```

Sin embargo, `PedidoAccion.tsx` **siempre** envía estos valores desde el cliente:

```ts
updatePayload.recogido_en = new Date().toISOString()      // línea 106
updatePayload.fecha_entrega_real = new Date().toISOString() // línea 109
```

Dado que el cliente envía los campos con valor, la condición `IS NULL` del trigger nunca se cumple. **El reloj del dispositivo del repartidor determina los timestamps de auditoría.** Un repartidor con la hora incorrecta en su teléfono puede registrar entregas en el pasado o el futuro. Peor aún: con acceso directo a la API, puede enviar cualquier timestamp arbitrario para fabricar registros de entrega.

**Recomendación:**  
Eliminar `recogido_en` y `fecha_entrega_real` del `updatePayload` en `PedidoAccion.tsx`. Dejar que el trigger los establezca siempre con `NOW()` server-side. El trigger ya está preparado para ello — solo hay que quitarle la condición `IS NULL` para hacerlo incondicional:

```sql
IF NEW.estado = 'recogido' THEN
  NEW.recogido_en := NOW();  -- siempre, no solo cuando es NULL
END IF;
```

---

### B-02 · CRÍTICA — Upload de foto + insert de evidencia + update de pedido no son atómicos

**Ubicación:** `src/pages/repartidor/PedidoAccion.tsx:75-119`

**Descripción:**  
La confirmación de una entrega con foto ejecuta **3 operaciones independientes en secuencia**:

```ts
// Paso 1: subir archivo a Storage
const { data: uploadData } = await supabase.storage.from('evidencias').upload(path, foto)

// Paso 2: registrar en tabla evidencias
await supabase.from('evidencias').insert({ pedido_id, tipo, foto_url })

// Paso 3: cambiar estado del pedido
const { error } = await supabase.from('pedidos').update({ estado, foto_*_url }).eq('id', pedidoId)
```

Escenarios de fallo:

| Falla en | Resultado |
|---|---|
| Paso 1 | Error capturado, nada persiste. ✓ |
| Paso 2 | Archivo subido a Storage, sin registro en `evidencias`. **Foto huérfana en Storage.** |
| Paso 3 | Archivo + registro en `evidencias` existen, pero `pedido.estado` no cambió. **Evidencia sin cambio de estado.** |

No existe transacción que envuelva los 3 pasos. El bloque `catch` solo muestra un toast de error pero no revierte lo que ya se persistió.

**Recomendación (dos opciones):**

**Opción A (sin infraestructura adicional):** invertir el orden — primero UPDATE del pedido, luego INSERT de evidencia, luego upload. Si falla el upload, el estado ya cambió (que es lo crítico) y la foto queda pendiente. Agregar lógica de reintento de upload.

**Opción B (robusta):** crear una Supabase Edge Function `confirmar-entrega` que encapsule los 3 pasos en una transacción PostgreSQL (usando `supabase_functions` + transacción SQL para el INSERT y UPDATE; el upload de Storage no puede estar en transacción pero puede verificarse primero).

---

### B-03 · ALTA — Estado `en_camino` existe en el modelo pero ningún flujo lo produce

**Ubicación:**  
- `src/types/index.ts:1-10` — definido en `EstadoPedido`  
- `src/pages/PedidoDetalle.tsx:21-27` — ausente en `ACCIONES`  
- `src/pages/repartidor/PedidoAccion.tsx:97-99` — nunca asignado  
- `src/components/shared/Timeline.tsx:5-8` — incluido en `ESTADOS_ORDEN`  
- `src/pages/repartidor/MiRuta.tsx:9` — incluido en `PENDIENTES`

**Descripción:**  
El estado `en_camino` aparece en el enum, en los estilos de badge, en la línea de tiempo y en el filtro de pedidos pendientes del repartidor. Pero no existe ninguna acción en la UI que transite un pedido a `en_camino`. El repartidor puede solo marcar `recogido`, `entregado` o `no_entregado`. El operador no tiene botón para ello tampoco.

Esto tiene dos consecuencias: (1) el estado es un dead code que confunde al leer el modelo, y (2) si alguna vez se creó un pedido en ese estado vía otra vía, el sistema lo mostraría correctamente pero no habría forma de avanzarlo desde la UI (el repartidor vería botones para `entregado`/`no_entregado` gracias a que `en_camino` está en la lista `['recogido', 'en_camino']`).

**Recomendación:**  
Decisión de producto: o se elimina el estado del enum (y se migra cualquier dato existente) o se implementa la transición `recogido → en_camino` en `PedidoDetalle.tsx` (para el operador que actualiza en tiempo real) y se ajusta el flujo del repartidor.

---

### B-04 · ALTA — La máquina de estados no tiene enforcement en la base de datos

**Ubicación:** BD — tabla `pedidos`, ningún trigger de validación

**Descripción:**  
Dado que las políticas RLS permiten UPDATE a cualquier autenticado (ver A-01), y no existe ningún trigger que valide transiciones, cualquier usuario puede ejecutar:

```js
supabase.from('pedidos').update({ estado: 'recibido' }).eq('id', pedidoId)
// Funciona incluso si el pedido está en estado 'entregado'
```

Un repartidor podría revertir la entrega de un pedido a `recibido`, `entregado` de nuevo, acumular entradas en historial, o pasar directamente de `recibido` a `entregado` sin ningún registro fotográfico.

**Recomendación:**  
Agregar un trigger `BEFORE UPDATE ON pedidos` que valide la transición:

```sql
CREATE OR REPLACE FUNCTION fn_validar_transicion_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NOT (NEW.estado::text = ANY(
      CASE OLD.estado::text
        WHEN 'recibido'       THEN ARRAY['verificado']
        WHEN 'verificado'     THEN ARRAY['en_preparacion']
        WHEN 'en_preparacion' THEN ARRAY['listo_despacho']
        WHEN 'listo_despacho' THEN ARRAY['recogido']
        WHEN 'recogido'       THEN ARRAY['en_camino','entregado','no_entregado']
        WHEN 'en_camino'      THEN ARRAY['entregado','no_entregado']
        WHEN 'no_entregado'   THEN ARRAY['reprogramado']
        WHEN 'reprogramado'   THEN ARRAY['listo_despacho']
        ELSE ARRAY[]::text[]
      END
    )) THEN
      RAISE EXCEPTION 'Transición inválida: % → %', OLD.estado, NEW.estado;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

---

### B-05 · ALTA — `fn_registrar_cambio_estado` nunca registra quién hizo el cambio

**Ubicación:** BD — función `fn_registrar_cambio_estado`; tabla `historial_estados`

**Descripción:**  
El trigger inserta en `historial_estados` así:

```sql
INSERT INTO historial_estados (pedido_id, estado_anterior, estado_nuevo)
VALUES (NEW.id, OLD.estado, NEW.estado);
-- usuario_id → siempre NULL
```

La columna `usuario_id` existe en la tabla con FK a `usuarios`, pero **el trigger nunca la rellena**. Toda la auditoría de estados carece de la información más básica: ¿quién hizo el cambio?

En el frontend, `cambiarEstado()` en `PedidoDetalle.tsx` podría pasar el `user.id` como parte del UPDATE, pero no lo hace. La vista `Timeline.tsx` tampoco muestra "cambiado por".

**Recomendación:**  
Pasar `auth.uid()` al trigger vía `app.settings` o usar directamente `auth.uid()` en la función:

```sql
INSERT INTO historial_estados (pedido_id, usuario_id, estado_anterior, estado_nuevo)
VALUES (NEW.id, auth.uid(), OLD.estado, NEW.estado);
```

Esto funciona en Supabase porque `auth.uid()` está disponible en el contexto del trigger cuando el cambio viene vía PostgREST con JWT.

---

### B-06 · ALTA — `fn_actualizar_contadores_ruta` ignora la ruta anterior al reasignar un pedido

**Ubicación:** BD — función `fn_actualizar_contadores_ruta`

**Descripción:**  
El código completo del trigger:

```sql
BEGIN
  IF NEW.ruta_id IS NOT NULL THEN
    UPDATE rutas SET
      total_pedidos = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id),
      entregados    = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id AND estado = 'entregado'),
      no_entregados = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id AND estado = 'no_entregado')
    WHERE id = NEW.ruta_id;
  END IF;
  RETURN NEW;
END;
```

Si un pedido se mueve de `ruta_id = A` a `ruta_id = B` (o a NULL), solo la ruta B se recalcula. **La ruta A queda con contadores desactualizados** hasta que otro evento la toque. Actualmente no existe UI para reasignar pedidos entre rutas, pero:

1. Sí existe el flujo en `PedidoNuevo.tsx` donde un pedido puede crearse sin ruta y luego asignarse.
2. Si en el futuro se implementa reasignación, este bug se activa.
3. El caso `ruta_id → NULL` (desasignar pedido) tampoco actualiza los contadores de la ruta original.

**Recomendación:**

```sql
BEGIN
  -- Actualizar ruta anterior si el pedido se movia de otra ruta
  IF OLD.ruta_id IS NOT NULL AND OLD.ruta_id IS DISTINCT FROM NEW.ruta_id THEN
    UPDATE rutas SET
      total_pedidos = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = OLD.ruta_id),
      entregados    = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = OLD.ruta_id AND estado = 'entregado'),
      no_entregados = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = OLD.ruta_id AND estado = 'no_entregado')
    WHERE id = OLD.ruta_id;
  END IF;
  -- Actualizar ruta nueva
  IF NEW.ruta_id IS NOT NULL THEN
    UPDATE rutas SET ... WHERE id = NEW.ruta_id;
  END IF;
  RETURN NEW;
END;
```

---

### B-07 · ALTA — `intento_numero` nunca se incrementa

**Ubicación:**  
- `src/types/index.ts:107` — campo `intento_numero: number` en interface `Pedido`  
- BD — columna `intento_numero INT DEFAULT 1` con comentario "Incrementa cada vez que el pedido es reprogramado"  
- `src/pages/PedidoDetalle.tsx:55-72` — `cambiarEstado()` solo actualiza `estado`  
- BD — ningún trigger lo incrementa

**Descripción:**  
El campo `intento_numero` está diseñado para contar cuántas veces se ha intentado entregar un pedido. Esto es útil para escalar pedidos reincidentes a `Urgente` automáticamente, o para reportes de reintento. Sin embargo, `cambiarEstado()` solo hace:

```ts
await supabase.from('pedidos').update({ estado: nuevoEstado }).eq('id', pedidoId)
```

Y no existe ningún trigger que detecte la transición `no_entregado → reprogramado` y ejecute `intento_numero = intento_numero + 1`. El campo siempre vale 1.

**Recomendación:**  
Agregar la lógica al trigger `fn_registrar_cambio_estado`:

```sql
IF NEW.estado = 'reprogramado' AND OLD.estado = 'no_entregado' THEN
  NEW.intento_numero := OLD.intento_numero + 1;
END IF;
```

---

### B-08 · ALTA — `fecha_reprogramada` nunca se captura al reprogramar un pedido

**Ubicación:**  
- `src/pages/PedidoDetalle.tsx:24` — acción `no_entregado → reprogramado`  
- `src/pages/PedidoDetalle.tsx:55-72` — `cambiarEstado()` solo actualiza `estado`  
- `src/types/index.ts:104` — `fecha_reprogramada: string | null`

**Descripción:**  
Cuando el operador hace clic en "Reprogramar", se ejecuta:

```ts
await supabase.from('pedidos').update({ estado: 'reprogramado' }).eq('id', pedidoId)
```

El modal de confirmación solo pregunta "¿Estás seguro?". No hay campo para capturar la nueva fecha de entrega. `fecha_reprogramada` siempre queda `NULL` incluso cuando el pedido está en estado `reprogramado`. El repartidor no sabe para cuándo fue reprogramado, y `v_repartidor_mis_pedidos` no expone este campo.

**Recomendación:**  
Modificar el modal de confirmación para estado `reprogramado` añadiendo un `<Input type="date">` obligatorio, y pasar `{ estado: 'reprogramado', fecha_reprogramada: nuevaFecha, fecha_programada: nuevaFecha }` en el UPDATE.

---

### B-09 · ALTA — El estado inicial del pedido no queda en `historial_estados`

**Ubicación:**  
- BD — trigger `trg_pedidos_historial` — evento `UPDATE` (no `INSERT`)  
- `src/pages/PedidoNuevo.tsx:103` — pedido creado con INSERT  
- `src/components/shared/Timeline.tsx:15-16` — construye el timeline desde `historial`

**Descripción:**  
`fn_registrar_cambio_estado` dispara solo en `UPDATE`. Cuando se crea un pedido (INSERT), el estado inicial (`recibido` o `listo_despacho`) **no genera ninguna entrada en `historial_estados`**. Consecuencias:

1. `Timeline.tsx` calcula `completados = new Set(historial.map(h => h.estado_nuevo))`. El primer estado nunca está en ese set, por lo que aparece como "no completado" en la línea de tiempo aunque sea el estado inicial.
2. No hay registro auditado de cuándo ni quién creó el pedido en el historial de estados.

**Recomendación:**  
Modificar `fn_generar_numero_pedido` (que sí dispara en INSERT) para que además inserte el primer historial:

```sql
INSERT INTO historial_estados (pedido_id, estado_anterior, estado_nuevo, usuario_id)
VALUES (NEW.id, NULL, NEW.estado, auth.uid());
```

O crear un trigger separado `AFTER INSERT ON pedidos`.

---

### B-10 · MEDIA — No existe flujo de cancelación de pedidos

**Ubicación:** `src/types/index.ts:1-10` — `EstadoPedido`; toda la UI

**Descripción:**  
El enum `EstadoPedido` no incluye `cancelado`. No existe UI ni lógica para cancelar un pedido. Si un cliente cancela, el operador no tiene forma de reflejarlo en el sistema. Las opciones actuales son:

- Dejarlo en `recibido` indefinidamente (contamina los reportes del día).
- Marcarlo como `no_entregado` con motivo "otro" (semánticamente incorrecto).
- Borrarlo directamente desde la BD (no hay soft delete en pedidos; borrar violaría FK de `historial_estados` y `evidencias`).

**Recomendación:**  
Agregar estado `cancelado` al enum. Agregar la transición desde cualquier estado pre-despacho (`recibido`, `verificado`, `en_preparacion`) con campo opcional de motivo de cancelación. Tratar `cancelado` como estado terminal (sin transiciones salientes).

---

### B-11 · MEDIA — Sin validación de disponibilidad del repartidor al asignar ruta

**Ubicación:** `src/pages/Rutas.tsx:211-218` — select de repartidor en modal

**Descripción:**  
El dropdown para asignar repartidor a una ruta filtra solo `activo = true`:

```ts
supabase.from('repartidores').select('*').eq('activo', true).order('nombre')
```

No verifica:
1. Si el repartidor ya tiene otra ruta asignada para la misma fecha.
2. Si su `estado` es `disponible` (podría estar en `descanso` o `inactivo`).

Un repartidor podría quedar asignado simultáneamente a dos rutas del mismo día.

**Recomendación:**  
Filtrar repartidores que no tengan otra ruta para la misma fecha:

```ts
// Obtener repartidores ya asignados en esa fecha
const { data: ocupados } = await supabase
  .from('rutas')
  .select('repartidor_id')
  .eq('fecha', form.fecha)
  .not('repartidor_id', 'is', null)

const idsOcupados = ocupados?.map(r => r.repartidor_id) ?? []

// Filtrar del dropdown
repartidores.filter(r => !idsOcupados.includes(r.id) && r.estado === 'disponible')
```

---

### B-12 · MEDIA — `v_resumen_dia` sin filtro de rol: todos ven métricas globales

**Ubicación:**  
- BD — vista `v_resumen_dia`  
- `src/pages/Dashboard.tsx:51` — `supabase.from('v_resumen_dia').select('*').single()`

**Descripción:**  
La vista agrega **todos los pedidos de `fecha_programada = CURRENT_DATE`** sin filtro por usuario o repartidor:

```sql
SELECT count(*), count(*) FILTER (WHERE estado = 'entregado'), ...
FROM pedidos WHERE fecha_programada = CURRENT_DATE;
```

Si en el futuro un repartidor accede al Dashboard (actualmente bloqueado en frontend pero no en BD), vería las métricas globales de toda la empresa. Más inmediatamente: cualquier usuario autenticado que llame directamente a la API ve estos datos agregados.

**Recomendación:**  
Por ahora es un riesgo bajo dado que el Dashboard está protegido en frontend para admin/op/sup. Pero si se añade un rol con dashboard propio (ej. supervisor de zona), la vista necesitará parámetros de filtro.

---

### B-13 · MEDIA — Pedido creado con ruta salta directamente a `listo_despacho`

**Ubicación:** `src/pages/PedidoNuevo.tsx:101`

```ts
const estado = data.ruta_id ? 'listo_despacho' : 'recibido'
```

**Descripción:**  
Cuando el operador asigna una ruta al crear el pedido, el estado inicial es `listo_despacho`, saltando `recibido → verificado → en_preparacion`. Esto implica que:

1. No hay verificación ni preparación formal registrada.
2. El historial de estados nacerá vacío (ver B-09) y la primera entrada reflejará ya `listo_despacho`.
3. `intento_numero` empieza en 1 pero sin contexto previo de preparación.

En algunos flujos esto puede ser intencional (pedidos express), pero no está documentado como caso especial y no hay forma de distinguirlo de un pedido que pasó por el flujo completo.

**Recomendación:**  
Si el salto de estados es intencional, documentarlo explícitamente y agregar un campo `tipo_pedido` (`express` vs `estandar`) para diferenciarlo en reportes. Si no es intencional, crear el pedido siempre como `recibido` y dejar que el flujo normal lo avance.

---

### B-14 · BAJA — Ruta puede tener `repartidor_id = NULL` sin advertencia

**Ubicación:** `src/pages/Rutas.tsx:49` — `repartidor_id: form.repartidor_id || null`

**Descripción:**  
Una ruta puede crearse sin repartidor asignado. Los pedidos asignados a esa ruta tendrán `estado = 'listo_despacho'` pero no podrán ser recogidos por nadie (la vista `v_repartidor_mis_pedidos` filtra por `rep.auth_user_id = auth.uid()` y no devolvería nada si no hay repartidor). La ruta aparecería en el Dashboard como activa sin avance.

**Recomendación:**  
Mostrar un aviso en el modal de creación si se intenta guardar sin repartidor. No es necesario bloquearlo, pero sí informar.

---

### B-15 · BAJA — `requiere_foto` validado solo en frontend, bypasseable vía API

**Ubicación:** `src/pages/repartidor/PedidoAccion.tsx:61-65`

```ts
const puedeConfirmar = accion !== null
  && (!pedido?.requiere_foto || foto !== null)
  && (accion !== 'no_entregado' || motivo !== null)
```

**Descripción:**  
Si `requiere_foto = true`, el botón de confirmación queda deshabilitado hasta que se adjunte una foto. Sin embargo, un repartidor con acceso directo a la API puede hacer `UPDATE pedidos SET estado='entregado'` sin foto, ya que no hay trigger ni constraint que lo impida en la BD.

**Recomendación:**  
Agregar en el trigger `fn_registrar_cambio_estado` una validación para transiciones hacia `entregado`:

```sql
IF NEW.estado = 'entregado' AND NEW.requiere_foto = true
   AND NEW.foto_entregado_url IS NULL THEN
  RAISE EXCEPTION 'Este pedido requiere foto de evidencia para marcar como entregado';
END IF;
```

---

## Resumen de severidades

```
CRÍTICA  ████ A-01, B-01, B-02
ALTA     ████████████████████████ A-02, A-03, A-04, A-05, B-03, B-04, B-05, B-06, B-07, B-08, B-09
MEDIA    ████████████ A-06, A-07, A-08, B-10, B-11, B-12, B-13
BAJA     ████ A-09, B-14, B-15
```

## Dependencias entre hallazgos

```
A-01 (RLS sin roles) ──── agrava ────► B-04 (sin validación de estados en BD)
                    └──── agrava ────► B-15 (requiere_foto bypasseable)
A-02 (FSM fragmentada) ── causa ────► B-03 (en_camino inalcanzable)
B-05 (sin usuario_id) ─── agrava ───► B-09 (historial sin contexto)
B-01 (timestamps cliente) ── contradice ── fn_registrar_cambio_estado (BD tiene lógica server-side ignorada)
```
