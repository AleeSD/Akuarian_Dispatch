# Auditoría — 03. Concurrencia, Rendimiento y Escalabilidad

**Proyecto:** Akuarian Dispatch  
**Fecha:** 2026-06-14  
**Fuentes:** código fuente completo + consultas directas a PostgreSQL (EXPLAIN, pg_trigger, pg_indexes, pg_constraint)

---

## Índice de hallazgos

| ID | Severidad | Área | Título abreviado |
|---|---|---|---|
| C-01 | **CRÍTICA** | Concurrencia | Race condition: dos operadores asignan los mismos pedidos a rutas distintas |
| C-02 | **ALTA** | Concurrencia | Sin control de concurrencia optimista en cambios de estado |
| C-03 | **ALTA** | Concurrencia | Confirmación de entrega no idempotente bajo reintentos de red |
| C-04 | **MEDIA** | Concurrencia | Sin Realtime: operadores simultáneos trabajan sobre datos desactualizados |
| C-05 | **MEDIA** | Concurrencia | `fetchReportes` sin `AbortController`: respuesta tardía sobreescribe la actual |
| C-06 | **MEDIA** | Concurrencia | Búsqueda de pedidos sin debounce — una query SQL por cada tecla pulsada |
| P-01 | **CRÍTICA** | Rendimiento | N+1 en Clientes: N queries de `COUNT` por página (una por cliente) |
| P-02 | **CRÍTICA** | Rendimiento | N+1 en Repartidores: 2N queries por página (dos por repartidor) |
| P-03 | **ALTA** | Rendimiento | N+1 en Reportes: M queries por repartidor + agregación total en JavaScript |
| P-04 | **ALTA** | Rendimiento | `trg_rutas_contadores` sin `WHEN`: 3 `COUNT(*)` por cada UPDATE de cualquier campo de pedidos |
| P-05 | **ALTA** | Rendimiento | `v_pedidos_detalle`: 2 subqueries correlacionadas por fila para contar evidencias |
| P-06 | **ALTA** | Rendimiento | ILIKE con wildcard inicial `%…%` sin índice trigram — full scan en cada búsqueda |
| P-07 | **ALTA** | Rendimiento | Plan de ejecución subóptimo: `fecha_programada` aplicada como Filter, no como Index Cond |
| P-08 | **ALTA** | Rendimiento | Sin paginación en Pedidos, Clientes ni Reportes — todo cargado en memoria |
| P-09 | **MEDIA** | Rendimiento | Sin estrategia de caché — cada navegación recarga todo desde cero |
| P-10 | **MEDIA** | Rendimiento | `SELECT *` sobre `v_pedidos_detalle` activa subqueries costosas aunque no se necesiten |
| P-11 | **MEDIA** | Rendimiento | `RutaDetalle` hace 2 queries secuenciales donde podría hacer 1 |
| P-12 | **MEDIA** | Rendimiento | Índice compuesto `(fecha_programada, estado)` faltante para el filtro más frecuente |

---

## SECCIÓN C — Concurrencia

---

### C-01 · CRÍTICA — Race condition: dos operadores asignan los mismos pedidos a rutas distintas

**Ubicación:** `src/pages/Rutas.tsx:48-77`  
**Verificado con:** `pg_constraint` — no existe UNIQUE ni constraint sobre `pedidos.ruta_id`

**Descripción:**  
La creación de una ruta con pedidos asignados involucra dos operaciones no atómicas en secuencia:

```ts
// Paso 1: INSERT de la ruta
const { data: ruta } = await supabase.from('rutas').insert({
  total_pedidos: seleccionados.size,   // ← fijado en el cliente
}).select().single()

// Paso 2: UPDATE de los pedidos para asignarlos
await supabase.from('pedidos')
  .update({ ruta_id: ruta.id, estado: 'listo_despacho' })
  .in('id', Array.from(seleccionados))
```

**Escenario de race condition:**

```
Tiempo  Operador A                          Operador B
──────  ────────────────────────────────    ────────────────────────────────
t0      Abre modal — ve pedidos [1,2,3]     Abre modal — ve pedidos [2,3,4]
t1      Selecciona [1,2,3]                  Selecciona [2,3,4]
t2      INSERT ruta_A (total_pedidos=3)     INSERT ruta_B (total_pedidos=3)
t3      UPDATE pedidos [1,2,3] → ruta_A     UPDATE pedidos [2,3,4] → ruta_B
t4                                          ← Pedidos 2 y 3 ahora son de ruta_B
t5      ruta_A dice tener 3 pedidos,        ruta_B tiene pedidos [2,3,4] ✓
        pero solo tiene pedido [1]  ✗
```

**Consecuencias concretas:**
- El trigger `fn_actualizar_contadores_ruta` recalculará `total_pedidos` de ruta_A al actualizar pedidos 2 y 3 (los sacará de ruta_A), dejando ruta_A con 1 pedido real pero `total_pedidos` mostrando un valor desincronizado hasta el siguiente evento.
- No hay ningún error, aviso ni bloqueo. Ambos operadores ven "Ruta creada correctamente".
- El operador A no sabe que perdió 2 de sus 3 pedidos.

**No existe UNIQUE ni FOR UPDATE** sobre `pedidos.ruta_id` — el schema lo confirma: el único constraint sobre `ruta_id` es la FK (`ON DELETE SET NULL`).

**Recomendación:**  
Mover la lógica de asignación a una función PostgreSQL que ejecute ambas operaciones en una sola transacción con lock explícito:

```sql
CREATE OR REPLACE FUNCTION asignar_pedidos_a_ruta(
  p_nombre TEXT, p_repartidor_id UUID, p_fecha DATE,
  p_creado_por UUID, p_pedido_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_ruta_id UUID;
BEGIN
  -- Verificar que los pedidos no tengan ruta aún (con lock)
  PERFORM id FROM pedidos
  WHERE id = ANY(p_pedido_ids)
    AND ruta_id IS NOT NULL
  FOR UPDATE;  -- lock hasta fin de transacción

  IF FOUND THEN
    RAISE EXCEPTION 'Uno o más pedidos ya fueron asignados a otra ruta';
  END IF;

  INSERT INTO rutas (nombre, repartidor_id, fecha, creado_por)
  VALUES (p_nombre, p_repartidor_id, p_fecha, p_creado_por)
  RETURNING id INTO v_ruta_id;

  UPDATE pedidos SET ruta_id = v_ruta_id, estado = 'listo_despacho'
  WHERE id = ANY(p_pedido_ids);

  RETURN v_ruta_id;
END;
$$;
```

Llamar esta función como RPC desde el frontend en lugar de los dos `.insert()` + `.update()` separados.

---

### C-02 · ALTA — Sin control de concurrencia optimista en cambios de estado

**Ubicación:** `src/pages/PedidoDetalle.tsx:55-72` — función `cambiarEstado()`

**Descripción:**  
El cambio de estado de un pedido es un `UPDATE` sin validación del estado previo:

```ts
async function cambiarEstado(nuevoEstado: EstadoPedido) {
  const { error } = await supabase
    .from('pedidos')
    .update({ estado: nuevoEstado })
    .eq('id', pedidoId)
    // ← sin .eq('estado', estadoEsperado)
}
```

**Escenario de doble procesamiento:**

```
Tiempo  Operador A (abre pedido #5, estado: 'recibido')
t0      Lee estado = 'recibido', ve botón "Verificar"
t1      Operador B también abre pedido #5 y hace clic en "Verificar"
        → pedido pasa a 'verificado', historial registra recibido→verificado
t2      Operador A hace clic en "Verificar" (su UI aún muestra 'recibido')
        → UPDATE estado='verificado' WHERE id=pedidoId
        → Sin el fix de B-04 (trigger de validación): UPDATE exitoso, pero el estado
          ya era 'verificado'. Se genera una segunda entrada en historial: verificado→verificado
        → Con el fix de B-04: el trigger rechazaría la transición inválida verificado→verificado
```

Sin lock optimista, la UI de A no tiene forma de detectar que el estado cambió entre que lo leyó y que envió el UPDATE. El resultado es historial contaminado o error confuso para el usuario.

**Recomendación:**  
Agregar el estado actual como condición en el UPDATE y verificar si se actualizó alguna fila:

```ts
async function cambiarEstado(nuevoEstado: EstadoPedido) {
  const { data, error } = await supabase
    .from('pedidos')
    .update({ estado: nuevoEstado })
    .eq('id', pedidoId)
    .eq('estado', pedido!.estado)   // ← optimistic lock: solo si estado no cambió
    .select('id')

  if (!error && (!data || data.length === 0)) {
    toast.error('El pedido fue modificado por otro usuario. Recargando...')
    await fetchDetalle()
    return
  }
}
```

---

### C-03 · ALTA — Confirmación de entrega no es idempotente bajo reintentos de red

**Ubicación:** `src/pages/repartidor/PedidoAccion.tsx:67-133`

**Descripción:**  
La función `confirmar()` ejecuta 3 operaciones independientes (también documentado en B-02 desde el ángulo de atomicidad; aquí el foco es la idempotencia bajo concurrencia):

```
Paso 1: Storage.upload(foto)         → Storage
Paso 2: evidencias.insert(registro)  → PostgreSQL
Paso 3: pedidos.update(estado)       → PostgreSQL
```

**Escenario de reintento por timeout:**

```
t0   Repartidor toca "Confirmar entrega"
t1   Paso 1 completa: foto subida a Storage ✓
t2   Paso 2 completa: registro en evidencias ✓  
t3   Paso 3 inicia: UPDATE pedidos SET estado='entregado'
t4   Red se cae — la solicitud no recibe respuesta en el cliente
t5   El UPDATE SÍ llegó al servidor y se ejecutó ✓ (server committed)
t6   Cliente muestra error de timeout
t7   Repartidor intenta de nuevo (navigate('/mi-ruta') + vuelve al mismo pedido)
t8   El pedido ya está en 'entregado' — la UI muestra otros botones, el repartidor confundido
```

No hay idempotency key. Un segundo intento distinto podría:
- Subir una segunda foto (nuevo archivo en Storage)
- Insertar un segundo registro en `evidencias`
- El UPDATE de estado ya fue aplicado (podría fallar si se agrega B-04)

Resultado: pedido con dos registros de evidencia para la misma entrega, dos archivos en Storage.

**Recomendación (corto plazo):**  
Verificar el estado actual antes de ejecutar cualquier paso:

```ts
async function confirmar() {
  // Verificar estado actual antes de proceder
  const { data: current } = await supabase
    .from('pedidos').select('estado').eq('id', pedidoId).single()
  
  if (current?.estado === estadoNuevo) {
    // Ya fue procesado (reintento) — ir directo a éxito
    navigate('/mi-ruta')
    return
  }
  // ... resto de la lógica
}
```

**Recomendación (largo plazo):** Edge Function `confirmar-entrega` con idempotency key (UUID generado en el cliente al iniciar la acción, verificado en servidor antes de procesar).

---

### C-04 · MEDIA — Sin Realtime: operadores simultáneos trabajan sobre datos desactualizados

**Ubicación:** todos los hooks y páginas — ninguno usa `supabase.channel().on()`

**Descripción:**  
Ninguna pantalla del sistema tiene suscripciones Realtime de Supabase. En un centro de operaciones donde 2-3 operadores gestionan simultáneamente el mismo día de despacho:

- Un operador que crea un pedido no aparece en la lista del otro hasta que refresca.
- Un repartidor que marca entrega no actualiza el Dashboard ni la lista de Pedidos del operador.
- Las métricas de `v_resumen_dia` en el Dashboard son un snapshot del momento de carga.
- La lista de "Pedidos recientes" puede mostrar estados obsoletos durante toda una jornada.

Esto es especialmente crítico en `PedidoDetalle` (el drawer): si un operador tiene abierto el detalle de un pedido mientras el repartidor lo marca como entregado, el operador sigue viendo "Listo para despacho" con el botón de acción del operador activo.

**Recomendación:**  
Agregar Realtime en las páginas de mayor tráfico operacional:

```ts
// En usePedidos.ts
useEffect(() => {
  fetchPedidos()
  const channel = supabase
    .channel('pedidos-cambios')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos' },
      () => fetchPedidos()   // o invalidar caché con React Query
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [fetchPedidos])
```

Prioridad: `usePedidos` (lista principal) → `PedidoDetalle` (drawer abierto) → Dashboard.

---

### C-05 · MEDIA — `fetchReportes` sin `AbortController`: respuesta tardía gana sobre la reciente

**Ubicación:** `src/pages/Reportes.tsx:58-62`

```ts
useEffect(() => {
  fetchReportes()          // ← sin cancelación de la anterior
}, [desde, hasta, repFiltro])
```

**Descripción:**  
Si el operador cambia el rango de fechas rápidamente (ajusta `desde` y luego `hasta` en segundos), se lanzan múltiples `fetchReportes()` concurrentes. La que resuelva **última** (no la más reciente) es la que setea el estado:

```
t0  fetchReportes() para "Ene-Jun" — request A, largo (6 meses de datos)
t1  Usuario cambia a "Jun 1-7"     — request B, corto
t2  Request B resuelve → UI muestra semana Jun 1-7 ✓
t3  Request A resuelve → UI sobreescribe con Ene-Jun ✗ (datos viejos ganan)
```

No hay `AbortController` ni token de cancelación. El estado de la UI puede quedar inconsistente con los filtros visibles.

**Recomendación:**

```ts
useEffect(() => {
  const controller = new AbortController()
  fetchReportes(controller.signal)
  return () => controller.abort()
}, [desde, hasta, repFiltro])
```

O migrar a React Query / TanStack Query que maneja esto automáticamente.

---

### C-06 · MEDIA — Búsqueda de pedidos sin debounce — una query SQL por tecla pulsada

**Ubicación:**  
- `src/pages/Pedidos.tsx:29-33` — `usePedidos({ busqueda })` sin debounce  
- `src/pages/Clientes.tsx:47-50` — tiene debounce de 300ms ✓ (contraste)  
- `src/hooks/usePedidos.ts:31-34` — dispara query en cada cambio de `filtros.busqueda`

**Descripción:**  
En `Pedidos.tsx`, el campo de búsqueda actualiza `busqueda` en cada keystroke sin debounce:

```ts
// Pedidos.tsx
<Input
  value={busqueda}
  onChange={(e) => setBusqueda(e.target.value)}   // sin debounce
/>
```

Cada cambio de `busqueda` → recrea `fetchPedidos` (useCallback) → dispara `useEffect` → nueva query contra `v_pedidos_detalle`. Escribir "AKU-2024" genera 8 queries independientes en menos de un segundo.

Por contraste, `Clientes.tsx` hace exactamente esto bien:
```ts
// Clientes.tsx — correcto
useEffect(() => {
  const timer = setTimeout(fetchClientes, 300)
  return () => clearTimeout(timer)
}, [busqueda])
```

**Recomendación:**  
Agregar debounce en `Pedidos.tsx` usando el mismo patrón de `Clientes.tsx`, o crear un hook `useDebounce(value, delay)` compartido:

```ts
// src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Pedidos.tsx
const busquedaDebounced = useDebounce(busqueda, 300)
const { pedidos } = usePedidos({ busqueda: busquedaDebounced || undefined, ... })
```

---

## SECCIÓN P — Rendimiento y Escalabilidad

---

### P-01 · CRÍTICA — N+1 en Clientes: N queries de `COUNT` paralelas por cada cliente visible

**Ubicación:** `src/pages/Clientes.tsx:33-44`

**Descripción:**

```ts
const withCounts = await Promise.all(
  data.map(async (c) => {
    const { count } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', c.id)       // ← 1 query por cliente
    return { ...c, total_pedidos: count ?? 0 }
  })
)
```

**Costo real:** Para `N` clientes activos → `N` queries `COUNT(*)` paralelas, cada una con un `Index Scan` sobre `idx_pedidos_cliente`. Con 100 clientes: 100 hits a Supabase en cada carga de la página de clientes.

**Esta operación también se repite cada vez que cambia el campo de búsqueda** (con 300ms de debounce) — el conteo se recalcula para todos los clientes en cada búsqueda.

**Recomendación:**  
Reemplazar con una sola query agregada:

```ts
// Una sola query en lugar de N
const { data } = await supabase
  .from('clientes')
  .select(`
    *,
    total_pedidos:pedidos(count)
  `)
  .eq('activo', true)
  .order('nombre')
```

O crear una vista `v_clientes_con_totales` con el COUNT como columna calculada.

---

### P-02 · CRÍTICA — N+1 en Repartidores: 2N queries por cada carga de página

**Ubicación:** `src/pages/Repartidores.tsx:48-69`

**Descripción:**

```ts
const pedidosCounts = await Promise.all(
  data.map(async (rep) => {
    // Query 1: obtener rutas del repartidor hoy
    const { data: rutas } = await supabase
      .from('rutas').select('id')
      .eq('repartidor_id', rep.id).eq('fecha', today())

    if (!rutas || rutas.length === 0) return { id: rep.id, count: 0 }

    // Query 2: contar pedidos en esas rutas
    const { count } = await supabase
      .from('pedidos').select('id', { count: 'exact', head: true })
      .in('ruta_id', rutaIds)

    return { id: rep.id, count: count ?? 0 }
  })
)
```

**Costo real:** Con 10 repartidores → hasta 20 queries en paralelo. Con 30 repartidores → 60 queries.

**Recomendación:**  
Una sola query con JOIN:

```ts
const { data } = await supabase
  .from('repartidores')
  .select(`
    *,
    rutas!rutas_repartidor_id_fkey(
      pedidos(count)
    )
  `)
  .eq('activo', true)
  .eq('rutas.fecha', today())
  .order('nombre')
```

O mediante SQL directo:

```sql
SELECT r.*, COALESCE(p.total, 0) AS pedidos_hoy
FROM repartidores r
LEFT JOIN (
  SELECT ru.repartidor_id, COUNT(p.id) AS total
  FROM rutas ru
  JOIN pedidos p ON p.ruta_id = ru.id
  WHERE ru.fecha = CURRENT_DATE
  GROUP BY ru.repartidor_id
) p ON p.repartidor_id = r.id
WHERE r.activo = true
ORDER BY r.nombre;
```

---

### P-03 · ALTA — N+1 en Reportes: M queries por repartidor + toda la agregación en JavaScript

**Ubicación:** `src/pages/Reportes.tsx:106-145`

**Descripción:**  
El módulo de reportes ejecuta tres rondas de queries:

```
Round 1: SELECT pedidos WHERE fecha BETWEEN desde AND hasta       → 1 query
Round 2: SELECT rutas WHERE fecha BETWEEN desde AND hasta         → 1 query
Round 3: por cada repartidor único en Round 2:
         SELECT pedidos WHERE ruta_id IN (rutaIds del repartidor)  → M queries
```

Luego toda la agregación (conteo por día, conteo por estado, tasa de entrega) ocurre en JavaScript en el navegador. Con un rango de 30 días y 10 repartidores: **12 queries mínimas** más lo que tarde el procesamiento en JS de potencialmente miles de filas.

Adicionalmente, el bar chart procesa datos en JS:
```ts
pedidos.forEach((p) => {
  if (p.estado === 'entregado') byDay[d].entregado++
  // ...
})
```
Esto debería ser un `GROUP BY fecha_programada, estado` en SQL.

**Recomendación:**  
Reemplazar con una sola query SQL con `GROUP BY`:

```sql
-- Reemplaza los 3 rounds de queries + JavaScript
SELECT
  fecha_programada,
  estado,
  rep.nombre AS repartidor_nombre,
  COUNT(*) AS total
FROM pedidos p
JOIN rutas ru ON ru.id = p.ruta_id
JOIN repartidores rep ON rep.id = ru.repartidor_id
WHERE p.fecha_programada BETWEEN $1 AND $2
GROUP BY p.fecha_programada, p.estado, rep.nombre
ORDER BY p.fecha_programada, rep.nombre;
```

---

### P-04 · ALTA — `trg_rutas_contadores` dispara 3 `COUNT(*)` en cada UPDATE de cualquier campo de pedidos

**Ubicación:** BD — trigger `trg_rutas_contadores` + función `fn_actualizar_contadores_ruta`  
**Verificado con:** `pg_get_triggerdef` — sin cláusula `WHEN`

**Descripción:**  
El trigger está definido como:

```sql
CREATE TRIGGER trg_rutas_contadores
AFTER INSERT OR UPDATE ON pedidos    -- ← todos los UPDATEs, sin condición
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_contadores_ruta();
```

**Sin cláusula `WHEN`**, dispara en CADA UPDATE de pedidos — incluyendo cambios de `observaciones`, `foto_entregado_url`, `peso_kg`, `descripcion_carga`, etc. — campos que no afectan los contadores de la ruta.

La función ejecuta **3 COUNT(*) correlated queries** contra toda la tabla `pedidos`:

```sql
total_pedidos = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id),
entregados    = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id AND estado = 'entregado'),
no_entregados = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id AND estado = 'no_entregado')
```

**Costo real:** Un repartidor que confirma 20 entregas (20 UPDATEs de `estado` + `foto_entregado_url` + `fecha_entrega_real`) genera **60 COUNT queries adicionales** solo en el trigger, más las que ya dispara `fn_registrar_cambio_estado`. A medida que la tabla `pedidos` crece, estos COUNT se vuelven más costosos aunque `idx_pedidos_ruta` los mitigue parcialmente.

**Recomendación:**  
Agregar cláusula `WHEN` para disparar solo cuando cambian los campos relevantes:

```sql
-- Recrear el trigger con condición
CREATE TRIGGER trg_rutas_contadores
AFTER INSERT OR UPDATE OF ruta_id, estado ON pedidos
FOR EACH ROW
WHEN (
  NEW.ruta_id IS DISTINCT FROM OLD.ruta_id OR
  NEW.estado  IS DISTINCT FROM OLD.estado
)
EXECUTE FUNCTION fn_actualizar_contadores_ruta();
```

Esto elimina hasta el 80% de las ejecuciones innecesarias.

---

### P-05 · ALTA — `v_pedidos_detalle`: 2 subqueries correlacionadas por fila para contar evidencias

**Ubicación:** BD — vista `v_pedidos_detalle` (cuerpo de la definición)

**Descripción:**  
La vista incluye:

```sql
( SELECT count(*) FROM evidencias WHERE pedido_id = p.id ) AS total_evidencias,
( SELECT count(*) FROM evidencias WHERE pedido_id = p.id AND tipo = 'entregado' ) AS fotos_entrega
```

Cada fila devuelta por la vista ejecuta **2 subqueries** contra `evidencias`. Los índices `idx_evidencias_pedido` e `idx_evidencias_tipo` ayudan, pero el overhead por fila se multiplica:

| Pedidos del día | Subqueries extra | Overhead |
|---|---|---|
| 50 | 100 | Tolerable |
| 200 | 400 | Notable |
| 1.000 | 2.000 | Significativo |

Esta vista es usada en Dashboard, Pedidos, RutaDetalle — las páginas más visitadas.

**Recomendación:**  
Reemplazar con un `LEFT JOIN LATERAL` que hace un solo scan de `evidencias` por pedido:

```sql
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                              AS total_evidencias,
    COUNT(*) FILTER (WHERE tipo = 'entregado') AS fotos_entrega
  FROM evidencias e
  WHERE e.pedido_id = p.id
) ev ON true
```

Esto reduce de 2 subqueries a 1 scan por fila.

---

### P-06 · ALTA — ILIKE con wildcard inicial `%…%` sin índice trigram — full scan en cada búsqueda

**Ubicación:**  
- `src/hooks/usePedidos.ts:31-34` — `.or('numero_pedido.ilike.%{busqueda}%,cliente_nombre.ilike.%{busqueda}%')`  
- `src/pages/Clientes.tsx:26-29` — `.or('nombre.ilike.%{busqueda}%,distrito.ilike.%{busqueda}%')`  
**Verificado con:** `pg_indexes` — no existe ningún índice GIN/trigram en el proyecto

**Descripción:**  
Un B-tree index (el tipo por defecto de PostgreSQL) puede acelerar búsquedas con prefijo (`LIKE 'AKU%'`) pero **no puede usarse con wildcard inicial** (`LIKE '%búsqueda%'`). El plan de ejecución para estos patrones es siempre un `Seq Scan` o `Index Scan` con filtro, escalando linealmente con el tamaño de la tabla.

La búsqueda en `usePedidos` además opera sobre `cliente_nombre`, que es una columna derivada de la vista — no existe ningún índice sobre `clientes.nombre` ni sobre la columna del view.

**Con el bug C-06 (sin debounce), esto significa que cada tecla del operador dispara un full scan.**

**Recomendación:**  
Habilitar la extensión `pg_trgm` y crear índices GIN:

```sql
-- Habilitar extensión (una sola vez)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices para búsqueda ILIKE eficiente
CREATE INDEX idx_pedidos_numero_trgm ON pedidos USING GIN (numero_pedido gin_trgm_ops);
CREATE INDEX idx_clientes_nombre_trgm ON clientes USING GIN (nombre gin_trgm_ops);
```

Con estos índices, `ILIKE '%texto%'` usa el índice GIN y es O(log N) en lugar de O(N).

---

### P-07 · ALTA — Plan de ejecución subóptimo: `fecha_programada` aplicada como Filter, no Index Condition

**Ubicación:** `src/hooks/usePedidos.ts:21-25`  
**Verificado con:** `EXPLAIN` ejecutado directamente en producción

**Descripción:**  
El EXPLAIN real de la query más frecuente del sistema:

```
Sort  (cost=2.37..2.38 rows=1 width=110)
  Sort Key: creado_en DESC
  -> Index Scan using idx_pedidos_estado on pedidos
       Index Cond: (estado = 'recibido')
       Filter: (fecha_programada = CURRENT_DATE)   ← aplicada DESPUÉS del index scan
```

PostgreSQL elige `idx_pedidos_estado` para la condición de índice y luego aplica `fecha_programada = CURRENT_DATE` como **filter posterior**. Esto significa que **escanea todas las filas con `estado = 'recibido'` de todos los días**, y después descarta las que no son hoy. A medida que la tabla crece (pedidos de días anteriores), este scan se vuelve progresivamente más costoso.

El caso más común en producción filtra por `fecha_programada` (el día actual), no por `estado`. El planificador eligió mal porque la cardinalidad estimada de `estado='recibido'` es baja con los datos actuales (19 filas). Cuando la tabla tenga miles de pedidos históricos con `estado='recibido'`, este plan se degradará.

La query también tiene un `Sort` separado en `creado_en DESC` porque no hay índice que cubra a la vez el filtro y el orden.

**Recomendación:**  
Crear un índice compuesto que cubra el filtro más común (fecha + orden) y opcionalmente el filtro de estado:

```sql
-- Índice principal: cubre el filtro de fecha y el ORDER BY
CREATE INDEX idx_pedidos_fecha_creado
ON pedidos (fecha_programada DESC, creado_en DESC);

-- Índice compuesto para filtro fecha+estado (también cubre estado solo)
CREATE INDEX idx_pedidos_fecha_estado
ON pedidos (fecha_programada, estado);
```

Con `idx_pedidos_fecha_creado`, la query principal de `usePedidos` pasaría a un `Index Scan` que cubre filtro + sort sin Sort node separado.

---

### P-08 · ALTA — Sin paginación en Pedidos, Clientes ni Reportes — todo cargado en memoria

**Ubicación:**  
- `src/hooks/usePedidos.ts:21` — `select('*')` sin `.limit()`  
- `src/pages/Clientes.tsx:26` — `select('*')` sin `.limit()`  
- `src/pages/Reportes.tsx:65-70` — `select('estado, fecha_programada, ruta_id')` sin límite  
- `src/pages/Dashboard.tsx:52` — `.limit(10)` ✓ (único caso con límite)

**Descripción:**  
No existe paginación en ninguna pantalla crítica. La lista de pedidos del día carga **todos los pedidos** sin límite. Con 500 pedidos/día:

| Recurso | Impacto |
|---|---|
| Ancho de banda | 500 filas × ~30 columnas × ~100 bytes ≈ 1.5 MB por carga de página |
| Memoria del navegador | Todo el dataset vive en estado de React |
| Tiempo de render | El DOM renderiza todos los items (sin virtualización) |
| Reportes (30 días × 100 ped/día) | 3.000 filas procesadas en JS del navegador |

El campo de búsqueda en Pedidos filtra en servidor (bien), pero sin paginación el primer render sin filtro carga todo.

**Recomendación (prioridad):**  
1. Añadir `.limit(50)` inmediato para evitar cargas masivas.
2. Implementar paginación cursor-based con `.range(offset, offset+49)`:

```ts
// usePedidos.ts
const [page, setPage] = useState(0)
const PAGE_SIZE = 50

query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
```

3. Para listas largas (>200 items), considerar virtualización con `@tanstack/react-virtual`.

---

### P-09 · MEDIA — Sin estrategia de caché — cada navegación recarga todo desde cero

**Ubicación:** toda la capa de datos (`hooks/`, páginas con fetching directo)

**Descripción:**  
No existe ninguna capa de caché en el frontend. Cada vez que el usuario navega entre páginas:

- `/pedidos` → `/pedidos/nuevo` → volver a `/pedidos` → **fetch completo nuevamente**
- `/dashboard` → `/rutas` → volver a `/dashboard` → **3 queries de nuevo**
- El drawer de `PedidoDetalle` ejecuta 3 queries paralelas cada vez que se abre

No se usa React Query, SWR, Zustand, ni ningún mecanismo de `stale-while-revalidate`. El único "caché" es el estado de React, que se destruye al desmontar el componente.

**Recomendación:**  
Integrar **TanStack Query (React Query)** como capa de data-fetching:

```ts
// Con React Query, la navegación reutiliza datos cacheados:
const { data: pedidos } = useQuery({
  queryKey: ['pedidos', { fecha, estado, busqueda }],
  queryFn: () => fetchPedidos({ fecha, estado, busqueda }),
  staleTime: 30_000,        // datos frescos por 30s
  gcTime: 5 * 60_000,       // mantener en caché 5 min
})
```

Beneficios inmediatos: re-fetch automático al volver a una pestaña, invalidación selectiva tras mutaciones, deduplicación de queries idénticas en vuelo.

---

### P-10 · MEDIA — `SELECT *` sobre `v_pedidos_detalle` activa subqueries costosas aunque no se necesiten las evidencias

**Ubicación:**  
- `src/pages/Dashboard.tsx:52` — `supabase.from('v_pedidos_detalle').select('*')`  
- `src/hooks/usePedidos.ts:22` — `.select('*')`  
- `src/pages/RutaDetalle.tsx:41` — `.select('*')`

**Descripción:**  
`v_pedidos_detalle` incluye `total_evidencias` y `fotos_entrega`, que implican 2 subqueries correlacionadas por fila (ver P-05). Estas subqueries se ejecutan **incluso cuando la pantalla no las muestra**.

Por ejemplo, `Dashboard.tsx` muestra `numero_pedido`, `estado`, `cliente_nombre`, `repartidor_nombre`, `total_evidencias` (el ícono de cámara) y `creado_en` — 6 de los 30+ campos. Pero el `SELECT *` lanza igualmente las 2 subqueries de evidencias por fila.

**Recomendación:**  
Especificar columnas explícitas por pantalla:

```ts
// Dashboard: solo los campos necesarios
supabase.from('v_pedidos_detalle')
  .select('id, numero_pedido, estado, cliente_nombre, distrito_entrega, repartidor_nombre, total_evidencias, creado_en')
  .eq('fecha_programada', today())
  .order('creado_en', { ascending: false })
  .limit(10)
```

Aunque `total_evidencias` sigue forzando la subquery, eliminando el `*` ya reduce payload significativamente.

---

### P-11 · MEDIA — `RutaDetalle` hace 2 queries secuenciales que podrían ser 1

**Ubicación:** `src/pages/RutaDetalle.tsx:32-49`

**Descripción:**

```ts
// Query 1 (secuencial): obtener IDs de pedidos de esta ruta
const { data: rawPedidos } = await supabase
  .from('pedidos').select('id').eq('ruta_id', id)

// Query 2 (secuencial, depende de Query 1): obtener detalles
if (rawPedidos?.length > 0) {
  const ids = rawPedidos.map(p => p.id)
  const { data } = await supabase
    .from('v_pedidos_detalle').select('*').in('id', ids)
}
```

Estas queries son secuenciales (la segunda espera a la primera). La causa raíz es que `v_pedidos_detalle` no expone `ruta_id`, por lo que no se puede filtrar directamente. El round-trip adicional añade la latencia de red de la primera query en cada carga.

**Recomendación:**  
Agregar `ruta_id` a la vista `v_pedidos_detalle`:

```sql
ALTER VIEW v_pedidos_detalle AS
SELECT p.id, ..., p.ruta_id, ...   -- agregar ruta_id
FROM pedidos p ...;
```

Esto permite colapsar a una sola query:

```ts
supabase.from('v_pedidos_detalle').select('*').eq('ruta_id', id)
```

---

### P-12 · MEDIA — Índice compuesto `(fecha_programada, estado)` faltante para el filtro más frecuente

**Ubicación:** BD — tabla `pedidos`  
**Verificado con:** EXPLAIN plan y `pg_indexes`

**Descripción:**  
El filtro más frecuente del sistema es `fecha_programada = X AND estado = Y` (en `usePedidos`). Los índices actuales son independientes:
- `idx_pedidos_fecha_prog` → sobre `fecha_programada` solo  
- `idx_pedidos_estado` → sobre `estado` solo

El EXPLAIN muestra que PostgreSQL usa `idx_pedidos_estado` y aplica `fecha_programada` como filter posterior. Un índice compuesto permitiría satisfacer ambas condiciones en un único Index Scan, sin filter posterior.

Adicionalmente, no hay índice que cubra el ORDER BY `creado_en DESC` en combinación con los filtros — el Sort siempre es un nodo separado.

**Recomendación** (ver también P-07):

```sql
-- Cubre el filtro compuesto más frecuente
CREATE INDEX idx_pedidos_fecha_estado
ON pedidos (fecha_programada, estado);

-- Cubre filtro de fecha + ordenamiento
CREATE INDEX idx_pedidos_fecha_creado
ON pedidos (fecha_programada DESC, creado_en DESC);
```

---

## Proyección de escalabilidad

| Volumen de pedidos/día | Impacto de hallazgos críticos sin corregir |
|---|---|
| 50 (actual) | Imperceptible. Sistema funciona bien. |
| 200 | N+1 en Clientes/Repartidores se nota. Búsqueda lenta. |
| 500 | `v_pedidos_detalle` sin paginación carga >1 MB por request. Trigger de contadores genera 1500+ COUNTs/día. |
| 1.000+ | Dashboard y Reportes se vuelven inutilizables. El scan de ILIKE sin trigram tarda segundos. Race condition de rutas ocurre con certeza en producción. |

---

## Resumen de severidades

```
CRÍTICA  ██████ C-01, P-01, P-02
ALTA     ████████████████████████████████ C-02, C-03, P-03, P-04, P-05, P-06, P-07, P-08
MEDIA    ████████████████████ C-04, C-05, C-06, P-09, P-10, P-11, P-12
```

## Top 5 acciones por impacto/esfuerzo

| Prioridad | Acción | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Reemplazar N+1 de Clientes y Repartidores con queries agregadas | Bajo (1-2h) | Alto inmediato |
| 2 | Agregar cláusula `WHEN` a `trg_rutas_contadores` | Muy bajo (10 min) | Reduce carga de BD ~80% |
| 3 | Crear índices compuestos + trigram | Bajo (30 min) | Elimina full scans |
| 4 | Debounce en búsqueda de Pedidos + AbortController en Reportes | Bajo (1h) | Reduce queries innecesarias |
| 5 | Envolver creación de rutas en función PostgreSQL atómica (C-01) | Medio (4h) | Elimina race condition crítica |
