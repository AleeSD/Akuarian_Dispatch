# Fase 9 — Imágenes de evidencia en Cloudflare R2

> Estado: **código y Edge Function listos y desplegados.** Falta solo la configuración
> de tu cuenta Cloudflare (bucket + credenciales). Mientras tanto, la app **comprime
> las fotos** y hace **fallback a Supabase Storage** sin romperse.

## Arquitectura

```
App (repartidor)
  └─ comprime la foto en el navegador (lib/imagen.ts → JPEG ~1600px, ~150-350 KB)
  └─ pide URL prefirmada a la Edge Function `r2-sign-upload`  (valida el JWT del usuario)
       └─ la función firma un PUT a R2 con las credenciales (secrets de Supabase)
  └─ PUT directo del blob a R2  (las credenciales NUNCA tocan el cliente)
  └─ guarda la URL pública en `pedidos.foto_*_url` + `evidencias.foto_url`
  └─ si R2 no está configurado → fallback automático a Supabase Storage
```

- **Compresión:** verificada (5 MB → 34 KB en pruebas). Foto real de celular ≈ 150-350 KB.
- **Volumen esperado:** ~máx 120 fotos/día → con compresión y retención de 4 días, ~15-40 MB en reposo. R2 free tier (10 GB) sobra.

## Lo que ya está hecho (código)

- `supabase/functions/r2-sign-upload/index.ts` — Edge Function (desplegada, `verify_jwt=false` + auth manual por JWT para que el preflight CORS funcione).
- `src/lib/imagen.ts` — compresión de imágenes en el cliente.
- `src/lib/r2.ts` — `subirEvidencia()`: comprime → R2 (prefirmado) → fallback a Supabase Storage.
- `src/pages/repartidor/PedidoAccion.tsx` — usa `subirEvidencia()` al registrar recogida/entrega/no-entrega.

## Lo que falta (tu parte, una sola vez)

### 1. Crear el bucket R2
Cloudflare Dashboard → **R2** → *Create bucket* (ej. `akuarian-evidencias`).

### 2. Habilitar acceso público
Bucket → **Settings → Public access** → habilita el subdominio `r2.dev` **o** conecta un dominio propio.
Copia la **URL pública base** (ej. `https://pub-xxxxxxxx.r2.dev`). Será `R2_PUBLIC_BASE_URL`.

### 3. CORS del bucket (necesario: el navegador hace PUT directo)
Bucket → **Settings → CORS policy** → pega (ajusta el dominio de producción):
```json
[
  {
    "AllowedOrigins": ["https://TU-APP.vercel.app", "http://localhost:5173"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

### 4. Retención automática (3-4 días)
Bucket → **Settings → Object lifecycle rules** → *Add rule* → **Delete objects** → **4 días** desde la creación. Esto borra las evidencias viejas solo, sin acumular almacenamiento.

### 5. Credenciales (API Token de R2)
R2 → **Manage R2 API Tokens** → *Create API token* con permiso **Object Read & Write** sobre el bucket. Anota:
- `Access Key ID` → `R2_ACCESS_KEY_ID`
- `Secret Access Key` → `R2_SECRET_ACCESS_KEY`
- El **Account ID** (arriba a la derecha en R2) → `R2_ACCOUNT_ID`

### 6. Cargar los secrets en Supabase
Dashboard de Supabase → **Project Settings → Edge Functions → Secrets** (o CLI):
```bash
supabase secrets set \
  R2_ACCOUNT_ID=xxxxxxxx \
  R2_ACCESS_KEY_ID=xxxxxxxx \
  R2_SECRET_ACCESS_KEY=xxxxxxxx \
  R2_BUCKET=akuarian-evidencias \
  R2_PUBLIC_BASE_URL=https://pub-xxxxxxxx.r2.dev
```
> `SUPABASE_URL` y `SUPABASE_ANON_KEY` ya los inyecta Supabase automáticamente; no los cargues.

Apenas estén los secrets, la app **empieza a usar R2 sin tocar nada más** (el fallback deja de activarse).

## Verificación rápida (tras configurar)
1. Entra como repartidor en `/mi-ruta`, abre un pedido y registra una entrega con foto.
2. Revisa en R2 que aparezca el objeto en `{pedido_id}/{tipo}/...jpg`.
3. Abre el pedido en el back-office → la evidencia debe verse (URL pública de R2).

## Notas
- El bucket Supabase `evidencias` queda como **fallback/legado**; cuando R2 esté estable se puede vaciar o retirar.
- Las credenciales R2 viven **solo** como secrets de Supabase (servidor). El cliente nunca las ve.
- Endurecimiento opcional futuro: validar en la función que el usuario sea dueño del pedido antes de firmar (hoy basta con estar autenticado).
