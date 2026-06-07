# Akuarian Dispatch

Sistema web de gestión de despachos para **Akuarian SAC**. Permite a operadores gestionar pedidos, rutas y repartidores, y a los repartidores registrar entregas desde el móvil con fotos de evidencia.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Estilos | Tailwind CSS con paleta personalizada |
| Routing | React Router v6 |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage (bucket `evidencias`) |
| Formularios | React Hook Form + Zod |
| Gráficas | Recharts |
| Fechas | date-fns (formato peruano dd/MM/yyyy) |
| Notificaciones | React Hot Toast |

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

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Build de producción
npm run build

# Preview del build
npm run preview
```

### Variables de entorno (`.env`)

```env
VITE_SUPABASE_URL=https://ajbkzbtmknlmuucotdol.supabase.co
VITE_SUPABASE_ANON_KEY=<tu_anon_key>
```

---

## Credenciales de prueba

Password universal: `Akuarian2024!`

| Rol | Email |
|---|---|
| Admin | admin@akuarian.pe |
| Operador | operador@akuarian.pe |
| Supervisor | supervisor@akuarian.pe |
| Repartidor | carlos@akuarian.pe |
| Repartidor | luis@akuarian.pe |
| Repartidor | pedro@akuarian.pe |

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
