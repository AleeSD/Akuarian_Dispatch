# Deploy a Vercel — Akuarian Dispatch

Guía para publicar el sistema y probarlo desde escritorio y dispositivos móviles reales.

---

## 1. Pre-requisitos

- Cuenta de Vercel (gratuita): https://vercel.com/signup
- Repositorio Git con el código actual (GitHub, GitLab o Bitbucket).
- Las credenciales de Supabase del proyecto `ajbkzbtmknlmuucotdol` (ya están en `.env` local — **no** se commitean).

---

## 2. Variables de entorno en Vercel

En **Project Settings → Environment Variables** crear estas dos variables y aplicarlas a *Production*, *Preview* y *Development*:

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://ajbkzbtmknlmuucotdol.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (la clave anon del archivo `.env` local) |

> Vite expone al cliente sólo variables prefijadas con `VITE_`. No agregar la `service_role` aquí.

---

## 3. Deploy desde la UI de Vercel (recomendado para la primera vez)

1. https://vercel.com/new
2. Importar el repositorio `SLDispatchTrack`.
3. Vercel detecta automáticamente Vite. Confirmar:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
4. Agregar las dos variables de entorno (paso 2).
5. **Deploy**.

Una vez termina, Vercel asigna una URL tipo `https://akuarian-dispatch-xxxx.vercel.app`.

---

## 4. Deploy desde la CLI (alternativa)

```bash
npm i -g vercel
vercel login
vercel link        # vincula la carpeta con el proyecto
vercel env pull    # sincroniza .env desde Vercel (si ya están seteadas)
vercel             # deploy de preview
vercel --prod      # deploy a producción
```

---

## 5. Configurar Supabase para aceptar la URL de Vercel

En el dashboard de Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://<tu-proyecto>.vercel.app`
- **Redirect URLs** (agregar):
  - `https://<tu-proyecto>.vercel.app/**`
  - `http://localhost:5173/**` (mantener para dev)

Si no se hace este paso, los flujos de auth pueden fallar con CORS o redirects bloqueados.

---

## 6. Pruebas post-deploy

### Escritorio
1. Abrir la URL en Chrome/Firefox/Edge.
2. Login con `operador@akuarian.pe`.
3. Verificar dashboard, pedidos, rutas, repartidores, clientes y reportes.

### Móvil real (Android / iOS)
1. Abrir la **misma URL** en el navegador del teléfono.
2. Login con `carlos@akuarian.pe` (rol repartidor).
3. Verificar vista `/mi-ruta` — debe mostrar pedidos del día.
4. Abrir un pedido pendiente → tocar "Confirmar Entrega" o "Marcar como Recogido".
5. Tocar el área de cámara → el SO debe abrir la cámara nativa (atributo `capture="environment"`).
6. Tomar foto, confirmar acción y verificar que el pedido cambia de estado en el panel del operador.

### PWA / instalación en home screen
La app no tiene `manifest.json` aún. Si se desea instalación tipo PWA, es una mejora posterior; mientras tanto, el usuario puede usar "Añadir a pantalla de inicio" desde el navegador.

---

## 7. Cosas a vigilar en la primera semana

- **HTTPS obligatorio para la cámara**: Vercel da HTTPS por defecto, así que la captura de foto funciona en móvil. Sobre HTTP la cámara no abre.
- **Zona horaria**: la app y la BD ya están alineadas a `America/Lima` (las vistas `v_resumen_dia` y `v_repartidor_mis_pedidos` usan `(now() AT TIME ZONE 'America/Lima')::date`).
- **RLS sin diferenciación de roles**: cualquier usuario autenticado puede leer/escribir cualquier tabla vía REST. Ver `docs/PLAN-PRODUCCION.md` (sección 3) — pendiente antes de meter clientes reales.
- **Bucket `evidencias` público**: las URLs de fotos son adivinables. Igualmente pendiente del plan de producción.

---

## 8. Rollback

Cada deploy de Vercel queda como un "Deployment" inmutable. Para volver a una versión anterior:

Project → Deployments → seleccionar deployment estable → **Promote to Production**.
