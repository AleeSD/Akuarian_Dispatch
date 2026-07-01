// Edge Function: despacha la cola de notificaciones al cliente (canal email).
//
// - Procesa filas de `notificaciones` con canal='email' y estado_envio='pendiente'.
// - Envía vía Resend (https://resend.com) si RESEND_API_KEY está configurado.
//   Sin la clave funciona en modo DRY-RUN: marca las filas como 'simulado'
//   (no envía nada real) para poder probar el flujo end-to-end sin proveedor.
// - Marca cada fila como 'enviado' | 'simulado' | 'error'.
//
// Invocación:
//   POST { }                         -> procesa hasta 50 pendientes
//   POST { "notificacion_id": "..." } -> procesa solo esa notificación
//
// Solo personal autenticado (staff) puede invocarla; las operaciones de datos
// usan la service-role key (secret de Supabase) para no depender de RLS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

interface Notificacion {
  id: string
  destino: string | null
  asunto: string | null
  mensaje: string
}

async function enviarEmailResend(apiKey: string, from: string, n: Notificacion): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: n.destino,
      subject: n.asunto ?? 'Actualización de tu pedido',
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#2D3748;line-height:1.5">
               <p>${n.mensaje}</p>
               <p style="color:#718096;font-size:13px">Este es un mensaje automático, por favor no respondas a este correo.</p>
             </div>`,
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // --- Auth manual: requiere usuario autenticado ---
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return json({ error: 'No autorizado' }, 401)

  // --- Cliente con service-role para operar sin RLS ---
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const db = createClient(url, serviceKey)

  try {
    const { notificacion_id } = await req.json().catch(() => ({}))

    let query = db
      .from('notificaciones')
      .select('id, destino, asunto, mensaje')
      .eq('canal', 'email')
      .eq('estado_envio', 'pendiente')
      .limit(50)
    if (notificacion_id) query = db
      .from('notificaciones')
      .select('id, destino, asunto, mensaje')
      .eq('id', notificacion_id)
      .eq('estado_envio', 'pendiente')

    const { data: pendientes, error } = await query
    if (error) throw error

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('RESEND_FROM') ?? 'Akuarian Dispatch <onboarding@resend.dev>'
    const dryRun = !apiKey

    let enviados = 0, simulados = 0, errores = 0

    for (const n of (pendientes ?? []) as Notificacion[]) {
      try {
        if (!n.destino) throw new Error('Sin destino')
        if (dryRun) {
          simulados++
          await db.from('notificaciones')
            .update({ estado_envio: 'simulado', enviado_en: new Date().toISOString(), error: null })
            .eq('id', n.id)
        } else {
          await enviarEmailResend(apiKey!, from, n)
          enviados++
          await db.from('notificaciones')
            .update({ estado_envio: 'enviado', enviado_en: new Date().toISOString(), error: null })
            .eq('id', n.id)
        }
      } catch (e) {
        errores++
        await db.from('notificaciones')
          .update({ estado_envio: 'error', error: e instanceof Error ? e.message : String(e) })
          .eq('id', n.id)
      }
    }

    return json({
      procesadas: (pendientes ?? []).length,
      enviados,
      simulados,
      errores,
      modo: dryRun ? 'dry-run (sin RESEND_API_KEY)' : 'envío real',
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
