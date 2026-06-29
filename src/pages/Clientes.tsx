import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Users, Phone, Upload, Star, LayoutGrid, Table2, Pencil, PackagePlus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Table } from '../components/ui/Table'
import type { Column } from '../components/ui/Table'
import { FilterBar } from '../components/ui/FilterBar'
import { EmptyState } from '../components/ui/EmptyState'
import { ClienteFormModal } from '../components/shared/ClienteFormModal'
import { SkeletonCard } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

type ClienteRow = Cliente & { total_pedidos: number }

const VIEW_KEY = 'akuarian:clientes-view'

export default function Clientes() {
  const navigate = useNavigate()
  const { puedeEditar } = useAuth()
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'table'>(
    () => (localStorage.getItem(VIEW_KEY) as 'cards' | 'table') || 'table',
  )

  // Filtros
  const [fNombre, setFNombre] = useState('')
  const [fId, setFId] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fTelefono, setFTelefono] = useState('')

  // Modal alta/edición: undefined = cerrado, null = nuevo, Cliente = editar
  const [modalCliente, setModalCliente] = useState<Cliente | null | undefined>(undefined)

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  async function fetchClientes() {
    setLoading(true)
    // Una sola consulta de clientes + una sola de pedidos (conteo agregado, sin N+1)
    const [clientesRes, pedidosRes] = await Promise.all([
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('pedidos').select('cliente_id'),
    ])
    const counts: Record<string, number> = {}
    for (const p of pedidosRes.data ?? []) {
      if (p.cliente_id) counts[p.cliente_id] = (counts[p.cliente_id] ?? 0) + 1
    }
    setClientes((clientesRes.data ?? []).map((c) => ({ ...c, total_pedidos: counts[c.id] ?? 0 })))
    setLoading(false)
  }

  useEffect(() => {
    fetchClientes()
  }, [])

  function limpiar() {
    setFNombre('')
    setFId('')
    setFEmail('')
    setFTelefono('')
  }

  const filtrados = clientes.filter((c) =>
    (!fNombre || c.nombre.toLowerCase().includes(fNombre.toLowerCase())) &&
    (!fId || c.id.toLowerCase().includes(fId.toLowerCase())) &&
    (!fEmail || (c.email ?? '').toLowerCase().includes(fEmail.toLowerCase())) &&
    (!fTelefono || (c.telefono ?? '').includes(fTelefono)),
  )

  const columns: Column<ClienteRow>[] = [
    {
      key: 'nombre',
      header: 'Nombre',
      sortable: true,
      render: (c) => <span className="font-medium text-celeste-700">{c.nombre}</span>,
    },
    {
      key: 'id',
      header: 'ID de Cliente',
      render: (c) => <span className="font-mono text-xs text-gray-400">{c.id.slice(0, 8)}</span>,
    },
    {
      key: 'email',
      header: 'Correo electrónico',
      render: (c) => (c.email ? <span className="text-gray-700">{c.email}</span> : <span className="text-gray-300">—</span>),
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      render: (c) => (c.telefono ? <span className="text-gray-700">{c.telefono}</span> : <span className="text-gray-300">—</span>),
    },
    {
      key: 'total_pedidos',
      header: 'Órdenes',
      sortable: true,
      align: 'right',
      render: (c) => <span className="font-semibold text-gray-800">{c.total_pedidos}</span>,
    },
  ]

  function renderCards() {
    if (loading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )
    }
    if (filtrados.length === 0) {
      return (
        <Card className="p-2">
          <EmptyState icon={<Users size={36} />} title="No se encontraron clientes"
            action={<Button onClick={() => setModalCliente(null)}><Plus size={16} /> Nuevo cliente</Button>} />
        </Card>
      )
    }
    return (
      <div className="space-y-2 animate-fadeIn">
        {filtrados.map((c) => (
          <Card key={c.id} className="p-4" onClick={() => setModalCliente(c)}>
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800">{c.nombre}</p>
                {c.distrito && <p className="text-sm text-gray-500">{c.distrito}</p>}
                {c.telefono && (
                  <span className="flex items-center gap-1 text-sm text-celeste-600 mt-1">
                    <Phone size={12} /> {c.telefono}
                  </span>
                )}
                {c.direccion_ref && <p className="text-xs text-gray-400 mt-1 truncate">{c.direccion_ref}</p>}
              </div>
              <div className="flex-shrink-0 ml-3 text-right">
                <span className="text-sm font-bold text-celeste-700">{c.total_pedidos}</span>
                <p className="text-xs text-gray-400">órdenes</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  function renderTable() {
    return (
      <Table<ClienteRow>
        columns={columns}
        data={filtrados}
        rowKey={(c) => c.id}
        loading={loading}
        onRowClick={(c) => setModalCliente(c)}
        rowActions={(c) => [
          { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setModalCliente(c) },
          { label: 'Nuevo pedido', icon: <PackagePlus size={14} />, onClick: () => navigate('/pedidos/nuevo') },
        ]}
        pageSize={15}
        emptyTitle="No se encontraron clientes"
        emptyDescription="Ajusta los filtros o crea un nuevo cliente"
      />
    )
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Clientes</h1>
            <p className="text-sm text-gray-500">{filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}</p>
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
            <Button variant="ghost" onClick={() => toast('Importar — próximamente', { icon: '🚧' })}><Upload size={16} /> Importar</Button>
            <Button variant="ghost" onClick={() => toast('Reseñas — próximamente', { icon: '⭐' })}><Star size={16} /> Reseñas</Button>
            {puedeEditar && <Button onClick={() => setModalCliente(null)}><Plus size={16} /> Nuevo cliente</Button>}
          </div>
        </div>

        {/* Filtros */}
        <FilterBar onClear={limpiar}>
          <div className="w-full sm:w-48">
            <Input placeholder="Nombre" value={fNombre} onChange={(e) => setFNombre(e.target.value)} />
          </div>
          <div className="w-full sm:w-36">
            <Input placeholder="ID de Cliente" value={fId} onChange={(e) => setFId(e.target.value)} />
          </div>
          <div className="w-full sm:w-48">
            <Input placeholder="Correo electrónico" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
          </div>
          <div className="w-full sm:w-40">
            <Input placeholder="Teléfono" value={fTelefono} onChange={(e) => setFTelefono(e.target.value)} />
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

      {modalCliente !== undefined && (
        <ClienteFormModal
          cliente={modalCliente}
          onClose={() => setModalCliente(undefined)}
          onSaved={fetchClientes}
        />
      )}
    </Layout>
  )
}
