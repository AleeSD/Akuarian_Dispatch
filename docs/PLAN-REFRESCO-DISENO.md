# Plan de Refresco de Diseño — Akuarian Dispatch

> Documento de trabajo para guiar el rediseño. Pensado para alimentar un prompt de implementación.
> **Fecha:** 26 de junio de 2026 · **Branch base:** `master`
> **Documentos hermanos:**
> - [ESTADO-DEL-PROYECTO.md](ESTADO-DEL-PROYECTO.md) — contexto completo del proyecto
> - [PROMPT-IMPLEMENTACION-REDISENO.md](PROMPT-IMPLEMENTACION-REDISENO.md) — **prompt ejecutable por fases** (versión ampliada de este plan, lista para pegar en la sesión de implementación)

---

> ✅ **Estado: implementado.** Todo este plan se ejecutó (Fases 0-9 + seguridad + `.xlsx`). El detalle ejecutable y el estado por fase están en [PROMPT-IMPLEMENTACION-REDISENO.md](PROMPT-IMPLEMENTACION-REDISENO.md). Decisión posterior relevante: **los mapas se eliminaron por completo** (no se implementan).

## 0. Decisiones tomadas (alcance de esta iteración)

| Tema | Decisión | Implicación |
|---|---|---|
| **Subestados de pedido** (Entrega exitosa/parcial, Recojo anulado…) | ⏸️ **Pospuesto** | NO se tocan enums ni el modelo de estados en esta fase. Seguimos con los 9 estados actuales. |
| **Paleta de colores** | ✅ **Se mantiene la actual** (celeste/menta/lavanda/coral) | NO migrar a navy. El refresco es de **layout y patrones de UX**, no de marca de color. |
| **Referencia Beetrack/DispatchTrack** | ✅ **Adoptar parcialmente** | Tomar los patrones que hacen el sistema **familiar al personal** que hoy usa DispatchTrack, reinterpretados con nuestra paleta pastel. |
| **Funcionalidad nueva (mapas, import, cobros…)** | ⏸️ Fuera de alcance aquí | Este documento es de **diseño/UX**, no de features de backend. Esas van en el roadmap (§11 del doc de estado). |

**Objetivo de la iteración:** que un operador que viene de DispatchTrack reconozca la estructura de la app (barra superior, navegación, vistas de tabla, lectura de estados y tiempos) **sin cambiar la identidad visual pastel** ni el modelo de datos.

---

## 1. Principio rector

> **Familiaridad estructural, identidad propia de color.**

Tomamos de Beetrack **la disposición y los patrones de interacción** (lo que el personal ya tiene memorizado), pero lo vestimos con la paleta celeste/menta/lavanda/coral existente. Donde Beetrack usa azul marino corporativo, nosotros usamos `celeste-900`/`celeste-700`. Donde usa gris frío de tablas, usamos nuestros grises actuales.

---

## 2. Elementos de Beetrack que SÍ adoptamos

Numerados para poder referenciarlos desde el prompt.

### 2.1 Barra superior global (top bar)
- **Qué:** una barra superior **persistente en escritorio** (hoy solo existe en móvil, ver `src/components/layout/Header.tsx`).
- **De Beetrack:** marca a la izquierda, zona de acciones a la derecha (notificaciones, ayuda, perfil).
- **Con nuestra paleta:** fondo `celeste-900` o `celeste-700` (no navy), texto blanco, logo Akuarian.
- **Contenido propuesto:** logo + nombre del módulo actual a la izquierda; a la derecha: campana de notificaciones, avatar de usuario con menú (perfil / cerrar sesión).
- **Resultado:** la app gana el "marco" superior que el personal espera ver siempre.

### 2.2 Sidebar refinada (estilo Beetrack)
- **Qué:** mantener la sidebar de escritorio (`src/components/layout/Sidebar.tsx`) pero acercarla al patrón Beetrack: **icono + label**, item activo claramente marcado, posibilidad de **colapsar a solo iconos**.
- **Con nuestra paleta:** activo en `celeste-50`/`celeste-700` (como ya está); al colapsar, mostrar tooltips.
- **Orden de navegación** alineado mentalmente con Beetrack (Actividad→Inicio, Órdenes→Pedidos, Rutas, Flota→Repartidores, Clientes, Estadísticas→Reportes).

### 2.3 Vista de tabla densa para listados
- **Qué:** ofrecer una **vista de tabla** (además de las tarjetas actuales) en **Pedidos**, **Rutas** y **Clientes**.
- **De Beetrack:** columnas claras, filas compactas, **checkbox de selección por fila**, **menú ⋮ por fila**, paginación al pie, barra de filtros arriba en una fila horizontal.
- **Columnas sugeridas para Pedidos:** Nº pedido · Estado · Cliente · Dirección/Distrito · Repartidor · Bultos · Hora · (⋮).
- **Columnas sugeridas para Rutas:** Nombre · Repartidor/Vehículo · Despachos · Fecha · Estado · Progreso · (⋮).
- **Toggle Tarjetas / Tabla:** conservar las tarjetas (buenas en móvil) y añadir la tabla (mejor densidad en escritorio). El usuario elige.
- **Componente nuevo reutilizable:** `src/components/ui/Table.tsx` (header ordenable, selección, paginación, slot de acciones).

### 2.4 Tiempo relativo
- **Qué:** mostrar tiempos como Beetrack: "hace 2 horas", "Estimado para 11 min", junto a la fecha absoluta.
- **De Beetrack:** lectura rápida del "qué tan reciente" sin calcular.
- **Implementación:** utilidad en `src/lib/utils.ts` usando `formatDistanceToNow` de `date-fns` con locale `es`. Usar en listados y timelines.

### 2.5 Barra de filtros horizontal
- **Qué:** unificar los filtros en una **fila horizontal de controles** sobre cada listado (como las pantallas de Órdenes/Rutas de Beetrack), en vez de filtros sueltos.
- **Con nuestra paleta:** usar los `Input`/`Select` actuales dentro de un contenedor `Card` blanco.
- **Extra:** botón "Filtrar" y "Limpiar filtros" explícitos.

### 2.6 Tira de KPIs en cabecera de listados/dashboard
- **Qué:** una fila compacta de métricas (Asignadas · Recogidas · Entregas · % Cumplimiento) como la barra superior de "Actividad" en Beetrack.
- **Dónde:** reforzar el Dashboard (`src/pages/Dashboard.tsx`) y/o cabecera de Rutas.
- **Con nuestra paleta:** chips/píldoras con los colores semánticos actuales (menta=entregado, celeste=en camino, coral=pendiente/fallo).

### 2.7 Detalle de pedido como página con timeline de eventos
- **Qué:** el detalle (`src/pages/PedidoDetalle.tsx`, hoy drawer) puede mantenerse como drawer **pero** enriquecer el timeline al estilo Beetrack: eventos verticales con hora, autor y estado ("Ingresado al sistema", "Asignado a ruta", "Entregado").
- **Opcional:** habilitar URL propia `/pedidos/:id` para enlace compartible (mejora, no bloqueante).

### 2.8 Acciones de cabecera consistentes
- **Qué:** botones de acción primarios arriba a la derecha de cada módulo (como "Nueva orden", "Exportar a Excel", "Nueva Ruta" en Beetrack).
- **Ya existe** parcialmente ("Nuevo pedido", "Nueva ruta"); estandarizar posición, estilo y agregar "Exportar" donde aplique (reusar el CSV de Reportes).

---

## 3. Elementos de Beetrack que NO adoptamos (por ahora)

Para evitar scope creep, dejar explícito lo que **queda fuera** de esta iteración:

- ❌ **Azul marino corporativo** → mantenemos pastel.
- ❌ **Subestados** (Estado + Subestado) → pospuesto, sin cambios de enum.
- ❌ **Mapas / geocodificación / pin por parada** → fase posterior (requiere librería + backend).
- ❌ **Tabs Despachos/Mapa/Cobros** en ruta, **reordenar/optimizar ruta** → fase posterior.
- ❌ **Importación masiva** desde archivo → fase posterior.
- ❌ **Notificaciones a cliente (WhatsApp/email)**, chat interno → fase posterior.
- ❌ **Campos personalizados / categorías y grupos** → fase posterior.

---

## 4. Sistema de diseño — ajustes (sin tocar la paleta)

La paleta se mantiene **idéntica** (`tailwind.config.js`). Los ajustes son de **consistencia**, no de color de marca:

1. **Consolidar badges de estado:** hoy `EstadoBadge` mezcla colores de marca con Tailwind por defecto (`yellow`, `orange`, `blue`, `amber`). Mantener la lógica pero documentar el mapa estado→color y asegurar contraste. **No** es necesario migrarlos a la paleta de marca si rompe la legibilidad de los 9 estados; sí dejar el mapa centralizado y comentado.
2. **Tokens de superficie:** definir como tokens reutilizables los grises de fondo (`#F7F9FC` que ya se usa en móvil), bordes (`gray-100`) y sombras, para que tablas y tarjetas se vean homogéneas.
3. **Estados vacíos / carga / error unificados:** hoy cada página los implementa distinto. Crear un patrón común (`EmptyState`, reutilizar `Skeleton`).
4. **Tipografía y densidad:** las tablas requieren tamaños y paddings más compactos que las tarjetas; definir esa escala.

---

## 5. Mapa de cambios por archivo (orientativo)

| Área | Archivo(s) | Cambio |
|---|---|---|
| Top bar global | `src/components/layout/Header.tsx`, `Layout.tsx` | Añadir top bar persistente en escritorio con paleta celeste |
| Sidebar | `src/components/layout/Sidebar.tsx` | Estado colapsable + tooltips, refinar activo |
| Tabla reutilizable | **nuevo** `src/components/ui/Table.tsx` | Header ordenable, selección, paginación, slot acciones |
| Pedidos | `src/pages/Pedidos.tsx` | Toggle tarjetas/tabla, barra de filtros horizontal, tiempo relativo |
| Rutas | `src/pages/Rutas.tsx` | Vista tabla opcional + KPIs |
| Clientes | `src/pages/Clientes.tsx` | Vista tabla con columnas (nombre/tel/email/# pedidos) |
| Dashboard | `src/pages/Dashboard.tsx` | Tira de KPIs estilo "Actividad" |
| Detalle pedido | `src/pages/PedidoDetalle.tsx` | Timeline de eventos enriquecido |
| Utilidades | `src/lib/utils.ts` | `formatRelativo()` con `date-fns` |
| Diseño común | **nuevo** `src/components/ui/EmptyState.tsx` | Estado vacío unificado |

> Nota: ninguno de estos cambios requiere tocar la base de datos ni los enums.

---

## 6. Orden de implementación sugerido

1. **Top bar global** + refinar sidebar (marco visual familiar). *Bajo riesgo, alto impacto percibido.*
2. **Componente `Table.tsx`** reutilizable. *Habilitador del resto.*
3. **Pedidos en vista tabla** + barra de filtros + tiempo relativo. *Pantalla más usada.*
4. **Rutas y Clientes en vista tabla.**
5. **Tira de KPIs** en Dashboard.
6. **Timeline de eventos** enriquecido en detalle de pedido.
7. **Estados vacíos/carga/error** unificados (transversal, al final).

---

## 7. Criterios de aceptación

- [ ] La paleta pastel actual **no cambia** (mismo `tailwind.config.js`).
- [ ] No se modifican enums ni el modelo de estados (sin subestados).
- [ ] Existe una **barra superior persistente en escritorio** con la marca.
- [ ] Pedidos, Rutas y Clientes ofrecen **vista de tabla** con selección, paginación y menú de fila, **además** de las tarjetas.
- [ ] Los listados muestran **tiempo relativo** junto a la fecha.
- [ ] El Dashboard muestra una **tira de KPIs** legible de un vistazo.
- [ ] La app sigue siendo **responsive** (tablas degradan a tarjetas en móvil).
- [ ] No se introducen mapas, importación ni notificaciones en esta iteración.

---

## 8. Insumos para el prompt de Claude Chat

Pegar este bloque como contexto base al pedir la implementación:

```
Proyecto: Akuarian Dispatch (React 18 + Vite + TS + Tailwind + Supabase).
Tarea: refresco de DISEÑO/UX. NO tocar la paleta de colores (celeste/menta/lavanda/coral
en tailwind.config.js) y NO tocar la base de datos ni los enums de estado.

Objetivo: que la app resulte FAMILIAR al personal que hoy usa DispatchTrack/Beetrack,
adoptando estos patrones reinterpretados con nuestra paleta pastel:
1. Barra superior global persistente en escritorio (fondo celeste-900, no navy).
2. Sidebar colapsable icono+label con tooltips.
3. Vista de TABLA densa (selección por fila, menú ⋮, paginación, filtros horizontales)
   como alternativa a las tarjetas en Pedidos, Rutas y Clientes. Crear src/components/ui/Table.tsx.
4. Tiempo relativo ("hace 2h") con date-fns en listados y timelines (helper en src/lib/utils.ts).
5. Tira de KPIs en el Dashboard (Asignadas/Recogidas/Entregas/% Cumplimiento) con colores semánticos actuales.
6. Timeline de eventos enriquecido en el detalle de pedido.

FUERA DE ALCANCE: subestados, mapas/geocodificación, importación masiva, notificaciones a
cliente, tabs de cobros, campos personalizados, cambio de color de marca.

Mantener responsive (tablas → tarjetas en móvil). Respetar la estructura de carpetas existente
y los componentes UI actuales (Button, Input, Card, Modal, Skeleton, EstadoBadge).
```

---

*Las capturas de referencia están en `Beetrack/`. Este documento cubre solo el refresco de diseño; el roadmap funcional completo está en [ESTADO-DEL-PROYECTO.md](ESTADO-DEL-PROYECTO.md) §11.*
