# Plan de Producción — Akuarian Dispatch

**Elaborado:** 2026-06-14  
**Estado:** Pendiente de ejecución (post-demo)  
**Referencia:** Auditoría de seguridad y concurrencia realizada en la misma fecha

---

## 1. Decisión de infraestructura

**Acción requerida antes de ir a producción con datos reales de clientes:**  
Subir el proyecto Supabase al plan **Pro** ($25/mes por organización, incluye $10 de créditos de cómputo).

**Motivo principal:**  
El plan Free no tiene backups (retención 0 días) y se pausa automáticamente tras 7 días de inactividad. Ambas condiciones lo hacen inaceptable para producción con PII de clientes. Supabase recomienda oficialmente el plan Pro para cualquier uso en producción.

**Beneficio adicional:**  
El plan Pro habilita `supabase branch`, necesario para probar las migraciones de RLS y otros cambios de schema en una rama aislada antes de tocar el proyecto de producción. Este flujo es especialmente importante para las correcciones de la Sección 3.

---

## 2. Regla de manejo de credenciales

**Regla permanente:** NUNCA pegar la contraseña de la base de datos ni ninguna credencial en el chat con el agente.

**Para inspeccionar el schema o ejecutar SQL de diagnóstico**, usar exclusivamente una de estas dos vías:
- Los tools MCP de Supabase ya conectados en esta sesión (`list_tables`, `execute_sql`): el agente los invoca directamente sin necesitar la contraseña.
- Ejecutar `supabase db dump --schema-only` localmente desde la terminal del equipo: el CLI de Supabase solicita la contraseña en la terminal del humano, no en el chat.

---

## 3. Bloqueantes críticos de seguridad (semana 1 de producción)

Estos hallazgos deben estar resueltos antes de que cualquier dato real de clientes entre al sistema.

---

### SA-05 / SA-06 / SA-07 / SA-08 — RLS sin diferenciación de roles

**Descripción:**  
Todas las tablas (9/9) tienen la misma policy:
```sql
USING (auth.role() = 'authenticated')
```
Esta expresión es `true` para todos los usuarios logueados sin importar su rol de negocio. La separación de roles (admin / operador / supervisor / repartidor) existe únicamente en el frontend. Cualquier usuario con un JWT válido puede acceder directamente a la API REST de Supabase y:
- Leer todos los pedidos, clientes (incluyendo coordenadas GPS), rutas e historial (SA-06).
- Modificar o eliminar cualquier fila de cualquier tabla, incluyendo los pedidos de otros repartidores (SA-07).
- **Autopromoverse a admin**: hacer `PATCH /rest/v1/usuarios` con `{"rol": "admin"}` sobre su propio registro — la policy de la tabla `usuarios` no distingue roles (SA-08). Este es el vector más grave porque da control total del sistema en un solo request.

**Archivos:** Todas las tablas en la BD de producción. La única protección real actual está en `src/App.tsx` (`ProtectedRoute`) y `src/pages/PedidoDetalle.tsx` (objeto `ACCIONES`).

**Caso especial — tabla `usuarios`:**  
La tabla `usuarios` no tiene FK a `auth.users(id)`. Esto significa que un usuario puede existir en `auth.users` sin entrada en `usuarios` (y quedar con `rol = null`, estado indeterminado en la UI), o viceversa. La FK faltante (`usuarios.id → auth.users(id) ON DELETE CASCADE`) debe crearse como parte de esta corrección.

**Solución acordada:**

```sql
-- 1. Función helper que lee el rol del usuario actual desde public.usuarios
CREATE OR REPLACE FUNCTION auth_rol()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$;

-- 2. Eliminar policy genérica y crear policies diferenciadas por tabla y operación
-- Ejemplo para la tabla pedidos:
DROP POLICY IF EXISTS "Acceso autenticado – pedidos" ON pedidos;

CREATE POLICY "pedidos_staff_all" ON pedidos
  FOR ALL USING (auth_rol() IN ('admin', 'operador', 'supervisor'));

CREATE POLICY "pedidos_repartidor_propios" ON pedidos
  FOR SELECT USING (auth_rol() = 'repartidor' AND repartidor_id = auth.uid());

-- 3. Políticas especiales para tabla usuarios (prevenir escalada)
DROP POLICY IF EXISTS "Acceso autenticado – usuarios" ON usuarios;

CREATE POLICY "usuarios_self_read" ON usuarios
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "usuarios_admin_write" ON usuarios
  FOR ALL USING (auth_rol() = 'admin')
  WITH CHECK (auth_rol() = 'admin');

-- 4. FK faltante
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_auth_id_fk
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

Repetir el patrón de policies diferenciadas para: `clientes`, `repartidores`, `rutas`, `evidencias`, `notificaciones`, `configuracion`, `historial_estados`.

**Nota de proceso:** Desarrollar y probar estas migraciones en una `supabase branch` (requiere plan Pro) antes de aplicar a producción.

---

### SA-14 — Credenciales en texto plano en README.md

**Descripción:**  
`README.md` (líneas 129–140) contiene la contraseña universal `Akuarian2024!` y los emails de los 6 usuarios del sistema (`admin@akuarian.pe`, `operador@akuarian.pe`, `supervisor@akuarian.pe`, `carlos@akuarian.pe`, `luis@akuarian.pe`, `pedro@akuarian.pe`). Están versionadas en el commit inicial `35a7b9c`, por lo que permanecen en el historial de git aunque se eliminen del archivo.

**Impacto combinado:** Esta información + la vulnerabilidad SA-08 permiten a cualquier persona con acceso al repositorio obtener control total del sistema en dos pasos.

**Acciones requeridas:**
1. Rotar las contraseñas de **todos** los usuarios con credenciales individuales (la contraseña universal implica que todos comparten la misma credencial — cambiarla de forma coordinada).
2. Eliminar la sección de credenciales del `README.md` y crear un nuevo commit.
3. Auditar si el repositorio fue clonado externamente o si el commit `35a7b9c` llegó a ser público.
4. El commit viejo queda en el historial de git — si el repo es privado y permanece así, el riesgo es acotado; si alguna vez se hace público, las credenciales rotadas son seguras pero los emails quedan expuestos.
5. A partir de ahora, cada usuario tiene su propia contraseña generada aleatoriamente. Sin contraseñas compartidas.

---

### SA-19 / S-02 — Bucket `evidencias` público

**Descripción:**  
El bucket de Storage `evidencias` está configurado como público. El código usa `getPublicUrl()` en `src/pages/repartidor/PedidoAccion.tsx:84`, lo que genera URLs permanentes sin token de autenticación. Las fotos de entrega contienen imágenes de fachadas de domicilios y posiblemente personas.

El patrón de URL predecible (`/storage/v1/object/public/evidencias/{pedido_id}/{tipo}/{timestamp}.ext`), combinado con el IDOR de SA-06 que expone los `pedido_id`, permite enumerar fotos de entregas pasadas sin autenticación.

**Archivos:** `src/pages/repartidor/PedidoAccion.tsx:84-92`

**Solución acordada:**
1. Cambiar el bucket a **privado** desde el panel de Supabase Storage.
2. Reemplazar `getPublicUrl()` por `createSignedUrl(path, 3600)` (URL firmada, válida 1 hora).
3. En la BD: almacenar el `path` relativo en la columna `foto_url` de la tabla `evidencias`, no la URL absoluta. Generar la URL firmada en el momento de visualizar (en `PedidoDetalle.tsx` al cargar evidencias).

---

### CC-02 — Race condition de doble asignación de pedidos a rutas

**Descripción:**  
`crearRuta()` en `src/pages/Rutas.tsx:48-83` hace dos transacciones separadas:
1. `INSERT INTO rutas` (Transacción 1)
2. `UPDATE pedidos SET ruta_id = ...` (Transacción 2, HTTP request independiente)

Si dos operadores abren el modal "Nueva ruta" simultáneamente y seleccionan el mismo pedido, ambos INSERT de rutas tienen éxito, y el segundo UPDATE de pedidos sobreescribe silenciosamente al primero (LAST WRITE WINS bajo READ COMMITTED). El repartidor de la primera ruta sale a repartir un bulto que el sistema ya no le asigna.

No hay ningún mecanismo preventivo: sin `SELECT FOR UPDATE`, sin lock, sin validación de que los pedidos siguen disponibles.

**Archivos:** `src/pages/Rutas.tsx:48-83`

**Solución acordada:** Mover `crearRuta()` a una función PL/pgSQL que use `SELECT FOR UPDATE` para lockear los pedidos antes de asignarlos, e invocarla con `supabase.rpc('crear_ruta_con_pedidos', {...})`. La función valida que todos los pedidos seleccionados siguen sin ruta antes de proceder; si alguno fue tomado por otra transacción concurrente, lanza excepción con mensaje claro al operador.

---

## 4. Antes del rollout completo (post-demo, pre-producción amplia)

Estos hallazgos no bloquean la demo ni el arranque inicial con pocos usuarios, pero deben resolverse antes de sumar más repartidores o aumentar el volumen de pedidos.

---

### CC-06 — Tres operaciones no atómicas en la entrega móvil

**Descripción:**  
`PedidoAccion.tsx:75-122` realiza tres operaciones secuenciales e independientes:
1. Upload de foto a Storage
2. `INSERT` en tabla `evidencias`
3. `UPDATE` del estado del pedido en `pedidos`

Bajo conectividad móvil degradada (repartidores en campo), un timeout de red en la Operación 3 deja el sistema en estado parcial permanente: la foto está subida y la evidencia registrada, pero el pedido no cambió de estado. Al reintentar, se genera una segunda evidencia duplicada con otro timestamp. No hay rollback ni compensación.

**Archivos:** `src/pages/repartidor/PedidoAccion.tsx:75-122`

**Por qué es crítico para este uso:** Los repartidores operan en celulares con señal variable. Este es el flujo más ejecutado del sistema (cada entrega lo recorre). Los estados parciales son permanentes y acumulan inconsistencias sin ningún mecanismo de detección.

**Solución acordada:** Crear una Supabase Edge Function `registrar-entrega` que consolide las tres operaciones. El cliente envía foto + metadata en una sola llamada; la Edge Function maneja el upload al Storage y las escrituras a la BD con manejo de errores centralizado. Si algo falla, la función puede hacer cleanup antes de retornar error al cliente.

---

### A-01 / CC-05 — State machine de pedidos solo en el frontend

**Descripción:**  
Las transiciones de estado válidas (ej. `recibido → verificado`, `verificado → en_preparacion`) están definidas solo en el objeto `ACCIONES` de `src/pages/PedidoDetalle.tsx:21-27`. La base de datos no valida ninguna transición.

Cualquier cliente con un JWT válido puede hacer `PATCH /rest/v1/pedidos` con cualquier estado y el UPDATE se aplica sin error. Un pedido puede saltar de `recibido` a `entregado` sin pasar por ningún estado intermedio, sin foto de evidencia, sin repartidor asignado.

Adicionalmente, sin un lock optimista en `cambiarEstado()`, dos operadores con el mismo pedido abierto pueden producir retrocesos de estado: Op B (con vista desactualizada) sobreescribe el estado que Op A ya avanzó, y el historial queda con secuencias inválidas como `en_preparacion → listo_despacho → en_preparacion`.

**Archivos:** `src/pages/PedidoDetalle.tsx:21-27` (ACCIONES), `src/pages/PedidoDetalle.tsx:55-72` (cambiarEstado)

**Solución acordada:**
1. Corto plazo — lock optimista en `cambiarEstado()`:
   ```ts
   await supabase.from('pedidos')
     .update({ estado: nuevoEstado })
     .eq('id', pedidoId)
     .eq('estado', estadoActual)  // guard: falla si el estado cambió mientras tanto
   ```
2. Largo plazo — función PL/pgSQL `cambiar_estado_pedido(p_pedido_id, p_nuevo_estado)` en la BD que valide la transición, haga el UPDATE con `FOR UPDATE`, y lance excepción si la transición no es válida. Invocar con `supabase.rpc(...)`.

---

## 5. Robustez y observabilidad (producción)

Necesarios para operar con confianza una vez que el sistema esté en producción activa.

---

### Q-04 — Sin sistema de monitoreo ni error tracking

**Descripción:** Sin Sentry ni equivalente. Un error de render en cualquier página produce pantalla en blanco sin stack trace, sin contexto del usuario, sin timestamp. El equipo técnico no puede diagnosticar incidentes en producción.

**Acción:** Integrar `@sentry/react`. Configurar un `<ErrorBoundary>` global en `src/App.tsx` que capture excepciones y las envíe a Sentry. Crear alertas básicas para errores de autenticación y queries con latencia alta.

---

### Q-01 — Cobertura de tests: 0%

**Descripción:** Sin framework de testing. No hay manera de verificar que un cambio de código no rompe un flujo existente.

**Acción:** Instalar Vitest + Testing Library. Comenzar por los flujos de mayor riesgo:
1. State machine de pedidos (transiciones válidas e inválidas).
2. Flujo de login (navegación por rol, manejo de error, estado null).

---

### Q-05 — Sin archivos de migración: schema no reproducible

**Descripción:** No hay archivos de migración en el repositorio. El schema actual solo existe en la BD de producción. Si hay que reproducir el entorno o se corrompe la BD, no hay forma de reconstruir el schema desde el código.

**Acción:**
```bash
supabase db dump --schema-only > supabase/schema.sql
# A partir de aquí, cada cambio de schema usa:
supabase migrations new <nombre-descriptivo>
```
Versionar todas las migraciones en el repositorio bajo `/supabase/migrations/`.

---

## 6. Rendimiento (cuando suba el volumen, ~200 pedidos/día)

Estos puntos no son urgentes en el arranque pero se vuelven críticos a medida que crece el volumen. El crecimiento es cuadrático, no lineal: duplicar los pedidos multiplica la carga por 4 en los módulos N+1.

---

### C-02 / C-03 / C-04 — Queries N+1 en Repartidores, Clientes y Reportes

- **C-02** (`src/pages/Repartidores.tsx:48-65`): Carga N repartidores con 2N queries (una por repartidor para obtener sus stats de ruta). Solución: crear view `v_repartidor_stats` con JOIN.
- **C-03** (`src/pages/Clientes.tsx`): Carga N clientes con N queries COUNT adicionales. Solución: subquery en la query principal.
- **C-04** (`src/pages/Reportes.tsx:125-139`): Lanza M queries paralelas (una por repartidor en el rango de fechas). Solución: mover las agregaciones a SQL con `GROUP BY` en Supabase RPC.

---

### P-01 — Sin paginación en ninguna lista

**Descripción:** Todas las listas (pedidos, clientes, repartidores, rutas) cargan el dataset completo. Con 10.000 pedidos, todos se cargarían al DOM en un solo request.

**Acción:** Agregar `.range(offset, offset + PAGE_SIZE - 1)` a todas las queries de lista. Implementar controles de paginación (anterior/siguiente) en cada página de lista.

---

### P-02 — Búsqueda de texto sin índice trigram

**Descripción:** Los campos `numero_pedido` y `nombre` se buscan con `ILIKE '%texto%'`, que fuerza un sequential scan completo de la tabla en cada búsqueda.

**Acción:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_pedidos_num_trgm ON pedidos USING GIN (numero_pedido gin_trgm_ops);
```

---

### P-04 — Trigger `trg_rutas_contadores` sin cláusula WHEN

**Descripción:** El trigger dispara en **cualquier** UPDATE de cualquier campo de `pedidos`, incluyendo campos irrelevantes para los contadores (observaciones, descripcion_carga, etc.). Esto ejecuta 3 SELECTs COUNT + 1 UPDATE extra por cada actualización de pedido, incluyendo las que no cambian ni el estado ni la ruta.

**Acción:**
```sql
-- Reemplazar el trigger por versión con WHEN clause
CREATE TRIGGER trg_rutas_contadores
AFTER INSERT OR UPDATE OF estado, ruta_id ON pedidos
FOR EACH ROW
WHEN (
  OLD.estado IS DISTINCT FROM NEW.estado OR
  OLD.ruta_id IS DISTINCT FROM NEW.ruta_id
)
EXECUTE FUNCTION fn_actualizar_contadores_ruta();
```

---

## 7. Plan de ejecución

El orden de ejecución prioriza cerrar los vectores de seguridad antes de cualquier otra mejora, porque la mayoría de vulnerabilidades de rendimiento y robustez son irrelevantes si los datos pueden ser exfiltrados o modificados por cualquier usuario autenticado.

```
SEMANA 1 — Seguridad crítica (pre-producción obligatorio)
  1. Rotar credenciales + limpiar README (SA-14) ..................... 1 hora
  2. Bucket evidencias a privado + signed URLs (SA-19/S-02) .......... 2 horas
  3. Función auth_rol() + RLS por roles en todas las tablas ........... 1 día
     (SA-05/SA-06/SA-07/SA-08) — en supabase branch antes de aplicar
  4. FK usuarios.id → auth.users(id) ................................ 30 min
  5. Race condition crearRuta() → función PL/pgSQL (CC-02) ........... 4 horas

  Total estimado: ~2 días de desarrollo

SEMANA 2 — Atomicidad y state machine (pre-rollout amplio)
  6. Edge Function registrar-entrega (CC-06) ......................... 1 día
  7. Lock optimista en cambiarEstado() (CC-04/CC-05 paso 1) .......... 2 horas
  8. State machine en BD — función cambiar_estado_pedido (CC-05) ..... 1 día

SEMANA 3 — Robustez y observabilidad
  9. Sentry + ErrorBoundary (Q-04/Q-02) ............................. 4 horas
  10. Framework de tests — Vitest + casos iniciales (Q-01) ........... 2 días
  11. Migraciones de schema en el repo (Q-05) ........................ 2 horas

SEMANA 4+ — Rendimiento (según volumen real observado)
  12. Eliminar N+1 queries con views/JOINs (C-02/C-03/C-04)
  13. Paginación en todas las listas (P-01)
  14. Índice trigram para búsqueda de texto (P-02)
  15. WHEN clause en trigger trg_rutas_contadores (P-04)
```

**Principio guía:** RLS cierra la mayoría de vectores de seguridad de una sola vez (SA-05 es la raíz de SA-06, SA-07, SA-08 y SA-09). Una vez cerrado ese vector, las mejoras de atomicidad y state machine reducen el riesgo de corrupción de datos bajo carga. La robustez (tests, monitoreo) da visibilidad sobre incidentes. El rendimiento se aborda último porque los síntomas son graduales y predecibles según el volumen real observado en producción.
