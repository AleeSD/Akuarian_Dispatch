# Roadmap de Mejoras — Akuarian Dispatch (referencia DispatchTrack / Beetrack LastMile)

> **Fecha:** 29 de junio de 2026 · **Versión base:** 1.0.0 · **Branch:** `master`
> **Propósito:** consolidar todas las mejoras que se pueden implementar en Akuarian Dispatch, tomando como referencia el SaaS que la operación usa hoy (**DispatchTrack | LastMile**, ex–Beetrack). Cada fase indica **dificultad**, **impacto**, **dependencias** y el **modelo de IA recomendado** para su desarrollo.
>
> Este documento es el plan de trabajo para la **siguiente etapa de desarrollo**. No implementa nada todavía.

---

## 0. Cómo leer este documento

### Escala de dificultad
| Nivel | Significado |
|---|---|
| ⭐ Baja | Cambio acotado, UI o lógica simple, sin tocar el esquema. |
| ⭐⭐ Media | Varios archivos, nueva columna/tabla o integración interna. |
| ⭐⭐⭐ Alta | Cambios de esquema, integración externa (mapas, mensajería) o lógica compleja. |
| ⭐⭐⭐⭐ Muy alta | Subsistema nuevo (optimización de rutas, portal público, tiempo real). |

### Modelo de IA recomendado por tipo de tarea
| Modelo | Cuándo usarlo |
|---|---|
| **Haiku 4.5** | Tareas mecánicas y acotadas: cambios de copy, badges, formateadores, CRUD repetitivo, ajustes de estilos puntuales. Rápido y barato. |
| **Sonnet 4.6** | El caballo de batalla: features de tamaño medio, nuevos componentes, endpoints, migraciones simples, refactors localizados, conexión de configuración. |
| **Opus 4.8** | Diseño de arquitectura y tareas de alto riesgo o transversales: optimización de rutas, tiempo real, modelo de datos nuevo, seguridad/RLS, integraciones externas complejas, decisiones que afectan a todo el sistema. |

> **Patrón sugerido:** que **Opus 4.8** diseñe el plan y el esqueleto de cada fase compleja (esquema, contratos, arquitectura) y que **Sonnet 4.6** implemente el grueso, dejando a **Haiku 4.5** los remates repetitivos. Indicado en cada paso.

### Funciones de referencia observadas en DispatchTrack / Beetrack LastMile
Mapas en tiempo real · optimización de rutas con IA y ETA · ventanas/citas de entrega · notificaciones automáticas al cliente (SMS/email/WhatsApp, incl. **pre-entrega**) · **portal público de seguimiento** para el destinatario · prueba de entrega digital (foto + **firma** + DNI) · **alertas operativas** (entregas fallidas/parciales/tardías, baja calificación) · **NPS/reseñas** del cliente · gestión de **flota** (vehículos) · estadísticas avanzadas (tiempos de gestión, por hora/día) · campos personalizados · exportaciones a Excel/recaudación · asistente IA de atención (DT Agent).
Fuentes: [dispatchtrack.com](https://www.dispatchtrack.com/) · [beetrack.com/es/lastmile](https://www.beetrack.com/es/lastmile) · [support.beetrack.com](https://support.beetrack.com/es/collections/1707910-lastmile)

---

## Fase 0 — Saneamiento previo (deuda técnica que habilita lo demás) ✅ COMPLETADA (29/06/2026)

**Objetivo:** dejar la base sólida antes de construir features. Barato y de alto retorno.

| # | Tarea | Dificultad | Modelo IA | Estado |
|---|---|---|---|---|
| 0.1 | **Unificar y versionar la numeración de pedidos** (raíz del Bug #1). | ⭐⭐ | **Sonnet 4.6** | ✅ Trigger auto-curativo + prefijo configurable + migración versionada. |
| 0.2 | **Versionar el esquema** (hoy `supabase/migrations/` vacío). | ⭐ | **Haiku 4.5** | 🟡 Migraciones de Fase 0 versionadas localmente; `supabase db pull` del histórico previo pendiente (requiere login CLI) — ver `supabase/migrations/README.md`. |
| 0.3 | **Sellar `recogido_en`/`fecha_entrega_real`** en toda transición (Bug #2). | ⭐⭐ | **Sonnet 4.6** | ✅ Trigger `trg_pedidos_sellar_tiempos` + backfill. Timeline pasó de 0 a 10 eventos. |
| 0.4 | **Rol supervisor = solo lectura** en RLS + UI (Bug #3). | ⭐⭐ | **Opus 4.8** | ✅ `es_operador_o_admin()` + políticas divididas + gating de UI (`puedeEditar`). |
| 0.5 | *Leaked Password Protection* + remates menores. | ⭐ | **Haiku 4.5** | 🟡 Saludo horario, nav "Actividad" y `title` en KPIs hechos; toggle de Auth es **1 clic manual del admin** (no por SQL). |
| 0.6 | **Conectar `configuracion` a la lógica**. | ⭐⭐ | **Sonnet 4.6** | ✅ Hook `useConfiguracion` + prefijo en el trigger + foto requerida por config en la app móvil. (Pendiente de cablear: `max_intentos_entrega`, horarios, `requiere_firma_entrega` → ver Fase 2.) |

**Salida de fase:** esquema (de Fase 0) versionado, numeración robusta, métricas de tiempo correctas, supervisor de solo lectura. **Build + tests verdes; advisors sin ERROR.**

---

## Fase 1 — Comunicación con el cliente (el mayor diferenciador de Beetrack)

**Objetivo:** que el destinatario sepa el estado de su pedido sin llamar. Es **la** función estrella de LastMile.

| # | Tarea | Dificultad | Modelo IA | Notas |
|---|---|---|---|---|
| 1.1 | **Notificaciones automáticas al cliente** (estado cambia → mensaje). Empezar por **email** (más simple) vía Edge Function + plantilla. Usar tabla `notificaciones` (hoy vacía) + parámetros de `configuracion`. | ⭐⭐⭐ | **Opus 4.8** (diseño Edge Function + cola/estados) → **Sonnet 4.6** (implementación) | Base para todo lo demás. |
| 1.2 | **WhatsApp** (canal preferido en Perú) vía proveedor (Twilio/Meta Cloud API) en la misma Edge Function. | ⭐⭐⭐ | **Opus 4.8** | Integración externa + credenciales. |
| 1.3 | **Notificación pre-entrega** ("tu pedido llega hoy / en X paradas"). | ⭐⭐ | **Sonnet 4.6** | Depende de 1.1. |
| 1.4 | **Portal público de seguimiento** (`/seguimiento/:token`): el cliente ve estado, ETA y evidencia sin login. Token firmado, RLS de solo lectura. | ⭐⭐⭐⭐ | **Opus 4.8** (arquitectura + seguridad del token) → **Sonnet 4.6** (UI) | Ruta pública nueva fuera de `ProtectedRoute`. |

**Salida de fase:** el cliente recibe avisos y puede rastrear su pedido. Reduce llamadas y reclamos.

---

## Fase 2 — Evidencia y cierre de entrega de nivel profesional

**Objetivo:** prueba de entrega irrefutable, como exige la operación real.

| # | Tarea | Dificultad | Modelo IA | Notas |
|---|---|---|---|---|
| 2.1 | **Firma digital** en la app móvil (canvas táctil → imagen → R2/`firma_url`). | ⭐⭐ | **Sonnet 4.6** | Campo `firma_url` ya existe. |
| 2.2 | **Captura de receptor + DNI** al entregar (campos `nombre_receptor`, `dni_receptor` ya existen). | ⭐ | **Haiku 4.5** | Solo formulario + guardado. |
| 2.3 | **Terminar la integración R2** (cargar credenciales) y mostrar **miniaturas** + lightbox de evidencias. | ⭐⭐ | **Sonnet 4.6** | Ver `FASE9-R2-SETUP.md`. |
| 2.4 | **Entrega parcial** (subestado ya existe): registrar bultos entregados vs. total. | ⭐⭐ | **Sonnet 4.6** | Requiere campo de bultos entregados. |
| 2.5 | **Modo offline** en la app del repartidor (cola local de acciones, sincroniza al recuperar señal). | ⭐⭐⭐⭐ | **Opus 4.8** | Service Worker + IndexedDB; complejo. |

**Salida de fase:** entregas con foto + firma + receptor, evidencias en la nube, soporte de zonas sin señal.

---

## Fase 3 — Citas, ventanas horarias y alertas operativas

**Objetivo:** paridad con la gestión por **CITA** y la **intervención temprana** de Beetrack.

| # | Tarea | Dificultad | Modelo IA | Notas |
|---|---|---|---|---|
| 3.1 | **Ventana de entrega comprometida (CITA)** por pedido (hora desde/hasta). La columna "Ventana comprometida" ya existe en `RutaDetalle` pero sin datos. | ⭐⭐ | **Sonnet 4.6** | ALTER tabla + UI en alta de pedido. |
| 3.2 | **Alertas operativas**: panel/badges de entregas fallidas, tardías (fuera de ventana), parciales y reintentos > máx. | ⭐⭐⭐ | **Opus 4.8** (modelo de reglas) → **Sonnet 4.6** | Usa `max_intentos_entrega` de Config (Fase 0.6). |
| 3.3 | **Hora estimada vs. hora real** por parada (las columnas existen en `RutaDetalle`, sin lógica). | ⭐⭐ | **Sonnet 4.6** | Estimación simple primero; ETA real en Fase 5. |
| 3.4 | **NPS / reseñas del cliente** tras la entrega (la UI de "Reseñas" ya existe en Clientes como placeholder). | ⭐⭐⭐ | **Sonnet 4.6** | Tabla nueva + captación vía portal/notificación. |

**Salida de fase:** la operación ve a tiempo lo que se está retrasando y mide satisfacción.

---

## Fase 4 — Flota, estadísticas avanzadas y volumen

**Objetivo:** completar los módulos que DispatchTrack muestra y que hoy faltan o están a medias.

| # | Tarea | Dificultad | Modelo IA | Notas |
|---|---|---|---|---|
| 4.1 | **Módulo de Flota** (vehículos como entidad: placa, tipo, capacidad, estado, vínculo a repartidor). Hoy el vehículo es texto libre. | ⭐⭐⭐ | **Sonnet 4.6** | Tabla nueva + migración + CRUD. |
| 4.2 | **Edición/baja de repartidores** (hoy solo alta) y eliminar el **N+1 query** que queda en Repartidores. | ⭐⭐ | **Sonnet 4.6** | Conteo agregado en vista/RPC. |
| 4.3 | **Estadísticas avanzadas**: tiempo promedio de gestión real (depende de Fase 0.3), despachos por hora del día y por día de semana, entrega más larga. | ⭐⭐ | **Sonnet 4.6** | Recharts ya está. |
| 4.4 | **Asignación de ruta en lote** desde el listado de pedidos (selección múltiple ya existe). | ⭐⭐ | **Sonnet 4.6** | Acción masiva sobre `ruta_id`. |
| 4.5 | **Exportar recaudación / módulo de Cobros (COD)** si aplica contraentrega (tab "Cobros" ya existe en `RutaDetalle`). | ⭐⭐⭐ | **Opus 4.8** (modelo de cobros) → **Sonnet 4.6** | Solo si hay pago contra entrega. |
| 4.6 | **React Query (TanStack)**: caché, invalidación y estados optimistas; elimina re-fetch en cada navegación. | ⭐⭐⭐ | **Opus 4.8** | Refactor transversal de data-fetching. |

**Salida de fase:** flota gestionada, reportes ricos, operación a escala más fluida.

---

## Fase 5 — Geolocalización y optimización de rutas (el gran diferenciador, mayor esfuerzo)

> **Nota de producto:** los mapas fueron **descartados** en el rediseño de jun-2026. Esta fase es **opcional** y solo procede si el negocio decide revertir esa decisión. Es la más cara.

| # | Tarea | Dificultad | Modelo IA | Notas |
|---|---|---|---|---|
| 5.1 | **Mapa en detalle de pedido/ruta** (Leaflet + tiles OSM/HERE; coordenadas `coordenadas_entrega` ya existen). | ⭐⭐⭐ | **Opus 4.8** (elección de stack) → **Sonnet 4.6** | Reintroduce dependencia de mapas. |
| 5.2 | **Geocodificación de direcciones** al crear pedido + alerta de confiabilidad (como DispatchTrack). | ⭐⭐⭐ | **Sonnet 4.6** | API de geocoding (HERE/Google/Nominatim). |
| 5.3 | **Captura de geolocalización del evento** (recogida/entrega) en la app móvil. | ⭐⭐ | **Sonnet 4.6** | `navigator.geolocation`. |
| 5.4 | **Reordenar/optimizar ruta** (secuencia óptima de paradas). El botón "Reordenar ruta" ya existe en la UI. | ⭐⭐⭐⭐ | **Opus 4.8** | Problema tipo TSP/VRP; usar servicio de optimización. |
| 5.5 | **Monitor "Actividad" en tiempo real** con posición de unidades y ETA dinámica (98 % es el referente de DispatchTrack). | ⭐⭐⭐⭐ | **Opus 4.8** | Realtime de Supabase + cálculo de ETA. |

**Salida de fase:** seguimiento en mapa y rutas optimizadas. Alto valor, alto costo.

---

## Fase 6 — Asistencia con IA (visión a futuro)

| # | Tarea | Dificultad | Modelo IA | Notas |
|---|---|---|---|---|
| 6.1 | **Asistente de atención** estilo "DT Agent": responde consultas de estado del pedido (chatbot sobre los datos). | ⭐⭐⭐⭐ | **Opus 4.8** | Usar la API de Claude (Sonnet/Haiku en runtime para costo). |
| 6.2 | **Predicción de retrasos / sugerencia de reprogramación** según histórico. | ⭐⭐⭐⭐ | **Opus 4.8** | Requiere volumen de datos. |

---

## Resumen de priorización sugerida

| Orden | Fase | Por qué primero |
|---|---|---|
| 1 | **Fase 0** | Sin base sólida, todo lo demás acumula deuda. Barato. |
| 2 | **Fase 1** | Máximo impacto percibido por el cliente final; corazón de Beetrack. |
| 3 | **Fase 2** | Cierra el flujo operativo real (firma/receptor/offline). |
| 4 | **Fase 3** | Citas y alertas: control operativo diario. |
| 5 | **Fase 4** | Escala y reportería. |
| 6 | **Fase 5** | Opcional/caro; solo si se reintroducen mapas. |
| 7 | **Fase 6** | Futuro, sobre datos ya maduros. |

### Reparto de modelos de IA (visión global)
- **Opus 4.8:** Fases 0.4, 1.1, 1.2, 1.4, 2.5, 3.2, 4.5, 4.6 y toda la Fase 5 y 6 (diseño + tareas de riesgo/transversales).
- **Sonnet 4.6:** el grueso de la implementación en todas las fases.
- **Haiku 4.5:** 0.2, 0.5, 2.2 y remates repetitivos.

---

*Documento de planificación basado en el código actual, la base de datos en vivo y la referencia funcional de DispatchTrack/Beetrack LastMile. Pendiente de aprobación para iniciar la siguiente fase de desarrollo. Akuarian SAC © 2026.*
