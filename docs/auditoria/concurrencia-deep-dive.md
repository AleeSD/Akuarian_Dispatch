# Deep Dive — Concurrencia en Akuarian Dispatch

**Fecha:** 2026-06-14  
**Scope:** Análisis estático + consultas directas a la BD de producción  
**Sin modificación de código**

---

## Contexto técnico crítico

Antes de trazar el flujo, dos hechos que condicionan todo el análisis:

**1. Nivel de aislamiento: `READ COMMITTED`** (confirmado via `SHOW default_transaction_isolation`)  
PostgreSQL lee siempre la versión más reciente de una fila comprometida, sin protección contra lecturas no repetibles ni phantoms. El patrón clásico "leo el estado, luego escribo basándome en lo que leí" es inherentemente inseguro sin locks explícitos.

**2. Cada llamada al SDK de Supabase es una transacción independiente**  
PostgREST encapsula cada request HTTP en su propia transacción. Cuando el código hace dos `await supabase.from(...)` consecutivos, son **dos transacciones separadas** sin relación entre sí. No hay `BEGIN` / `COMMIT` compartido entre ellas. Esto convierte cualquier secuencia de dos llamadas SDK en una operación no atómica por diseño.

---

## Flujo completo de un pedido

```
[Operador crea pedido]
       │
       ▼
 FASE 1: INSERT pedido (PedidoNuevo.tsx)
       │
       ▼
 FASE 2: Asignación a ruta — INSERT ruta + UPDATE pedidos (Rutas.tsx)
       │
       ▼
 FASE 3: Avance de estados por operador (PedidoDetalle.tsx)
       recibido → verificado → en_preparacion → listo_despacho
       │
       ▼
 FASE 4: Recogida y entrega por repartidor (PedidoAccion.tsx)
       listo_despacho → recogido → entregado | no_entregado
       │
       ▼
 FASE 5: Contadores de ruta (trigger fn_actualizar_contadores_ruta)
         [dispara en cada INSERT/UPDATE de pedidos]
```

---

## FASE 1 — Creación del pedido

**Archivo:** `src/pages/PedidoNuevo.tsx:97-127`  
**Recurso compartido:** tabla `pedidos`, secuencia `seq_pedido_numero`, tabla `rutas` (si se asigna ruta)

### Código exacto

```ts
// PedidoNuevo.tsx:103
const { error } = await supabase.from('pedidos').insert({
  cliente_id: step1Data.cliente_id,
  ruta_id: data.ruta_id || null,
  estado,  // 'listo_despacho' si tiene ruta, 'recibido' si no
  ...
})
```

Esta es **una sola transacción** en PostgreSQL. Dentro de ella, los triggers disparan en este orden:

```
1. BEFORE INSERT: trg_pedidos_numero → fn_generar_numero_pedido()
      → NEXTVAL('seq_pedido_numero')   ← ATÓMICO, thread-safe
      → NEW.numero_pedido = 'AKU-2026-00042'
      → RETURN NEW (modifica la fila antes de escribirla)

2. La fila se escribe en `pedidos`

3. AFTER INSERT: trg_rutas_contadores → fn_actualizar_contadores_ruta()
      → IF NEW.ruta_id IS NOT NULL: UPDATE rutas SET total_pedidos=... WHERE id=NEW.ruta_id
```

### Evaluación de concurrencia

| Paso | ¿En transacción? | ¿Race condition? |
|------|-----------------|-----------------|
| NEXTVAL secuencia | Sí, dentro del INSERT | No — las secuencias son atómicas en PostgreSQL |
| INSERT pedido | Sí | No — cada pedido tiene su propio UUID |
| UPDATE rutas.total_pedidos (trigger) | Sí, misma transacción del INSERT | **Sí** — ver CC-01 |

### CC-01 — MEDIA: Contador `total_pedidos` con TOCTOU en inserción concurrente

**Severidad:** Media  
**Ubicación:** `fn_actualizar_contadores_ruta` (trigger), disparado desde `PedidoNuevo.tsx:103`

**Escenario exacto:**

```
T1 (Op A crea pedido P1 con ruta_id = R1):
  INSERT pedidos (ruta_id = R1)
  → trigger: SELECT COUNT(*) FROM pedidos WHERE ruta_id = R1  → 5
  → UPDATE rutas SET total_pedidos = 5 WHERE id = R1

T2 (Op B crea pedido P2 con ruta_id = R1, concurrente):
  INSERT pedidos (ruta_id = R1)
  → trigger: SELECT COUNT(*) FROM pedidos WHERE ruta_id = R1
     ¿Ve a P1? Depende de si T1 ya hizo COMMIT:
     → Si T1 no committeó: COUNT = 5 → UPDATE total_pedidos = 5 (PERDIDO el pedido de T1)
     → Si T1 committeó:   COUNT = 6 → UPDATE total_pedidos = 6 (correcto)
```

Resultado: bajo carga simultánea, `total_pedidos` puede quedar subestimado. No es catastrófico (el trigger `trg_rutas_contadores` también dispara en UPDATE, así que la próxima entrega lo recalcula), pero el dashboard y la pantalla de rutas pueden mostrar conteos incorrectos durante la operación activa.

**Solución:** Reemplazar los `SELECT COUNT(*)` por un `UPDATE rutas SET total_pedidos = total_pedidos + 1` atómico, que no tiene ventana TOCTOU.

### Idempotencia en creación

El botón tiene `loading={saving}` que lo deshabilita durante el request (`PedidoNuevo.tsx:304`). Sin embargo:

- No hay clave de idempotencia externa. Si el usuario cierra y reabre el formulario con los mismos datos, crea un pedido duplicado.
- No hay `UNIQUE(cliente_id, fecha_programada)` en la tabla. El mismo cliente puede tener N pedidos para el mismo día sin restricción.
- `numero_pedido` sí tiene `UNIQUE` (`pedidos_numero_pedido_key`, confirmado en pg_constraint), protegiendo contra duplicados exactos del mismo número — pero dos pedidos distintos para el mismo cliente/fecha tendrán números diferentes y ambos se insertarán sin error.

---

## FASE 2 — Asignación a ruta

**Archivo:** `src/pages/Rutas.tsx:48-83`  
**Recursos compartidos:** tabla `rutas` (INSERT), tabla `pedidos` (UPDATE masivo), campo `ruta_id`

### Código exacto

```ts
// Rutas.tsx:51-71
// TRANSACCIÓN 1: crear la ruta
const { data: ruta } = await supabase
  .from('rutas')
  .insert({
    nombre: form.nombre,
    repartidor_id: form.repartidor_id || null,
    fecha: form.fecha,
    total_pedidos: seleccionados.size,   // ← SET CLIENT-SIDE en este momento
  })
  .select().single()

// ← AQUÍ HAY UN GAP ENTRE LAS DOS TRANSACCIONES ←

// TRANSACCIÓN 2: asignar pedidos (request HTTP separado)
if (seleccionados.size > 0) {
  await supabase
    .from('pedidos')
    .update({ ruta_id: ruta.id, estado: 'listo_despacho' })
    .in('id', Array.from(seleccionados))
}
```

### CC-02 — CRÍTICO: Double-assignment de pedidos entre rutas concurrentes

**Severidad:** Crítica  
**Ubicación:** `Rutas.tsx:48-83`

Este es el race condition más grave del sistema. Dos operadores pueden asignar el mismo pedido a dos rutas diferentes simultáneamente, y **ninguno recibe error**.

**Escenario paso a paso:**

```
T=0ms:  Op A y Op B abren el modal "Nueva ruta".

T=1ms:  Op A lee pedidos sin ruta:
        SELECT * FROM v_pedidos_detalle WHERE ruta_nombre IS NULL
        → [P1, P2, P3, P4]  (P1 es el pedido que se duplicará)

T=1ms:  Op B lee pedidos sin ruta (misma query concurrente):
        SELECT * FROM v_pedidos_detalle WHERE ruta_nombre IS NULL
        → [P1, P2, P3, P4]  (ambos ven P1 disponible)

T=2ms:  Op A selecciona P1, P2.  Op B selecciona P1, P3.
        (P1 está en ambas selecciones — esto es la race condition)

T=100ms: Op A: INSERT INTO rutas → Ruta-A (total_pedidos=2) creada

T=101ms: Op B: INSERT INTO rutas → Ruta-B (total_pedidos=2) creada

T=200ms: Op A: UPDATE pedidos SET ruta_id=Ruta-A, estado='listo_despacho'
              WHERE id IN (P1, P2)
         → COMMIT exitoso. P1.ruta_id = Ruta-A

T=201ms: Op B: UPDATE pedidos SET ruta_id=Ruta-B, estado='listo_despacho'
              WHERE id IN (P1, P3)
         → COMMIT exitoso. P1.ruta_id = Ruta-B  ← SOBRESCRIBE a Ruta-A
```

**Estado final en la BD:**
- P1.ruta_id = Ruta-B (el último UPDATE gana — LAST WRITE WINS bajo READ COMMITTED)
- Ruta-A tiene `total_pedidos = 2` pero solo P2 está asignado → conteo incorrecto permanente
- El repartidor de Ruta-A cree que tiene P1 en su lista. Cuando abra `MiRuta.tsx`, P1 NO aparecerá (porque `v_repartidor_mis_pedidos` filtra por `ruta_id = Ruta-A`, y P1 ahora es Ruta-B).
- El repartidor de Ruta-A sale a repartir con un bulto que no está en su lista. El sistema no tiene forma de detectar esto.

No hay ningún mecanismo que prevenga este escenario: no hay `SELECT FOR UPDATE` al leer los pedidos disponibles, no hay lock al seleccionarlos, y los dos UPDATEs son válidos bajo READ COMMITTED.

**Solución:**  
Mover `crearRuta` a una función PL/pgSQL con locking explícito:

```sql
CREATE FUNCTION crear_ruta_con_pedidos(
  p_nombre TEXT, p_repartidor_id UUID, p_fecha DATE,
  p_pedido_ids UUID[], p_creado_por UUID
) RETURNS UUID AS $$
DECLARE
  v_ruta_id UUID;
BEGIN
  -- Lock los pedidos seleccionados para excluirlos de asignaciones concurrentes
  PERFORM id FROM pedidos
    WHERE id = ANY(p_pedido_ids)
      AND ruta_id IS NULL          -- validar que siguen disponibles
    ORDER BY id                   -- orden determinístico para evitar deadlock
    FOR UPDATE;
  
  -- Verificar que todos los pedidos siguen sin ruta
  IF (SELECT COUNT(*) FROM pedidos WHERE id = ANY(p_pedido_ids) AND ruta_id IS NULL)
     < array_length(p_pedido_ids, 1) THEN
    RAISE EXCEPTION 'Uno o más pedidos ya fueron asignados a otra ruta';
  END IF;

  INSERT INTO rutas (nombre, repartidor_id, fecha, total_pedidos, creado_por)
  VALUES (p_nombre, p_repartidor_id, p_fecha, array_length(p_pedido_ids,1), p_creado_por)
  RETURNING id INTO v_ruta_id;

  UPDATE pedidos SET ruta_id = v_ruta_id, estado = 'listo_despacho'
  WHERE id = ANY(p_pedido_ids);
  
  RETURN v_ruta_id;
END;
$$ LANGUAGE plpgsql;
```

Invocar desde el cliente con `supabase.rpc('crear_ruta_con_pedidos', {...})`.

### CC-03 — ALTO: Fallo parcial entre creación de ruta y asignación de pedidos

**Severidad:** Alta  
**Ubicación:** `Rutas.tsx:51-71`

Entre la Transacción 1 (INSERT ruta) y la Transacción 2 (UPDATE pedidos) puede ocurrir:
- Timeout de red
- Cierre del navegador
- Error del servidor

Si T1 committeó pero T2 nunca se ejecuta:
- La ruta existe con `total_pedidos = N` (fijado client-side en T1)
- Cero pedidos tienen `ruta_id` apuntando a la nueva ruta
- La ruta aparece en el listado con "N pedidos" pero sin ninguno en `RutaDetalle`
- No hay mecanismo de cleanup ni detección de este estado inconsistente

**Solución:** Consolidar las dos operaciones en una sola función PL/pgSQL (ver CC-02).

---

## FASE 3 — Avance de estados (operador)

**Archivo:** `src/pages/PedidoDetalle.tsx:55-72`  
**Recurso compartido:** `pedidos.estado` (campo compartido entre todos los operadores)

### Código exacto

```ts
// PedidoDetalle.tsx:55-62
async function cambiarEstado(nuevoEstado: EstadoPedido) {
  const { error } = await supabase
    .from('pedidos')
    .update({ estado: nuevoEstado })
    .eq('id', pedidoId)
  // ← SOLO filtra por id. No verifica el estado actual.
}
```

El map de transiciones válidas es:
```ts
// PedidoDetalle.tsx:21-27
const ACCIONES = {
  recibido:       [{ siguiente: 'verificado' }],
  verificado:     [{ siguiente: 'en_preparacion' }],
  en_preparacion: [{ siguiente: 'listo_despacho' }],
  no_entregado:   [{ siguiente: 'reprogramado' }],
  reprogramado:   [{ siguiente: 'listo_despacho' }],
}
```

Este objeto existe **solo en el frontend**. No hay ningún enforcement en la base de datos.

### CC-04 — ALTO: Transición de estado sin lock optimista — estados pueden retroceder

**Severidad:** Alta  
**Ubicación:** `PedidoDetalle.tsx:55-72`

**Escenario: Dos operadores con el mismo pedido abierto**

```
Estado inicial: pedido P1 en estado 'verificado'

Op A abre PedidoDetalle de P1 → lee estado 'verificado'
Op B abre PedidoDetalle de P1 → lee estado 'verificado'

T=1s:  Op A hace click en "Marcar en preparación"
       UPDATE pedidos SET estado='en_preparacion' WHERE id=P1
       → COMMIT. P1 ahora está en 'en_preparacion'

T=2s:  Op A hace click en "Listo para despacho" (estado actual: en_preparacion)
       UPDATE pedidos SET estado='listo_despacho' WHERE id=P1
       → COMMIT. P1 ahora está en 'listo_despacho'

T=3s:  Op B (su vista sigue mostrando 'verificado', no se refrescó automáticamente)
       hace click en "Marcar en preparación" (la acción que corresponde a 'verificado')
       UPDATE pedidos SET estado='en_preparacion' WHERE id=P1
       → COMMIT EXITOSO — el UPDATE no verifica el estado actual
       → P1 vuelve a 'en_preparacion' 🔴
```

El historial_estados quedará: `... → en_preparacion → listo_despacho → en_preparacion`

El pedido **retrocedió** de `listo_despacho` a `en_preparacion`. El repartidor que iba a buscarlo ya no lo verá en estado correcto. Sin alertas, sin error.

**Escenario con impacto en entrega:**

```
Estado: P1 en 'no_entregado'

Op A: reprograma → UPDATE estado='reprogramado'
      Luego: reasigna → UPDATE estado='listo_despacho'

Op B (vista desactualizada, ve 'no_entregado'):
      UPDATE estado='reprogramado'  ← retrocede de 'listo_despacho' a 'reprogramado'

El repartidor que ya tiene P1 en 'listo_despacho' para llevar... ve que el pedido desapareció.
```

**Solución: WHERE con estado esperado (optimistic lock):**
```ts
const { data, error } = await supabase
  .from('pedidos')
  .update({ estado: nuevoEstado })
  .eq('id', pedidoId)
  .eq('estado', estadoActual)   // ← guard: solo actualiza si el estado no cambió

if (!data || data.length === 0) {
  toast.error('El pedido fue modificado por otro usuario. Recarga para ver el estado actual.')
}
```

### CC-05 — CRÍTICO: Sin state machine en la BD — cualquier API call puede saltar a cualquier estado

**Severidad:** Crítica  
**Ubicación:** `PedidoDetalle.tsx:21-27` (ACCIONES object), toda la capa BD

La máquina de estados existe únicamente en el objeto `ACCIONES` de `PedidoDetalle.tsx`. A nivel de base de datos no hay ninguna validación de transiciones. Cualquier cliente con un JWT válido puede hacer:

```
PATCH /rest/v1/pedidos?id=eq.{id}
{ "estado": "entregado" }
```

Y el pedido saltará de `recibido` a `entregado` sin pasar por ningún estado intermedio, sin foto de evidencia, sin registro de repartidor. El trigger `fn_registrar_cambio_estado` solo registra el cambio en `historial_estados`, no lo valida.

Combinado con la ausencia de RLS por roles (S-03 del informe de seguridad), esto significa que cualquier usuario autenticado puede manipular el estado de cualquier pedido a cualquier valor.

---

## FASE 4 — Recogida y entrega (repartidor móvil)

**Archivo:** `src/pages/repartidor/PedidoAccion.tsx:67-135`  
**Recursos compartidos:** Storage bucket `evidencias`, tabla `evidencias`, `pedidos.estado`

### Código exacto con numeración de operaciones

```ts
// PedidoAccion.tsx:75-120
async function confirmar() {
  setSaving(true)
  try {
    let fotoUrl = null

    // ══ OPERACIÓN 1: Upload a Storage (NO ES UNA TRANSACCIÓN BD) ══
    if (foto) {
      const path = `${pedidoId}/${accion}/${Date.now()}.${ext}`   // ← Date.now() = timestamp del dispositivo
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('evidencias').upload(path, foto)        // HTTP request independiente
      if (uploadErr) throw uploadErr                  // si falla, lanza → catch → toast.error → setSaving(false)

      // ══ OPERACIÓN 2: INSERT en tabla evidencias (TRANSACCIÓN 1) ══
      await supabase.from('evidencias').insert({
        pedido_id: pedidoId,
        tipo: accion,
        foto_url: fotoUrl,
      })
      // Si esta falla: foto subida en storage, sin registro en evidencias
    }

    // ══ OPERACIÓN 3: UPDATE pedido (TRANSACCIÓN 2) ══
    const updatePayload = {
      estado: estadoNuevo,
      recogido_en: new Date().toISOString(),     // ← RELOJ DEL DISPOSITIVO MÓVIL
      // o fecha_entrega_real: new Date().toISOString()
    }
    const { error } = await supabase
      .from('pedidos').update(updatePayload).eq('id', pedidoId)
    // Si esta falla: storage + evidencias OK, pedido sin actualizar
    if (error) throw error
  }
}
```

### CC-06 — CRÍTICO: Tres operaciones no atómicas bajo conectividad móvil degradada

**Severidad:** Crítica  
**Ubicación:** `PedidoAccion.tsx:75-122`

Las 3 operaciones son independientes. Cualquier fallo a mitad deja la BD en un estado inconsistente **permanente** (no hay rollback, no hay compensación):

| Fallo en | Estado resultante |
|----------|------------------|
| Op 1 (Storage) | Nada subido. Error al usuario. Estado limpio. Retry seguro. |
| Op 2 (INSERT evidencias) | Foto en Storage sin registro. `evidencias` vacío para esta entrega. El repartidor puede reintentar y subir **otra** foto (nuevo `Date.now()`). Foto original huérfana en Storage para siempre. |
| Op 3 (UPDATE pedido) | Foto subida + evidencia registrada, pero `pedidos.estado` sigue siendo el anterior. El pedido aparece como `listo_despacho` en el sistema aunque el repartidor ya lo entregó. Si reintenta, genera **otra** evidencia duplicada. |

**Escenario de doble entrega (más frecuente en campo):**

El repartidor tiene señal inestable. Toca "Confirmar entrega". La Op 3 falla (timeout). Toast de error. El repartidor toca nuevamente. El código ejecuta las 3 operaciones desde cero:

```
1er intento:
  Op1: foto subida a evidencias/P1/entregado/1718000000000.jpg ✓
  Op2: INSERT evidencias { pedido_id: P1, foto_url: .../1718000000000.jpg } ✓
  Op3: UPDATE pedidos SET estado='entregado' WHERE id=P1 → TIMEOUT ✗

2do intento (saving=false tras el error, repartidor puede hacer click):
  Op1: foto subida a evidencias/P1/entregado/1718000001234.jpg ✓ (diferente timestamp)
  Op2: INSERT evidencias { pedido_id: P1, foto_url: .../1718000001234.jpg } ✓
  Op3: UPDATE pedidos SET estado='entregado' WHERE id=P1 ✓

Resultado: P1 tiene DOS registros en evidencias (dos fotos del mismo evento).
            La primera foto queda huérfana (sin referencia en pedidos.foto_entregado_url).
            Pero el estado se actualiza correctamente en el 2do intento.
```

**Solución:** Mover las 3 operaciones a una Edge Function de Supabase:

```ts
// supabase/functions/registrar-entrega/index.ts
const { error } = await supabase.rpc('registrar_entrega', {
  p_pedido_id: pedidoId,
  p_accion: accion,
  p_foto_base64: fotoBase64,  // o manejar upload en la Edge Function
  p_motivo: motivo,
})
```

La función del lado del servidor puede manejar la transacción completa con rollback real.

### CC-07 — ALTO: Timestamp de entrega tomado del reloj del dispositivo móvil

**Severidad:** Alta  
**Ubicación:** `PedidoAccion.tsx:106-109`

```ts
updatePayload.recogido_en = new Date().toISOString()        // reloj del dispositivo
updatePayload.fecha_entrega_real = new Date().toISOString() // reloj del dispositivo
```

**Problema #1: El trigger servidor es dead code bajo este flujo.**

El trigger `trg_pedidos_historial` → `fn_registrar_cambio_estado` intenta hacer:
```sql
-- fn_registrar_cambio_estado (AFTER trigger)
IF NEW.estado = 'recogido' AND NEW.recogido_en IS NULL THEN
  NEW.recogido_en := NOW();   -- ← DEAD CODE
END IF;
```

Dos razones por las que esto nunca funciona:
1. `PedidoAccion.tsx` siempre envía `recogido_en` en el payload → el valor nunca llega NULL → la condición `IS NULL` nunca es true.
2. Aunque llegara NULL, `fn_registrar_cambio_estado` es un **AFTER trigger**. En PostgreSQL, las modificaciones a `NEW` en un trigger AFTER son ignoradas — la fila ya fue escrita. `RETURN NEW` es un no-op en triggers AFTER row-level. El assignment `NEW.recogido_en := NOW()` dentro de un AFTER trigger **no tiene ningún efecto** en la tabla.

**Problema #2: El reloj del móvil puede estar desfasado.**

Un repartidor con el reloj del dispositivo configurado incorrectamente (manual o zona horaria errónea) generará timestamps de entrega incorrectos que quedan en la BD como datos históricos oficiales. Los reportes de tiempo de entrega estarán contaminados.

**Solución:** Quitar `recogido_en` y `fecha_entrega_real` del payload del cliente. Convertir el trigger a BEFORE:

```sql
-- Cambiar trg_pedidos_historial de AFTER a BEFORE
-- Así NEW.recogido_en := NOW() sí tiene efecto antes de que la fila se escriba
CREATE TRIGGER trg_pedidos_historial
BEFORE UPDATE ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_registrar_cambio_estado();
```

---

## FASE 5 — Actualización de contadores de ruta

**Trigger:** `trg_rutas_contadores` (confirmado via pg_get_triggerdef)  
**Función:** `fn_actualizar_contadores_ruta`

### Código exacto del trigger y la función

```sql
-- TRIGGER (sin WHEN clause)
CREATE TRIGGER trg_rutas_contadores
AFTER INSERT OR UPDATE ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_contadores_ruta()

-- FUNCIÓN
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

### CC-08 — ALTO: Trigger sin cláusula WHEN — dispara en cada UPDATE de cualquier campo

**Severidad:** Alta  
**Ubicación:** Trigger `trg_rutas_contadores`

El trigger dispara en **todo** `INSERT OR UPDATE ON pedidos` sin ningún filtro. Incluyendo:
- Actualizaciones de `actualizado_en` (timestamp automático)
- Actualizaciones de `observaciones`, `descripcion_carga`, etc.
- Cualquier campo irrelevante para los contadores

Para un pedido con `ruta_id`, cada UPDATE de cualquier campo de ese pedido ejecuta `fn_actualizar_contadores_ruta`, que a su vez hace 3 `SELECT COUNT(*)` sobre toda la tabla `pedidos` filtrada por `ruta_id` + 1 `UPDATE` sobre `rutas`.

Impacto acumulado: Cada entrega de `PedidoAccion.tsx` hace 1 UPDATE de pedido. Este dispara `trg_pedidos_updated` (timestamp) + `trg_pedidos_historial` (historial) + `trg_rutas_contadores` (3 SELECTs + 1 UPDATE). Por 20 repartidores entregando simultáneamente: 20 pedidos × (3+1) queries adicionales = 80 queries extra en el momento pico.

**Solución:**
```sql
CREATE TRIGGER trg_rutas_contadores
AFTER INSERT OR UPDATE OF estado, ruta_id ON pedidos   -- solo los campos relevantes
FOR EACH ROW
WHEN (
  OLD.estado IS DISTINCT FROM NEW.estado OR
  OLD.ruta_id IS DISTINCT FROM NEW.ruta_id
)
EXECUTE FUNCTION fn_actualizar_contadores_ruta();
```

### CC-09 — ALTO: `fn_actualizar_contadores_ruta` ignora `OLD.ruta_id` — contadores de ruta origen nunca se decrementan

**Severidad:** Alta  
**Ubicación:** `fn_actualizar_contadores_ruta`

```sql
IF NEW.ruta_id IS NOT NULL THEN   -- solo actualiza la ruta DESTINO
  UPDATE rutas SET ... WHERE id = NEW.ruta_id;
END IF;
-- OLD.ruta_id nunca se toca
```

Si un pedido se mueve de Ruta-A a Ruta-B (via un UPDATE `SET ruta_id = Ruta-B`):
- Ruta-B: contadores actualizados ✓
- Ruta-A: `total_pedidos` sigue contando el pedido que ya no está → jamás se corrige

**Caso real:** Operador reasigna P1 de Ruta-Norte (10 pedidos) a Ruta-Sur. Ruta-Norte seguirá mostrando 10 pedidos en el dashboard cuando en realidad tiene 9. Este error es permanente — solo se corregiría si algún otro pedido de Ruta-Norte se actualiza.

**Solución:**
```sql
BEGIN
  -- Decrementar ruta origen si el pedido cambió de ruta
  IF OLD.ruta_id IS NOT NULL AND OLD.ruta_id IS DISTINCT FROM NEW.ruta_id THEN
    UPDATE rutas SET
      total_pedidos = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = OLD.ruta_id),
      entregados    = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = OLD.ruta_id AND estado = 'entregado'),
      no_entregados = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = OLD.ruta_id AND estado = 'no_entregado')
    WHERE id = OLD.ruta_id;
  END IF;
  
  -- Actualizar ruta destino
  IF NEW.ruta_id IS NOT NULL THEN
    UPDATE rutas SET
      total_pedidos = (SELECT COUNT(*) FROM pedidos WHERE ruta_id = NEW.ruta_id),
      ...
    WHERE id = NEW.ruta_id;
  END IF;
  
  RETURN NEW;
END;
```

### CC-10 — MEDIA: TOCTOU entre los tres SELECT COUNT dentro del trigger

**Severidad:** Media  
**Ubicación:** `fn_actualizar_contadores_ruta`

Los tres `SELECT COUNT(*)` dentro del UPDATE son expresiones separadas evaluadas bajo READ COMMITTED. En PostgreSQL, bajo READ COMMITTED, cada sub-expresión puede ver un snapshot diferente si una transacción concurrente commitea entre ellas.

**Escenario:**

```
Trigger ejecutándose para T1 (pedido P1 → 'entregado'):
  Evaluación de total_pedidos:    SELECT COUNT(*) → 10  (T2 no committeó aún)
  T2 commitea P2 → 'no_entregado'
  Evaluación de entregados:       SELECT COUNT(*) → 6   (incluye P1 propio y P2? depende del timing)
  Evaluación de no_entregados:    SELECT COUNT(*) → 3   (incluye P2 de T2)

  total_pedidos = 10, entregados = 6, no_entregados = 3
  → 6 + 3 = 9 < 10: la suma no cierra
```

Los contadores pueden ser temporalmente inconsistentes entre sí (aunque el siguiente trigger los recalcule y los corrija). Esto afecta el dashboard en tiempo real durante picos operativos.

**Solución:** Usar `REPEATABLE READ` para la transacción del trigger, o mover el UPDATE a `total_pedidos = total_pedidos + CASE WHEN ... END` (atómico).

---

## 4. Idempotencia general

| Operación | Protección de doble ejecución | Estado si falla a mitad |
|-----------|------------------------------|------------------------|
| Crear pedido (PedidoNuevo) | `saving` state + UNIQUE(numero_pedido) — pero dos submits distintos crean dos pedidos válidos | Limpio (transacción única) |
| Crear ruta (Rutas.tsx) | `saving` state — no hay clave única de ruta | Ruta sin pedidos si T2 falla |
| Cambiar estado (PedidoDetalle) | Ninguna — doble click produce dos historial_estados | Último gana (idempotente por estado, no por historial) |
| Registrar entrega (PedidoAccion) | `saving` state — pero retry tras error produce evidencias duplicadas | Evidencias huérfanas si Op3 falla |

**Hallazgo:** Ninguna operación tiene una clave de idempotencia explícita (e.g., `X-Idempotency-Key` en HTTP o un campo UUID de requestde correlación). El sistema depende completamente del estado `saving` del React local, que se resetea ante cualquier error.

---

## 5. Inventario y stock — riesgo de sobreventa

**El sistema no gestiona inventario.** No existen tablas `stock`, `inventario`, `productos`, ni `sku`. Akuarian Dispatch es un sistema de gestión de **entregas** (dispatch tracking), no de e-commerce ni ERP.

El concepto equivalente a "sobreventa" en este dominio es **doble-despacho**: el mismo bulto físico asignado a dos rutas/repartidores. Este escenario SÍ es posible y está documentado en **CC-02** (double-assignment en la creación de rutas). El campo `pedidos.ruta_id` es una FK nullable — un pedido solo puede estar en una ruta a la vez, pero dos transacciones concurrentes pueden sobrescribir ese valor sin detectar el conflicto (último en commitear gana).

---

## 6. Colas y procesamiento asíncrono

**El sistema no tiene colas, workers, ni procesamiento asíncrono de ningún tipo.** No hay:
- Background jobs
- Supabase Edge Functions en uso
- Supabase Realtime subscriptions
- Cron jobs
- Webhooks entrantes o salientes

Todo el procesamiento ocurre de forma síncrona: el cliente envía una request HTTP → PostgREST ejecuta SQL → triggers disparan → respuesta al cliente.

**Consecuencia:** No hay garantías de exactly-once, at-least-once, ni ordering porque no hay cola que los provea. Las garantías actuales son las del protocolo HTTP síncrono: si el cliente recibe 200 OK, el registro está en la BD. Si recibe error o timeout, el estado es indeterminado (el servidor puede haber committeado aunque el cliente no recibió la respuesta).

Este es precisamente el origen del problema CC-06: bajo conectividad móvil degradada, un timeout de red no equivale a que la operación falló — la operación puede haber committeado en el servidor mientras el timeout expiraba en el cliente.

---

## Resumen de hallazgos

| ID | Severidad | Descripción | Archivo | Solución |
|----|-----------|-------------|---------|----------|
| CC-01 | 🟡 Media | Contador `total_pedidos` con TOCTOU en creación concurrente | `fn_actualizar_contadores_ruta` | `UPDATE total_pedidos = total_pedidos + 1` atómico |
| CC-02 | 🔴 Crítico | Double-assignment de pedidos a dos rutas simultáneas | `Rutas.tsx:48-83` | Función PL/pgSQL con `SELECT FOR UPDATE` |
| CC-03 | 🟠 Alto | Fallo parcial entre INSERT ruta y UPDATE pedidos | `Rutas.tsx:51-71` | Consolidar en una sola función BD |
| CC-04 | 🟠 Alto | Estado puede retroceder sin lock optimista | `PedidoDetalle.tsx:55-72` | Agregar `.eq('estado', estadoActual)` al UPDATE |
| CC-05 | 🔴 Crítico | Sin state machine en BD — cualquier transición es posible via API | Capa BD | Función PL/pgSQL con validación de transiciones |
| CC-06 | 🔴 Crítico | 3 operaciones no atómicas en entrega móvil — evidencias duplicadas bajo retry | `PedidoAccion.tsx:75-122` | Edge Function con operación única |
| CC-07 | 🟠 Alto | Timestamps de entrega del reloj del móvil + trigger AFTER es dead code | `PedidoAccion.tsx:106-109`, `fn_registrar_cambio_estado` | Cambiar trigger a BEFORE, quitar timestamps del cliente |
| CC-08 | 🟠 Alto | Trigger sin WHEN clause — 4 queries extra por cualquier UPDATE de pedido | `trg_rutas_contadores` | Agregar `WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR ...)` |
| CC-09 | 🟠 Alto | `fn_actualizar_contadores_ruta` ignora `OLD.ruta_id` — contadores de ruta origen no se decrementan | `fn_actualizar_contadores_ruta` | Agregar bloque para `OLD.ruta_id` |
| CC-10 | 🟡 Media | TOCTOU entre los 3 SELECT COUNT dentro del trigger — contadores momentáneamente inconsistentes | `fn_actualizar_contadores_ruta` | Actualización atómica por incremento/decremento |

### Distribución de severidades

```
🔴 CRÍTICO  ███  CC-02 (double-assignment), CC-05 (sin state machine), CC-06 (entrega no atómica)
🟠 ALTO     ████████  CC-03, CC-04, CC-07, CC-08, CC-09
🟡 MEDIO    ██  CC-01, CC-10
```

### Orden de remediación recomendado

1. **CC-06** — Consolidar las 3 operaciones de entrega en una Edge Function (impacto operativo inmediato).
2. **CC-02** — Crear ruta como función PL/pgSQL con `SELECT FOR UPDATE` (pérdida de datos silenciosa).
3. **CC-04** — Agregar WHERE estado al cambiarEstado (1 línea de código, alto impacto).
4. **CC-07** — Cambiar trigger a BEFORE y eliminar timestamps del cliente (corrección de bug + datos limpios).
5. **CC-08** — Agregar WHEN clause al trigger (mejora de rendimiento bajo carga).
6. **CC-09** — Corregir `fn_actualizar_contadores_ruta` para manejar OLD.ruta_id (integridad de contadores).
7. **CC-05** — Implementar state machine en BD (mayor esfuerzo, mayor protección).
8. **CC-03 / CC-01 / CC-10** — Mejoras de robustez una vez solucionados los anteriores.
