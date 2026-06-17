# Auditoría — 01. Reconocimiento

**Proyecto:** Akuarian Dispatch  
**Fecha:** 2026-06-14  
**Alcance:** estructura completa del repositorio + base de datos en producción  

---

## 1. Stack Completo

### Lenguajes y Runtime
| Capa | Tecnología | Versión instalada |
|---|---|---|
| Lenguaje principal | TypeScript | 5.9.3 |
| Runtime de build | Node.js (vía npm) | no especificado en repo |
| Gestor de paquetes | npm | (package-lock.json presente) |
| Módulos | ESM nativo (`"type": "module"`) | — |

### Frontend
| Categoría | Tecnología | Versión instalada |
|---|---|---|
| Framework UI | React | 18.3.1 |
| Herramienta de build | Vite | 5.4.21 |
| Estilos | Tailwind CSS | 3.4.19 |
| Routing | React Router DOM | 6.30.4 |
| Formularios | React Hook Form + Zod | 7.77.0 / 3.25.76 |
| Íconos | Lucide React | 0.460.0 |
| Gráficos | Recharts | 2.15.4 |
| Fechas | date-fns | 3.6.0 |
| Notificaciones | React Hot Toast | 2.4.1 |

### Backend / Infraestructura
| Categoría | Tecnología | Detalle |
|---|---|---|
| BaaS (Backend-as-a-Service) | Supabase | proyecto `ajbkzbtmknlmuucotdol` |
| Base de datos | PostgreSQL | gestionada por Supabase |
| Autenticación | Supabase Auth | email + password |
| Almacenamiento de archivos | Supabase Storage | bucket `evidencias` |
| Lógica de negocio en BD | PL/pgSQL (funciones + triggers) | 4 funciones, 10 triggers |
| SDK cliente | @supabase/supabase-js | 2.107.0 |

**No existe ningún servidor propio:** el proyecto es una SPA pura con llamadas directas al SDK de Supabase. No hay Express, Fastapi, Next.js API routes, workers, ni cron jobs en el repositorio.

---

## 2. Arquitectura General

### Patrón: SPA + BaaS (sin backend propio)

```
┌──────────────────────────────────────────────────────┐
│                   NAVEGADOR (SPA)                     │
│                                                       │
│  React 18 + Vite + TypeScript                        │
│                                                       │
│  Capas internas:                                      │
│  ┌────────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │   Pages    │→ │  Hooks    │→ │  supabase.ts    │  │
│  │ (10 rutas) │  │ (3 hooks) │  │ (cliente único) │  │
│  └────────────┘  └───────────┘  └────────┬────────┘  │
│                                           │           │
└───────────────────────────────────────────┼───────────┘
                                            │ HTTPS / WSS
                              ┌─────────────▼──────────────┐
                              │         SUPABASE            │
                              │                             │
                              │  ┌──────────┐  ┌────────┐  │
                              │  │ Auth JWT │  │Storage │  │
                              │  └──────────┘  └────────┘  │
                              │  ┌──────────────────────┐   │
                              │  │  PostgreSQL (PostgREST│   │
                              │  │  REST API auto)       │   │
                              │  │  + RLS + Triggers     │   │
                              │  └──────────────────────┘   │
                              └─────────────────────────────┘
```

### Puntos de entrada
| Punto de entrada | Tipo | Descripción |
|---|---|---|
| `/login` | UI | Autenticación email/password vía Supabase Auth |
| `/dashboard` | UI (admin/op/sup) | Resumen del día: métricas y rutas activas |
| `/pedidos` | UI (admin/op/sup) | Listado, filtros y drawer de detalle |
| `/pedidos/nuevo` | UI (admin/op/sup) | Formulario wizard de 2 pasos |
| `/rutas` | UI (admin/op/sup) | Gestión de rutas de despacho |
| `/rutas/:id` | UI (admin/op/sup) | Detalle de ruta y sus pedidos |
| `/repartidores` | UI (admin/op/sup) | CRUD básico de repartidores |
| `/clientes` | UI (admin/op/sup) | CRUD básico de clientes |
| `/reportes` | UI (admin/op/sup) | Gráficos y tabla de rendimiento |
| `/mi-ruta` | UI (repartidor, móvil) | Lista de pedidos del día del repartidor |
| `/mi-ruta/:id/accion` | UI (repartidor, móvil) | Confirmar recogida/entrega + foto |
| `/configuracion` | UI (solo admin, link visible) | **Ruta en sidebar pero sin página implementada** |

**No hay APIs propias, workers, jobs programados, webhooks ni Edge Functions** en el repositorio.

### Capas internas del frontend
```
src/
├── main.tsx              ← Punto de montaje (StrictMode)
├── App.tsx               ← Router + ProtectedRoute + Toaster
├── context/
│   └── AuthContext.tsx   ← Estado global de sesión y rol
├── lib/
│   ├── supabase.ts       ← Cliente Supabase (singleton)
│   └── utils.ts          ← Helpers: fechas, labels, cn()
├── hooks/                ← Abstracción de fetching (3 hooks)
├── pages/                ← Vistas (10 páginas)
├── components/
│   ├── layout/           ← Sidebar + Header + Layout wrapper
│   ├── ui/               ← Primitivos: Button, Input, Card, Modal, Skeleton, Badge
│   └── shared/           ← EstadoBadge, RepartidorAvatar, Timeline
└── types/index.ts        ← Todas las interfaces TypeScript del proyecto
```

---

## 3. Archivos de Configuración y Dependencias

### Archivos de configuración presentes
| Archivo | Propósito | Observaciones |
|---|---|---|
| `package.json` | Dependencias y scripts | Solo 3 scripts: dev, build, preview |
| `package-lock.json` | Lock de versiones exactas | Presente ✓ |
| `tsconfig.json` | Configuración TypeScript | `strict: true`, `noUnusedLocals/Parameters: true` — configuración robusta |
| `tsconfig.node.json` | TS para config de Vite | Estándar |
| `vite.config.ts` | Configuración de Vite | Mínima: solo plugin-react, sin aliases ni proxy |
| `tailwind.config.js` | Configuración de Tailwind | Paleta custom (celeste, menta, lavanda, coral) + fuente JetBrains Mono + animaciones |
| `postcss.config.js` | PostCSS (requerido por Tailwind) | Estándar |
| `.env.example` | Plantilla de variables de entorno | Solo 2 variables documentadas |
| `.env` | Variables reales | **Presente en el repositorio** (ver advertencia abajo) |
| `index.html` | Entrada HTML de Vite | Estándar, sin meta tags de seguridad (CSP, etc.) |
| `CLAUDE.md` | Instrucciones para el asistente IA | Documentación de proyecto para Claude Code |
| `.mcp.json` | Configuración MCP (IA tools) | Conecta Claude con Supabase |

**⚠️ ADVERTENCIA:** El archivo `.env` con las credenciales reales **está en el repositorio** (aparece en el `find` pero no está en `.gitignore` explícito visible). Si este repo se sube a GitHub como público o se comparte, la `ANON_KEY` queda expuesta.

**Ausencias notables:**
- ❌ No hay `.gitignore` visible en el raíz (verificar si existe oculto)
- ❌ No hay ESLint ni Prettier configurados
- ❌ No hay Vitest / Jest / ningún framework de tests
- ❌ No hay `docker-compose.yml` (no aplica: no hay backend propio)
- ❌ No hay CI/CD pipeline (GitHub Actions, etc.)
- ❌ No hay `README.md` de desarrollo (el existente parece plantilla)

### Estado de dependencias (npm outdated)

#### Actualizaciones de parche/menor disponibles (seguras, compatibles)
| Paquete | Instalada | Última compatible | Acción |
|---|---|---|---|
| `@supabase/supabase-js` | 2.107.0 | 2.108.1 | Actualizar (parche) |
| `react-hook-form` | 7.77.0 | 7.79.0 | Actualizar (menor) |

#### Saltos de versión mayor disponibles (breaking changes — evaluar)
| Paquete | Instalada | Última | Riesgo de migración |
|---|---|---|---|
| `react` / `react-dom` | 18.3.1 | **19.2.7** | Alto — cambios en concurrent features, ref como prop |
| `@types/react` / `@types/react-dom` | 18.3.x | 19.2.x | Alineado con React 19 |
| `react-router-dom` | 6.30.4 | **7.17.0** | Alto — v7 unifica con Remix, API cambia |
| `tailwindcss` | 3.4.19 | **4.3.1** | Alto — config JS eliminada, nuevo motor CSS |
| `vite` | 5.4.21 | **8.0.16** | Alto — salto de 3 versiones mayores |
| `@vitejs/plugin-react` | 4.7.0 | **6.0.2** | Ligado a versión de Vite |
| `date-fns` | 3.6.0 | **4.4.0** | Medio — revisar API de v4 |
| `lucide-react` | 0.460.0 | **1.18.0** | Medio — nombres de íconos pueden cambiar |
| `recharts` | 2.15.4 | **3.8.1** | Medio — revisar props deprecadas |
| `typescript` | 5.9.3 | **6.0.3** | Medio — cambios en inferencia de tipos |
| `zod` | 3.25.76 | **4.4.3** | Alto — v4 cambia API de `.parse()` y `.object()` |
| `@hookform/resolvers` | 5.4.0 | (ligado a RHF) | Verificar compatibilidad con Zod v4 |

**Conclusión de dependencias:** El proyecto está en una generación de versiones que quedará sin soporte progresivamente. Ninguna dependencia está abandonada, pero hay 8 saltos de versión mayor pendientes. Prioridad de actualización sugerida: Supabase SDK (parche) → RHF (menor) → Lucide/date-fns (menor riesgo) → resto como proyecto separado.

---

## 4. Modelo de Datos

### Tablas (9 tablas en schema `public`)

#### `pedidos` — Entidad central (19 filas en producción)
```
id               UUID PK
numero_pedido    VARCHAR UNIQUE  ← generado por trigger: AKU-YYYY-NNNNN
cliente_id       UUID FK→clientes
ruta_id          UUID FK→rutas (nullable)
creado_por       UUID FK→usuarios (nullable)
estado           ENUM estado_pedido  DEFAULT 'recibido'
  └─ recibido | verificado | en_preparacion | listo_despacho
     | recogido | en_camino | entregado | no_entregado | reprogramado
direccion_entrega   TEXT
distrito_entrega    VARCHAR (nullable)
referencia_entrega  TEXT (nullable)
coordenadas_entrega TEXT (nullable)  ← preparado para mapas, sin uso en UI
bultos           INT  CHECK > 0  DEFAULT 1
peso_kg          NUMERIC (nullable)
descripcion_carga TEXT (nullable)
fecha_programada DATE  DEFAULT CURRENT_DATE
fecha_entrega_real TIMESTAMPTZ (nullable)
foto_evidencia_url TEXT (nullable)   ← campo legacy (también hay foto_*_url específicos)
firma_url          TEXT (nullable)   ← preparado, sin uso en UI actual
nombre_receptor    VARCHAR (nullable)  ← preparado, sin uso en UI actual
dni_receptor       VARCHAR (nullable)  ← preparado, sin uso en UI actual
motivo_no_entrega  ENUM motivo_no_entrega (nullable)
detalle_no_entrega TEXT (nullable)
fecha_reprogramada DATE (nullable)
intento_numero     INT  DEFAULT 1  ← se incrementa en reprogramaciones
observaciones      TEXT (nullable)
prioridad          SMALLINT  CHECK 0–3  DEFAULT 0  (0=Normal, 1=Media, 2=Alta, 3=Urgente)
foto_recogido_url  TEXT (nullable)
foto_entregado_url TEXT (nullable)
foto_no_entregado_url TEXT (nullable)
recogido_en        TIMESTAMPTZ (nullable)
requiere_foto      BOOLEAN  DEFAULT true
codigo_qr          VARCHAR (nullable)  ← preparado, sin uso en UI actual
creado_en / actualizado_en  TIMESTAMPTZ
```

#### `clientes` (4 filas)
```
id, nombre, telefono, email, direccion_ref, distrito, provincia, departamento
coordenadas (Lat,Lng — preparado para mapas), activo, notas
creado_en, actualizado_en
```

#### `repartidores` (3 filas)
```
id, nombre, telefono, dni UNIQUE, vehiculo, placa, licencia
estado  ENUM estado_repartidor (disponible|en_ruta|descanso|inactivo)  DEFAULT 'disponible'
usuario_id FK→usuarios (nullable)   ← vínculo a cuenta de sistema
auth_user_id UUID UNIQUE (nullable) ← vínculo directo a Supabase Auth (usado por RLS)
pin_acceso VARCHAR (nullable)        ← preparado, sin uso en UI actual
activo, creado_en, actualizado_en
```
> Nota: hay dos formas de vincular repartidor↔auth: `usuario_id` (vía tabla usuarios) y `auth_user_id` (directo). La vista `v_repartidor_mis_pedidos` usa `auth_user_id`. La app usa `auth_user_id` al cargar el perfil.

#### `rutas` (3 filas)
```
id, nombre, repartidor_id FK→repartidores (nullable)
fecha  DATE  DEFAULT CURRENT_DATE
estado  ENUM estado_ruta (pendiente|en_curso|completada|cancelada)  DEFAULT 'pendiente'
total_pedidos INT DEFAULT 0   ← contador desnormalizado (mantenido por trigger)
entregados    INT DEFAULT 0   ← contador desnormalizado (mantenido por trigger)
no_entregados INT DEFAULT 0   ← contador desnormalizado (mantenido por trigger)
notas, creado_por FK→usuarios, creado_en, actualizado_en
```

#### `historial_estados` (2 filas)
```
id, pedido_id FK→pedidos, usuario_id FK→usuarios (nullable)
estado_anterior ENUM estado_pedido (nullable)
estado_nuevo    ENUM estado_pedido
motivo TEXT (nullable), cambiado_en TIMESTAMPTZ
```
> Poblado exclusivamente por el trigger `trg_pedidos_historial`.

#### `evidencias` (0 filas)
```
id, pedido_id FK→pedidos
subido_por FK→repartidores (nullable)  ← FK a repartidores, no a usuarios
tipo  VARCHAR  CHECK IN ('recogido','entregado','no_entregado','firma','otro')
foto_url TEXT  (URL en Supabase Storage bucket "evidencias")
notas TEXT (nullable), subido_en TIMESTAMPTZ
```

#### `notificaciones` (0 filas)
```
id, pedido_id FK→pedidos (nullable), usuario_id FK→usuarios (nullable)
tipo VARCHAR, mensaje TEXT, leida BOOLEAN DEFAULT false, creado_en TIMESTAMPTZ
```
> Tabla creada y con RLS configurada, pero **sin filas y sin código en el frontend que la use**.

#### `configuracion` (9 filas — clave/valor)
```
clave  VARCHAR PK, valor TEXT, descripcion TEXT, actualizado_en TIMESTAMPTZ
```
> Solo admin puede editarla según comentario en schema, pero la política RLS real permite a cualquier usuario autenticado hacer ALL.

#### `usuarios` (6 filas)
```
id UUID (=auth.uid() de Supabase Auth), nombre VARCHAR, email VARCHAR UNIQUE
rol  ENUM rol_usuario (admin|operador|supervisor|repartidor)  DEFAULT 'operador'
activo BOOLEAN DEFAULT true, creado_en, actualizado_en
```

---

### Vistas (3 vistas en `public`)

| Vista | Propósito | Filtro RLS real |
|---|---|---|
| `v_pedidos_detalle` | JOIN pedidos + clientes + rutas + repartidores + conteo de evidencias | Ninguno adicional (hereda RLS de tablas base) |
| `v_repartidor_mis_pedidos` | Igual pero filtrado: `fecha = CURRENT_DATE` y `rep.auth_user_id = auth.uid()` | **El único filtro por usuario real del sistema** |
| `v_resumen_dia` | Conteos de todos los estados para `fecha_programada = CURRENT_DATE` | Ninguno — todos ven el mismo resumen |

**Observación importante sobre `v_pedidos_detalle`:** la vista no expone `ruta_id` ni `cliente_id` — solo los nombres textuales. Esto obliga al double-query en `RutaDetalle.tsx` y elimina la posibilidad de navegar o filtrar por FK desde el frontend usando esta vista.

---

### Funciones PL/pgSQL (4)

| Función | Disparada por | Acción |
|---|---|---|
| `fn_generar_numero_pedido()` | `trg_pedidos_numero` (INSERT en pedidos) | Genera `numero_pedido` con formato `AKU-YYYY-NNNNN` correlativo |
| `fn_registrar_cambio_estado()` | `trg_pedidos_historial` (UPDATE en pedidos) | Inserta en `historial_estados` cuando cambia `estado` |
| `fn_actualizar_contadores_ruta()` | `trg_rutas_contadores` (INSERT o UPDATE en pedidos) | Recalcula `entregados`, `no_entregados`, `total_pedidos` en la ruta correspondiente |
| `fn_actualizar_timestamp()` | `trg_*_updated` en 6 tablas | Actualiza `actualizado_en = now()` en cada UPDATE |

> `fn_actualizar_contadores_ruta` es especialmente importante: resuelve en la base de datos el problema de mantener los contadores de ruta sincronizados. Sin embargo, la app actualiza `total_pedidos` manualmente al crear una ruta (`Rutas.tsx:59`) y **no actualiza** cuando se asignan pedidos después desde `PedidoNuevo.tsx`, creando una inconsistencia potencial con lo que el trigger recalcula.

---

### Índices (17 índices no-PK)

| Tabla | Índices | Cobertura |
|---|---|---|
| `pedidos` | `estado`, `fecha_programada`, `numero_pedido`, `cliente_id`, `ruta_id` | Buena — cubre los filtros más usados |
| `evidencias` | `(pedido_id)`, `(pedido_id, tipo)` | Adecuada |
| `historial_estados` | `pedido_id`, `cambiado_en` | Adecuada |
| `repartidores` | `auth_user_id` | Crítico para RLS de la vista |
| `rutas` | `fecha`, `repartidor_id` | Adecuada |
| `notificaciones` | `(usuario_id, leida)` | Preparada para uso futuro |

**Índice faltante relevante:** no hay índice compuesto `(fecha_programada, estado)` en `pedidos`, que es la combinación más frecuente en `usePedidos` y `v_resumen_dia`.

---

### RLS (Row Level Security)

RLS está **habilitado en las 9 tablas**. Sin embargo, todas las políticas tienen la misma forma:

```sql
-- Ejemplo (igual en TODAS las tablas):
USING (auth.role() = 'authenticated')
```

Esto significa que **cualquier usuario autenticado puede leer y escribir cualquier fila de cualquier tabla**. La separación de roles (admin/operador/supervisor/repartidor) se hace **solo en el frontend** (React Router `ProtectedRoute`). No hay enforcement de roles en la base de datos.

La única excepción real es la vista `v_repartidor_mis_pedidos`, que filtra por `auth.uid()` en su definición SQL — pero esto es un filtro de vista, no una política RLS sobre una tabla base.

**Implicación:** Un repartidor autenticado que conozca la API de Supabase puede leer y modificar pedidos de otros repartidores, ver datos de todos los clientes, y alterar rutas, directamente desde la consola del navegador o con curl.

---

### Diagrama de Relaciones (simplificado)

```
usuarios ──────────────────────────────────────────┐
   │ (creado_por)      (usuario_id)                 │
   ▼                       ▼                        │
pedidos ◄──── rutas ◄──── repartidores              │
   │            │                                   │
   ▼            └──────────────────────────────────►┘
clientes                                    (historial_estados)
   │                                        (notificaciones)
   └── (pedidos.cliente_id)

pedidos ──► historial_estados
pedidos ──► evidencias ◄── repartidores
pedidos ──► notificaciones
```

---

## Resumen Ejecutivo (5 líneas)

Akuarian Dispatch es una SPA React 18/TypeScript sin backend propio que usa Supabase como capa completa de datos, autenticación y almacenamiento de fotos. La arquitectura es un monolito frontend con lógica de negocio distribuida entre el cliente (React) y la base de datos (triggers PL/pgSQL en PostgreSQL). El modelo de datos está bien normalizado y los triggers automatizan las tareas críticas (numeración de pedidos, historial de estados, contadores de ruta). El punto de riesgo más serio es que la separación de roles existe solo en el frontend: la base de datos permite a cualquier usuario autenticado leer y modificar todo el dataset sin restricción. Las dependencias son estables pero acumulan 8 saltos de versión mayor pendientes, y el proyecto carece por completo de tests automatizados y pipeline de CI/CD.
