import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, Package, Camera, AlertCircle, Download, BookText, LayoutGrid, Table2, Eye,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Table } from '../components/ui/Table'
import type { Column } from '../components/ui/Table'
import { FilterBar } from '../components/ui/FilterBar'
import { EmptyState } from '../components/ui/EmptyState'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { SubestadoBadge } from '../components/shared/SubestadoBadge'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { SkeletonCard } from '../components/ui/Skeleton'
import { PedidoDetalle } from './PedidoDetalle'
import { usePedidos } from '../hooks/usePedidos'
import { useAuth } from '../context/AuthContext'
import type { EstadoPedido, VPedidoDetalle } from '../types'
import {
  ESTADO_LABELS, formatHora, formatFecha, formatRelativo, today,
  PRIORIDAD_COLORS, PRIORIDAD_LABELS, cn,
} from '../lib/utils'
import { SUBESTADOS, labelSubestado } from '../lib/subestados'
import { exportarXlsx } from '../lib/xlsx'
import type { XlsxCell } from '../lib/xlsx'

const ESTADOS: EstadoPedido[] = [
  'recibido', 'verificado', 'en_preparacion', 'listo_despacho',
  'recogido', 'en_camino', 'entregado', 'no_entregado', 'reprogramado',
]

const VIEW_KEY = 'akuarian:pedidos-view'

export default function Pedidos() {
  const navigate = useNavigate()
  const { puedeEditar } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EstadoPedido | ''>('')
  const [subFiltro, setSubFiltro] = useState('')
  const [fecha, setFecha] = useState(today())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [view, setView] = useState<'cards' | 'table'>(
    () => (localStorage.getItem(VIEW_KEY) as 'cards' | 'table') || 'table',
  )

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  const { pedidos, loading, refetch } = usePedidos({
    busqueda: busqueda || undefined,
    estado: estado || undefined,
    fecha,
  })

  const pedidosVisibles = subFiltro ? pedidos.filter((p) => p.subestado === subFiltro) : pedidos

  function limpiar() {
    setBusqueda('')
    setEstado('')
    setSubFiltro('')
    setFecha(today())
  }

  async function exportarExcel() {
    if (pedidosVisibles.length === 0) {
      toast.error('No hay pedidos para exportar')
      return
    }
    const H = (t: string): XlsxCell => ({ value: t, header: true })
    const filas: XlsxCell[][] = [
      [H('Orden'), H('Estado'), H('Subestado'), H('Cliente'), H('Dirección'), H('Distrito'), H('Repartidor'), H('Vehículo'), H('Fecha'), H('Bultos')],
      ...pedidosVisibles.map((p): XlsxCell[] => [
        { value: p.numero_pedido }, { value: ESTADO_LABELS[p.estado] }, { value: labelSubestado(p.subestado) },
        { value: p.cliente_nombre ?? '' }, { value: p.direccion_entrega }, { value: p.distrito_entrega ?? '' },
        { value: p.repartidor_nombre ?? '' }, { value: p.repartidor_vehiculo ?? '' }, { value: formatFecha(p.fecha_programada) }, { value: p.bultos },
      ]),
    ]
    await exportarXlsx([{ nombre: 'Pedidos', anchos: [16, 14, 22, 24, 30, 16, 18, 14, 12, 8], filas }], `pedidos_${fecha}.xlsx`)
  }

  const columns: Column<VPedidoDetalle>[] = [
    {
      key: 'numero_pedido',
      header: 'Orden',
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-celeste-700">{p.numero_pedido}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', PRIORIDAD_COLORS[p.prioridad])}>
            {PRIORIDAD_LABELS[p.prioridad]}
          </span>
          {(p.total_evidencias ?? 0) > 0 && <Camera size={12} className="text-menta-500" />}
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      render: (p) => <EstadoBadge estado={p.estado} />,
    },
    {
      key: 'subestado',
      header: 'Subestado',
      render: (p) => (p.subestado ? <SubestadoBadge codigo={p.subestado} /> : <span className="text-gray-300">—</span>),
    },
    {
      key: 'cliente_nombre',
      header: 'Cliente',
      sortable: true,
      render: (p) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="font-medium text-gray-800 truncate">{p.cliente_nombre ?? '—'}</p>
          <p className="text-xs text-gray-400 truncate">
            {p.direccion_entrega}{p.distrito_entrega ? ` — ${p.distrito_entrega}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'repartidor',
      header: 'Vehículo / Repartidor',
      render: (p) => (p.repartidor_nombre ? (
        <div className="flex items-center gap-2">
          <RepartidorAvatar nombre={p.repartidor_nombre} size="sm" />
          <div className="leading-tight min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{p.repartidor_nombre}</p>
            {p.repartidor_vehiculo && <p className="text-[10px] text-gray-400 truncate">{p.repartidor_vehiculo}</p>}
          </div>
        </div>
      ) : (
        <span className="text-xs text-gray-400">Sin asignar</span>
      )),
    },
    {
      key: 'fecha_programada',
      header: 'Fecha de ruta',
      sortable: true,
      render: (p) => (
        <div className="leading-tight whitespace-nowrap">
          <p className="text-gray-700">{formatFecha(p.fecha_programada)}</p>
          <p className="text-[11px] text-gray-400">{formatRelativo(p.creado_en)}</p>
        </div>
      ),
    },
  ]

  function renderCards() {
    if (loading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )
    }
    if (pedidosVisibles.length === 0) {
      return (
        <Card className="p-2">
          <EmptyState
            icon={<Package size={40} />}
            title="No se encontraron pedidos"
            description="Ajusta los filtros o crea un nuevo pedido"
            action={<Button onClick={() => navigate('/pedidos/nuevo')}><Plus size={16} /> Nuevo pedido</Button>}
          />
        </Card>
      )
    }
    return (
      <div className="space-y-2 animate-fadeIn">
        {pedidosVisibles.map((p) => (
          <Card key={p.id} className="p-4" onClick={() => setSelectedId(p.id)}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-sm font-bold text-celeste-700">{p.numero_pedido}</span>
                  <EstadoBadge estado={p.estado} />
                  {p.subestado && <SubestadoBadge codigo={p.subestado} />}
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', PRIORIDAD_COLORS[p.prioridad])}>
                    {PRIORIDAD_LABELS[p.prioridad]}
                  </span>
                  {(p.total_evidencias ?? 0) > 0 && <Camera size={12} className="text-menta-500" />}
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
    )
  }

  function renderTable() {
    return (
      <Table<VPedidoDetalle>
        columns={columns}
        data={pedidosVisibles}
        rowKey={(p) => p.id}
        loading={loading}
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        onRowClick={(p) => setSelectedId(p.id)}
        rowActions={(p) => [
          { label: 'Ver detalle', icon: <Eye size={14} />, onClick: () => setSelectedId(p.id) },
        ]}
        pageSize={12}
        emptyTitle="No se encontraron pedidos"
        emptyDescription="Ajusta los filtros o crea un nuevo pedido"
      />
    )
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pedidos</h1>
            <p className="text-sm text-gray-500">
              {pedidosVisibles.length} pedido{pedidosVisibles.length !== 1 ? 's' : ''} encontrado{pedidosVisibles.length !== 1 ? 's' : ''}
              {selectedKeys.size > 0 && <span className="ml-2 text-celeste-700 font-medium">· {selectedKeys.size} seleccionado{selectedKeys.size !== 1 ? 's' : ''}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle vista (solo escritorio) */}
            <div className="hidden lg:flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('table')}
                title="Vista de tabla"
                className={cn('p-1.5 rounded-md transition-colors', view === 'table' ? 'bg-white shadow-sm text-celeste-700' : 'text-gray-500 hover:text-gray-700')}
              >
                <Table2 size={16} />
              </button>
              <button
                onClick={() => setView('cards')}
                title="Vista de tarjetas"
                className={cn('p-1.5 rounded-md transition-colors', view === 'cards' ? 'bg-white shadow-sm text-celeste-700' : 'text-gray-500 hover:text-gray-700')}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
            <Button variant="ghost" onClick={() => toast('Bitácora — próximamente', { icon: '📒' })}>
              <BookText size={16} /> Bitácora
            </Button>
            <Button variant="secondary" onClick={exportarExcel}>
              <Download size={16} /> Exportar
            </Button>
            {puedeEditar && (
              <Button onClick={() => navigate('/pedidos/nuevo')}>
                <Plus size={16} /> Nuevo pedido
              </Button>
            )}
          </div>
        </div>

        {/* Filtros */}
        <FilterBar onFilter={refetch} onClear={limpiar}>
          <div className="w-full sm:w-56">
            <Input
              placeholder="Código de orden o cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoPedido | '')}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-52">
            <Select value={subFiltro} onChange={(e) => setSubFiltro(e.target.value)}>
              <option value="">Todos los subestados</option>
              {SUBESTADOS.map((s) => (
                <option key={s.codigo} value={s.codigo}>{s.label}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-44">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </FilterBar>

        {/* Lista */}
        {view === 'cards' ? (
          renderCards()
        ) : (
          <>
            <div className="hidden lg:block">{renderTable()}</div>
            <div className="lg:hidden">{renderCards()}</div>
          </>
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
