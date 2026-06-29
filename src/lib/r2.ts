import { supabase } from './supabase'
import { comprimirImagen } from './imagen'

export type TipoEvidencia = 'recogido' | 'entregado' | 'no_entregado' | 'firma' | 'otro'

/**
 * Sube una evidencia fotográfica:
 *  1. Comprime la imagen en el cliente (siempre).
 *  2. Pide una URL prefirmada a la Edge Function y sube directo a Cloudflare R2.
 *  3. Si R2 aún no está configurado (Edge Function responde 503), hace fallback
 *     a Supabase Storage para no romper el flujo del repartidor.
 *
 * Devuelve la URL pública de la imagen para guardar en la BD.
 */
export async function subirEvidencia(file: File, pedidoId: string, tipo: TipoEvidencia): Promise<string> {
  const blob = await comprimirImagen(file)

  // 1) Intentar R2 vía URL prefirmada
  try {
    const { data, error } = await supabase.functions.invoke('r2-sign-upload', {
      body: { pedido_id: pedidoId, tipo, contentType: 'image/jpeg' },
    })
    if (!error && data?.uploadUrl && data?.publicUrl) {
      const put = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: blob,
      })
      if (!put.ok) throw new Error(`R2 respondió ${put.status}`)
      return data.publicUrl as string
    }
  } catch {
    // cae al fallback
  }

  // 2) Fallback: Supabase Storage (bucket `evidencias`)
  const path = `${pedidoId}/${tipo}/${Date.now()}.jpg`
  const { data: up, error: upErr } = await supabase.storage
    .from('evidencias')
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (upErr) throw upErr
  return supabase.storage.from('evidencias').getPublicUrl(up.path).data.publicUrl
}
