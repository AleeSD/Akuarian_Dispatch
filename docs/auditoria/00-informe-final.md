# Informe Final de Auditoría — Akuarian Dispatch

**Proyecto:** Akuarian Dispatch v1.0  
**Fecha:** 2026-06-14  
**Analista:** Claude Sonnet 4.6  
**Alcance:** Análisis estático de código fuente + consultas directas a la BD de producción via MCP  
**Metodología:** Sin modificación de código. Solo lectura y análisis.

---

## 1. Resumen Ejecutivo

### El sistema funciona para su escala actual, pero tiene cuatro vulnerabilidades que requieren acción inmediata antes de cualquier crecimiento.

**1. Las credenciales de todos los usuarios están en el README del repositorio.**  
La contraseña universal `Akuarian2024!` y los emails de los seis usuarios del sistema (incluyendo `admin@akuarian.pe`) están en texto claro en `README.md`, comprometido en el commit inicial. Cualquier persona con acceso al repositorio puede acceder como administrador del sistema ahora mismo.

**2. La separación de roles existe solo en el frontend, no en la base de datos.**  
Las políticas RLS de Supabase autorizan a cualquier usuario autenticado a leer y escribir todas las tablas. Un repartidor con el JWT de su cuenta puede obtener la lista completa de clientes, modificar pedidos de otros repartidores, o crear nuevos usuarios, accediendo directamente a la API REST de Supabase sin pasar por la app.

**3. Tres problemas de rendimiento escalarán de forma cuadrática con el volumen.**  
El sistema ejecuta 2N queries para cargar N repartidores, N queries para N clientes, y M queries para M rutas en el módulo de reportes. Con 50 repartidores, eso son 100 queries por carga de página. No hay paginación, no hay caché, y no hay indexación de texto libre.

**4. No hay tests ni monitoreo: los fallos silenciosos son indetectables.**  
Cobertura de tests: 0%. Cuatro módulos suprimen errores de red sin informar al usuario. No hay Error Boundary; un error en render produce pantalla en blanco. No hay Sentry ni equivalente en producción.

**Estado general:** Sistema funcional en condiciones normales de baja carga. No apto para producción con datos reales de clientes hasta remediar S-01, S-02 y S-03. El resto de hallazgos son mejoras de robustez y rendimiento que deben ejecutarse en un roadmap de 30-90 días.

---

## 2. Tabla de Hallazgos por Severidad

### 🔴 CRÍTICOS (acción inmediata)

| ID | Hallazgo | Archivo(s) | Fase |
|----|----------|------------|------|
| S-01 | README.md contiene contraseña universal + todos los emails en texto claro | `README.md` | F4 |
| S-02 | Bucket `evidencias` aparentemente público: fotos de entrega sin autenticación | `PedidoAccion.tsx:89-92` | F4 |
| S-03 | RLS sin enforcement de roles: cualquier autenticado accede a todos los datos | Todas las tablas (BD) | F4 / F2 |
| Q-01 | Cobertura de tests: 0%. Sin framework de testing | Repositorio completo | F4 |
| A-01 | Lógica de negocio (transiciones de estado) vive en el frontend: bypasseable | `PedidoDetalle.tsx:21-27` | F2 |
| C-01 | Race condition en `crearRuta()`: dos operaciones no atómicas permiten asignación duplicada de pedidos | `Rutas.tsx:50-72` | F3 |

### 🟠 ALTOS (resolver en 30 días)

| ID | Hallazgo | Archivo(s) | Fase |
|----|----------|------------|------|
| S-04 | Inyección de filtros PostgREST via `.or()` con input sin sanitizar | `usePedidos.ts:32-34` | F4 |
| S-05 | Race condition en lectura de rol post-login: stale closure + setTimeout(800ms) | `Login.tsx:28-40` | F4 |
| S-06 | Mensajes de error internos de la BD expuestos al usuario via toast | `Login.tsx:38`, múltiples | F4 |
| S-07 | `pin_acceso` almacenado en texto plano | `repartidores` (BD) | F4 |
| S-08 | `usuarios.id` sin FK a `auth.users` | BD (confirmado via pg_constraint) | F4 |
| Q-02 | Sin React Error Boundary: un error en render produce pantalla en blanco | `App.tsx` | F4 |
| Q-03 | Manejo de errores inconsistente: useRutas, useRepartidor, Dashboard, Reportes tragan errores | Cuatro módulos | F4 |
| Q-04 | Sin sistema de monitoreo ni error tracking (Sentry o equivalente) | Repositorio completo | F4 |
| Q-05 | Sin archivos de migración: schema no reproducible desde el repositorio | Raíz del proyecto | F4 |
| A-02 | `loadUserProfile` sin manejo de error: usuario autenticado puede quedar sin rol | `AuthContext.tsx:27-47` | F2 |
| A-03 | `onAuthStateChange` no llama `setLoading(false)`: spinner puede quedar activo | `AuthContext.tsx:60-73` | F2 |
| B-01 | `PedidoAccion.tsx` envía timestamps del reloj del dispositivo cliente, haciendo dead code el trigger servidor | `PedidoAccion.tsx:97-120` | F2 |
| B-02 | 3 operaciones no atómicas en `PedidoAccion.tsx`: storage + evidencias + pedido pueden quedar en estado parcial | `PedidoAccion.tsx:78-130` | F2 |
| B-03 | Estado `en_camino` definido en el enum pero inalcanzable desde ningún flujo de la UI | `PedidoDetalle.tsx`, `PedidoAccion.tsx` | F2 |
| B-06 | `fn_actualizar_contadores_ruta` no maneja `OLD.ruta_id`: pedidos reasignados corrompen contadores | Trigger en BD | F2 |
| C-02 | N+1 queries en `Repartidores.tsx`: 2N queries por carga de página | `Repartidores.tsx:48-65` | F3 |
| C-03 | N+1 queries en `Clientes.tsx`: N queries COUNT por carga de página | `Clientes.tsx` | F3 |
| C-04 | N+1 queries en `Reportes.tsx`: M queries paralelas por repartidor en el rango de fechas | `Reportes.tsx:125-139` | F3 |
| P-01 | Sin paginación en ninguna lista del sistema: 10.000 pedidos cargarían enteros al DOM | Todas las pages de lista | F3 |
| A-06 | Double query en `RutaDetalle.tsx` por campo `ruta_id` ausente en la vista | `RutaDetalle.tsx:32-44` | F1/F2 |
| A-07 | `useRutas` suprime todos los errores silenciosamente | `useRutas.ts:10-24` | F1/F2 |

### 🟡 MEDIOS (resolver en 60-90 días)

| ID | Hallazgo | Archivo(s) | Fase |
|----|----------|------------|------|
| S-09 | Sin cabeceras HTTP de seguridad (CSP, X-Frame-Options, HSTS) | `index.html`, `vite.config.ts` | F4 |
| S-10 | Sin límite de intentos de login en frontend | `Login.tsx` | F4 |
| S-11 | Validación Zod solo en Login y PedidoNuevo; formularios CRUD sin schema | `Repartidores.tsx`, `Clientes.tsx`, `Rutas.tsx` | F4 |
| S-12 | `anon_key` potencialmente comprometida si el repo fue público; amplificada por S-03 | — | F4 |
| Q-06 | README es única documentación, desactualizada y con credenciales | `README.md` | F4 |
| Q-07 | `setTimeout(800ms)` como mecanismo de detección de rol | `Login.tsx:33` | F4 |
| B-04 | `historial_estados.usuario_id` siempre NULL: trigger no registra quién cambió el estado | BD trigger | F2 |
| B-05 | `cambiarEstado()` sin lock optimista: dos operadores pueden cambiar el mismo pedido simultáneamente | `PedidoDetalle.tsx:48-72` | F2 |
| B-07 | `total_pedidos` en rutas no se actualiza al agregar pedidos desde `PedidoNuevo` | `PedidoNuevo.tsx:103-106` | F1/F2 |
| B-08 | Salto de 3 estados al crear pedido con ruta asignada | `PedidoNuevo.tsx:101` | F2 |
| P-02 | Búsqueda de texto sin índice trigram: `ILIKE '%texto%'` hace seq scan | BD (confirmado via EXPLAIN) | F3 |
| P-03 | Sin debounce en el campo de búsqueda de `Pedidos.tsx` (a diferencia de Clientes.tsx que sí lo tiene) | `Pedidos.tsx` | F3 |
| P-04 | Trigger `trg_rutas_contadores` sin cláusula WHEN: se ejecuta en cada UPDATE de cualquier campo de pedido | BD (confirmado via pg_get_triggerdef) | F3 |
| P-05 | Agregaciones de Reportes.tsx en JavaScript del cliente: todo el dataset viaja por red antes de calcular | `Reportes.tsx` | F3 |
| A-04 | Ruta `/pedidos/:id` renderiza `<Pedidos />` (la lista) en vez de `<PedidoDetalle />` | `App.tsx:84-88` | F1 |
| A-05 | `NAV_ITEMS` duplicado entre `Sidebar.tsx` y `Header.tsx`; link a `/configuracion` apunta a ruta inexistente | `Sidebar.tsx`, `Header.tsx` | F2 |
| A-08 | Casts TypeScript inseguros `as unknown as` en Reportes, Rutas, RutaDetalle | Tres archivos | F1/F2 |
| P-06 | Sin `AbortController` en ningún fetch: requests completadas tras unmount pueden causar setState en desmontados | Todos los hooks/pages | F3 |

### 🔵 BAJOS (backlog)

| ID | Hallazgo | Archivo(s) | Fase |
|----|----------|------------|------|
| S-13 | Sin CAPTCHA en login | `Login.tsx` | F4 |
| B-09 | `today()` calculado al montar: sesiones abiertas de día para otro usan fecha incorrecta | `utils.ts:32-34` | F2 |
| B-10 | "Buenos días" hardcodeado independientemente de la hora del día | `MiRuta.tsx:47` | F1/F2 |
| P-07 | `@supabase/supabase-js` en v2.45.4 (versión actual: 2.64+) — actualizaciones con mejoras de rendimiento disponibles | `package.json` | F1 |
| A-09 | 6 campos en `pedidos` declarados en TypeScript pero nunca escritos desde la UI (`foto_evidencia_url`, `firma_url`, `nombre_receptor`, etc.) | `types/index.ts` | F2 |

---

## 3. Hoja de Ruta Priorizada

### Semana 1 — Quick wins (máximo impacto, mínimo tiempo)

| Prioridad | Acción | Hallazgos | Tiempo estimado |
|-----------|--------|-----------|-----------------|
| 🔴 1 | **Rotar contraseñas de todos los usuarios** con credenciales individuales. Eliminar sección de credenciales del README. | S-01 | 1 hora |
| 🔴 2 | **Verificar y cambiar bucket `evidencias` a privado** en panel Supabase. Reemplazar `getPublicUrl()` por `createSignedUrl(path, 3600)` en `PedidoAccion.tsx`. | S-02 | 2 horas |
| 🟠 3 | **Agregar `try/catch` y estado `error`** a `useRutas.ts` y `useRepartidor.ts`. | Q-03, A-07 | 1 hora |
| 🟠 4 | **Agregar `<ErrorBoundary>`** en `App.tsx` con fallback de "algo salió mal". | Q-02 | 1 hora |
| 🟠 5 | **Sanitizar el input de búsqueda** antes de interpolarlo en `.or()` de PostgREST. | S-04 | 30 min |
| 🟠 6 | **Reemplazar `setTimeout(800ms)`** por `useEffect` reactivo al estado `rol` en Login.tsx. Agregar `setLoading(false)` en `onAuthStateChange`. | S-05, A-03 | 2 horas |
| 🔵 7 | **Agregar clave foránea** `usuarios.id → auth.users(id) ON DELETE CASCADE`. | S-08 | 30 min |

**Total semana 1:** ~8 horas de desarrollo.

---

### Corto plazo — Semanas 2-4 (corrección de arquitectura)

#### RLS por roles (semana 2)
El cambio de mayor impacto en seguridad. Requiere coordinar con el schema de BD.

```sql
-- 1. Función helper de rol
CREATE OR REPLACE FUNCTION auth_rol()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$;

-- 2. Políticas diferenciadas (ejemplo para pedidos)
DROP POLICY IF EXISTS "pedidos_auth" ON pedidos;
CREATE POLICY "pedidos_operador_supervisor_admin" ON pedidos
  FOR ALL USING (auth_rol() IN ('admin', 'operador', 'supervisor'));
CREATE POLICY "pedidos_repartidor_propios" ON pedidos
  FOR SELECT USING (auth_rol() = 'repartidor' AND repartidor_id = auth.uid());
```

Repetir para: `clientes`, `repartidores`, `rutas`, `evidencias`, `notificaciones`, `configuracion`, `historial_estados`.

#### Eliminar N+1 queries (semana 2-3)

1. **Repartidores**: Crear view `v_repartidor_stats` con JOIN a rutas y COUNT de pedidos. Una sola query.
2. **Clientes**: Agregar `pedidos_count` a la query principal con `SELECT *, (SELECT COUNT(*) FROM pedidos WHERE cliente_id = clientes.id)`.
3. **Reportes**: Mover las agregaciones a SQL (GROUP BY en queries Supabase) en lugar de JavaScript. Usar una RPC de Supabase si las agregaciones son complejas.

#### Versionado del schema (semana 3)
```bash
npm install -D supabase
npx supabase login
npx supabase db dump --schema-only > supabase/schema.sql
# A partir de aquí, usar supabase migrations new <nombre> para cada cambio
```

#### Testing inicial (semana 3-4)
```bash
npm install -D vitest @testing-library/react @testing-library/user-event
```
Prioridad de tests iniciales:
1. State machine de pedidos (transiciones válidas e inválidas).
2. `usePedidos` hook (filtros, búsqueda, paginación futura).
3. Login flow (navegación por rol, manejo de error).

#### Paginación en listas (semana 4)
Agregar `.range(offset, offset + PAGE_SIZE - 1)` a todas las queries de lista. Implementar controles de paginación simples (anterior/siguiente).

---

### Largo plazo — Semanas 5-12 (robustez y escala)

#### Atomicidad en operaciones críticas (semanas 5-6)
1. **`PedidoAccion.tsx`**: Crear una Supabase Edge Function `registrar-entrega` que ejecute storage upload + INSERT evidencias + UPDATE pedidos en una sola llamada. Eliminar las 3 operaciones secuenciales del cliente.
2. **`crearRuta()`**: Mover la lógica de INSERT ruta + UPDATE pedidos a una función PL/pgSQL con `PERFORM pg_advisory_xact_lock(pedido_id)` por pedido, eliminando la race condition C-01.
3. **`cambiarEstado()`**: Agregar check de concurrencia optimista:
   ```ts
   await supabase.from('pedidos')
     .update({ estado: nuevoEstado })
     .eq('id', pedidoId)
     .eq('estado', estadoActual)  // lock optimista
   ```

#### Monitoreo (semana 5)
Integrar Sentry (`@sentry/react`). Configurar Error Boundary para capturar excepciones. Crear alertas básicas para errores de autenticación y queries lentas.

#### Validación de estado en backend (semana 6-7)
Mover las transiciones de estado permitidas a una función PL/pgSQL con validación:
```sql
CREATE OR REPLACE FUNCTION cambiar_estado_pedido(
  p_pedido_id UUID, p_nuevo_estado estado_pedido
) RETURNS VOID AS $$
DECLARE
  v_estado_actual estado_pedido;
BEGIN
  SELECT estado INTO v_estado_actual FROM pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT (v_estado_actual, p_nuevo_estado) IN (
    ('recibido','verificado'), ('verificado','en_preparacion'), ...
  ) THEN
    RAISE EXCEPTION 'Transición inválida: % → %', v_estado_actual, p_nuevo_estado;
  END IF;
  UPDATE pedidos SET estado = p_nuevo_estado WHERE id = p_pedido_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Indexación (semana 7-8)
```sql
-- Búsqueda de texto libre
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_pedidos_num_trgm ON pedidos USING GIN (numero_pedido gin_trgm_ops);
CREATE INDEX idx_pedidos_fecha_estado ON pedidos (fecha_programada, estado);

-- Fix al trigger costoso
-- Reemplazar trg_rutas_contadores por versión con WHEN:
CREATE TRIGGER trg_rutas_contadores
AFTER UPDATE OF estado, ruta_id ON pedidos
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR OLD.ruta_id IS DISTINCT FROM NEW.ruta_id)
EXECUTE FUNCTION fn_actualizar_contadores_ruta();
```

#### Cabeceras de seguridad HTTP (semana 8)
En el hosting de producción (Vercel/Netlify), configurar:
```
Content-Security-Policy: default-src 'self'; connect-src https://ajbkzbtmknlmuucotdol.supabase.co; img-src 'self' data: blob: https://ajbkzbtmknlmuucotdol.supabase.co;
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

#### Validación uniforme con Zod (semana 9-10)
Centralizar schemas en `src/lib/schemas.ts` y aplicar a `Clientes.tsx`, `Repartidores.tsx` y `Rutas.tsx`.

#### Generación de tipos TypeScript desde Supabase (semana 10-12)
```bash
npx supabase gen types typescript --project-id ajbkzbtmknlmuucotdol > src/types/supabase.ts
```
Eliminar los casts `as unknown as` que compensan tipos inferidos incorrectamente.

---

## 4. Riesgos si el Sistema Escala en Volumen de Pedidos

### Riesgo 1 — Colapso de rendimiento a partir de ~200 pedidos diarios
**Causa:** N+1 queries en Repartidores (2N), Clientes (N), y Reportes (M) sin paginación ni caché.  
**Síntoma progresivo:** A 50 pedidos/día: lentitud notable en Reportes. A 200 pedidos/día: timeouts en Repartidores y Clientes. A 500 pedidos/día: el módulo de Reportes excede los límites de la capa gratuita de Supabase (conexiones concurrentes y tiempo de query).  
**Trigger crítico:** El crecimiento es cuadrático, no lineal. Duplicar los pedidos no duplica la carga, la multiplica por 4.

### Riesgo 2 — Corrupción de datos bajo carga concurrente
**Causa:** `crearRuta()` y `cambiarEstado()` no son atómicos. Bajo carga alta, dos operadores pueden:
- Asignar el mismo pedido a dos rutas distintas simultáneamente (C-01).
- Cambiar el estado de un pedido al mismo tiempo, produciendo historial inconsistente (B-05).

**Síntoma:** Con 1-2 operadores simultáneos, la probabilidad es baja. Con 5+ operadores en hora punta, los incidentes serán frecuentes. No hay forma de detectarlos sin tests (Q-01) ni monitoreo (Q-04).

### Riesgo 3 — Pérdida de datos por operaciones no atómicas en entrega
**Causa:** `PedidoAccion.tsx` hace 3 operaciones secuenciales no atómicas: storage → INSERT evidencias → UPDATE pedido.  
**Síntoma:** Con mala conectividad móvil (repartidores en campo), si la 2ª o 3ª operación falla, el sistema queda en estado parcial: foto subida a storage pero pedido sin actualizar, o evidencia registrada pero pedido con estado anterior. Sin retries automáticos ni transacciones, estos estados intermedios son permanentes.

### Riesgo 4 — Pantallas en blanco en producción sin diagnóstico
**Causa:** Sin Error Boundary (Q-02) ni Sentry (Q-04). Un error de JavaScript en el render de `Dashboard.tsx` (por ejemplo, si Supabase retorna un formato inesperado) produce pantalla en blanco.  
**Síntoma:** Los operadores no pueden trabajar. El equipo técnico no sabe qué pasó ni cuándo. El único diagnóstico es "algo no funciona" sin stack trace, sin contexto del usuario, sin timestamp.

### Riesgo 5 — Escalado de la brecha de seguridad RLS con más usuarios
**Causa:** S-03 — RLS sin enforcement de roles.  
**Síntoma actual (1-5 usuarios):** Brecha existe pero el impacto potencial es bajo porque los usuarios son conocidos.  
**Síntoma a escala (20-50 repartidores):** Un repartidor descontento o comprometido puede exfiltrar la lista completa de clientes con direcciones, teléfonos y patrones de pedido. Acceso a `configuracion` puede revelar parámetros del sistema. El surface de ataque crece linealmente con el número de cuentas de repartidor.

---

## Apéndice — Índice de Hallazgos por Documento de Fase

| Documento | Hallazgos | Descripción |
|-----------|-----------|-------------|
| [`01-reconocimiento.md`](01-reconocimiento.md) | Stack, schema, dependencias, estructura | Reconocimiento completo del proyecto |
| [`02-arquitectura-negocio.md`](02-arquitectura-negocio.md) | A-01..A-09, B-01..B-15 | Arquitectura, lógica de negocio, triggers |
| [`03-concurrencia-rendimiento.md`](03-concurrencia-rendimiento.md) | C-01..C-06, P-01..P-12 | Concurrencia, N+1, índices, rendimiento |
| [`04-seguridad-calidad.md`](04-seguridad-calidad.md) | S-01..S-13, Q-01..Q-07 | Seguridad, calidad, observabilidad |

**Total de hallazgos documentados:** ~62 (6 críticos, 21 altos, 18 medios, 4 bajos + preliminares)

---

*Fin del informe. Todos los hallazgos están respaldados por evidencia directa del código fuente o de consultas SQL a la base de datos de producción. Los ítems marcados como "pendiente de verificar" se indican explícitamente en el documento de fase correspondiente.*
