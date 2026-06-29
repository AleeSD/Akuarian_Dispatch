# Akuarian Dispatch

Sistema web de gestión de despachos para **Akuarian SAC**. Permite a operadores gestionar pedidos, rutas y repartidores, y a los repartidores registrar entregas desde el móvil con fotos de evidencia.

> **Estado (jun-2026):** rediseño UX "estilo Beetrack" completo (Fases 0-9), subestados, importación CSV/Excel, exportación `.xlsx` multi-hoja, transversal de seguridad RLS aplicado, y subida de evidencias a Cloudflare R2 con compresión. Ver [docs/ESTADO-DEL-PROYECTO.md](docs/ESTADO-DEL-PROYECTO.md).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Estilos | Tailwind CSS con paleta personalizada |
| Routing | React Router v6 |
| Base de datos | Supabase (PostgreSQL) + RLS de mínimo privilegio |
| Auth | Supabase Auth |
| Storage de evidencias | Cloudflare R2 (URL prefirmada vía Edge Function) + compresión en cliente; fallback a Supabase Storage |
| Formularios | React Hook Form + Zod |
| Gráficas | Recharts |
| Import/Export | CSV nativo + `.xlsx` (write-excel-file / read-excel-file, lazy-load) |
| Fechas | date-fns (formato peruano dd/MM/yyyy) |
| Notificaciones | React Hot Toast |
| Tests | Vitest (`npm test`) |

---

## Funcionalidades principales

### Vista de operador / admin / supervisor
- **Dashboard** — métricas del día: total pedidos, tasa de entrega, pedidos por estado (gráficas)
- **Pedidos** — listado con filtros por estado, repartidor y fecha; creación de nuevos pedidos
- **Detalle de pedido** — historial de estados, datos del cliente, fotos de evidencia
- **Rutas** — agrupación de pedidos por repartidor y fecha; seguimiento en tiempo real
- **Repartidores** — gestión del equipo de reparto y sus estados (disponible / en ruta / descanso)
- **Clientes** — directorio de clientes con historial de pedidos
- **Reportes** — exportación y análisis de entregas por período

### Vista móvil del repartidor
- Lista de pedidos asignados para el día
- Acción por pedido: registrar recogida, entrega exitosa o no entrega con foto de evidencia
- Flujo guiado con cámara integrada

---

## Flujo de estados

```
recibido → verificado → en_preparacion → listo_despacho → recogido → en_camino
                                                                          ↓
                                                              entregado | no_entregado | reprogramado
```

Cada cambio de estado se registra automáticamente en `historial_estados` vía trigger de PostgreSQL.

---

## Roles y acceso

| Rol | Acceso |
|---|---|
| `admin` | Todo el sistema + configuración |
| `operador` | Gestión de pedidos, rutas y clientes |
| `supervisor` | Lectura completa + reportes |
| `repartidor` | Solo vista móvil (`/mi-ruta`) |

---

## Estructura del proyecto

```
src/
├── components/
│   ├── ui/          # Button, Input, Select, Badge, Card, Modal, Skeleton
│   ├── layout/      # Sidebar, Header, Layout
│   └── shared/      # EstadoBadge, RepartidorAvatar, Timeline
├── pages/
│   ├── Login, Dashboard, Pedidos, PedidoDetalle, PedidoNuevo
│   ├── Rutas, RutaDetalle, Repartidores, Clientes, Reportes
│   └── repartidor/  # MiRuta, PedidoAccion (vista móvil)
├── hooks/           # usePedidos, useRutas, useRepartidor
├── lib/             # supabase.ts, utils.ts
├── types/           # index.ts
└── context/         # AuthContext.tsx
```

---

## Base de datos (Supabase)

**Proyecto:** `ajbkzbtmknlmuucotdol`

### Tablas principales
- `pedidos` — tabla central con 9 estados
- `clientes`, `repartidores`, `rutas`
- `historial_estados` — auditoría automática vía trigger
- `evidencias` — fotos subidas a Storage
- `notificaciones`, `configuracion`, `usuarios`

### Vistas
- `v_pedidos_detalle` — pedidos con cliente, repartidor, ruta y conteo de evidencias
- `v_repartidor_mis_pedidos` — pedidos del repartidor autenticado (filtra por `auth.uid()`)
- `v_resumen_dia` — métricas del día actual

---

## Instalación y ejecución

### Prerequisitos
- **Node.js** 18 o superior (`node -v`)
- **npm** 9+ (`npm -v`)
- Una cuenta de **Supabase** con acceso al proyecto `ajbkzbtmknlmuucotdol` (o uno propio con el mismo esquema)

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd SLDispatchTrack
npm install
```

> Aviso: `npm install` muestra 2 vulnerabilidades altas en `esbuild` (transitiva vía Vite). **Solo afectan al servidor de desarrollo local, no a producción.** El fix automático sube Vite 5 → 8 y es _breaking_; revisar manualmente antes de aplicar.

### 2. Configurar variables de entorno

Copiar `.env.example` a `.env` y completar con las claves del proyecto Supabase:

```env
VITE_SUPABASE_URL=https://ajbkzbtmknlmuucotdol.supabase.co
VITE_SUPABASE_ANON_KEY=<tu_anon_key>
```

> La `anon key` se obtiene desde el panel de Supabase → **Settings → API → anon public**.

### 3. Iniciar el proyecto

```bash
# Desarrollo (http://localhost:5173)
npm run dev

# Build de producción
npm run build

# Preview del build de producción
npm run preview
```

Una vez levantado el dev server, abrir <http://localhost:5173> en el navegador y entrar con cualquiera de las credenciales de prueba listadas abajo.

---

## Credenciales de prueba

Todos los usuarios comparten el password: **`Akuarian2026!`**

| Rol | Email | Acceso |
|---|---|---|
| Admin | `admin@akuarian.pe` | Sistema completo + configuración |
| Operador | `operador@akuarian.pe` | Pedidos, rutas, clientes |
| Supervisor | `supervisor@akuarian.pe` | Lectura completa + reportes |
| Repartidor | `carlos@akuarian.pe` | Vista móvil `/mi-ruta` |
| Repartidor | `luis@akuarian.pe` | Vista móvil `/mi-ruta` |
| Repartidor | `pedro@akuarian.pe` | Vista móvil `/mi-ruta` |

> **Tip de prueba**: para ver la vista de repartidor en su forma real, abrir las DevTools del navegador, activar la vista móvil (responsive) y entrar con `carlos@akuarian.pe`.

---

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Compila TypeScript y genera build de producción en `dist/` |
| `npm run preview` | Sirve el build de `dist/` para validarlo localmente |
| `npm test` | Ejecuta la suite de tests (Vitest) |

> Validación previa al deploy: `npm run build` (corre `tsc`, detecta errores de tipos) + `npm test` (tests unitarios de utilidades). Los tests se excluyen del build de producción (`tsconfig.json`).

---

## Paleta de colores

| Token | Uso |
|---|---|
| `celeste` | Color primario / acciones |
| `menta` | Éxito / entregado |
| `lavanda` | Secundario / estados intermedios |
| `coral` | Error / no entregado / alertas |

---

*Akuarian SAC © 2026*
