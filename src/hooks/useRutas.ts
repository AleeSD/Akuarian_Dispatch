import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Ruta, Repartidor } from '../types'
import { today } from '../lib/utils'

export function useRutas(fecha: string = today()) {
  const [rutas, setRutas] = useState<(Ruta & { repartidor?: Repartidor })[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRutas = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('rutas')
        .select('*, repartidor:repartidores(*)')
        .eq('fecha', fecha)
        .order('creado_en', { ascending: false })

      setRutas((data as (Ruta & { repartidor?: Repartidor })[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => {
    fetchRutas()
  }, [fetchRutas])

  return { rutas, loading, refetch: fetchRutas }
}
