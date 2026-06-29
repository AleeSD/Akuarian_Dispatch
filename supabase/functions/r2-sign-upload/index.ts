// Edge Function: firma subidas a Cloudflare R2 (URL prefirmada PUT, SigV4).
// Las credenciales R2 viven como secrets de Supabase (nunca en el cliente).
//
// verify_jwt = false a propósito: con verify_jwt=true el gateway corta el
// preflight CORS (OPTIONS) antes de llegar aquí y el navegador bloquea la
// petición. En su lugar validamos el JWT manualmente dentro de la función.
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIPOS_VALIDOS = ['recogido', 'entregado', 'no_entregado', 'firma', 'otro']

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  // --- Auth manual (solo usuarios autenticados) ---
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'No autorizado' }, 401)

  try {
    const { pedido_id, tipo, contentType } = await req.json().catch(() => ({}))
    if (!pedido_id || !tipo) return json({ error: 'pedido_id y tipo son requeridos' }, 400)

    const accountId = Deno.env.get('R2_ACCOUNT_ID')
    const bucket = Deno.env.get('R2_BUCKET')
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
    const publicBase = Deno.env.get('R2_PUBLIC_BASE_URL') ?? ''

    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
      // R2 aún no configurado → el cliente hará fallback a Supabase Storage.
      return json({ error: 'R2 no configurado' }, 503)
    }

    const t = TIPOS_VALIDOS.includes(tipo) ? tipo : 'otro'
    const rand = crypto.randomUUID().slice(0, 8)
    const key = `${pedido_id}/${t}/${Date.now()}-${rand}.jpg`

    const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    const endpoint = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`)
    endpoint.searchParams.set('X-Amz-Expires', '300') // URL válida 5 min

    const signed = await aws.sign(endpoint.toString(), { method: 'PUT', aws: { signQuery: true } })

    const publicUrl = publicBase ? `${publicBase.replace(/\/$/, '')}/${key}` : null
    return json({
      uploadUrl: signed.url,
      key,
      publicUrl,
      contentType: contentType || 'image/jpeg',
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
