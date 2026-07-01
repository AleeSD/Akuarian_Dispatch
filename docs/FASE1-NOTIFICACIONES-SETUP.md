# Fase 1 — Notificaciones al cliente y portal de seguimiento (setup)

> Lo construido en la Fase 1 funciona **end-to-end en modo prueba (dry-run)** sin credenciales.
> Para enviar correos reales solo falta cargar una clave de proveedor. Esta guía explica cómo.

## ¿Qué quedó implementado?

| Pieza | Estado |
|---|---|
| **Token de seguimiento** por pedido (`pedidos.codigo_seguimiento`) | ✅ |
| **Portal público** `/seguimiento/:token` (sin login) | ✅ verificado |
| **RPC** `seguimiento_pedido(token)` (solo lectura, anon) | ✅ |
| **Auto-encolado** de notificaciones al cambiar de estado (trigger) | ✅ verificado |
| **Notificación pre-entrega** (al pasar a `en_camino`) | ✅ |
| **Edge Function** `enviar-notificaciones` (Resend, dry-run sin clave) | ✅ desplegada |
| **Botón "Enviar notificación"** + "Copiar enlace de seguimiento" en el detalle | ✅ verificado |
| Envío real de email | ⏳ requiere clave (abajo) |
| WhatsApp (Fase 1.2) | ⏳ pendiente (ver más abajo) |

## Activar el envío real de email (Resend)

1. Crea una cuenta en [resend.com](https://resend.com) y **verifica tu dominio** (o usa el dominio de prueba `onboarding@resend.dev` para pruebas).
2. Genera un **API Key**.
3. Carga los secrets en Supabase (panel **Edge Functions → Secrets**, o CLI):
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
   supabase secrets set RESEND_FROM="Akuarian Dispatch <despachos@tu-dominio.com>"
   ```
   - Sin `RESEND_API_KEY`, la función funciona en **dry-run**: marca las notificaciones como `simulado` (no envía nada). Útil para probar el flujo.
4. Activa/desactiva el canal desde **Configuración → Notificaciones** (`notificaciones_email_activas`).

> El proveedor es intercambiable: la función está aislada en `enviarEmailResend()`. Para SendGrid/Mailgun, reemplaza esa función.

## Despachar la cola automáticamente (cron)

El trigger **encola** notificaciones (`estado_envio='pendiente'`); el envío lo hace la Edge Function.
El botón "Enviar notificación" despacha al instante una notificación puntual. Para despachar la
cola periódicamente, programa un cron (panel **Database → Cron** / `pg_cron`, o un scheduler externo)
que invoque la función cada pocos minutos:

```sql
-- Ejemplo con pg_cron + pg_net (requiere extensiones habilitadas)
select cron.schedule('despachar-notificaciones', '*/5 * * * *', $$
  select net.http_post(
    url    := 'https://ajbkzbtmknlmuucotdol.supabase.co/functions/v1/enviar-notificaciones',
    headers:= jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_JWT>', 'Content-Type','application/json'),
    body   := '{}'::jsonb
  );
$$);
```

## Estados de una notificación (`notificaciones.estado_envio`)

`pendiente` → en cola · `simulado` → procesada en dry-run · `enviado` → enviada por el proveedor · `error` → falló (ver columna `error`).

## Pendiente en esta fase

- **WhatsApp (1.2):** añadir un canal `whatsapp` en la tabla y un branch en la Edge Function que llame a Twilio o Meta Cloud API (requiere credenciales del proveedor y número aprobado). El modelo (`canal`, `destino`) ya lo soporta.
- **Personalización de plantillas** de mensaje por estado desde Configuración.
- Mostrar el **estado de envío** de las notificaciones en el detalle del pedido (hoy se registran en la tabla).
