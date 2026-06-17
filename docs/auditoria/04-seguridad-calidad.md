# FASE 4 — Seguridad, Calidad e Informe de Observabilidad

**Proyecto:** Akuarian Dispatch  
**Fecha:** 2026-06-14  
**Analista:** Claude Sonnet 4.6  
**Metodología:** Análisis estático de código + consultas directas a la BD via MCP

---

## A — Seguridad

### Severidades

| ID | Severidad | Área |
|----|-----------|------|
| S-01 | 🔴 CRÍTICA | Control de acceso — credenciales |
| S-02 | 🔴 CRÍTICA | Control de acceso — storage |
| S-03 | 🔴 CRÍTICA | Autorización — RLS |
| S-04 | 🟠 ALTA | Inyección — filtros PostgREST |
| S-05 | 🟠 ALTA | Autenticación — race condition de rol |
| S-06 | 🟠 ALTA | Información — errores técnicos expuestos |
| S-07 | 🟠 ALTA | Datos sensibles — PIN en texto plano |
| S-08 | 🟠 ALTA | Integridad — usuarios sin FK a auth.users |
| S-09 | 🟡 MEDIA | Cabeceras HTTP de seguridad ausentes |
| S-10 | 🟡 MEDIA | Control de acceso — sin límite de intentos |
| S-11 | 🟡 MEDIA | Validación de inputs incompleta |
| S-12 | 🟡 MEDIA | Secretos — anon key potencialmente comprometida |
| S-13 | 🔵 BAJA | Sin CAPTCHA en login |

---

### S-01 · CRÍTICA — README.md contiene contraseña universal y emails de todas las cuentas en texto plano

**Ubicación:** `README.md` (sección "Usuarios de prueba")

**Descripción:**  
El archivo README.md, incluido en el commit inicial del repositorio, contiene en texto claro:

```
Password universal: Akuarian2024!

admin@akuarian.pe
operador@akuarian.pe
supervisor@akuarian.pe
carlos@akuarian.pe
luis@akuarian.pe
pedro@akuarian.pe
```

Expone también el identificador real del proyecto Supabase (`ajbkzbtmknlmuucotdol`) y la URL de producción.

Si el repositorio es público o se comparte con terceros (auditor, nuevo empleado, proveedor), **cualquier persona obtiene acceso total a todos los roles del sistema**, incluyendo `admin`. La contraseña universal implica que todos los usuarios comparten la misma credencial, lo que impide la trazabilidad de acciones y hace que la rotación de credenciales sea una operación de alto riesgo (cambiar la contraseña de uno afecta a todos).

**Impacto:** Compromiso total del sistema — lectura/escritura de pedidos, clientes, repartidores y configuración.

**Recomendación:**
1. Rotar **inmediatamente** la contraseña de todos los usuarios listados con credenciales individuales.
2. Eliminar la sección de credenciales del README en el próximo commit.
3. Nunca documentar contraseñas en repositorios. Usar un gestor de secretos (1Password Teams, Bitwarden, AWS Secrets Manager) o un canal cifrado.
4. Auditar el historial de `git log` para verificar si en algún commit previo estuvo también el archivo `.env` (aunque `.gitignore` lo excluye actualmente).

---

### S-02 · CRÍTICA — Bucket `evidencias` aparentemente público: fotos de entrega accesibles sin autenticación

**Ubicación:** `src/pages/repartidor/PedidoAccion.tsx:89-92`

**Descripción:**  
El código usa `getPublicUrl()` de Supabase Storage, que genera URLs permanentes accesibles **sin ningún token de autenticación**:

```ts
const { data: urlData } = supabase.storage
  .from('evidencias')
  .getPublicUrl(uploadData.path)
fotoUrl = urlData.publicUrl
```

`getPublicUrl()` solo funciona si el bucket está configurado como **público** en el panel de Supabase. El uso de `createSignedUrl()` (URL temporal con expiración) sería la alternativa para buckets privados.

Las evidencias fotográficas incluyen fotos de fachadas de domicilios, puertas, y posiblemente personas. Cualquier agente con conocimiento del patrón de URL (`{SUPABASE_URL}/storage/v1/object/public/evidencias/{pedido_id}/{tipo}/{timestamp}.ext`) puede descargar estas imágenes sin autenticarse.

El patrón de path es predecible: `pedido_id` es un UUID, `tipo` es `entrega` o `recogida`, y `timestamp` es un ISO timestamp — suficiente para que un atacante con acceso a cualquier dato del sistema construya URLs válidas.

**Pendiente de verificar:** La configuración real del bucket en el panel Supabase Storage (la consulta SQL a `storage.buckets` no retornó resultados, posiblemente por política RLS sobre el schema `storage`).

**Recomendación:**
1. Cambiar el bucket a **privado** en Supabase Storage.
2. Reemplazar `getPublicUrl()` por `createSignedUrl(path, 3600)` (URL firmada de 1 hora).
3. Almacenar el path en la BD, no la URL completa — generar URLs firmadas en tiempo de visualización.

---

### S-03 · CRÍTICA — Políticas RLS sin enforcement de roles: cualquier usuario autenticado accede a todos los datos

**Ubicación:** Supabase — políticas RLS en todas las tablas (verificado via `pg_policies`)

**Descripción:**  
Todas las políticas RLS del proyecto usan únicamente:

```sql
USING (auth.role() = 'authenticated')
```

No se verifica el rol de negocio (`admin`, `operador`, `repartidor`, etc.) almacenado en `usuarios.rol`. El resultado:

- Un **repartidor** autenticado puede ejecutar `SELECT * FROM clientes` via API REST y obtener todos los clientes.
- Un **repartidor** puede ejecutar `UPDATE pedidos SET estado = 'entregado'` en pedidos que no son suyos.
- Un **repartidor** puede `INSERT INTO repartidores` y crear cuentas nuevas.
- Un **operador** puede leer la tabla `configuracion` completa.

La separación de roles existe **únicamente en el frontend** (React Router + `ProtectedRoute`). Cualquier usuario que acceda directamente a la API PostgREST de Supabase (con su JWT válido) obtiene acceso completo a todos los datos del sistema.

**Evidencia:** El trigger `fn_registrar_cambio_estado` y la view `v_repartidor_mis_pedidos` usan `auth.uid()` para filtrar por repartidor — lo que demuestra que la infraestructura de RLS está disponible pero no se usa en las policies de las tablas base.

**Recomendación:**
1. Crear una función helper en Supabase: `CREATE FUNCTION auth_rol() RETURNS TEXT AS $$ SELECT rol FROM public.usuarios WHERE id = auth.uid() $$ LANGUAGE SQL SECURITY DEFINER STABLE;`
2. Refinar cada política por tabla y rol. Ejemplo para `clientes`:
   ```sql
   USING (auth_rol() IN ('admin', 'operador', 'supervisor'))
   ```
3. Para `pedidos`, la política de repartidor debería limitar a sus propios pedidos: `USING (auth_rol() != 'repartidor' OR repartidor_id = auth.uid())`

---

### S-04 · ALTA — Inyección de filtros PostgREST vía interpolación directa en `.or()`

**Ubicación:** `src/hooks/usePedidos.ts:32-34`

**Descripción:**  
El input de búsqueda del usuario se inserta directamente en una cadena de filtros PostgREST:

```ts
query = query.or(
  `numero_pedido.ilike.%${filtros.busqueda}%,cliente_nombre.ilike.%${filtros.busqueda}%`
)
```

PostgREST parsea la cadena separada por comas como múltiples condiciones. Un input malicioso puede manipular el conjunto de resultados:

- Input: `abc%,estado.eq.entregado` → agrega condición `estado = 'entregado'` al OR, devolviendo pedidos que el operador no esperaba ver en el contexto actual.
- Input: `%` → `.ilike.%%` matchea todos los registros, ignorando filtros de fecha u operador.

Esto no es una inyección SQL clásica (PostgREST usa queries parametrizadas internamente para los valores), pero sí es una **manipulación de lógica de filtrado** que puede exponer datos no intencionados o bypassear filtros de UI.

**Recomendación:**
1. Sanitizar el input antes de interpolarlo, escapando los caracteres especiales del parser PostgREST (`,`, `.`, `(`):
   ```ts
   const safe = filtros.busqueda.replace(/[,.()\[\]]/g, '')
   query = query.or(`numero_pedido.ilike.%${safe}%,cliente_nombre.ilike.%${safe}%`)
   ```
2. O usar `.textSearch()` con vectores de búsqueda full-text en lugar de `.or()` manual.

---

### S-05 · ALTA — Race condition en detección de rol post-login: uso de stale closure + `setTimeout` como workaround

**Ubicación:** `src/pages/Login.tsx:28-40`

**Descripción:**  
Tras el `signIn()` exitoso, el código espera 800ms y lee `rol` desde el closure:

```ts
const { signIn, rol } = useAuth()  // rol capturado al momento del render

async function onSubmit(data) {
  await signIn(data.email, data.password)
  await new Promise(r => setTimeout(r, 800))  // hack: esperar que AuthContext actualice
  const currentRol = rol  // ← stale closure: valor de rol al momento que onSubmit fue definido
  if (currentRol === 'repartidor') navigate('/mi-ruta')
  else navigate('/dashboard')
}
```

`rol` en `onSubmit` es el valor capturado en el render **antes** del login (siempre `null`). El `setTimeout(800ms)` puede permitir que React re-renderice `Login` con el nuevo `rol`, pero `onSubmit` en ejecución sigue usando el valor del closure anterior.

Si la red es lenta (> 800ms para `loadUserProfile`), **todos los usuarios navegan a `/dashboard`** independientemente de su rol. Los repartidores que deberían ir a `/mi-ruta` verían el dashboard y lo verían vacío o con datos no habilitados.

**Recomendación:**
1. Resolver la navegación post-login en `AuthContext` o mediante un `useEffect` en el componente que reaccione a cambios en `rol`:
   ```ts
   useEffect(() => {
     if (rol === 'repartidor') navigate('/mi-ruta')
     else if (rol) navigate('/dashboard')
   }, [rol])
   ```
2. Eliminar el `setTimeout`.

---

### S-06 · ALTA — Mensajes de error internos de la BD expuestos al usuario mediante toast

**Ubicación:** `src/pages/Login.tsx:38`, múltiples páginas

**Descripción:**  
Los errores de Supabase se propagan directamente al usuario sin sanitizar:

```ts
// Login.tsx
toast.error(e instanceof Error ? e.message : 'Error al iniciar sesión')
```

Supabase Auth puede retornar mensajes como:
- `"Email not confirmed"` — revela que el email existe y está pendiente de confirmación.
- `"Invalid login credentials"` — diferencia entre usuario inexistente y contraseña incorrecta en algunos contextos.
- `"duplicate key value violates unique constraint "usuarios_email_key""` — expone nombres de constraints y estructura de la BD.

Estos mensajes revelan detalles de implementación que facilitan ataques de enumeración de usuarios y reconocimiento de la estructura del sistema.

**Recomendación:**
1. Mapear los errores conocidos de Supabase a mensajes genéricos en español para el usuario.
2. Loguear el error técnico en consola (o en un sistema de monitoreo) sin mostrarlo al usuario.

---

### S-07 · ALTA — `pin_acceso` almacenado en texto plano en la tabla `repartidores`

**Ubicación:** `src/types/index.ts:47` (`pin_acceso?: string | null`), tabla `repartidores`

**Descripción:**  
La tabla `repartidores` incluye una columna `pin_acceso` que, según el esquema TypeScript, es un string en texto plano. Los PINs son credenciales de autenticación de segundo factor o de acceso alternativo; almacenarlos sin hash viola las mejores prácticas de seguridad.

Si la BD es comprometida (por ejemplo, mediante una política RLS incorrecta + acceso anon), los PINs quedan expuestos en claro.

**Pendiente de verificar:** Si `pin_acceso` está actualmente en uso o es un campo reservado no implementado (el campo existe en `types/index.ts` pero no se encontraron referencias en el frontend).

**Recomendación:**
1. Si se implementa: hashear los PINs con `pgcrypto.crypt(pin, gen_salt('bf'))` antes de almacenar.
2. Si es un campo no utilizado: eliminar la columna del schema.

---

### S-08 · ALTA — `usuarios.id` sin clave foránea a `auth.users`: integridad referencial inexistente

**Ubicación:** Tabla `usuarios` (confirmado via `pg_constraint`)

**Descripción:**  
La consulta a `pg_constraint` retornó solo:
- `PRIMARY KEY (id)`
- `UNIQUE (email)`

No existe ninguna `FOREIGN KEY` de `usuarios.id` hacia `auth.users(id)`. Esto permite:
- Registros en `usuarios` con IDs que no corresponden a ningún usuario de Supabase Auth.
- Usuarios de Auth eliminados que mantienen registros activos en `usuarios` con rol asignado.
- Inconsistencias entre el estado de autenticación y el estado de autorización de la aplicación.

`loadUserProfile` en `AuthContext.tsx` busca el usuario en `usuarios` por `auth.uid()` — si el registro no existe (por borrado manual en Auth), `rol` queda `null` y el usuario autenticado queda en estado indeterminado.

**Recomendación:**
```sql
ALTER TABLE public.usuarios
  ADD CONSTRAINT fk_usuarios_auth
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

---

### S-09 · MEDIA — Sin cabeceras HTTP de seguridad (CSP, X-Frame-Options, HSTS)

**Ubicación:** `index.html` (sin meta tags de seguridad), sin configuración de headers en `vite.config.ts`

**Descripción:**  
No se detectó ninguna configuración de Content Security Policy, X-Frame-Options, X-Content-Type-Options, ni Referrer-Policy. Esto expone a:

- **Clickjacking:** La app puede ser embebida en un `<iframe>` malicioso sin restricción.
- **XSS amplificado:** Sin CSP, cualquier script inyectado (por ejemplo, via un campo de la BD comprometida) puede ejecutarse sin restricciones.
- **MIME sniffing:** Sin `X-Content-Type-Options: nosniff`, el navegador puede interpretar respuestas como scripts.

**Recomendación:**
1. Configurar headers HTTP en el servidor de hosting (Vercel/Netlify) o en `vite.config.ts` para desarrollo.
2. Mínimo viable:
   ```
   Content-Security-Policy: default-src 'self'; connect-src https://ajbkzbtmknlmuucotdol.supabase.co; img-src 'self' data: blob: https://ajbkzbtmknlmuucotdol.supabase.co;
   X-Frame-Options: DENY
   X-Content-Type-Options: nosniff
   ```

---

### S-10 · MEDIA — Sin límite de intentos de login en el frontend

**Ubicación:** `src/pages/Login.tsx`

**Descripción:**  
No existe ningún mecanismo de rate limiting, backoff, ni lockout en el frontend para intentos fallidos de login. Un atacante puede intentar miles de combinaciones de contraseñas vía script. La protección depende exclusivamente de la configuración por defecto de Supabase Auth (que sí tiene rate limiting en el servicio, pero configurable).

**Recomendación:**
1. Implementar bloqueo progresivo en el frontend: tras 3 fallos, deshabilitar el botón con backoff exponencial.
2. Agregar CAPTCHA de Supabase Auth (hCaptcha o Turnstile) — Supabase lo soporta nativamente.
3. Verificar la configuración de rate limiting en el panel de Supabase Auth.

---

### S-11 · MEDIA — Validación con Zod solo en Login y PedidoNuevo; formularios CRUD sin schema de validación

**Ubicación:** `src/pages/Repartidores.tsx`, `src/pages/Clientes.tsx`, `src/pages/Rutas.tsx`

**Descripción:**  
Los formularios de creación/edición de repartidores, clientes y rutas usan validaciones básicas de React Hook Form (`register('campo', { required: true })`) sin schema Zod. Esto significa:

- No hay validación de formato en emails de clientes o repartidores.
- No hay límite de longitud en campos de texto — puede enviarse contenido arbitrariamente largo.
- No hay validación de caracteres especiales en campos como `nombre`, `direccion`, o `telefono`, que luego se renderizan en la UI sin sanitización explícita (React escapa HTML, lo que mitiga XSS, pero no filtra caracteres de control o emojis que puedan romper exportaciones CSV).

**Recomendación:**
1. Extender el patrón de `PedidoNuevo.tsx` (Zod + `zodResolver`) a todos los formularios CRUD.
2. Definir schemas centralizados en `src/lib/schemas.ts`.

---

### S-12 · MEDIA — `VITE_SUPABASE_ANON_KEY` potencialmente comprometida si el repositorio fue público

**Ubicación:** `.env` (no trackeado), `VITE_SUPABASE_URL` visible en `README.md`

**Descripción:**  
El `.gitignore` excluye correctamente el archivo `.env`. Sin embargo:
- La URL del proyecto (`ajbkzbtmknlmuucotdol`) está en el README y potencialmente en el historial de git.
- La `anon_key` de Supabase es una clave pública por diseño — se espera que esté en el frontend y sea visible en el código JavaScript compilado.

El riesgo real es que la `anon_key` + las policies RLS permisivas (S-03) otorgan a cualquier persona acceso completo a todos los datos. En un sistema con RLS correcta, la `anon_key` expuesta sería aceptable; en este sistema, es un amplificador del problema S-03.

**Recomendación:**
1. Priorizar S-03 (RLS por rol). Una vez que la RLS sea restrictiva, la exposición de la `anon_key` deja de ser crítica.
2. Verificar que la `service_role_key` **nunca** esté en el frontend ni en el historial de git.

---

### S-13 · BAJA — Sin CAPTCHA en el formulario de login

**Ubicación:** `src/pages/Login.tsx`

**Descripción:**  
No hay CAPTCHA ni mecanismo anti-bot. Combinado con S-10, facilita ataques de credential stuffing o fuerza bruta automatizada.

Supabase Auth soporta hCaptcha y Cloudflare Turnstile de forma nativa con configuración mínima.

**Recomendación:** Habilitar Turnstile (gratuito) en el panel de Supabase Auth y agregar el widget al formulario de login.

---

## B — Calidad y Observabilidad

### Severidades

| ID | Severidad | Área |
|----|-----------|------|
| Q-01 | 🔴 CRÍTICA | Testing — cobertura cero |
| Q-02 | 🟠 ALTA | Resiliencia — sin Error Boundary |
| Q-03 | 🟠 ALTA | Errores — manejo inconsistente |
| Q-04 | 🟠 ALTA | Observabilidad — sin monitoring |
| Q-05 | 🟠 ALTA | Reproducibilidad — sin migraciones |
| Q-06 | 🟡 MEDIA | Documentación — README con credenciales |
| Q-07 | 🟡 MEDIA | Estabilidad — setTimeout en flujo de auth |

---

### Q-01 · CRÍTICA — Cobertura de tests: 0%

**Ubicación:** Todo el repositorio

**Descripción:**  
No existe ningún archivo de test (`.test.ts`, `.spec.ts`, `.test.tsx`), no hay framework de testing configurado (Vitest, Jest, Playwright, Cypress), y el `package.json` no tiene script `test`. El proyecto carece de:

- Tests unitarios de funciones de `utils.ts` y schemas Zod.
- Tests de integración para el ciclo de vida de pedidos.
- Tests end-to-end del flujo login → dashboard → pedido nuevo → entrega.
- Tests de regresión para los bugs identificados (ruta `/pedidos/:id`, N+1, race conditions).

Un sistema de gestión de despachos sin tests no tiene ninguna red de seguridad ante cambios. Cualquier refactor puede introducir regresos silenciosos.

**Recomendación:**
1. Agregar Vitest (compatible con Vite sin configuración extra): `npm install -D vitest @testing-library/react`.
2. Priorizar tests para: el state machine de pedidos, la lógica de `usePedidos`, y los flows de login.
3. Agregar `"test": "vitest"` al `package.json`.

---

### Q-02 · ALTA — Sin React Error Boundary global: un error en runtime provoca pantalla en blanco total

**Ubicación:** `src/App.tsx` — no hay `<ErrorBoundary>` en ningún nivel del árbol

**Descripción:**  
En React, un error no capturado en un componente durante el render desmonta todo el árbol de componentes y muestra una pantalla en blanco (en producción) o la pantalla de error de React (en desarrollo). No hay ningún `ErrorBoundary` en el proyecto.

Un error en, por ejemplo, el render de `Dashboard.tsx` al recibir datos inesperados de Supabase dejaría al operador con una pantalla en blanco sin posibilidad de navegar a otra página.

**Recomendación:**
```tsx
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError)
      return <div>Algo salió mal. <button onClick={() => window.location.href='/'}>Volver al inicio</button></div>
    return this.props.children
  }
}
// En App.tsx: <ErrorBoundary><AppRoutes /></ErrorBoundary>
```

---

### Q-03 · ALTA — Manejo de errores inconsistente: varios módulos tragan errores silenciosamente

**Ubicación:** `src/hooks/useRutas.ts:10-24`, `src/hooks/useRepartidor.ts`, `src/pages/Dashboard.tsx:67-89`, `src/pages/Reportes.tsx:120-145`

**Descripción:**  
Cuatro módulos principales suprimen errores sin informar al usuario ni al desarrollador:

1. **`useRutas.ts`**: `try { ... } finally { setLoading(false) }` — sin `catch`, sin estado `error`. Un fallo de red muestra "No hay rutas" como si fuera un resultado vacío válido.

2. **`useRepartidor.ts`**: Sin estado `error` expuesto. El repartidor ve su lista de pedidos vacía si la query falla.

3. **`Dashboard.tsx`**: `const results = await Promise.all([...])` sin `try/catch`. Un fallo en cualquiera de las 5 queries paralelas rechaza toda la Promise y el Dashboard queda colgado (si tampoco hay Error Boundary, pantalla en blanco).

4. **`Reportes.tsx`**: `fetchReportes` usa `finally` pero no `catch`. Los errores de las M queries paralelas de rendimiento se tragan en silencio.

**Recomendación:**
1. Agregar estado `error` y `catch` a `useRutas` y `useRepartidor`, siguiendo el patrón de `usePedidos.ts`.
2. Envolver el `Promise.all` en Dashboard con `try/catch` y mostrar un toast de error si falla.
3. En Reportes, acumular errores de las queries paralelas y mostrarlos en la UI.

---

### Q-04 · ALTA — Sin sistema de monitoreo ni error tracking

**Ubicación:** Todo el proyecto

**Descripción:**  
No existe ninguna integración con herramientas de observabilidad (Sentry, LogRocket, Datadog, o similar). En producción:

- Los errores JavaScript no capturados no se registran en ningún lado.
- No hay métricas de performance de queries Supabase.
- No hay alertas si el sistema falla a medianoche.
- El único diagnóstico disponible es el `console.log` en el navegador del cliente.

**Recomendación:**
1. Integrar Sentry (tier gratuito suficiente para este volumen): `npm install @sentry/react`.
2. Inicializar en `main.tsx` con `Sentry.init({ dsn: ... })`.
3. Configurar el Error Boundary (Q-02) para reportar a Sentry con `Sentry.captureException(error)`.

---

### Q-05 · ALTA — Sin archivos de migración en el repositorio: el schema no es reproducible

**Ubicación:** Raíz del repositorio — no existe directorio `supabase/migrations/`

**Descripción:**  
El schema de la base de datos (9 tablas, 4 funciones, 10 triggers, 17 índices, 3 views, 4 enums) no está versionado en el repositorio. Solo existe en el proyecto de Supabase en la nube. Consecuencias:

- Imposible crear un entorno de desarrollo local con el mismo schema.
- Si el proyecto de Supabase se corrompe, elimina, o se agota la cuota, el schema se pierde.
- No hay forma de hacer code review de cambios de schema.
- Nuevos desarrolladores no pueden reproducir el entorno.

**Recomendación:**
1. Instalar Supabase CLI y ejecutar: `supabase db dump --schema-only > supabase/schema.sql`
2. Desde ese punto, usar `supabase migrations new <nombre>` para cada cambio.
3. Commitear los archivos de migración en el repositorio.

---

### Q-06 · MEDIA — README es la única documentación, está desactualizada y contiene credenciales

**Ubicación:** `README.md`

**Descripción:**  
El README mezcla documentación técnica con credenciales de producción. Además:
- No documenta el flujo de onboarding para nuevos desarrolladores.
- No documenta las variables de entorno necesarias (solo `.env.example` tiene 2 líneas).
- No explica cómo ejecutar las migraciones o seed inicial.
- No hay documentación de la API REST de Supabase (endpoints, parámetros, respuestas).

**Recomendación:**
1. Separar la documentación en secciones: setup, arquitectura, flujos de negocio.
2. Eliminar credenciales (cubiertas por S-01).
3. Agregar sección de "Variables de entorno" con descripción de cada variable.

---

### Q-07 · MEDIA — `setTimeout(800ms)` como mecanismo de detección de rol post-login

**Ubicación:** `src/pages/Login.tsx:33`

**Descripción:**  
El código asume que 800ms es suficiente para que `AuthContext` complete la carga del perfil del usuario. Este es un antipatrón frágil:

- En redes lentas o con Supabase en cold start, 800ms puede ser insuficiente.
- En redes rápidas, 800ms es un delay artificial que degrada la experiencia de login.
- No hay forma de saber en qué estado está la carga del perfil desde `Login.tsx`.

El problema raíz es que `AuthContext` no expone una forma de saber si el perfil está "listo". Ver también A-1 (loading no se resetea en `onAuthStateChange`) y S-05.

**Recomendación:**  
Exponer un estado `profileReady: boolean` en `AuthContext` que se ponga en `true` solo cuando `loadUserProfile` complete exitosamente. En `Login.tsx`, suscribirse a ese estado mediante `useEffect`.

---

## Resumen de la Fase 4

| Categoría | Crítica | Alta | Media | Baja | Total |
|-----------|---------|------|-------|------|-------|
| Seguridad | 3 | 5 | 4 | 1 | **13** |
| Calidad | 1 | 4 | 2 | 0 | **7** |
| **Total** | **4** | **9** | **6** | **1** | **20** |

Los 3 hallazgos críticos de seguridad (S-01, S-02, S-03) representan riesgos de compromiso total o parcial del sistema y deben remediarse antes de cualquier otro trabajo.

---

*Continúa en: [00-informe-final.md](00-informe-final.md)*
