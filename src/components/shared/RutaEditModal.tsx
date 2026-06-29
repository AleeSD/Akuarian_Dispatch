import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import type { Ruta, Repartidor, EstadoRuta } from '../../types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Select, Textarea } from '../ui/Input'

const ESTADOS: { value: EstadoRuta; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
]

interface Props {
  ruta: Ruta
  repartidores: Repartidor[]
  onClose: () => void
  onSaved: () => void
}

export function RutaEditModal({ ruta, repartidores, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    nombre: ruta.nombre,
    repartidor_id: ruta.repartidor_id ?? '',
    fecha: ruta.fecha,
    estado: ruta.estado,
    notas: ruta.notas ?? '',
  })
  const [saving, setSaving] = useState(false)

  const vehiculo = repartidores.find((r) => r.id === form.repartidor_id)
  const vehiculoLabel = vehiculo ? `${vehiculo.vehiculo ?? ''} ${vehiculo.placa ?? ''}`.trim() || '—' : '—'

  async function guardar() {
    if (!form.nombre) { toast.error('Ingresa un nombre para la ruta'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('rutas').update({
        nombre: form.nombre,
        repartidor_id: form.repartidor_id || null,
        fecha: form.fecha,
        estado: form.estado,
        notas: form.notas || null,
        actualizado_en: new Date().toISOString(),
      }).eq('id', ruta.id)
      if (error) throw error
      toast.success('Ruta actualizada')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Editar ruta">
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Información de usuario</p>
        <Select
          label="Usuario móvil (repartidor)"
          value={form.repartidor_id}
          onChange={(e) => setForm((f) => ({ ...f, repartidor_id: e.target.value }))}
        >
          <option value="">Sin asignar</option>
          {repartidores.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </Select>
        <Input label="Vehículo" value={vehiculoLabel} disabled />

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Información de despacho</p>
        <Input
          label="Nombre de la ruta"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha de despacho"
            type="date"
            value={form.fecha}
            onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
          />
          <Select
            label="Estado"
            value={form.estado}
            onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoRuta }))}
          >
            {ESTADOS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>
        <Textarea
          label="Notas"
          rows={2}
          value={form.notas}
          onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
        />

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={guardar} loading={saving} className="flex-1">Actualizar</Button>
        </div>
      </div>
    </Modal>
  )
}
