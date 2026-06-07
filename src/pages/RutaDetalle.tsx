import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Ruta, Repartidor, VPedidoDetalle } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { PedidoDetalle } from './PedidoDetalle'
import { SkeletonCard } from '../components/ui/Skeleton'

export default function RutaDetalle() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ruta, setRuta] = useState<(Ruta & { repartidor?: Repartidor }) | null>(null)
  const [pedidos, setPedidos] = useState<VPedidoDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function fetchData() {
    if (!id) return

    const { data: rutaData } = await supabase
      .from('rutas')
      .select('*, repartidor:repartidores(*)')
      .eq('id', id)
      .single()

    setRuta((rutaData as Ruta & { repartidor?: Repartidor }) ?? null)

    const { data: rawPedidos } = await supabase
      .from('pedidos')
      .select('id')
      .eq('ruta_id', id)

    if (rawPedidos && rawPedidos.length > 0) {
      const ids = rawPedidos.map((p) => p.id)
      const { data } = await supabase
        .from('v_pedidos_detalle')
        .select('*')
        .in('id', ids)
        .order('prioridad', { ascending: false })
      setPedidos(data ?? [])
    } else {
      setPedidos([])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const rep = ruta?.repartidor as Repartidor | undefined
  const pct = ruta && ruta.total_pedidos > 0
    ? Math.round((ruta.entregados / ruta.total_pedidos) * 100)
    : 0

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/rutas')}>
            <ArrowLeft size={16} /> Rutas
          </Button>
        </div>

        {ruta && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800">{ruta.nombre}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                  ruta.estado === 'en_curso' ? 'bg-celeste-100 text-celeste-700' :
                  ruta.estado === 'completada' ? 'bg-menta-100 text-menta-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {ruta.estado.replace('_', ' ')}
                </span>
              </div>
              <span className="text-2xl font-bold text-gray-700">{pct}%</span>
            </div>

            {rep && (
              <div className="flex items-center gap-2.5">
                <RepartidorAvatar nombre={rep.nombre} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{rep.nombre}</p>
                  <p className="text-xs text-gray-400">{rep.vehiculo} · {rep.placa}</p>
                </div>
              </div>
            )}

            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-menta-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{ruta.entregados} de {ruta.total_pedidos} pedidos entregados</p>
          </div>
        )}

        <h2 className="font-semibold text-gray-800">Pedidos de esta ruta</h2>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : pedidos.length === 0 ? (
          <Card className="p-10 text-center">
            <Package size={36} className="mx-auto mb-2 text-gray-300" />
            <p className="text-gray-400 text-sm">No hay pedidos en esta ruta</p>
          </Card>
        ) : (
          <div className="space-y-2 animate-fadeIn">
            {pedidos.map((p) => (
              <Card key={p.id} className="p-3.5" onClick={() => setSelectedId(p.id)}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm font-bold text-celeste-700">{p.numero_pedido}</span>
                      <EstadoBadge estado={p.estado} />
                    </div>
                    <p className="text-sm text-gray-700 truncate">{p.cliente_nombre}</p>
                    <p className="text-xs text-gray-400 truncate">{p.direccion_entrega}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedId && (
        <PedidoDetalle
          pedidoId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchData}
        />
      )}
    </Layout>
  )
}
