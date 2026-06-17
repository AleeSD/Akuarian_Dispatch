# Deep Dive — Seguridad en Akuarian Dispatch

**Fecha:** 2026-06-14  
**Scope:** Análisis estático de código + consultas directas a la BD de producción  
**Sin modificación de código**

---

## Contexto técnico

El sistema es una **SPA React + BaaS** (Supabase). No existe un backend propio: toda la lógica de autorización que no esté en la BD (RLS) o en el cliente es inexistente. El cliente web tiene acceso directo a la API PostgREST de Supabase con el `anon_key`. Esto hace que el modelo de seguridad dependa **exclusivamente** de las políticas RLS.

**Lo que se encontró resumido al abrir las policies de la BD:**

```sql
-- Política real en TODAS las tablas (9/9 tablas con esta misma expresión):
USING (auth.role() = 'authenticated')
```

Este hecho único es la raíz de la mayoría de hallazgos críticos de este informe.

---

## 1. Autenticación

### SA-01 · ALTA — JWT almacenado en localStorage: susceptible a robo por XSS

**Ubicación:** `src/lib/supabase.ts:6` — `createClient(url, key)` sin opciones de auth

**Descripción:**  
El SDK de Supabase JS usa `localStorage` por defecto para persistir el access token y el refresh token. Esto es documentado y configurable, pero el cliente no lo configura.

```ts
// supabase.ts:6
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
// Sin: { auth: { storage: cookieStorage, storageKey: '...', persistSession: true } }
```

Cualquier script que corra en el contexto de la página puede leer `localStorage.getItem('sb-ajbkzbtmknlmuucotdol-auth-token')` y obtener el JWT completo del usuario activo. El JWT contiene el `user_id`, email, y permite hacer peticiones a la API como el usuario.

React auto-escapa strings en JSX (mitigación natural de XSS), pero localStorage no tiene Same-Origin garantías cuando hay inyección de scripts por otras vías (extensiones maliciosas, dependencies comprometidas, subdomain takeover futuro).

**Remediación:** Configurar el cliente con almacenamiento en cookies HttpOnly via un servidor proxy, o usar la configuración de `cookieStorage` del SDK si se agrega un BFF (Backend for Frontend). Alternativamente, evaluar si la app requiere persistencia cross-tab — si no, `persistSession: false` limita la ventana de exposición.

---

### SA-02 · ALTA — `loadUserProfile` sin manejo de error: usuario autenticado puede quedar sin rol

**Ubicación:** `src/context/AuthContext.tsx:27-47`

**Descripción:**  
```ts
async function loadUserProfile(userId: string) {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, nombre')
    .eq('id', userId)
    .single()
  // ← sin manejo de error: si falla, `rol` queda null silenciosamente

  if (usuario) {
    setRol(usuario.rol as RolUsuario)
    ...
  }
}
```

Si la query a `usuarios` falla (red, RLS, usuario no existe), el estado queda: `user` (Supabase Auth) ≠ null, `rol` = null.

La condición de `ProtectedRoute` (`App.tsx:35`):
```ts
if (requiredRole && rol && !requiredRole.includes(rol)) { // rol = null → esta condición no entra }
```

Si `rol` es null, el guard no redirige. El usuario autenticado llega a la ruta protegida con rol indeterminado. Dependiendo de qué routes se visiten, puede ver datos sin restricción frontend.

**Vector de ataque:** Si un operador malicioso puede forzar que `loadUserProfile` falle para otro usuario (por ejemplo, bloqueando su entrada en `usuarios` via una policy maliciosa), puede mantenerlo en estado indeterminado.

**Remediación:**
```ts
async function loadUserProfile(userId: string) {
  const { data, error } = await supabase.from('usuarios').select('rol, nombre').eq('id', userId).single()
  if (error || !data) {
    await supabase.auth.signOut()  // forzar logout si no se puede determinar el rol
    return
  }
  setRol(data.rol as RolUsuario)
  setNombreUsuario(data.nombre)
}
```

---

### SA-03 · MEDIA — Race condition en detección de rol post-login: stale closure + setTimeout frágil

**Ubicación:** `src/pages/Login.tsx:28-46`

**Descripción:**  
```ts
const { signIn, rol } = useAuth()   // `rol` capturado en el closure al momento del render

async function onSubmit(data) {
  await signIn(data.email, data.password)
  await new Promise(r => setTimeout(r, 800))  // espera empírica
  const currentRol = rol  // ← valor del closure, NO el estado actualizado
  if (currentRol === 'repartidor') navigate('/mi-ruta')
  else navigate('/dashboard')
}
```

`rol` en `onSubmit` es el valor capturado cuando el componente renderizó por última vez antes del submit (siempre `null` antes del login). El `setTimeout(800ms)` puede permitir que React re-renderice `Login` con el nuevo `rol`, pero si la red es lenta o Supabase está en cold-start (> 800ms para `loadUserProfile`), `currentRol` sigue siendo `null` → todos los usuarios navegan a `/dashboard` aunque sean repartidores.

**Consecuencia de seguridad:** Un repartidor llega a `/dashboard`. `ProtectedRoute` en `/dashboard` tiene `requiredRole={['admin', 'operador', 'supervisor']}`. En ese punto, si `rol` ya cargó = `'repartidor'`, lo redirige a `/mi-ruta`. Si `rol` aún es null, lo deja pasar (ver SA-02). En el mejor caso es confusión de UX; en el peor, acceso a rutas no autorizadas.

**Remediación:** Resolver la navegación post-login vía `useEffect` reactivo al estado `rol`:
```ts
useEffect(() => {
  if (!isLoggingIn || !rol) return
  navigate(rol === 'repartidor' ? '/mi-ruta' : '/dashboard')
}, [rol, isLoggingIn])
```

---

### SA-04 · MEDIA — `onAuthStateChange` no llama `setLoading(false)`: spinner permanente posible

**Ubicación:** `src/context/AuthContext.tsx:60-70`

**Descripción:**  
`setLoading(false)` solo se llama en el callback de `getSession()` inicial (línea 54). El handler de `onAuthStateChange` no tiene `finally { setLoading(false) }`. Si el token se refresca silenciosamente y `loadUserProfile` falla, la app puede quedar en estado `loading = true` indefinidamente, mostrando el spinner y bloqueando toda la UI sin mensaje de error al usuario.

**Remediación:** Agregar `setLoading(false)` en el handler de `onAuthStateChange` (en el bloque `if (session?.user)` y en el bloque `else`).

---

## 2. Autorización — Mapa completo de endpoints y IDOR

### Estado real de las RLS policies (confirmado via `pg_policies`)

| Tabla | Policy name | Comando | Expresión USING | WITH CHECK |
|-------|-------------|---------|-----------------|------------|
| clientes | "Acceso autenticado – clientes" | ALL | `auth.role() = 'authenticated'` | null (= USING) |
| configuracion | **"Solo admin – configuracion"** | ALL | `auth.role() = 'authenticated'` | null |
| evidencias | "Acceso autenticado – evidencias" | ALL | `auth.role() = 'authenticated'` | null |
| historial_estados | "Acceso autenticado – historial" | ALL | `auth.role() = 'authenticated'` | null |
| notificaciones | "Acceso autenticado – notificaciones" | ALL | `auth.role() = 'authenticated'` | null |
| pedidos | "Acceso autenticado – pedidos" | ALL | `auth.role() = 'authenticated'` | null |
| repartidores | "Acceso autenticado – repartidores" | ALL | `auth.role() = 'authenticated'` | null |
| rutas | "Acceso autenticado – rutas" | ALL | `auth.role() = 'authenticated'` | null |
| usuarios | "Acceso autenticado – usuarios" | ALL | `auth.role() = 'authenticated'` | null |

**La policy "Solo admin – configuracion" tiene exactamente la misma expresión que todas las demás.** El nombre es engañoso — cualquier usuario autenticado puede leer y escribir `configuracion`.

---

### SA-05 · CRÍTICA — Sin diferenciación de roles en RLS: todo autenticado = acceso total a todo

**Ubicación:** Todas las tablas — BD de producción

**Descripción:**  
La expresión `auth.role() = 'authenticated'` evalúa si el JWT tiene el claim `role = "authenticated"`. **Esto es true para TODOS los usuarios logueados**, sin importar si son admin, operador, supervisor o repartidor. Los roles de negocio (`admin`, `repartidor`, etc.) están en `public.usuarios.rol`, pero las policies nunca consultan esa tabla.

La separación de roles existe únicamente en la UI (componente `ProtectedRoute` en `App.tsx` y el objeto `ACCIONES` en `PedidoDetalle.tsx`). Cualquier cliente que acceda directamente a la API REST de Supabase (con un JWT válido) tiene acceso completo a todos los datos y operaciones.

**Evidencia directa:** La vista `v_repartidor_mis_pedidos` sí filtra por `auth.uid()`:
```sql
WHERE r.fecha = CURRENT_DATE AND rep.auth_user_id = auth.uid()
```
Pero esta vista es solo un helper de la UI. La tabla `pedidos` subyacente no tiene esa restricción.

**Impacto:** Ver SA-06, SA-07, SA-08 para los vectores de ataque concretos.

---

### SA-06 · CRÍTICA — IDOR en lectura: repartidor puede exfiltrar todos los pedidos, clientes y rutas

**Ubicación:** Endpoints PostgREST `/rest/v1/pedidos`, `/rest/v1/clientes`, `/rest/v1/rutas`

**Descripción:**  
Un repartidor autenticado (ej. `carlos@akuarian.pe`) puede ejecutar las siguientes peticiones con su JWT:

```bash
# Leer TODOS los pedidos (de todos los repartidores, todos los días)
GET https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/pedidos
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}

# Leer toda la base de clientes con PII completa (nombre, teléfono, email, dirección, coordenadas GPS)
GET https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/clientes
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}

# Ver la vista de pedidos detalle con datos cruzados de cliente + repartidor + ruta
GET https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/v_pedidos_detalle
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}
```

Todos estos requests retornan HTTP 200 con el dataset completo. El repartidor carlos no debería ver pedidos de luis ni de pedro, ni la lista de clientes completa.

La tabla `clientes` incluye el campo `coordenadas` (tipo `text`, confirmado via `information_schema.columns`), que puede contener coordenadas GPS de las ubicaciones de entrega — dato sensible bajo GDPR y normativa peruana de protección de datos.

**Remediación:** Ver SA-05. Requiere reestructurar las RLS policies por tabla y por rol.

---

### SA-07 · CRÍTICA — IDOR en escritura: repartidor puede modificar o eliminar cualquier pedido

**Ubicación:** Endpoint PostgREST `PATCH /rest/v1/pedidos`, `DELETE /rest/v1/pedidos`

**Descripción:**  
La policy `cmd: ALL` con `WITH CHECK: null` permite que cualquier usuario autenticado ejecute UPDATE y DELETE sobre cualquier fila de cualquier tabla.

**Vectores concretos:**

```bash
# Repartidor modifica el estado de un pedido que no es suyo
PATCH https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/pedidos?id=eq.{uuid-pedido-de-luis}
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}
Content-Type: application/json
{"estado": "entregado", "fecha_entrega_real": "2026-01-01T00:00:00Z"}

# Repartidor elimina un cliente
DELETE https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/clientes?id=eq.{uuid}
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}

# Repartidor elimina toda la tabla de pedidos (no hay restricción de filas)
DELETE https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/pedidos?estado=eq.recibido
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}
```

El último comando eliminaría todos los pedidos en estado `recibido` sin posibilidad de recuperación (no hay soft delete configurado en las tablas).

---

### SA-08 · CRÍTICA — Escalada de privilegios: repartidor puede auto-asignarse rol de admin

**Ubicación:** Endpoint `PATCH /rest/v1/usuarios`, tabla `usuarios`

**Descripción:**  
Esta es la vulnerabilidad más grave de autorización. La policy de la tabla `usuarios` es idéntica a las demás:

```sql
USING (auth.role() = 'authenticated')  -- WITH CHECK implícito = lo mismo
```

Un repartidor puede modificar su propio registro en `usuarios` para cambiar su rol a `admin`:

```bash
# Paso 1: el repartidor conoce su propio auth.uid() (está en su JWT)
# Paso 2: busca su id en la tabla usuarios
GET https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/usuarios?select=id,rol&email=eq.carlos@akuarian.pe
Authorization: Bearer {jwt_de_carlos}

# Paso 3: actualiza su rol a admin
PATCH https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/usuarios?id=eq.{su-uuid}
Authorization: Bearer {jwt_de_carlos}
apikey: {anon_key}
Content-Type: application/json
{"rol": "admin"}
```

Tras este PATCH, en el próximo login `loadUserProfile` leerá `rol = 'admin'` y el repartidor tendrá acceso completo a todas las funciones del operador/admin en la UI.

Adicionalmente, puede cambiar el rol de **cualquier otro usuario** (incluyendo desactivar operadores legítimos):
```bash
PATCH https://ajbkzbtmknlmuucotdol.supabase.co/rest/v1/usuarios?id=eq.{uuid-del-admin}
{"rol": "repartidor", "activo": false}
```

**Remediación urgente:**

```sql
-- Política correcta para la tabla usuarios
-- Los usuarios solo pueden leer su propio registro
CREATE POLICY "usuarios_self_read" ON usuarios
  FOR SELECT USING (id = auth.uid());

-- Solo admins pueden crear o modificar usuarios (y nunca pueden auto-escalar)
CREATE POLICY "usuarios_admin_write" ON usuarios
  FOR ALL USING (auth_rol() = 'admin')
  WITH CHECK (auth_rol() = 'admin');
```

Donde `auth_rol()` es la función helper descrita en el informe de seguridad (Fase 4, SA-03).

---

### SA-09 · ALTA — Mapa de endpoints: ninguna route valida permisos a nivel de API

Todos los endpoints PostgREST están expuestos sin restricción de rol. Tabla de superficie de ataque completa:

| Endpoint | Método | Protección en UI | Protección en BD | Estado real |
|----------|--------|-----------------|-----------------|-------------|
| `/rest/v1/pedidos` | GET/POST/PATCH/DELETE | ProtectedRoute (frontend) | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/clientes` | GET/POST/PATCH/DELETE | ProtectedRoute (frontend) | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/repartidores` | GET/POST/PATCH/DELETE | ProtectedRoute (frontend) | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/rutas` | GET/POST/PATCH/DELETE | ProtectedRoute (frontend) | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/usuarios` | GET/POST/PATCH/DELETE | ProtectedRoute (frontend) | `authenticated` only | 🔴 **Privilege escalation** |
| `/rest/v1/configuracion` | GET/POST/PATCH/DELETE | Solo visible a admin en UI | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/evidencias` | GET/POST/PATCH/DELETE | Ninguna mención en UI | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/historial_estados` | GET/POST/PATCH/DELETE | Solo lectura en UI | `authenticated` only | 🔴 Historial manipulable |
| `/rest/v1/notificaciones` | GET/POST/PATCH/DELETE | No implementado en UI | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/v_pedidos_detalle` | GET | ProtectedRoute (frontend) | `authenticated` only | 🔴 Sin protección real |
| `/rest/v1/v_repartidor_mis_pedidos` | GET | `/mi-ruta` solo | `auth.uid()` filter | 🟡 Parcialmente protegido |
| `/rest/v1/v_resumen_dia` | GET | ProtectedRoute (frontend) | `authenticated` only | 🔴 Sin protección real |
| `/storage/v1/object/evidencias/*` | GET | Sin auth (getPublicUrl) | Bucket público | 🔴 Sin autenticación |

La única protección real a nivel de BD es la vista `v_repartidor_mis_pedidos` que filtra por `auth.uid()`. Todo lo demás depende del cliente React.

---

## 3. Validación de inputs

### SA-10 · ALTA — Inyección de filtros PostgREST via `.or()` con input sin sanitizar

**Ubicación:** `src/hooks/usePedidos.ts:32`, `src/pages/Clientes.tsx:28`

**Descripción:**  
PostgREST parsea la cadena del método `.or()` como una lista de condiciones separadas por comas. La interpolación directa del input del usuario permite manipular esta lista:

```ts
// usePedidos.ts:32-34
query = query.or(
  `numero_pedido.ilike.%${filtros.busqueda}%,cliente_nombre.ilike.%${filtros.busqueda}%`
)

// Clientes.tsx:28
query = query.or(`nombre.ilike.%${busqueda}%,distrito.ilike.%${busqueda}%`)
```

**Vectores de ataque:**

**Vector 1 — Bypass de filtros (data leakage):**  
Input: `%` → La condición `ILIKE '%%'` matchea TODOS los registros, ignorando los filtros de fecha, estado o repartidor que se aplicaron antes en la misma query. Un operador puede ver pedidos de otras fechas o estados no seleccionados.

**Vector 2 — Inyección de condición OR adicional:**  
Input: `abc,id.in.(uuid1)` → PostgREST parseará esto como tres condiciones:
```
numero_pedido ILIKE '%abc,id.in.(uuid1)%'  ← probable fallo por caracteres inválidos
```
O dependiendo del parser interno, puede interpretar `id.in.(uuid1)` como condición adicional real. El comportamiento exacto depende de la versión de PostgREST.

**Vector 3 — ILIKE wildcards sin escape:**  
El caracter `_` en ILIKE es wildcard de un carácter. Input `a_c` matcheará `abc`, `adc`, `aec`, etc. No es explotable directamente pero produce resultados incorrectos.

**Nota:** PostgREST usa queries parametrizadas para los VALORES, por lo que no es inyección SQL clásica. El riesgo es de **manipulación de lógica de filtrado** y potencial data leakage, no de ejecución de SQL arbitrario.

**Remediación:**
```ts
// Escapar caracteres especiales del parser PostgREST antes de interpolar
const safe = busqueda.replace(/[,%()]/g, '\\$&')
query = query.or(`numero_pedido.ilike.%${safe}%,cliente_nombre.ilike.%${safe}%`)
```

---

### SA-11 · MEDIA — Sin validación Zod en formularios CRUD: campos sin restricción de longitud ni formato

**Ubicación:** `src/pages/Clientes.tsx:52-63`, `src/pages/Repartidores.tsx`, `src/pages/Rutas.tsx`

**Descripción:**  
Los formularios de alta de clientes, repartidores y rutas solo tienen `form.nombre && return` como validación. No hay:
- Límite de longitud (un `nombre` de 100.000 caracteres se almacena sin error)
- Validación de formato en `email` (se acepta cualquier string)
- Validación de formato en `telefono` (acepta texto libre)

El campo `coordenadas` en `clientes` es de tipo `text` libre — acepta cualquier string. Si en el futuro se usa para geolocalización, podría contener datos sintácticamente inválidos sin detección.

**Vector de riesgo:** No XSS directo (React escapa el output), pero strings muy largos en la BD pueden afectar el rendimiento de queries con `ILIKE` y generar respuestas JSON grandes que saturan el cliente.

**Remediación:** Aplicar el patrón `zodResolver` de `PedidoNuevo.tsx` a todos los formularios CRUD. Agregar `.max(255)` en campos de texto y `.email()` en campos de email.

---

### SA-12 · BAJA — XSS via `foto_url` en tag `<img>`: mitigado por React pero con residuo

**Ubicación:** `src/pages/PedidoDetalle.tsx:241-244`

**Descripción:**  
```tsx
<img src={ev.foto_url} alt={ev.tipo} ... />
```

`foto_url` viene de la tabla `evidencias` en la BD. Si un atacante puede insertar un registro en `evidencias` con un `foto_url` malicioso (posible via SA-07), el valor se renderiza como atributo `src`.

En navegadores modernos, `<img src="javascript:alert(1)">` no ejecuta JS. Un `<img src="data:text/html,<script>alert(1)</script>">` tampoco ejecuta JS (las data URIs en img src se interpretan como imágenes, no como HTML). El riesgo de XSS directo es muy bajo.

Sin embargo, una URL externa (ej. `https://tracker.malicioso.com/pixel.png`) puede usarse para **exfiltrar** el token de sesión o la IP del usuario sin su conocimiento, ya que el navegador cargará la imagen automáticamente.

**Remediación:** Validar que `foto_url` tenga el prefijo del bucket propio (`https://ajbkzbtmknlmuucotdol.supabase.co/storage/v1/object/`) antes de renderizar. Idealmente, almacenar el path en la BD y generar la URL firmada en el frontend.

---

### SA-13 · BAJA — Sin protección contra fuerza bruta en login

**Ubicación:** `src/pages/Login.tsx` (sin rate limiting frontend)

**Descripción:**  
No hay mecanismo de bloqueo, backoff exponencial, ni CAPTCHA en el formulario de login. Supabase Auth tiene rate limiting por IP en el servicio (configurable), pero la app no añade ninguna capa adicional.

La protección depende íntegramente de la configuración del panel de Supabase Auth, que no se verificó en este análisis (pendiente de verificar).

**Remediación:** Habilitar hCaptcha o Cloudflare Turnstile desde el panel de Supabase Auth (zero-code). Agregar backoff progresivo en el frontend tras 3 intentos fallidos.

---

## 4. Secretos y credenciales

### SA-14 · CRÍTICA — README.md contiene contraseña universal y emails de todas las cuentas en texto claro

**Ubicación:** `README.md:129-140` (versionado en git, commit `35a7b9c`)

**Descripción:**  
```markdown
## Credenciales de prueba

Password universal: `Akuarian2024!`

| Rol       | Email                       |
|-----------|----------------------------|
| Admin     | admin@akuarian.pe          |
| Operador  | operador@akuarian.pe       |
| Supervisor| supervisor@akuarian.pe     |
| Repartidor| carlos@akuarian.pe         |
| Repartidor| luis@akuarian.pe           |
| Repartidor| pedro@akuarian.pe          |
```

Estas credenciales están en el historial de git (`git log` confirma un único commit inicial que las incluye). Cualquier persona con acceso al repositorio puede autenticarse como admin ahora mismo.

La contraseña universal implica que todos los usuarios comparten la misma credencial. Cambiar la contraseña de un usuario para revocación de acceso no revoca la de los demás.

**Impacto combinado con SA-05/SA-08:** Con esta contraseña + escalada de privilegios, un atacante externo con acceso al repo obtiene control total del sistema en dos pasos.

**Acción inmediata:**
1. Rotar las contraseñas de TODOS los usuarios con credenciales individuales (la rotación de la contraseña universal no es suficiente — implica coordinar a 6 personas).
2. Eliminar la sección de credenciales del README y hacer un nuevo commit.
3. Nunca usar contraseñas compartidas. Cada usuario debe tener su propia contraseña generada aleatoriamente.
4. Auditar si el repositorio fue clonado externamente o si el commit llegó a ser público.

---

### SA-15 · MEDIA — URL del proyecto Supabase (`project-id`) en README: facilita reconocimiento

**Ubicación:** `README.md:87`, `README.md:122`

**Descripción:**  
```markdown
**Proyecto:** `ajbkzbtmknlmuucotdol`
VITE_SUPABASE_URL=https://ajbkzbtmknlmuucotdol.supabase.co
```

El project ID de Supabase está en el README. Junto con el `anon_key` (que está en el bundle JS compilado, visible en DevTools), un atacante puede construir todos los endpoints de ataque sin acceso al repositorio.

Combinado con SA-14, esto significa que las credenciales de Supabase de producción están en texto claro en el mismo documento.

**Remediación:** Retirar el project ID del README. Usar un placeholder como `<project-ref>`. El project ID es menos crítico que las credenciales, pero su presencia facilita el reconocimiento.

---

### SA-16 · BAJA — `VITE_SUPABASE_ANON_KEY` compilada en el bundle JS: visible en DevTools

**Ubicación:** `src/lib/supabase.ts:4`, `vite.config.ts` (sin ofuscación)

**Descripción:**  
Las variables `VITE_*` de Vite se incrustan en el bundle JavaScript compilado en tiempo de build. Cualquier usuario puede abrir DevTools → Sources → buscar en los archivos JS compilados y encontrar el `anon_key`.

Esto es **comportamiento intencional de Supabase** — el `anon_key` está diseñado para ser público. Es un JWT con `role: "anon"` que solo tiene los permisos que RLS le otorga al rol anónimo. En un sistema con RLS correctamente configurada, exponer el `anon_key` es aceptable.

**En este sistema**, dado que SA-05 muestra que RLS no diferencia roles, la `anon_key` + `authenticated` token = acceso total. El riesgo real es la combinación de esta exposición con SA-05, no la exposición del anon_key por sí sola.

**Remediación principal:** Arreglar SA-05. Una vez que RLS sea restrictiva, la exposición del anon_key deja de ser crítica.

---

### SA-17 · VERIFICADO — `.env` no está versionado en git

**Evidencia:**  
```bash
git log --all --full-history -- ".env"
# (sin output — nunca fue committeado)
```

El archivo `.env` existe en el filesystem local (encontrado por Glob) pero está correctamente excluido via `.gitignore`. El `VITE_SUPABASE_ANON_KEY` real no está en el historial de git.

**Recomendación adicional:** Verificar que la `service_role_key` (que bypasea RLS completamente) nunca haya sido referenciada en el código fuente ni en el historial. No se encontró ninguna referencia en el análisis actual (confirmado: grep de `service_role` retornó vacío).

---

## 5. Datos sensibles

### SA-18 · ALTA — PII de clientes expuesta a todos los roles sin restricción de campos

**Ubicación:** Vista `v_pedidos_detalle`, tabla `clientes`, endpoint `/rest/v1/clientes`

**Descripción:**  
La tabla `clientes` contiene (confirmado via `information_schema.columns`):

| Campo | Tipo | Sensibilidad |
|-------|------|-------------|
| nombre | varchar | Media |
| telefono | varchar | Alta |
| email | varchar | Alta |
| direccion_ref | text | Alta |
| distrito | varchar | Media |
| coordenadas | text | **Muy alta** (GPS) |
| notas | text | Variable |

Un repartidor llamando a `GET /rest/v1/clientes` recibe el directorio completo de todos los clientes con su información de contacto y ubicación GPS. Esto es una violación de la **Ley N° 29733** (Ley de Protección de Datos Personales del Perú) y potencialmente del GDPR si hay clientes europeos.

La vista `v_pedidos_detalle` también incluye `cliente_email` y `cliente_telefono` en cada pedido, accesibles a todos los roles.

**Remediación:**
1. Implementar RLS por rol (SA-05) como primera prioridad.
2. Agregar una política de campo (column-level security) para `coordenadas`: solo admin/supervisor deberían verla.
3. La vista `v_repartidor_mis_pedidos` ya omite el email del cliente — usar ese patrón en `v_pedidos_detalle` para el rol repartidor.

---

### SA-19 · ALTA — Bucket Storage `evidencias` público: fotos de entrega sin autenticación

**Ubicación:** `src/pages/repartidor/PedidoAccion.tsx:84`

**Descripción:**  
```ts
const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(uploadData.path)
fotoUrl = urlData.publicUrl
```

`getPublicUrl()` genera URLs permanentes sin token de autenticación. Solo funciona si el bucket está configurado como público. Las fotos de evidencia contienen:
- Imágenes de fachadas de domicilios
- Posiblemente personas (receptor, repartidor)
- Información del entorno del domicilio

El patrón de URL es: `https://ajbkzbtmknlmuucotdol.supabase.co/storage/v1/object/public/evidencias/{pedido_id}/{tipo}/{timestamp}.{ext}`

Con el `pedido_id` (accesible via IDOR en SA-06) y un timestamp aproximado, un atacante puede enumerar las fotos de entregas pasadas.

**Remediación:**
1. Cambiar el bucket a **privado** en el panel de Supabase Storage.
2. Reemplazar `getPublicUrl()` por `createSignedUrl(path, 3600)` (URL firmada válida 1 hora).
3. Almacenar el `path` en la BD, no la URL completa; generar URLs firmadas al momento de visualizar.

---

### SA-20 · MEDIA — Mensajes de error internos de Supabase expuestos al usuario via toast

**Ubicación:** `src/pages/Login.tsx:41`, múltiples páginas/hooks

**Descripción:**  
```ts
// Login.tsx:41
toast.error(e instanceof Error ? e.message : 'Error al iniciar sesión')
```

Supabase Auth devuelve mensajes como:
- `"Invalid login credentials"` — distingue usuario inexistente vs contraseña incorrecta en algunos flows
- `"Email not confirmed"` — confirma que el email existe pero está sin verificar
- `"duplicate key value violates unique constraint \"usuarios_email_key\""` — revela la estructura interna de la BD

Estos mensajes permiten **enumeración de usuarios** (saber qué emails están registrados) y **reconocimiento de schema** (nombres de constraints, tablas).

**Remediación:** Mapear errores de Supabase a mensajes genéricos:
```ts
const mensajes: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'Email not confirmed': 'Verifica tu correo para continuar',
}
toast.error(mensajes[e.message] ?? 'Error al iniciar sesión')
```

---

### SA-21 · MEDIA — Sin cabeceras HTTP de seguridad: sin CSP, X-Frame-Options ni HSTS

**Ubicación:** `index.html` (sin meta CSP), `vite.config.ts` (sin headers configurados)

**Descripción:**  
`index.html` contiene únicamente:
```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Sin ninguna cabecera de seguridad:
- **Sin CSP**: Sin Content-Security-Policy, cualquier script inyectado (vía XSS residual, extensiones maliciosas, o dependencias comprometidas) puede ejecutarse sin restricción.
- **Sin X-Frame-Options**: La app puede ser embebida en un `<iframe>` malicioso para ataques de clickjacking. Un atacante puede superponer botones transparentes sobre la UI real para que el operador confirme acciones sin saberlo.
- **Sin HSTS**: Sin Strict-Transport-Security, un ataque de downgrade de HTTPS a HTTP es posible si el hosting no fuerza HTTPS.

**Remediación:** Configurar en el servidor de hosting (Vercel/Netlify/Nginx):
```
Content-Security-Policy: default-src 'self'; connect-src https://ajbkzbtmknlmuucotdol.supabase.co wss://ajbkzbtmknlmuucotdol.supabase.co; img-src 'self' data: blob: https://ajbkzbtmknlmuucotdol.supabase.co; script-src 'self'; style-src 'self' 'unsafe-inline';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

---

## 6. Dependencias

### SA-22 · MEDIA — Vite `^5.4.10` vulnerable a path traversal en servidor de desarrollo (CVE-2025-30208)

**Ubicación:** `package.json:devDependencies`

**Descripción:**  
CVE-2025-30208 afecta Vite < 5.4.15. Permite que un request crafteado con `?raw??` o similar en la URL del servidor de desarrollo lea archivos fuera del root del proyecto, incluyendo el archivo `.env`.

**Versión declarada:** `^5.4.10` — puede resolverse a cualquier versión entre 5.4.10 y 5.5.0-0.

**Impacto real:** El servidor de desarrollo solo corre localmente (`npm run dev`). **No afecta el build de producción.** El riesgo se materializa si el desarrollador expone accidentalmente el servidor de dev a una red no confiable (ej. `--host 0.0.0.0`).

**Remediación:** Actualizar a `"vite": "^5.4.15"` o `"^6.0.0"` en package.json y correr `npm update`.

---

### SA-23 · MEDIA — `@supabase/supabase-js ^2.45.4`: 20+ versiones de parche sin actualizar

**Ubicación:** `package.json:dependencies`

**Descripción:**  
La versión declarada es `^2.45.4`. La versión actual es `2.68.x` (20+ versiones de diferencia). El SDK de Supabase tiene actualizaciones frecuentes, algunas con correcciones de seguridad relacionadas con el manejo de tokens y refresh.

No se identificaron CVEs específicos críticos en el rango 2.45.x–2.68.x al momento de este análisis, pero el desfase de versiones es riesgo acumulado.

**Remediación:** `npm update @supabase/supabase-js` para obtener la última versión compatible con la API v2.

---

### SA-24 · BAJA — `@hookform/resolvers ^5.4.0` con `react-hook-form ^7.53.2`: mismatch de versiones mayores

**Ubicación:** `package.json:dependencies`

**Descripción:**  
`@hookform/resolvers v5.x` está diseñado para `react-hook-form v8.x`. La versión instalada de RHF es `^7.53.2`. Este mismatch puede causar comportamiento impredecible en los validadores Zod, incluyendo que validaciones fallen silenciosamente sin mostrar errores al usuario.

**Impacto de seguridad:** Si un validador Zod falla silenciosamente, el formulario acepta datos inválidos y los envía a la BD. No es un vector de ataque activo, pero puede deshabilitar las validaciones de `PedidoNuevo.tsx` bajo ciertas condiciones.

**Remediación:** Alinear las versiones: actualizar `react-hook-form` a `^8.x` o bajar `@hookform/resolvers` a `^3.x` (compatible con RHF 7).

---

## Tabla resumen — priorizada por riesgo

| ID | Severidad | Categoría | Hallazgo | Remediación |
|----|-----------|-----------|----------|-------------|
| SA-14 | 🔴 **CRÍTICA** | Secretos | README con contraseña universal + todos los emails | Rotar credenciales HOY, limpiar README |
| SA-08 | 🔴 **CRÍTICA** | Autorización | Escalada de privilegios: repartidor → admin via PATCH usuarios | RLS con función `auth_rol()` |
| SA-05 | 🔴 **CRÍTICA** | Autorización | RLS sin diferenciación de roles: todo autenticado = acceso total | Reestructurar todas las policies |
| SA-06 | 🔴 **CRÍTICA** | IDOR | Repartidor puede leer todos los pedidos, clientes y GPS | Depende de SA-05 |
| SA-07 | 🔴 **CRÍTICA** | IDOR | Cualquier usuario puede modificar/eliminar cualquier dato | Depende de SA-05 |
| SA-19 | 🟠 **ALTA** | Datos sensibles | Bucket evidencias público: fotos sin autenticación | Bucket privado + signed URLs |
| SA-18 | 🟠 **ALTA** | Datos sensibles | PII y GPS de clientes accesible a repartidores | Depende de SA-05 + restricción de campos |
| SA-09 | 🟠 **ALTA** | Autorización | Todos los endpoints sin protección real de rol | Ver SA-05 |
| SA-10 | 🟠 **ALTA** | Validación | Filter injection en búsqueda via `.or()` | Sanitizar input antes de interpolar |
| SA-01 | 🟠 **ALTA** | Autenticación | JWT en localStorage: susceptible a robo por XSS | Evaluar cookie storage o BFF |
| SA-02 | 🟠 **ALTA** | Autenticación | `loadUserProfile` sin error handling: rol null = acceso indeterminado | Signout forzado en error |
| SA-20 | 🟡 **MEDIA** | Datos sensibles | Errores internos de BD expuestos al usuario | Mapear a mensajes genéricos |
| SA-21 | 🟡 **MEDIA** | Infra | Sin CSP, X-Frame-Options, ni HSTS | Headers en servidor de hosting |
| SA-15 | 🟡 **MEDIA** | Secretos | Project ID de Supabase en README | Reemplazar con placeholder |
| SA-03 | 🟡 **MEDIA** | Autenticación | Race condition en detección de rol post-login | Reemplazar setTimeout por useEffect |
| SA-04 | 🟡 **MEDIA** | Autenticación | `onAuthStateChange` sin setLoading(false) | Agregar finally block |
| SA-11 | 🟡 **MEDIA** | Validación | Sin validación Zod en formularios CRUD | Agregar zodResolver a todos los forms |
| SA-22 | 🟡 **MEDIA** | Dependencias | Vite ^5.4.10: CVE-2025-30208 (dev server) | Actualizar a ≥5.4.15 |
| SA-23 | 🟡 **MEDIA** | Dependencias | supabase-js ^2.45.4: 20+ versiones sin actualizar | npm update @supabase/supabase-js |
| SA-12 | 🔵 **BAJA** | Validación | Sin límites de longitud en campos de texto | Agregar .max() en schemas Zod |
| SA-13 | 🔵 **BAJA** | Autenticación | Sin protección frontend contra fuerza bruta | Turnstile/hCaptcha en Supabase Auth |
| SA-16 | 🔵 **BAJA** | Secretos | anon_key en bundle JS (by design, amplificado por SA-05) | Prioridad: arreglar SA-05 primero |
| SA-24 | 🔵 **BAJA** | Dependencias | hookform/resolvers v5 + react-hook-form v7: mismatch | Alinear versiones mayores |
| SA-12 | 🔵 **BAJA** | XSS | foto_url de BD en img src: riesgo residual de pixel tracking | Validar prefijo de URL antes de render |

### Orden de remediación inmediata (semana 1)

1. **Rotar credenciales** de los 6 usuarios + eliminar del README (SA-14) — 1 hora
2. **Función `auth_rol()` + reestructurar policies** para cada tabla (SA-05/08) — 1 día
3. **Cambiar bucket evidencias a privado + signed URLs** (SA-19) — 2 horas
4. **Sanitizar inputs de búsqueda** en usePedidos y Clientes (SA-10) — 30 min
5. **Error handling en loadUserProfile** con signOut forzado (SA-02) — 30 min
