# Auditoría Fase 1 — Arquitectura y Estructura del Código

**Proyecto:** Akuarian Dispatch  
**Fecha:** 2026-06-14  
**Archivos analizados:** App.tsx, AuthContext.tsx, supabase.ts, types/index.ts, utils.ts, hooks (3), pages (10), package.json

---

## Resumen Ejecutivo

El proyecto tiene una arquitectura correcta para su escala (SPA React + Supabase). El código está bien organizado y es legible. Sin embargo, se detectaron **3 problemas críticos**, **7 altos** y **8 medios/bajos** que afectan corrección funcional, rendimiento y mantenibilidad.

---

## CRÍTICOS

### C-1 — Ruta `/pedidos/:id` renderiza el componente equivocado
**Archivo:** `src/App.tsx:84-88`

```tsx
<Route path="/pedidos/:id" element={
  <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
    <Pedidos />   // ← debería ser <PedidoDetalle /> o al menos abrir el drawer
  </ProtectedRoute>
} />
```

La ruta existe pero renderiza la lista general. Cualquier enlace directo a `/pedidos/some-id` muestra la lista sin abrir el detalle del pedido. El componente `PedidoDetalle` es un drawer que solo se abre vía `setSelectedId` desde `Pedidos.tsx`, no desde la URL. Los links directos (notificaciones, emails, copiar URL) no funcionan.

---

### C-2 — N+1 Queries en `Repartidores.tsx`
**Archivo:** `src/pages/Repartidores.tsx:48-65`

```ts
const pedidosCounts = await Promise.all(
  data.map(async (rep) => {
    const { data: rutas } = await supabase.from('rutas').select('id')...    // Query 1 por repartidor
    const { count } = await supabase.from('pedidos').select(...)...          // Query 2 por repartidor
  })
)
```

Para N repartidores se lanzan **2N queries paralelas**. Con 10 repartidores = 20 queries. Debería ser una sola query con `JOIN` o una view en Supabase.

---

### C-3 — N+1 Queries en `Reportes.tsx`
**Archivo:** `src/pages/Reportes.tsx:125-139`

```ts
const rend = await Promise.all(
  Object.values(rutasPorRep).map(async ({ rutaIds }) => {
    const { data: peds } = await supabase.from('pedidos').select('estado').in('ruta_id', rutaIds)
  })
)
```

Para M repartidores se lanzan M queries adicionales a `pedidos`. En un rango de 7 días con 10 repartidores, esto puede ser 10 queries extra encima de las 2 iniciales.

---

## ALTOS

### A-1 — `onAuthStateChange` nunca resetea `loading` a `false`
**Archivo:** `src/context/AuthContext.tsx:60-73`

`setLoading(false)` solo se llama en el handler de `getSession()` inicial (línea 54). Si el auth state cambia después (refresh de token, logout/login), `loadUserProfile` se ejecuta pero no hay `finally { setLoading(false) }`. El spinner de carga puede quedar activo indefinidamente si el estado cambia tras la inicialización.

---

### A-2 — Sin manejo de errores en `loadUserProfile`
**Archivo:** `src/context/AuthContext.tsx:27-47`

```ts
async function loadUserProfile(userId: string) {
  const { data: usuario } = await supabase.from('usuarios').select('rol, nombre')...
  // No hay manejo de error: si falla, rol = null silenciosamente
  if (usuario) { ... }
}
```

Si la query falla (red, RLS policy, usuario no existe en tabla `usuarios`), `rol` permanece `null`. El usuario queda autenticado en Supabase Auth pero sin rol, y `ProtectedRoute` no puede determinar a dónde redirigirlo correctamente (líneas 35-39 de App.tsx: la condición `rol && !requiredRole.includes(rol)` no entra porque `rol === null`). El usuario queda en un limbo de acceso sin mensaje de error.

---

### A-3 — `fetchPedidos` no está en `useCallback` en `useRepartidor.ts`
**Archivo:** `src/hooks/useRepartidor.ts:9-21`

```ts
async function fetchPedidos() {  // ← recreada en cada render
  setLoading(true)
  ...
}
useEffect(() => { fetchPedidos() }, [])   // dep array vacío: corre solo una vez
```

La función no está memoizada. Si se agrega a un `useEffect` con deps en el futuro, causará un loop infinito. La inconsistencia con `usePedidos.ts` y `useRutas.ts` (que sí usan `useCallback`) es un error de patrón.

---

### A-4 — `total_pedidos` en `rutas` no se actualiza automáticamente
**Archivo:** `src/pages/Rutas.tsx:59` y `src/pages/PedidoNuevo.tsx:103-106`

Al crear una ruta se fija `total_pedidos: seleccionados.size` (Rutas.tsx:59). Pero desde `PedidoNuevo.tsx`, al asignar un pedido a una ruta existente, solo se hace `INSERT` en `pedidos` con `ruta_id` — nunca se incrementa `rutas.total_pedidos`. El progreso de la ruta (barra en Dashboard, Rutas, RutaDetalle) quedará desactualizado.

---

### A-5 — Estado `en_camino` inalcanzable desde la UI
**Archivos:** `src/types/index.ts:1-10`, `src/pages/PedidoDetalle.tsx:21-27`, `src/pages/repartidor/PedidoAccion.tsx:97-99`

El enum `EstadoPedido` incluye `en_camino`. Sin embargo:
- `PedidoDetalle.tsx` (panel operador): no tiene ninguna acción para transicionar a `en_camino`.
- `PedidoAccion.tsx` (vista repartidor): produce `recogido`, `entregado` o `no_entregado`, nunca `en_camino`.

El estado existe en la base de datos y en el filtro de `MiRuta.tsx:9` (`PENDIENTES`), pero ningún flujo de la aplicación lo establece. O es un estado obsoleto o falta implementar la transición.

---

### A-6 — Double query innecesaria en `RutaDetalle.tsx`
**Archivo:** `src/pages/RutaDetalle.tsx:32-44`

```ts
// Query 1: obtener IDs de pedidos de la ruta
const { data: rawPedidos } = await supabase.from('pedidos').select('id').eq('ruta_id', id)
// Query 2: buscar esos IDs en la vista
const { data } = await supabase.from('v_pedidos_detalle').select('*').in('id', ids)
```

La causa raíz es que `VPedidoDetalle` (el tipo de la vista `v_pedidos_detalle`) no incluye `ruta_id`, solo `ruta_nombre`. Por eso no se puede filtrar directamente. La vista debería exponer `ruta_id` para eliminar la primera query.

---

### A-7 — `useRutas` silencia todos los errores
**Archivo:** `src/hooks/useRutas.ts:10-24`

```ts
try {
  const { data } = await supabase.from('rutas').select(...)
  setRutas(...)
} finally {
  setLoading(false)  // ← sin catch, sin setError
}
```

Los errores de red o de RLS en las rutas se tragan silenciosamente. La UI muestra "No hay rutas para esta fecha" cuando en realidad hubo un error.

---

## MEDIOS

### M-1 — `PedidoNuevo` salta 3 estados del flujo al asignar ruta
**Archivo:** `src/pages/PedidoNuevo.tsx:101`

```ts
const estado = data.ruta_id ? 'listo_despacho' : 'recibido'
```

Al asignar un pedido directamente a una ruta, se crea con estado `listo_despacho`, saltando `recibido → verificado → en_preparacion`. El trigger `fn_registrar_cambio_estado()` solo registrará el estado inicial, sin historial previo. Puede ser intencional, pero no es consistente con el flujo normal.

---

### M-2 — Casts TypeScript inseguros (`as unknown as`)
**Archivos:** `Reportes.tsx:117`, `Rutas.tsx:129`, `RutaDetalle.tsx:57`

```ts
const repData = r.repartidor as unknown as { nombre: string } | null  // Reportes.tsx
const rep = ruta.repartidor as Repartidor | undefined                  // Rutas.tsx, RutaDetalle.tsx
```

Estos casts ocurren porque Supabase infiere los datos de join como tipos genéricos que no coinciden con las interfaces TypeScript definidas manualmente. La solución correcta es generar los tipos desde la base de datos con `supabase gen types typescript`.

---

### M-3 — Doble verificación de `loading` en `App.tsx`
**Archivo:** `src/App.tsx:25-31` y `src/App.tsx:46-53`

Tanto `ProtectedRoute` como `AppRoutes` verifican `const { loading } = useAuth()` y muestran un spinner. Si `loading` es true, `AppRoutes` muestra spinner Y si llega a renderizar `ProtectedRoute`, este muestra otro spinner. Redundancia que podría producir doble flash de loading.

---

### M-4 — `filtros` como objeto inline rompe memoización de `usePedidos`
**Archivo:** `src/hooks/usePedidos.ts:44` y `src/pages/Pedidos.tsx:29-33`

```ts
// usePedidos.ts
}, [filtros.fecha, filtros.estado, filtros.busqueda])  // ← bien: deps individuales
```

El hook extrae las props individuales, lo cual está bien. Pero si en el futuro se llama con `usePedidos({})` como prop inline, el objeto se recrea en cada render aunque los valores no cambien. El patrón actual en `Pedidos.tsx` usa variables de estado individuales, así que está correcto — solo es un riesgo latente.

---

### M-5 — Sin `AbortController` en los fetches
**Todos los hooks y páginas**

Ningún fetch usa `AbortController`. Si el usuario navega rápidamente entre páginas, los requests pueden completarse después del unmount y llamar a `setState` en componentes desmontados, produciendo warnings de React y potencial data race.

---

### M-6 — `today()` calculado al montar, no al hacer fetch
**Archivo:** `src/lib/utils.ts:32-34`

```ts
export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
```

El valor de "hoy" se fija cuando el componente renderiza por primera vez. Si un operador deja la app abierta de un día para otro sin recargar, todos los filtros y queries seguirán usando la fecha del día anterior.

---

### M-7 — Hardcoded "Buenos días" en `MiRuta.tsx`
**Archivo:** `src/pages/repartidor/MiRuta.tsx:47`

```tsx
<h1>Buenos días, {nombreUsuario?.split(' ')[0]}</h1>
```

No varía según la hora. Un repartidor que entra a las 3pm ve "Buenos días".

---

### M-8 — `Clientes.tsx` no fue auditado en esta fase
El archivo `src/pages/Clientes.tsx` y los componentes UI (`Button`, `Card`, `Input`, `Modal`) quedan para fases posteriores.

---

## Dependencias del Proyecto

| Paquete | Versión | Observación |
|---|---|---|
| `@supabase/supabase-js` | ^2.45.4 | Estable. La v2 actual es 2.64+, hay versiones disponibles. |
| `react` | ^18.3.1 | Correcto. |
| `react-router-dom` | ^6.28.0 | Correcto. |
| `@hookform/resolvers` | ^5.4.0 | Versión mayor reciente (5.x). Compatibilidad con `react-hook-form` ^7 a verificar. |
| `zod` | ^3.23.8 | Estable. |
| `recharts` | ^2.13.3 | Estable. |
| `date-fns` | ^3.6.0 | v3 — breaking changes respecto a v2; uso correcto verificado. |

**Sin tests**: No hay archivos de test (`.test.ts`, `.spec.ts`, Vitest/Jest config). Todo es manual.

**Sin ESLint/Prettier config**: No se encontró `.eslintrc` ni `.prettierrc`. El build solo corre `tsc`.

---

## Mapa de Severidades

```
CRÍTICO  ████ C-1 (ruta rota), C-2 (N+1 repartidores), C-3 (N+1 reportes)
ALTO     ████████████████ A-1..A-7
MEDIO    ████████████████ M-1..M-8
```

---

## Siguiente Fase Sugerida

**Fase 2 — Seguridad y RLS**: revisar políticas Row Level Security en Supabase, validación de inputs, exposición de datos entre roles, y el manejo de `auth_user_id` vs `usuario_id` en repartidores.
