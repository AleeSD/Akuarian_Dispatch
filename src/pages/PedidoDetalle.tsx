import { useEffect, useState } from 'react'
import { X, Phone, Camera, AlertCircle, CheckCircle, ChevronRight, Copy, AlertTriangle, Eraser, FileEdit } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { VPedidoDetalle, HistorialEstado, Evidencia, EstadoPedido } from '../types'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { SubestadoBadge } from '../components/shared/SubestadoBadge'
import { EventTimeline } from '../components/shared/Timeline'
import { subestadosDe } from '../lib/subestados'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Skeleton } from '../components/ui/Skeleton'
import { formatFecha, formatFechaHora, MOTIVO_LABELS, PRIORIDAD_LABELS, PRIORIDAD_COLORS } from '../lib/utils'
import { cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

interface Props {
  pedidoId: string
  onClose: () => void
  onUpdated: () => void
}

const ACCIONES: Partial<Record<EstadoPedido, { label: string; siguiente: EstadoPedido; variant: 'primary' | 'success' | 'secondary' }[]>> = {
  recibido:       [{ label: 'Verificar pedido',      siguiente: 'verificado',     variant: 'primary' }],
  verificado:     [{ label: 'Marcar en preparación', siguiente: 'en_preparacion', variant: 'primary' }],
  en_preparacion: [{ label: 'Listo para despacho',   siguiente: 'listo_despacho', variant: 'primary' }],
  no_entregado:   [{ label: 'Reprogramar',            siguiente: 'reprogramado',   variant: 'secondary' }],
  reprogramado:   [{ label: 'Volver a despachar',     siguiente: 'listo_despacho', variant: 'primary' }],
}

function Campo({ label, value }: { label: string; value?: string | number | null }) {
  const vacio = value === null || value === undefined || value === ''
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-700 truncate">{vacio ? <span className="text-gray-300">N/A</span> : value}</p>
    </div>
  )
}

export function PedidoDetalle({ pedidoId, onClose, onUpdated }: Props) {
  const { puedeEditar } = useAuth()
  const [pedido, setPedido] = useState<VPedidoDetalle | null>(null)
  const [historial, setHistorial] = useState<HistorialEstado[]>([])
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [accionLoading, setAccionLoading] = useState(false)
  const [confirmando, setConfirmando] = useState<EstadoPedido | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    fetchDetalle()
  }, [pedidoId])

  async function fetchDetalle() {
    setLoading(true)
    const [pedRes, histRes, evRes, usrRes] = await Promise.all([
      supabase.from('v_pedidos_detalle').select('*').eq('id', pedidoId).single(),
      supabase.from('historial_estados').select('*').eq('pedido_id', pedidoId).order('cambiado_en'),
      supabase.from('evidencias').select('*').eq('pedido_id', pedidoId).order('subido_en'),
      supabase.from('usuarios').select('id, nombre'),
    ])
    setPedido(pedRes.data)
    setHistorial(histRes.data ?? [])
    setEvidencias(evRes.data ?? [])
    setUsuarios(Object.fromEntries((usrRes.data ?? []).map((u) => [u.id, u.nombre])))
    setLoading(false)
  }

  async function cambiarEstado(nuevoEstado: EstadoPedido) {
    setAccionLoading(true)
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: nuevoEstado })
        .eq('id', pedidoId)
      if (error) throw error
      toast.success('Estado actualizado correctamente')
      setConfirmando(null)
      await fetchDetalle()
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setAccionLoading(false)
    }
  }

  async function updateSubestado(codigo: string) {
    try {
      const { error } = await supabase.from('pedidos').update({ subestado: codigo || null }).eq('id', pedidoId)
      if (error) throw error
      toast.success('Subestado actualizado')
      await fetchDetalle()
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar')
    }
  }

  function copiarNumero() {
    if (!pedido) return
    navigator.clipboard?.writeText(pedido.numero_pedido)
    toast.success('Número copiado')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:block animate-fadeIn"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full lg:w-[520px] bg-white shadow-2xl flex flex-col animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          {loading ? (
            <div className="space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : pedido ? (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-0.5">
                <span>Pedidos</span>
                <ChevronRight size={12} />
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono font-bold text-celeste-700 text-lg truncate">{pedido.numero_pedido}</p>
                <button onClick={copiarNumero} title="Copiar número" className="text-gray-400 hover:text-gray-600">
                  <Copy size={14} />
                </button>
                <EstadoBadge estado={pedido.estado} />
                {pedido.subestado && <SubestadoBadge codigo={pedido.subestado} />}
              </div>
            </div>
          ) : null}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Action bar */}
        {!loading && pedido && puedeEditar && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 flex-wrap">
            {ACCIONES[pedido.estado]?.map((accion) => (
              <Button
                key={accion.siguiente}
                size="sm"
                variant={accion.variant}
                onClick={() => setConfirmando(accion.siguiente)}
              >
                {accion.label}
              </Button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => toast('Modificar datos — próximamente', { icon: '✏️' })}>
              <FileEdit size={14} /> Modificar datos
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toast('Limpiar orden — próximamente', { icon: '🧹' })}>
              <Eraser size={14} /> Limpiar orden
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : pedido ? (
            <div className="p-5 space-y-4">
              {/* Chips */}
              <div className="flex gap-2 flex-wrap">
                <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', PRIORIDAD_COLORS[pedido.prioridad])}>
                  {PRIORIDAD_LABELS[pedido.prioridad]}
                </span>
                <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-medium">
                  {pedido.bultos} bulto{pedido.bultos > 1 ? 's' : ''}
                  {pedido.peso_kg ? ` · ${pedido.peso_kg} kg` : ''}
                </span>
              </div>

              {/* Subestado */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Subestado</span>
                {pedido.subestado
                  ? <SubestadoBadge codigo={pedido.subestado} />
                  : <span className="text-xs text-gray-300">Sin asignar</span>}
                {puedeEditar && (
                  <select
                    value={pedido.subestado ?? ''}
                    onChange={(e) => updateSubestado(e.target.value)}
                    className="ml-auto text-xs rounded-lg border border-gray-200 bg-white px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-celeste-300"
                  >
                    <option value="">Sin subestado</option>
                    {subestadosDe(pedido.estado).map((s) => (
                      <option key={s.codigo} value={s.codigo}>{s.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Resumen */}
              <section className="surface-panel p-4 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resumen</h3>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Nombre</p>
                  <p className="text-sm font-medium text-gray-800">{pedido.cliente_nombre ?? '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Identificador" value={pedido.cliente_email} />
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Teléfono</p>
                    {pedido.cliente_telefono ? (
                      <a href={`tel:${pedido.cliente_telefono}`} className="text-sm text-celeste-600 hover:text-celeste-700 flex items-center gap-1">
                        <Phone size={12} /> {pedido.cliente_telefono}
                      </a>
                    ) : <p className="text-sm text-gray-300">N/A</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Dirección</p>
                  <p className="text-sm text-gray-700">{pedido.direccion_entrega}</p>
                  {pedido.distrito_entrega && <p className="text-sm text-gray-500">{pedido.distrito_entrega}</p>}
                  {pedido.referencia_entrega && <p className="text-xs text-gray-400 italic">{pedido.referencia_entrega}</p>}
                </div>
                {/* Confiabilidad de dirección (placeholder Beetrack) */}
                <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5">
                  <AlertTriangle size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Confiabilidad de dirección no disponible en esta versión.</p>
                    <button
                      onClick={() => toast('Enviar notificación — próximamente', { icon: '🔔' })}
                      className="text-xs text-celeste-600 hover:text-celeste-700 mt-0.5"
                    >
                      Enviar notificación
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Núm. intentos" value={pedido.intento_numero} />
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Último estado</p>
                    <EstadoBadge estado={pedido.estado} />
                  </div>
                </div>
              </section>

              {/* Observaciones */}
              {pedido.observaciones && (
                <section className="surface-panel p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Observaciones</h3>
                  <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5">
                    <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{pedido.observaciones}</p>
                  </div>
                </section>
              )}

              {/* Categorías y grupos */}
              <section className="surface-panel p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Categorías y grupos</h3>
                <Campo label="Cliente" value={pedido.cliente_nombre} />
              </section>

              {/* Campos personalizados */}
              <section className="surface-panel p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Campos personalizados</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Cliente" value={pedido.cliente_nombre} />
                  <Campo label="Distrito" value={pedido.distrito_entrega} />
                  <Campo label="Referencia dirección" value={pedido.referencia_entrega} />
                  <Campo label="Orden de compra" value={null} />
                  <Campo label="Marketplace ID" value={null} />
                  <Campo label="Ubigeo cliente" value={null} />
                </div>
              </section>

              {/* Ítems */}
              <section className="surface-panel p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ítems</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-gray-400 uppercase tracking-wide text-left">
                        <th className="font-medium pb-1.5">Descripción</th>
                        <th className="font-medium pb-1.5 text-right">Bultos</th>
                        <th className="font-medium pb-1.5 text-right">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-gray-700">
                        <td className="py-1">{pedido.descripcion_carga ?? <span className="text-gray-300">Sin descripción</span>}</td>
                        <td className="py-1 text-right">{pedido.bultos}</td>
                        <td className="py-1 text-right">{pedido.peso_kg ? `${pedido.peso_kg} kg` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Repartidor */}
              {pedido.repartidor_nombre && (
                <section className="surface-panel p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Repartidor</h3>
                  <div className="flex items-center gap-2.5">
                    <RepartidorAvatar nombre={pedido.repartidor_nombre} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{pedido.repartidor_nombre}</p>
                      {pedido.repartidor_telefono && (
                        <a href={`tel:${pedido.repartidor_telefono}`} className="text-xs text-celeste-600 flex items-center gap-1">
                          <Phone size={11} /> {pedido.repartidor_telefono}
                        </a>
                      )}
                    </div>
                    {pedido.ruta_nombre && (
                      <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{pedido.ruta_nombre}</span>
                    )}
                  </div>
                </section>
              )}

              {/* Motivo no entrega */}
              {pedido.motivo_no_entrega && (
                <section className="surface-panel p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Motivo de no entrega</h3>
                  <p className="text-sm text-coral-700 font-medium">{MOTIVO_LABELS[pedido.motivo_no_entrega]}</p>
                  {pedido.detalle_no_entrega && (
                    <p className="text-xs text-gray-500 mt-0.5">{pedido.detalle_no_entrega}</p>
                  )}
                </section>
              )}

              {/* Fechas */}
              <section className="surface-panel p-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-gray-400">Programado</p>
                  <p className="font-medium text-gray-700">{formatFecha(pedido.fecha_programada)}</p>
                </div>
                {pedido.recogido_en && (
                  <div>
                    <p className="text-gray-400">Recogido</p>
                    <p className="font-medium text-gray-700">{formatFechaHora(pedido.recogido_en)}</p>
                  </div>
                )}
                {pedido.fecha_entrega_real && (
                  <div>
                    <p className="text-gray-400">Entregado</p>
                    <p className="font-medium text-gray-700">{formatFechaHora(pedido.fecha_entrega_real)}</p>
                  </div>
                )}
              </section>

              {/* Evidencias */}
              {evidencias.length > 0 && (
                <section className="surface-panel p-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Camera size={13} /> Evidencias
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {evidencias.map((ev) => (
                      <div key={ev.id} className="relative group cursor-pointer" onClick={() => setLightbox(ev.foto_url)}>
                        <img
                          src={ev.foto_url}
                          alt={ev.tipo}
                          className="w-full h-24 object-cover rounded-lg border border-gray-200 group-hover:opacity-80 transition-opacity"
                        />
                        <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded capitalize">
                          {ev.tipo}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Eventos */}
              <section className="surface-panel p-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Eventos</h3>
                <EventTimeline eventos={historial} estadoActual={pedido.estado} usuarios={usuarios} />
              </section>
            </div>
          ) : (
            <div className="p-5 text-center text-gray-400">Pedido no encontrado</div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      <Modal
        open={confirmando !== null}
        onClose={() => setConfirmando(null)}
        title="Confirmar acción"
      >
        <p className="text-sm text-gray-600 mb-4">
          ¿Estás seguro de que quieres cambiar el estado a{' '}
          <strong>{confirmando ? confirmando.replace(/_/g, ' ') : ''}</strong>?
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setConfirmando(null)}>Cancelar</Button>
          <Button
            onClick={() => confirmando && cambiarEstado(confirmando)}
            loading={accionLoading}
          >
            <CheckCircle size={16} /> Confirmar
          </Button>
        </div>
      </Modal>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Evidencia" className="max-w-full max-h-full rounded-xl" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300">
            <X size={28} />
          </button>
        </div>
      )}
    </>
  )
}
