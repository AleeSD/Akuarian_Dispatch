import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { VRepartidorMisPedido } from '../types'

export function useRepartidorPedidos() {
  const [pedidos, setPedidos] = useState<VRepartidorMisPedido[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchPedidos() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('v_repartidor_mis_pedidos')
        .select('*')
        .order('prioridad', { ascending: false })

      setPedidos(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPedidos()
  }, [])

  return { pedidos, loading, refetch: fetchPedidos }
}
