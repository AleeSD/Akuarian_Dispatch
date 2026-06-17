import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { VRepartidorMisPedido } from '../types'

export function useRepartidorPedidos() {
  const [pedidos, setPedidos] = useState<VRepartidorMisPedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPedidos() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('v_repartidor_mis_pedidos')
        .select('*')
        .order('prioridad', { ascending: false })

      if (err) throw err
      setPedidos(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar tus pedidos')
      setPedidos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPedidos()
  }, [])

  return { pedidos, loading, error, refetch: fetchPedidos }
}
