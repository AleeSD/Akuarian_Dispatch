import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, X, CheckCircle, XCircle, PackageCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import type { VRepartidorMisPedido, EstadoPedido, MotivoNoEntrega } from '../../types'
import { EstadoBadge } from '../../components/shared/EstadoBadge'
import { Button } from '../../components/ui/Button'
import { MOTIVO_LABELS } from '../../lib/utils'
import { commitAccion, encolarAccion, generarId } from '../../lib/offline'
import type { AccionPendiente } from '../../lib/offline'
import { useAuth } from '../../context/AuthContext'
import { useConfiguracion } from '../../hooks/useConfiguracion'
import { FirmaPad } from '../../components/shared/FirmaPad'
import type { FirmaPadHandle } from '../../components/shared/FirmaPad'

type AccionTipo = 'recogido' | 'entregado' | 'no_entregado'

const MOTIVOS: MotivoNoEntrega[] = [
  'cliente_ausente', 'direccion_incorrecta', 'rechazo_cliente',
  'producto_danado', 'zona_inaccesible', 'otro',
]

export default function PedidoAccion() {
  const { pedidoId } = useParams<{ pedidoId: string }>()
  const navigate = useNavigate()
  const { repartidorId } = useAuth()
  const cfg = useConfiguracion()

  const [pedido, setPedido] = useState<VRepartidorMisPedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [accion, setAccion] = useState<AccionTipo | null>(null)
  const [motivo, setMotivo] = useState<MotivoNoEntrega | null>(null)
  const [detalleMotivo, setDetalleMotivo] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Fase 2: cierre de entrega
  const [receptor, setReceptor] = useState('')
  const [dni, setDni] = useState('')
  const [bultosEntregados, setBultosEntregados] = useState<number | null>(null)
  const [firmaVacia, setFirmaVacia] = useState(true)
  const firmaRef = useRef<FirmaPadHandle>(null)

  useEffect(() => {
    if (!pedidoId) return
    supabase
      .from('v_repartidor_mis_pedidos')
      .select('*')
      .eq('id', pedidoId)
      .single()
      .then(({ data }) => {
        setPedido(data)
        setLoading(false)
      })
  }, [pedidoId])

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFoto(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  function removeFoto() {
    setFoto(null)
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Requerimiento de foto según la configuración global (Fase 0.6),
  // condicionado además al flag por pedido `requiere_foto`.
  const fotoRequerida = (pedido?.requiere_foto ?? false) && (
    accion === 'entregado' ? cfg.getBool('foto_requerida_entrega', true)
    : accion === 'no_entregado' ? cfg.getBool('foto_requerida_no_entrega', true)
    : true
  )

  // Firma requerida solo en la entrega, según configuración (Fase 0.6 / 2.1)
  const firmaRequerida = accion === 'entregado' && cfg.getBool('requiere_firma_entrega', false)

  const puedeConfirmar = accion !== null && (
    !fotoRequerida || foto !== null
  ) && (
    accion !== 'no_entregado' || motivo !== null
  ) && (
    !firmaRequerida || !firmaVacia
  )

  async function confirmar() {
    if (!pedido || !accion || !pedidoId) return
    setSaving(true)

    const estadoNuevo: EstadoPedido = accion === 'recogido' ? 'recogido'
      : accion === 'entregado' ? 'entregado'
      : 'no_entregado'

    const total = pedido.bultos
    const entregados = accion === 'entregado' ? (bultosEntregados ?? total) : null
    const firmaBlob = accion === 'entregado' ? await firmaRef.current?.getBlob() ?? null : null

    const item: AccionPendiente = {
      id: generarId(),
      pedidoId,
      numeroPedido: pedido.numero_pedido,
      accion,
      estadoNuevo,
      repartidorId: repartidorId ?? null,
      motivo: accion === 'no_entregado' ? motivo : null,
      detalleMotivo: detalleMotivo || undefined,
      receptor: receptor.trim() || undefined,
      dni: dni.trim() || undefined,
      bultosEntregados: entregados,
      subestado: accion === 'entregado' && entregados != null && entregados < total ? 'entrega_con_observaciones' : null,
      fotoBlob: foto,
      firmaBlob,
      creadoEn: Date.now(),
    }

    const okMsg = accion === 'recogido' ? 'Pedido marcado como recogido'
      : accion === 'entregado' ? '¡Entrega confirmada!'
      : 'Pedido registrado como no entregado'

    try {
      if (!navigator.onLine) {
        await encolarAccion(item)
        toast.success('Guardado sin conexión. Se enviará al reconectar.', { icon: '📴' })
        navigate('/mi-ruta')
        return
      }
      await commitAccion(item)
      toast.success(okMsg)
      navigate('/mi-ruta')
    } catch (e) {
      // Si la falla fue por pérdida de red, encolar en lugar de perder el trabajo
      if (!navigator.onLine) {
        await encolarAccion(item)
        toast.success('Sin conexión: acción guardada en cola.', { icon: '📴' })
        navigate('/mi-ruta')
      } else {
        toast.error(e instanceof Error ? e.message : 'Error al confirmar')
      }
    } finally {
      setSaving(false)
    }
  }

  const tipoFotoLabel = accion === 'recogido' ? 'Foto de recogida'
    : accion === 'entregado' ? 'Foto de entrega'
    : accion === 'no_entregado' ? 'Foto de no entrega'
    : 'Foto de evidencia'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-celeste-500 border-t-transparent" />
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-gray-500">Pedido no encontrado</p>
      </div>
    )
  }

  const mostrarRecogido = ['listo_despacho'].includes(pedido.estado)
  const mostrarEntregado = ['recogido', 'en_camino'].includes(pedido.estado)
  const mostrarNoEntregado = ['recogido', 'en_camino'].includes(pedido.estado)

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate('/mi-ruta')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="font-mono font-bold text-celeste-700">{pedido.numero_pedido}</p>
          <EstadoBadge estado={pedido.estado} />
        </div>
      </header>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4 pb-28">
        {/* Pedido info */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-1.5">
          <p className="font-semibold text-gray-800 text-lg">{pedido.cliente_nombre}</p>
          <p className="text-sm text-gray-600">{pedido.direccion_entrega}</p>
          {pedido.distrito_entrega && <p className="text-sm text-gray-500">{pedido.distrito_entrega}</p>}
          {pedido.referencia_entrega && (
            <p className="text-xs text-gray-400 italic">{pedido.referencia_entrega}</p>
          )}
          {pedido.observaciones && (
            <div className="flex items-start gap-1.5 mt-2 bg-amber-50 rounded-lg p-2">
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{pedido.observaciones}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Actualizar estado</h2>

          {mostrarRecogido && (
            <button
              onClick={() => setAccion(accion === 'recogido' ? null : 'recogido')}
              className={`w-full h-14 rounded-xl text-lg font-semibold flex items-center justify-center gap-3 transition-all ${
                accion === 'recogido'
                  ? 'bg-celeste-500 text-white shadow-lg scale-[1.01]'
                  : 'bg-celeste-50 text-celeste-700 border-2 border-celeste-200'
              }`}
            >
              <PackageCheck size={22} />
              Marcar como Recogido
            </button>
          )}

          {mostrarEntregado && (
            <button
              onClick={() => setAccion(accion === 'entregado' ? null : 'entregado')}
              className={`w-full h-14 rounded-xl text-lg font-semibold flex items-center justify-center gap-3 transition-all ${
                accion === 'entregado'
                  ? 'bg-menta-500 text-white shadow-lg scale-[1.01]'
                  : 'bg-menta-50 text-menta-700 border-2 border-menta-100'
              }`}
            >
              <CheckCircle size={22} />
              Confirmar Entrega
            </button>
          )}

          {mostrarNoEntregado && (
            <button
              onClick={() => setAccion(accion === 'no_entregado' ? null : 'no_entregado')}
              className={`w-full h-14 rounded-xl text-lg font-semibold flex items-center justify-center gap-3 transition-all ${
                accion === 'no_entregado'
                  ? 'bg-coral-500 text-white shadow-lg scale-[1.01]'
                  : 'bg-coral-50 text-coral-700 border-2 border-coral-100'
              }`}
            >
              <XCircle size={22} />
              No pude entregar
            </button>
          )}
        </div>

        {/* Motivo no entrega */}
        {accion === 'no_entregado' && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 animate-fadeIn">
            <h3 className="text-sm font-semibold text-gray-700">Motivo de no entrega</h3>
            <div className="space-y-2">
              {MOTIVOS.map((m) => (
                <label key={m} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="motivo"
                    value={m}
                    checked={motivo === m}
                    onChange={() => setMotivo(m)}
                    className="text-coral-500"
                  />
                  <span className="text-sm text-gray-700">{MOTIVO_LABELS[m]}</span>
                </label>
              ))}
            </div>
            {motivo === 'otro' && (
              <textarea
                className="w-full rounded-lg border border-gray-200 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-coral-300 resize-none"
                placeholder="Describe el motivo..."
                rows={3}
                value={detalleMotivo}
                onChange={(e) => setDetalleMotivo(e.target.value)}
              />
            )}
          </div>
        )}

        {/* Cierre de entrega: receptor, DNI, bultos parciales y firma (Fase 2) */}
        {accion === 'entregado' && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 animate-fadeIn">
            <h3 className="text-sm font-semibold text-gray-700">Datos de entrega</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Recibido por</label>
                <input
                  value={receptor}
                  onChange={(e) => setReceptor(e.target.value)}
                  placeholder="Nombre"
                  className="w-full mt-1 rounded-lg border border-gray-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-menta-300"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">DNI</label>
                <input
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  placeholder="00000000"
                  className="w-full mt-1 rounded-lg border border-gray-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-menta-300"
                />
              </div>
            </div>

            {pedido.bultos > 1 && (
              <div>
                <label className="text-xs text-gray-500">Bultos entregados (de {pedido.bultos})</label>
                <input
                  type="number"
                  min={1}
                  max={pedido.bultos}
                  value={bultosEntregados ?? pedido.bultos}
                  onChange={(e) => setBultosEntregados(Math.max(1, Math.min(pedido.bultos, Number(e.target.value) || pedido.bultos)))}
                  className="w-full mt-1 rounded-lg border border-gray-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-menta-300"
                />
                {(bultosEntregados ?? pedido.bultos) < pedido.bultos && (
                  <p className="text-xs text-amber-600 mt-1">
                    Entrega parcial: {bultosEntregados ?? pedido.bultos}/{pedido.bultos} bultos
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                Firma del receptor
                {firmaRequerida && <span className="text-amber-500 text-xs font-normal">· Requerida</span>}
              </div>
              <FirmaPad ref={firmaRef} onChange={setFirmaVacia} />
            </div>
          </div>
        )}

        {/* Photo upload */}
        {accion && (
          <div className="space-y-2 animate-fadeIn">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Camera size={14} /> {tipoFotoLabel}
              {fotoRequerida && (
                <span className="text-amber-500 normal-case text-xs font-normal flex items-center gap-1 ml-1">
                  <AlertTriangle size={12} /> Requerida
                </span>
              )}
            </h3>

            {fotoPreview ? (
              <div className="relative inline-block">
                <img
                  src={fotoPreview}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-xl border border-gray-200"
                />
                <button
                  onClick={removeFoto}
                  className="absolute -top-2 -right-2 bg-coral-500 text-white rounded-full p-0.5 shadow-md"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="block">
                <div className="border-2 border-dashed border-celeste-300 rounded-xl p-8 text-center cursor-pointer hover:bg-celeste-50 transition-colors">
                  <Camera size={48} className="mx-auto mb-2 text-celeste-500" />
                  <p className="text-sm font-medium text-celeste-700">{tipoFotoLabel}</p>
                  <p className="text-xs text-gray-400 mt-1">Toca para abrir la cámara</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFoto}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Sticky confirm button */}
      {accion && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 max-w-lg mx-auto">
          <Button
            className="w-full h-14 text-base"
            onClick={confirmar}
            loading={saving}
            disabled={!puedeConfirmar}
            variant={accion === 'entregado' ? 'success' : accion === 'no_entregado' ? 'danger' : 'primary'}
          >
            {saving ? 'Guardando...' :
              accion === 'recogido' ? 'Confirmar recogida' :
              accion === 'entregado' ? 'Confirmar entrega' :
              'Confirmar no entrega'}
          </Button>
        </div>
      )}
    </div>
  )
}
