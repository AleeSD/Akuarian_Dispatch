import { useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import type { Cliente } from '../../types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Input'

interface Props {
  /** Si se pasa un cliente, el modal está en modo edición; si es null, en modo alta. */
  cliente?: Cliente | null
  onClose: () => void
  onSaved: () => void
}

export function ClienteFormModal({ cliente, onClose, onSaved }: Props) {
  const editing = !!cliente
  const [form, setForm] = useState({
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    email: cliente?.email ?? '',
    direccion_ref: cliente?.direccion_ref ?? '',
    distrito: cliente?.distrito ?? '',
    notas: cliente?.notas ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function guardar() {
    if (!form.nombre) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      const payload = {
        nombre: form.nombre,
        telefono: form.telefono || null,
        email: form.email || null,
        direccion_ref: form.direccion_ref || null,
        distrito: form.distrito || null,
        notas: form.notas || null,
      }
      const { error } = editing
        ? await supabase.from('clientes').update({ ...payload, actualizado_en: new Date().toISOString() }).eq('id', cliente!.id)
        : await supabase.from('clientes').insert(payload)
      if (error) throw error
      toast.success(editing ? 'Cliente actualizado' : 'Cliente creado correctamente')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
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
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={guardar} loading={saving} className="flex-1">{editing ? 'Actualizar' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}
