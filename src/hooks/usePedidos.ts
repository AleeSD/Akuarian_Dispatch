import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { VPedidoDetalle, EstadoPedido } from '../types'
import { today } from '../lib/utils'

interface FiltrosPedidos {
  fecha?: string
  estado?: EstadoPedido | ''
  repartidor?: string
  busqueda?: string
}

export function usePedidos(filtros: FiltrosPedidos = {}) {
  const [pedidos, setPedidos] = useState<VPedidoDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPedidos = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('v_pedidos_detalle')
        .select('*')
        .eq('fecha_programada', filtros.fecha ?? today())
        .order('creado_en', { ascending: false })

      if (filtros.estado) {
        query = query.eq('estado', filtros.estado)
      }

      if (filtros.busqueda) {
        query = query.or(`numero_pedido.ilike.%${filtros.busqueda}%,cliente_nombre.ilike.%${filtros.busqueda}%`)
      }

      const { data, error: err } = await query

      if (err) throw err
      setPedidos(data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos')
    } finally {
      setLoading(false)
    }
  }, [filtros.fecha, filtros.estado, filtros.busqueda])

  useEffect(() => {
    fetchPedidos()
  }, [fetchPedidos])

  return { pedidos, loading, error, refetch: fetchPedidos }
}
