import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Ruta, Repartidor } from '../types'
import { today } from '../lib/utils'

export function useRutas(fecha: string = today()) {
  const [rutas, setRutas] = useState<(Ruta & { repartidor?: Repartidor })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRutas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('rutas')
        .select('*, repartidor:repartidores(*)')
        .eq('fecha', fecha)
        .order('creado_en', { ascending: false })

      if (err) throw err
      setRutas((data as (Ruta & { repartidor?: Repartidor })[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar rutas')
      setRutas([])
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => {
    fetchRutas()
  }, [fetchRutas])

  return { rutas, loading, error, refetch: fetchRutas }
}
