import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Package, Pencil, ListPlus, ArrowUpDown, Flag, FlagOff, Wallet,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { Ruta, Repartidor, VPedidoDetalle } from '../types'
import { Layout } from '../components/layout/Layout'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import type { Column } from '../components/ui/Table'
import { EmptyState } from '../components/ui/EmptyState'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { RutaEditModal } from '../components/shared/RutaEditModal'
import { PedidoDetalle } from './PedidoDetalle'
import { Skeleton } from '../components/ui/Skeleton'
import { formatHora, cn } from '../lib/utils'

type Tab = 'despachos' | 'cobros'
type PedidoFila = VPedidoDetalle & { _idx: number }

export default function RutaDetalle() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ruta, setRuta] = useState<(Ruta & { repartidor?: Repartidor }) | null>(null)
  const [pedidos, setPedidos] = useState<VPedidoDetalle[]>([])
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('despachos')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)

  async function fetchData() {
    if (!id) return
    const { data: rutaData } = await supabase
      .from('rutas')
      .select('*, repartidor:repartidores(*)')
      .eq('id', id)
      .single()
    setRuta((rutaData as Ruta & { repartidor?: Repartidor }) ?? null)

    const { data: rawPedidos } = await supabase.from('pedidos').select('id').eq('ruta_id', id)
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
    supabase.from('repartidores').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setRepartidores(data ?? [])
    })
  }, [id])

  const rep = ruta?.repartidor
  const gestionados = pedidos.filter((p) => ['entregado', 'no_entregado', 'reprogramado'].includes(p.estado)).length

  const filas: PedidoFila[] = pedidos.map((p, i) => ({ ...p, _idx: i + 1 }))

  const columns: Column<PedidoFila>[] = [
    { key: '_idx', header: '#', align: 'right', render: (p) => <span className="text-gray-400">{p._idx}</span> },
    {
      key: 'numero_pedido',
      header: 'Pedido',
      sortable: true,
      render: (p) => <span className="font-mono font-semibold text-celeste-700">{p.numero_pedido}</span>,
    },
    { key: 'estado', header: 'Estado', sortable: true, render: (p) => <EstadoBadge estado={p.estado} /> },
    {
      key: 'contacto',
      header: 'Contacto',
      render: (p) => (
        <div className="leading-tight min-w-0 max-w-[180px]">
          <p className="text-gray-700 truncate">{p.cliente_nombre ?? '—'}</p>
          {p.cliente_telefono && <p className="text-[11px] text-gray-400">{p.cliente_telefono}</p>}
        </div>
      ),
    },
    { key: 'hora_estimada', header: 'Hora estimada', align: 'right', render: () => <span className="text-gray-300">—</span> },
    {
      key: 'hora_real',
      header: 'Hora real',
      align: 'right',
      render: (p) => {
        const t = p.fecha_entrega_real ?? p.recogido_en
        return t ? <span className="text-gray-700">{formatHora(t)}</span> : <span className="text-gray-300">—</span>
      },
    },
    { key: 'ventana', header: 'Ventana comprometida', align: 'right', render: () => <span className="text-gray-300">—</span> },
    {
      key: 'direccion_entrega',
      header: 'Dirección',
      render: (p) => (
        <span className="text-gray-600 truncate inline-block max-w-[220px]">
          {p.direccion_entrega}{p.distrito_entrega ? ` — ${p.distrito_entrega}` : ''}
        </span>
      ),
    },
  ]

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'despachos', label: 'Despachos', icon: Package },
    { id: 'cobros', label: 'Cobros', icon: Wallet },
  ]

  return (
    <Layout>
      <div className="space-y-5">
        {/* Breadcrumb + acciones */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <button onClick={() => navigate('/rutas')} className="text-gray-400 hover:text-gray-600">Rutas</button>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="font-semibold text-gray-800">{ruta?.nombre ?? '...'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => toast('Asociar pedido — próximamente', { icon: '🚧' })}>
              <ListPlus size={16} /> Asociar pedido
            </Button>
            <Button onClick={() => setEditando(true)} disabled={!ruta}>
              <Pencil size={16} /> Editar ruta
            </Button>
          </div>
        </div>

        {/* Sub-header */}
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : ruta && (
          <div className="surface-panel p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              {rep ? <RepartidorAvatar nombre={rep.nombre} size="sm" /> : null}
              <div className="leading-tight">
                <p className="text-sm font-medium text-gray-800">{rep?.nombre ?? 'Sin repartidor'}</p>
                <p className="text-xs text-gray-400">{rep ? `${rep.vehiculo ?? ''} ${rep.placa ?? ''}`.trim() || '—' : '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Flag size={14} className="text-gray-400" /> Inicio de ruta: <span className="text-gray-700">—</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <FlagOff size={14} className="text-gray-400" /> Fin de ruta: <span className="text-gray-700">—</span>
            </div>
            <div className="text-sm text-gray-500">Pedidos: <span className="font-semibold text-gray-800">{ruta.total_pedidos}</span></div>
            <div className="text-sm text-gray-500">Gestionados: <span className="font-semibold text-gray-800">{gestionados}</span></div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => toast('Reordenar ruta — próximamente', { icon: '🚧' })}>
              <ArrowUpDown size={14} /> Reordenar ruta
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-100">
          {TABS.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === tabId ? 'border-celeste-500 text-celeste-700' : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'despachos' && (
          <Table<PedidoFila>
            columns={columns}
            data={filas}
            rowKey={(p) => p.id}
            loading={loading}
            onRowClick={(p) => setSelectedId(p.id)}
            pageSize={15}
            emptyTitle="No hay pedidos en esta ruta"
            emptyDescription="Asocia pedidos a esta ruta para verlos aquí"
          />
        )}

        {tab === 'cobros' && (
          <div className="surface-panel">
            <EmptyState icon={<Wallet size={36} />} title="Sin información de cobros"
              description="Esta ruta no tiene recaudación registrada." />
          </div>
        )}
      </div>

      {editando && ruta && (
        <RutaEditModal
          ruta={ruta}
          repartidores={repartidores}
          onClose={() => setEditando(false)}
          onSaved={fetchData}
        />
      )}

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
