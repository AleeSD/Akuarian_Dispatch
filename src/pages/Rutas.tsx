import { useState, useEffect } from 'react'
import {
  Plus, Route, Package, Upload, Download, ListPlus, LayoutGrid, Table2,
  Eye, Pencil, Trash2, Printer,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Repartidor, VPedidoDetalle, Ruta, EstadoRuta } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Table } from '../components/ui/Table'
import type { Column } from '../components/ui/Table'
import { FilterBar } from '../components/ui/FilterBar'
import { EmptyState } from '../components/ui/EmptyState'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { RutaEditModal } from '../components/shared/RutaEditModal'
import { SkeletonCard } from '../components/ui/Skeleton'
import { useRutas } from '../hooks/useRutas'
import { today, formatFecha, formatRelativo, cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

type RutaRow = Ruta & { repartidor?: Repartidor }

const VIEW_KEY = 'akuarian:rutas-view'

const RUTA_ESTADO: Record<EstadoRuta, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-gray-100 text-gray-600' },
  en_curso:   { label: 'En curso',   cls: 'bg-celeste-100 text-celeste-700' },
  completada: { label: 'Completada', cls: 'bg-menta-100 text-menta-700' },
  cancelada:  { label: 'Cancelada',  cls: 'bg-coral-100 text-coral-700' },
}

function EstadoRutaChip({ estado }: { estado: EstadoRuta }) {
  const e = RUTA_ESTADO[estado]
  return <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', e.cls)}>{e.label}</span>
}

export default function Rutas() {
  const navigate = useNavigate()
  const { user, puedeEditar } = useAuth()
  const [fecha, setFecha] = useState(today())
  const { rutas, loading, error, refetch } = useRutas(fecha)

  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [repFiltro, setRepFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoRuta | ''>('')

  const [view, setView] = useState<'cards' | 'table'>(
    () => (localStorage.getItem(VIEW_KEY) as 'cards' | 'table') || 'table',
  )
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Modales
  const [showCrear, setShowCrear] = useState(false)
  const [rutaEditar, setRutaEditar] = useState<RutaRow | null>(null)
  const [rutaEliminar, setRutaEliminar] = useState<RutaRow | null>(null)
  const [eliminando, setEliminando] = useState(false)

  // Crear ruta
  const [pedidosSinRuta, setPedidosSinRuta] = useState<VPedidoDetalle[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ nombre: '', repartidor_id: '', fecha: today() })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  useEffect(() => {
    supabase.from('repartidores').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setRepartidores(data ?? [])
    })
  }, [])

  useEffect(() => {
    if (showCrear) {
      supabase
        .from('v_pedidos_detalle')
        .select('*')
        .eq('fecha_programada', form.fecha)
        .is('ruta_nombre', null)
        .then(({ data }) => setPedidosSinRuta(data ?? []))
    }
  }, [showCrear, form.fecha])

  const rutasFiltradas = rutas.filter(
    (r) => (!repFiltro || r.repartidor_id === repFiltro) && (!estadoFiltro || r.estado === estadoFiltro),
  )

  function limpiar() {
    setFecha(today())
    setRepFiltro('')
    setEstadoFiltro('')
  }

  async function crearRuta() {
    if (!form.nombre) return toast.error('Ingresa un nombre para la ruta')
    setSaving(true)
    try {
      const { data: ruta, error: err } = await supabase
        .from('rutas')
        .insert({
          nombre: form.nombre,
          repartidor_id: form.repartidor_id || null,
          fecha: form.fecha,
          creado_por: user?.id ?? null,
          total_pedidos: seleccionados.size,
        })
        .select()
        .single()

      if (err) throw err

      if (seleccionados.size > 0) {
        await supabase
          .from('pedidos')
          .update({ ruta_id: ruta.id, estado: 'listo_despacho' })
          .in('id', Array.from(seleccionados))
      }

      toast.success('Ruta creada correctamente')
      setShowCrear(false)
      setForm({ nombre: '', repartidor_id: '', fecha: today() })
      setSeleccionados(new Set())
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear ruta')
    } finally {
      setSaving(false)
    }
  }

  async function eliminarRuta() {
    if (!rutaEliminar) return
    setEliminando(true)
    try {
      // Desvincular pedidos antes de borrar la ruta
      await supabase.from('pedidos').update({ ruta_id: null }).eq('ruta_id', rutaEliminar.id)
      const { error: err } = await supabase.from('rutas').delete().eq('id', rutaEliminar.id)
      if (err) throw err
      toast.success('Ruta eliminada')
      setRutaEliminar(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setEliminando(false)
    }
  }

  function togglePedido(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const proximamente = (q: string) => () => toast(`${q} — próximamente`, { icon: '🚧' })

  const columns: Column<RutaRow>[] = [
    {
      key: 'vehiculo',
      header: 'Vehículo',
      render: (r) => (r.repartidor?.vehiculo ? (
        <span className="text-gray-700">
          {r.repartidor.vehiculo}{r.repartidor.placa ? <span className="text-gray-400"> · {r.repartidor.placa}</span> : ''}
        </span>
      ) : <span className="text-gray-300">—</span>),
    },
    {
      key: 'usuario',
      header: 'Usuario móvil',
      render: (r) => (r.repartidor ? (
        <div className="flex items-center gap-2">
          <RepartidorAvatar nombre={r.repartidor.nombre} size="sm" />
          <span className="text-gray-700 truncate max-w-[140px]">{r.repartidor.nombre}</span>
        </div>
      ) : <span className="text-xs text-gray-400">Sin asignar</span>),
    },
    {
      key: 'total_pedidos',
      header: 'Despachos',
      sortable: true,
      align: 'right',
      render: (r) => (
        <span className="font-medium text-gray-800">
          {r.entregados}/{r.total_pedidos}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      render: (r) => <EstadoRutaChip estado={r.estado} />,
    },
    {
      key: 'fecha',
      header: 'Fecha de entrega',
      sortable: true,
      render: (r) => <span className="text-gray-700 whitespace-nowrap">{formatFecha(r.fecha)}</span>,
    },
    {
      key: 'creado_en',
      header: 'Creado en',
      sortable: true,
      render: (r) => (
        <div className="leading-tight whitespace-nowrap">
          <p className="text-gray-700">{formatFecha(r.creado_en)}</p>
          <p className="text-[11px] text-gray-400">{formatRelativo(r.creado_en)}</p>
        </div>
      ),
    },
  ]

  function renderCards() {
    if (loading) {
      return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )
    }
    if (error) {
      return (
        <Card className="p-2">
          <EmptyState icon={<Route size={36} />} title="Error al cargar rutas" description={error}
            action={<button onClick={refetch} className="text-sm text-celeste-600 underline">Reintentar</button>} />
        </Card>
      )
    }
    if (rutasFiltradas.length === 0) {
      return (
        <Card className="p-2">
          <EmptyState icon={<Route size={36} />} title="No hay rutas para esta fecha"
            action={<Button onClick={() => setShowCrear(true)}><Plus size={16} /> Nueva ruta</Button>} />
        </Card>
      )
    }
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn">
        {rutasFiltradas.map((ruta) => {
          const pct = ruta.total_pedidos > 0 ? Math.round((ruta.entregados / ruta.total_pedidos) * 100) : 0
          const rep = ruta.repartidor
          return (
            <Card key={ruta.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800">{ruta.nombre}</p>
                  <span className="mt-1 inline-block"><EstadoRutaChip estado={ruta.estado} /></span>
                </div>
                <span className="text-sm text-gray-500 font-medium">{ruta.entregados}/{ruta.total_pedidos}</span>
              </div>
              {rep && (
                <div className="flex items-center gap-2 mb-3">
                  <RepartidorAvatar nombre={rep.nombre} size="sm" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">{rep.nombre}</p>
                    <p className="text-[10px] text-gray-400">{rep.vehiculo} {rep.placa}</p>
                  </div>
                </div>
              )}
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                <div className="bg-menta-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{formatRelativo(ruta.creado_en)}</span>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/rutas/${ruta.id}`)}>
                  <Package size={13} /> Ver pedidos
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  function renderTable() {
    return (
      <Table<RutaRow>
        columns={columns}
        data={rutasFiltradas}
        rowKey={(r) => r.id}
        loading={loading}
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        onRowClick={(r) => navigate(`/rutas/${r.id}`)}
        rowActions={(r) => [
          { label: 'Mostrar', icon: <Eye size={14} />, onClick: () => navigate(`/rutas/${r.id}`) },
          { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setRutaEditar(r) },
          { label: 'Imprimir etiquetas', icon: <Printer size={14} />, onClick: proximamente('Imprimir etiquetas') },
          { label: 'Abrir rutas', onClick: proximamente('Abrir rutas') },
          { label: 'Cerrar rutas', onClick: proximamente('Cerrar rutas') },
          { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setRutaEliminar(r) },
        ]}
        pageSize={12}
        emptyTitle="No hay rutas para esta fecha"
        emptyDescription="Ajusta los filtros o crea una nueva ruta"
      />
    )
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Rutas</h1>
            <p className="text-sm text-gray-500">
              {rutasFiltradas.length} ruta{rutasFiltradas.length !== 1 ? 's' : ''} para {formatFecha(fecha)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="hidden lg:flex items-center bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setView('table')} title="Vista de tabla"
                className={cn('p-1.5 rounded-md transition-colors', view === 'table' ? 'bg-white shadow-sm text-celeste-700' : 'text-gray-500 hover:text-gray-700')}>
                <Table2 size={16} />
              </button>
              <button onClick={() => setView('cards')} title="Vista de tarjetas"
                className={cn('p-1.5 rounded-md transition-colors', view === 'cards' ? 'bg-white shadow-sm text-celeste-700' : 'text-gray-500 hover:text-gray-700')}>
                <LayoutGrid size={16} />
              </button>
            </div>
            {puedeEditar && <Button variant="ghost" onClick={proximamente('Importar archivo')}><Upload size={16} /> Importar</Button>}
            {puedeEditar && <Button variant="ghost" onClick={proximamente('Asignar ruta')}><ListPlus size={16} /> Asignar</Button>}
            <Button variant="secondary" onClick={proximamente('Exportar recaudación')}><Download size={16} /> Recaudación</Button>
            {puedeEditar && <Button onClick={() => setShowCrear(true)}><Plus size={16} /> Nueva ruta</Button>}
          </div>
        </div>

        {/* Filtros */}
        <FilterBar onFilter={refetch} onClear={limpiar}>
          <div className="w-full sm:w-44">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="w-full sm:w-52">
            <Select value={repFiltro} onChange={(e) => setRepFiltro(e.target.value)}>
              <option value="">Todos los usuarios móviles</option>
              {repartidores.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-44">
            <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as EstadoRuta | '')}>
              <option value="">Todos los estados</option>
              {(Object.keys(RUTA_ESTADO) as EstadoRuta[]).map((e) => (
                <option key={e} value={e}>{RUTA_ESTADO[e].label}</option>
              ))}
            </Select>
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

      {/* Crear ruta */}
      <Modal open={showCrear} onClose={() => setShowCrear(false)} title="Nueva ruta" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre de la ruta" placeholder="Ruta Norte, Zona A..." value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            <Input label="Fecha" type="date" value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
          </div>
          <Select label="Repartidor" value={form.repartidor_id}
            onChange={(e) => setForm((f) => ({ ...f, repartidor_id: e.target.value }))}>
            <option value="">Sin asignar</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre} — {r.vehiculo}</option>
            ))}
          </Select>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Pedidos disponibles para {formatFecha(form.fecha)} ({seleccionados.size} seleccionados)
            </p>
            {pedidosSinRuta.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
                No hay pedidos sin ruta para esta fecha
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {pedidosSinRuta.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => togglePedido(p.id)} className="rounded text-celeste-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-semibold text-celeste-700">{p.numero_pedido}</p>
                      <p className="text-xs text-gray-700 truncate">{p.cliente_nombre} — {p.distrito_entrega}</p>
                      <p className="text-[10px] text-gray-400 truncate">{p.direccion_entrega}</p>
                    </div>
                    <EstadoBadge estado={p.estado} />
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCrear(false)} className="flex-1">Cancelar</Button>
            <Button onClick={crearRuta} loading={saving} className="flex-1">Crear ruta</Button>
          </div>
        </div>
      </Modal>

      {/* Editar ruta */}
      {rutaEditar && (
        <RutaEditModal
          ruta={rutaEditar}
          repartidores={repartidores}
          onClose={() => setRutaEditar(null)}
          onSaved={refetch}
        />
      )}

      {/* Eliminar ruta */}
      <Modal open={!!rutaEliminar} onClose={() => setRutaEliminar(null)} title="Eliminar ruta">
        <p className="text-sm text-gray-600 mb-4">
          ¿Eliminar la ruta <strong>{rutaEliminar?.nombre}</strong>? Los pedidos asociados quedarán sin ruta (no se eliminan).
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setRutaEliminar(null)}>Cancelar</Button>
          <Button variant="danger" onClick={eliminarRuta} loading={eliminando}>
            <Trash2 size={16} /> Eliminar
          </Button>
        </div>
      </Modal>
    </Layout>
  )
}
