import { useState, useEffect } from 'react'
import { Plus, Users, Phone, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { SkeletonCard } from '../components/ui/Skeleton'

export default function Clientes() {
  const [clientes, setClientes] = useState<(Cliente & { total_pedidos?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', direccion_ref: '',
    distrito: '', notas: '',
  })

  async function fetchClientes() {
    setLoading(true)
    let query = supabase.from('clientes').select('*').eq('activo', true).order('nombre')
    if (busqueda) {
      query = query.or(`nombre.ilike.%${busqueda}%,distrito.ilike.%${busqueda}%`)
    }
    const { data } = await query

    if (data) {
      const withCounts = await Promise.all(
        data.map(async (c) => {
          const { count } = await supabase
            .from('pedidos')
            .select('id', { count: 'exact', head: true })
            .eq('cliente_id', c.id)
          return { ...c, total_pedidos: count ?? 0 }
        })
      )
      setClientes(withCounts)
    }
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(fetchClientes, 300)
    return () => clearTimeout(timer)
  }, [busqueda])

  async function crearCliente() {
    if (!form.nombre) return toast.error('El nombre es requerido')
    setSaving(true)
    try {
      const { error } = await supabase.from('clientes').insert({
        nombre: form.nombre,
        telefono: form.telefono || null,
        email: form.email || null,
        direccion_ref: form.direccion_ref || null,
        distrito: form.distrito || null,
        notas: form.notas || null,
      })
      if (error) throw error
      toast.success('Cliente creado correctamente')
      setShowModal(false)
      setForm({ nombre: '', telefono: '', email: '', direccion_ref: '', distrito: '', notas: '' })
      fetchClientes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Clientes</h1>
            <p className="text-sm text-gray-500">{clientes.length} clientes</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Nuevo cliente
          </Button>
        </div>

        <Input
          placeholder="Buscar por nombre o distrito..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          icon={<Search size={15} />}
          className="max-w-sm"
        />

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : clientes.length === 0 ? (
          <Card className="p-12 text-center">
            <Users size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No se encontraron clientes</p>
          </Card>
        ) : (
          <div className="space-y-2 animate-fadeIn">
            {clientes.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800">{c.nombre}</p>
                    {c.distrito && <p className="text-sm text-gray-500">{c.distrito}</p>}
                    {c.telefono && (
                      <a href={`tel:${c.telefono}`} className="flex items-center gap-1 text-sm text-celeste-600 mt-1">
                        <Phone size={12} /> {c.telefono}
                      </a>
                    )}
                    {c.direccion_ref && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{c.direccion_ref}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3 text-right">
                    <span className="text-sm font-bold text-celeste-700">{c.total_pedidos}</span>
                    <p className="text-xs text-gray-400">pedidos</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuevo cliente">
        <div className="space-y-3">
          <Input label="Nombre *" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <Input label="Dirección" value={form.direccion_ref} onChange={(e) => setForm((f) => ({ ...f, direccion_ref: e.target.value }))} />
          <Input label="Distrito" value={form.distrito} onChange={(e) => setForm((f) => ({ ...f, distrito: e.target.value }))} />
          <Textarea label="Notas" rows={2} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
            <Button onClick={crearCliente} loading={saving} className="flex-1">Guardar</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
