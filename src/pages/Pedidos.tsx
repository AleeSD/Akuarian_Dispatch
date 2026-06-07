import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Package, Camera, AlertCircle } from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { SkeletonCard } from '../components/ui/Skeleton'
import { PedidoDetalle } from './PedidoDetalle'
import { usePedidos } from '../hooks/usePedidos'
import type { EstadoPedido } from '../types'
import { ESTADO_LABELS, formatHora, today, PRIORIDAD_COLORS, PRIORIDAD_LABELS } from '../lib/utils'
import { cn } from '../lib/utils'

const ESTADOS: EstadoPedido[] = [
  'recibido', 'verificado', 'en_preparacion', 'listo_despacho',
  'recogido', 'en_camino', 'entregado', 'no_entregado', 'reprogramado',
]

export default function Pedidos() {
  const navigate = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EstadoPedido | ''>('')
  const [fecha, setFecha] = useState(today())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { pedidos, loading, refetch } = usePedidos({
    busqueda: busqueda || undefined,
    estado: estado || undefined,
    fecha,
  })

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pedidos</h1>
            <p className="text-sm text-gray-500">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} encontrados</p>
          </div>
          <Button onClick={() => navigate('/pedidos/nuevo')}>
            <Plus size={16} /> Nuevo pedido
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Buscar pedido o cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            icon={<Search size={15} />}
          />
          <Select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoPedido | '')}
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
            ))}
          </Select>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : pedidos.length === 0 ? (
          <Card className="p-12 text-center">
            <Package size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No se encontraron pedidos</p>
            <p className="text-gray-400 text-sm mt-1">Ajusta los filtros o crea un nuevo pedido</p>
          </Card>
        ) : (
          <div className="space-y-2 animate-fadeIn">
            {pedidos.map((p) => (
              <Card
                key={p.id}
                className="p-4"
                onClick={() => setSelectedId(p.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-bold text-celeste-700">{p.numero_pedido}</span>
                      <EstadoBadge estado={p.estado} />
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', PRIORIDAD_COLORS[p.prioridad])}>
                        {PRIORIDAD_LABELS[p.prioridad]}
                      </span>
                      {(p.total_evidencias ?? 0) > 0 && (
                        <Camera size={12} className="text-menta-500" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 truncate">{p.cliente_nombre}</p>
                    <p className="text-xs text-gray-500 truncate">{p.direccion_entrega}{p.distrito_entrega ? ` — ${p.distrito_entrega}` : ''}</p>
                    {p.observaciones && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle size={11} className="text-amber-500" />
                        <p className="text-xs text-amber-600 truncate">{p.observaciones}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {p.repartidor_nombre && <RepartidorAvatar nombre={p.repartidor_nombre} size="sm" />}
                    <span className="text-[11px] text-gray-400">{formatHora(p.creado_en)}</span>
                    <span className="text-xs text-gray-500">{p.bultos} bulto{p.bultos > 1 ? 's' : ''}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <PedidoDetalle
          pedidoId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={refetch}
        />
      )}
    </Layout>
  )
}
