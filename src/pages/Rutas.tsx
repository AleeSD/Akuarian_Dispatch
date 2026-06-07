import { useState, useEffect } from 'react'
import { Plus, MapPin, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Repartidor, VPedidoDetalle } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { SkeletonCard } from '../components/ui/Skeleton'
import { useRutas } from '../hooks/useRutas'
import { today, formatFecha } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

export default function Rutas() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [fecha, setFecha] = useState(today())
  const { rutas, loading, refetch } = useRutas(fecha)
  const [showModal, setShowModal] = useState(false)
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [pedidosSinRuta, setPedidosSinRuta] = useState<VPedidoDetalle[]>([])
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ nombre: '', repartidor_id: '', fecha: today() })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('repartidores').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setRepartidores(data ?? [])
    })
  }, [])

  useEffect(() => {
    if (showModal) {
      supabase
        .from('v_pedidos_detalle')
        .select('*')
        .eq('fecha_programada', form.fecha)
        .is('ruta_nombre', null)
        .then(({ data }) => setPedidosSinRuta(data ?? []))
    }
  }, [showModal, form.fecha])

  async function crearRuta() {
    if (!form.nombre) return toast.error('Ingresa un nombre para la ruta')
    setSaving(true)
    try {
      const { data: ruta, error } = await supabase
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

      if (error) throw error

      if (seleccionados.size > 0) {
        await supabase
          .from('pedidos')
          .update({ ruta_id: ruta.id, estado: 'listo_despacho' })
          .in('id', Array.from(seleccionados))
      }

      toast.success('Ruta creada correctamente')
      setShowModal(false)
      setForm({ nombre: '', repartidor_id: '', fecha: today() })
      setSeleccionados(new Set())
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear ruta')
    } finally {
      setSaving(false)
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

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Rutas</h1>
            <p className="text-sm text-gray-500">{rutas.length} ruta{rutas.length !== 1 ? 's' : ''} para {formatFecha(fecha)}</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={16} /> Nueva ruta
          </Button>
        </div>

        <Input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="max-w-xs"
        />

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : rutas.length === 0 ? (
          <Card className="p-12 text-center">
            <MapPin size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No hay rutas para esta fecha</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn">
            {rutas.map((ruta) => {
              const pct = ruta.total_pedidos > 0
                ? Math.round((ruta.entregados / ruta.total_pedidos) * 100)
                : 0
              const rep = ruta.repartidor as Repartidor | undefined

              return (
                <Card key={ruta.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{ruta.nombre}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                        ruta.estado === 'en_curso' ? 'bg-celeste-100 text-celeste-700' :
                        ruta.estado === 'completada' ? 'bg-menta-100 text-menta-700' :
                        ruta.estado === 'cancelada' ? 'bg-coral-100 text-coral-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {ruta.estado.replace('_', ' ')}
                      </span>
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
                    <div
                      className="bg-menta-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {ruta.entregados > 0 && (
                        <span className="text-[10px] bg-menta-100 text-menta-700 px-1.5 py-0.5 rounded-full">
                          {ruta.entregados} ent.
                        </span>
                      )}
                      {ruta.no_entregados > 0 && (
                        <span className="text-[10px] bg-coral-100 text-coral-700 px-1.5 py-0.5 rounded-full">
                          {ruta.no_entregados} no ent.
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(`/rutas/${ruta.id}`)}
                    >
                      <Package size={13} /> Ver pedidos
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Create route modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nueva ruta" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre de la ruta"
              placeholder="Ruta Norte, Zona A..."
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
            <Input
              label="Fecha"
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            />
          </div>

          <Select
            label="Repartidor"
            value={form.repartidor_id}
            onChange={(e) => setForm((f) => ({ ...f, repartidor_id: e.target.value }))}
          >
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
                  <label
                    key={p.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={seleccionados.has(p.id)}
                      onChange={() => togglePedido(p.id)}
                      className="rounded text-celeste-500"
                    />
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
            <Button variant="secondary" onClick={() => setShowModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={crearRuta} loading={saving} className="flex-1">
              Crear ruta
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
