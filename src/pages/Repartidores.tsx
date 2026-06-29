import { useState, useEffect } from 'react'
import { Plus, Truck, Phone, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { Repartidor } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { SkeletonCard } from '../components/ui/Skeleton'
import { today } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

const ESTADO_STYLES: Record<string, string> = {
  disponible: 'bg-menta-100 text-menta-700',
  en_ruta: 'bg-celeste-100 text-celeste-700',
  descanso: 'bg-gray-100 text-gray-600',
  inactivo: 'bg-coral-100 text-coral-700',
}

const ESTADO_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  en_ruta: 'En ruta',
  descanso: 'Descanso',
  inactivo: 'Inactivo',
}

export default function Repartidores() {
  const { puedeEditar } = useAuth()
  const [repartidores, setRepartidores] = useState<(Repartidor & { pedidos_hoy?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: '', telefono: '', dni: '', vehiculo: '', placa: '', licencia: '',
  })

  async function fetchRepartidores() {
    setLoading(true)
    const { data } = await supabase
      .from('repartidores')
      .select('*')
      .eq('activo', true)
      .order('nombre')

    if (data) {
      // Fetch pedido counts for today
      const pedidosCounts = await Promise.all(
        data.map(async (rep) => {
          const { data: rutas } = await supabase
            .from('rutas')
            .select('id')
            .eq('repartidor_id', rep.id)
            .eq('fecha', today())

          if (!rutas || rutas.length === 0) return { id: rep.id, count: 0 }

          const rutaIds = rutas.map((r) => r.id)
          const { count } = await supabase
            .from('pedidos')
            .select('id', { count: 'exact', head: true })
            .in('ruta_id', rutaIds)

          return { id: rep.id, count: count ?? 0 }
        })
      )

      const countMap = Object.fromEntries(pedidosCounts.map((p) => [p.id, p.count]))
      setRepartidores(data.map((r) => ({ ...r, pedidos_hoy: countMap[r.id] ?? 0 })))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRepartidores()
  }, [])

  async function crearRepartidor() {
    if (!form.nombre || !form.telefono) return toast.error('Nombre y teléfono son requeridos')
    setSaving(true)
    try {
      const { error } = await supabase.from('repartidores').insert({
        nombre: form.nombre,
        telefono: form.telefono,
        dni: form.dni || null,
        vehiculo: form.vehiculo || null,
        placa: form.placa || null,
        licencia: form.licencia || null,
      })
      if (error) throw error
      toast.success('Repartidor creado correctamente')
      setShowModal(false)
      setForm({ nombre: '', telefono: '', dni: '', vehiculo: '', placa: '', licencia: '' })
      fetchRepartidores()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Repartidores</h1>
            <p className="text-sm text-gray-500">{repartidores.length} repartidores activos</p>
          </div>
          {puedeEditar && (
            <Button onClick={() => setShowModal(true)}>
              <Plus size={16} /> Nuevo repartidor
            </Button>
          )}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : repartidores.length === 0 ? (
          <Card className="p-12 text-center">
            <Truck size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No hay repartidores registrados</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 animate-fadeIn">
            {repartidores.map((rep) => (
              <Card key={rep.id} className="p-4">
                <div className="flex items-start gap-3">
                  <RepartidorAvatar nombre={rep.nombre} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">{rep.nombre}</p>
                        {rep.dni && <p className="text-xs text-gray-400">DNI: {rep.dni}</p>}
                      </div>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ESTADO_STYLES[rep.estado]}`}>
                        {ESTADO_LABELS[rep.estado]}
                      </span>
                    </div>

                    <a href={`tel:${rep.telefono}`} className="flex items-center gap-1 text-sm text-celeste-600 mt-1.5">
                      <Phone size={12} /> {rep.telefono}
                    </a>

                    {(rep.vehiculo || rep.placa) && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Truck size={12} className="text-gray-400" />
                        <span className="text-xs text-gray-500">{rep.vehiculo}</span>
                        {rep.placa && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                            {rep.placa}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                      <Package size={12} className="text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {rep.pedidos_hoy} pedido{rep.pedidos_hoy !== 1 ? 's' : ''} hoy
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuevo repartidor">
        <div className="space-y-3">
          <Input label="Nombre completo *" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          <Input label="Teléfono *" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
          <Input label="DNI" value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Vehículo" value={form.vehiculo} onChange={(e) => setForm((f) => ({ ...f, vehiculo: e.target.value }))} />
            <Input label="Placa" value={form.placa} onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))} />
          </div>
          <Input label="Licencia" value={form.licencia} onChange={(e) => setForm((f) => ({ ...f, licencia: e.target.value }))} />
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">Cancelar</Button>
            <Button onClick={crearRepartidor} loading={saving} className="flex-1">Guardar</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
