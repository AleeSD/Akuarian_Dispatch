import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Carga los parámetros de `configuracion` y los expone como helpers tipados.
 * Conecta la pantalla de Configuración con la lógica de la app (Fase 0.6).
 *
 * Cachea el resultado a nivel de módulo: la configuración cambia rara vez y
 * varias pantallas pueden consumirla sin refetch en cada navegación.
 */
export interface ConfigHelpers {
  getStr: (clave: string, fallback?: string) => string
  getBool: (clave: string, fallback?: boolean) => boolean
  getNum: (clave: string, fallback?: number) => number
  loading: boolean
}

let cache: Record<string, string> | null = null
let inflight: Promise<Record<string, string>> | null = null

async function cargar(): Promise<Record<string, string>> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    const { data } = await supabase.from('configuracion').select('clave, valor')
    const map = Object.fromEntries((data ?? []).map((c) => [c.clave, c.valor ?? '']))
    cache = map
    inflight = null
    return map
  })()
  return inflight
}

/** Invalida la caché (llamar tras guardar cambios en Configuración). */
export function invalidarConfiguracion() {
  cache = null
  inflight = null
}

export function useConfiguracion(): ConfigHelpers {
  const [map, setMap] = useState<Record<string, string>>(cache ?? {})
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    let activo = true
    cargar().then((m) => {
      if (activo) {
        setMap(m)
        setLoading(false)
      }
    })
    return () => { activo = false }
  }, [])

  return {
    loading,
    getStr: (clave, fallback = '') => map[clave] ?? fallback,
    getBool: (clave, fallback = false) => {
      const v = map[clave]
      return v === undefined ? fallback : v === 'true'
    },
    getNum: (clave, fallback = 0) => {
      const n = Number(map[clave])
      return Number.isFinite(n) ? n : fallback
    },
  }
}
