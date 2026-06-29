# Reporte de Pruebas Pre-Despliegue — Akuarian Dispatch

> **Fecha:** 29 de junio de 2026 · **Branch:** `master` · **Entorno:** dev local (`npm run dev`) contra Supabase de producción (`ajbkzbtmknlmuucotdol`)
> **Objetivo:** validar el sistema completo con datos de prueba y todos los roles antes de desplegar a Vercel.

---

## 1. Resumen ejecutivo

| Dimensión | Resultado |
|---|---|
| Build de producción (`tsc && vite build`) | 🟢 Sin errores de tipos · build en ~7.6 s |
| Tests unitarios (`vitest run`) | 🟢 11/11 pasan |
| Navegación back-office (admin/operador/supervisor) | 🟢 Todas las pantallas renderizan sin errores de consola |
| Flujo móvil del repartidor | 🟢 Funciona (lista, acción, validación de foto) |
| Control de acceso por rol (guards) | 🟢 Correcto (repartidor→`/mi-ruta`, operador bloqueado de `/configuracion`) |
| Transición de estado + historial (trigger) | 🟢 Funciona end-to-end |
| Advisors de seguridad de Supabase | 🟡 Solo WARN aceptados (sin ERROR) |
| **Creación de pedidos (numeración)** | 🔴 **Estaba rota** — corregida durante esta sesión (ver Bug #1) |

**Veredicto:** el sistema es **apto para desplegar** una vez aplicado el arreglo de la secuencia de numeración (Bug #1, ya aplicado). Los demás hallazgos son menores y no bloquean el despliegue.

---

## 2. Datos de prueba insertados

Para poder probar (el back-office filtra por la fecha actual y no había pedidos con fecha 29/06/2026), se insertaron datos marcados con `[PRUEBA]` en `observaciones`:

- **3 rutas** para hoy (`Ruta Norte/Sur/Este – Hoy (PRUEBA)`), asignadas a los 3 repartidores, con IDs `11111111…`, `22222222…`, `33333333…`.
- **20 pedidos** para hoy (`PRB-20260629-001` … `016` + `AKU-2026-00054`), cubriendo **los 9 estados** (`recibido`, `verificado`, `en_preparacion`, `listo_despacho`, `recogido`, `en_camino`, `entregado`, `no_entregado`, `reprogramado`) y una variedad de subestados, prioridades y distritos reales de Lima.
- 9 pedidos asignados a rutas (para alimentar la vista del repartidor) y 11 sin asignar (embudo de bodega).

### Limpieza de datos de prueba

```sql
-- Ejecutar cuando ya no se necesiten los datos de testing
delete from pedidos where observaciones like '[PRUEBA]%';
delete from rutas  where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333');
```

> ⚠️ Los datos de prueba quedaron **en la base de producción**. Decidir si se conservan para la demo o se limpian antes del go-live.

---

## 3. Alcance de las pruebas (qué se probó)

### Back-office (admin / operador / supervisor)
| Pantalla | Resultado | Notas |
|---|---|---|
| Login | 🟢 | Email+password OK para los 6 usuarios de prueba. Redirección por rol correcta. |
| Inicio / Actividad (`/dashboard`) | 🟢 | KPIs: 16 % cumplimiento, 19 asignadas, 6 gestionadas, 3 entregadas. Tarjetas por repartidor con %. |
| Pedidos (`/pedidos`) | 🟢 | Tabla densa con 19 filas, filtros (estado/subestado/fecha/búsqueda), selección múltiple, export. |
| Detalle de pedido (drawer) | 🟢 | Resumen, Categorías, Campos personalizados, Ítems, Eventos (timeline), acciones. |
| Transición de estado | 🟢 | `recibido → verificado` confirmada; el trigger registró el evento en `historial_estados`. |
| Pedido nuevo (`/pedidos/nuevo`) | 🟢 | Wizard de 2 pasos renderiza correctamente. |
| Rutas (`/rutas`) | 🟢 | 3 rutas con contadores (1/4, 2/4, 0/3), tiempo relativo, filtros. |
| Detalle de ruta (`/rutas/:id`) | 🟢 | Tabs Despachos/Cobros, paradas con hora estimada/real/ventana, Reordenar, Asociar pedido. |
| Repartidores (`/repartidores`) | 🟢 | 3 repartidores, conteo de pedidos del día, vehículos. |
| Clientes (`/clientes`) | 🟢 | 4 clientes, # órdenes, Importar, Reseñas. |
| Reportes (`/reportes`) | 🟢 | 18 gráficas Recharts, KPIs, distribución de estados, despachos por día. |
| Configuración (`/configuracion`) | 🟢 | 23 parámetros agrupados (solo admin). |
| Importar (`/importar`) | 🟢 | Carga CSV/XLSX de clientes y pedidos, plantilla descargable. |

### App móvil del repartidor (Carlos Quispe)
| Pantalla | Resultado | Notas |
|---|---|---|
| Mi ruta (`/mi-ruta`) | 🟢 | Muestra **solo** los 4 pedidos de su ruta (RLS correcto), separados en Pendientes/Completados. |
| Acción de pedido (`/mi-ruta/:id/accion`) | 🟢 | Botones Confirmar Entrega / No pude entregar; captura de foto. |
| Validación de foto requerida | 🟢 | Bloquea la entrega si `requiere_foto = true` y no hay foto. |

### Control de acceso (guards de ruta)
- 🟢 Repartidor en `/pedidos` → redirigido a `/mi-ruta`.
- 🟢 Operador en `/configuracion` → redirigido a `/dashboard`.
- 🟢 Los 4 roles (admin, operador, supervisor, repartidor) resuelven su perfil y entran a su vista correspondiente.

---

## 4. Errores y hallazgos

### 🔴 Bug #1 — Secuencia de `numero_pedido` desincronizada (BLOQUEANTE) — *corregido en esta sesión*

**Severidad:** Alta (bloqueaba la creación de pedidos en producción).

**Descripción:** el trigger `fn_generar_numero_pedido()` genera el número con `nextval('seq_pedido_numero')` en formato `AKU-YYYY-NNNNN`. La secuencia estaba en `last_value = 24`, pero la tabla ya tenía números hasta `AKU-2026-00053`. Como `PedidoNuevo.tsx` inserta el pedido **sin** `numero_pedido` (delega en el trigger), las siguientes ~30 altas habrían fallado con:

```
ERROR: duplicate key value violates unique constraint "pedidos_numero_pedido_key"
DETAIL: Key (numero_pedido)=(AKU-2026-00025..00053) already exists.
```

Es decir, **crear un pedido desde la app estaba roto** en el estado previo.

**Causa raíz:** la secuencia no se avanzó al sembrar/migrar los pedidos `AKU-` existentes (probable carga directa o restauración sin `setval`). Adicionalmente conviven **dos formatos** de número en la tabla: `AKU-…` (53 filas, del trigger) y `PED-YYYYMMDD-NNNNN-XXXX` (50 filas, de una versión/seed anterior) — inconsistencia histórica.

**Arreglo aplicado:**
```sql
select setval('seq_pedido_numero',
  (select max(substring(numero_pedido from 'AKU-\d{4}-(\d+)')::int)
     from pedidos where numero_pedido like 'AKU-%'), true);
-- last_value = 53 → siguiente AKU-2026-00054
```
**Verificado:** un INSERT vía trigger ahora genera `AKU-2026-00054` sin colisión. ✔️

**Recomendación de fondo (roadmap):** mover la numeración a un único origen de verdad y versionar el cambio en `supabase/migrations/`; considerar reset anual de la secuencia y un formato único.

---

### 🟡 Bug #2 — Timeline "Actividad del día" y métricas de tiempo dependen de timestamps que solo escribe la app móvil — *resuelto en Fase 0.3*

**Severidad:** Media (afecta exactitud de reportes con datos importados). **Estado: ✅ resuelto** — trigger `trg_pedidos_sellar_tiempos` sella `recogido_en`/`fecha_entrega_real` en toda transición + backfill. Verificado: el timeline pasó de 0 a 10 eventos.

**Descripción:** en el Dashboard, "Actividad del día" mostró *"0 eventos con hora registrada / Sin recogidas ni entregas registradas"* pese a existir 6 pedidos gestionados. En Reportes, "Min. promedio de gestión" y "Entrega más larga" mostraron **0 min**. La causa es que estos widgets leen `recogido_en` y `fecha_entrega_real`, campos que **solo se rellenan cuando el repartidor registra la acción desde el móvil**, no al insertar/importar pedidos ni al cambiar estado desde el back-office.

**Impacto:** pedidos creados por **importación masiva** o por cambio de estado manual no aparecen en el timeline ni alimentan las métricas de tiempo → reportes subestimados.

**Recomendación:** rellenar `recogido_en`/`fecha_entrega_real` también al transicionar estado desde el back-office (o derivar los tiempos de `historial_estados`, que sí registra todas las transiciones).

---

### 🟡 Bug #3 — "Supervisor = solo lectura" no implementado en la UI — *resuelto en Fase 0.4*

**Severidad:** Media (control de acceso). **Estado: ✅ resuelto** — `es_operador_o_admin()` en RLS (escritura admin/operador, lectura todo staff) + gating de UI con `puedeEditar`. Verificado: supervisor sin botones de creación ni barra de acciones.

**Descripción:** el README/análisis indica que el supervisor debería ser de solo lectura, pero el guard de frontend trata a `operador` y `supervisor` igual (ambos pueden crear/editar). El único control real estaría en las políticas RLS.

**Recomendación:** verificar/implementar en RLS que `supervisor` no tenga `INSERT/UPDATE/DELETE`, o documentar explícitamente que supervisor = operador.

---

### 🟢 Hallazgos menores (no bloquean)

| # | Hallazgo | Ubicación | Sugerencia |
|---|---|---|---|
| 4 | Saludo fijo "Buenos días" sin lógica horaria | `MiRuta.tsx:47` | ✅ Resuelto (Fase 0.5): `saludoHora()`. |
| 5 | "Bitácora" es un placeholder (`toast 'próximamente'`) | `Pedidos.tsx:259` | Pendiente (feature futura). |
| 6 | El toggle tabla/tarjetas solo aparece en `lg+` (`hidden lg:flex`) | `Pedidos.tsx:243` | Aceptable; decisión responsive. |
| 7 | Inconsistencia menú "Inicio" vs. página "Actividad" | `Sidebar.tsx` | ✅ Resuelto (Fase 0.5): menú renombrado a "Actividad". |
| 8 | Etiquetas KPI truncadas en pantallas estrechas | `KpiStrip` | ✅ Resuelto (Fase 0.5): `title` (tooltip) en la etiqueta. |

---

## 5. Seguridad (Supabase Advisors — 29/06/2026)

Sin **ERROR**. Solo **WARN** ya aceptados y documentados en `ESTADO-DEL-PROYECTO.md §9`:

- `anon/authenticated_security_definer_function_executable` ×6 — `current_repartidor_id()`, `es_admin()`, `es_staff()`. **Intencional:** se usan dentro de las políticas RLS.
- `auth_leaked_password_protection` — toggle del panel de Auth, **acción manual pendiente del admin** (1 clic).

---

## 6. Checklist previo a Vercel

- [x] Build de producción sin errores.
- [x] Tests pasan.
- [x] Navegación validada con todos los roles.
- [x] **Bug #1 (numeración) corregido y verificado.**
- [ ] Decidir si limpiar los datos `[PRUEBA]` (ver §2).
- [ ] Activar *Leaked Password Protection* en el panel de Auth de Supabase.
- [ ] Cargar credenciales de Cloudflare R2 (evidencias) — ver `docs/FASE9-R2-SETUP.md`.
- [ ] Versionar el esquema actual en `supabase/migrations/` (`supabase db pull`).
- [ ] Confirmar variables de entorno en Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

*Reporte generado tras pruebas en vivo (servidor de desarrollo + base de datos de producción Supabase). Akuarian SAC © 2026.*
