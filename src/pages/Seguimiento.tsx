import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Truck, Package, CheckCircle, XCircle, MapPin, Clock, CalendarDays, Phone, AlertTriangle, Star,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ESTADO_LABELS, formatFecha, formatFechaHora } from '../lib/utils'
import type { EstadoPedido } from '../types'

interface SeguimientoData {
  numero_pedido: string
  estado: EstadoPedido
  subestado: string | null
  distrito: string | null
  direccion: string | null
  referencia: string | null
  fecha_programada: string | null
  fecha_entrega_real: string | null
  recogido_en: string | null
  bultos: number
  ventana_inicio: string | null
  ventana_fin: string | null
  cliente: string | null
  repartidor: string | null
  empresa: string | null
  empresa_telefono: string | null
  calificacion: number | null
  eventos: { estado: EstadoPedido; en: string }[]
}

// Etapas visibles del recorrido para el cliente (las excepciones se muestran aparte).
const ETAPAS: { estado: EstadoPedido; label: string }[] = [
  { estado: 'recibido', label: 'Recibido' },
  { estado: 'en_preparacion', label: 'En preparación' },
  { estado: 'listo_despacho', label: 'Listo' },
  { estado: 'en_camino', label: 'En camino' },
  { estado: 'entregado', label: 'Entregado' },
]

function indiceEtapa(estado: EstadoPedido): number {
  // mapea estados intermedios a la etapa visible más cercana
  const map: Record<EstadoPedido, number> = {
    recibido: 0, verificado: 0, en_preparacion: 1, listo_despacho: 2,
    recogido: 3, en_camino: 3, entregado: 4, no_entregado: 3, reprogramado: 0,
  }
  return map[estado] ?? 0
}

export default function Seguimiento() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<SeguimientoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [noEncontrado, setNoEncontrado] = useState(false)

  useEffect(() => {
    if (!token) return
    supabase.rpc('seguimiento_pedido', { p_token: token }).then(({ data, error }) => {
      if (error || !data) setNoEncontrado(true)
      else setData(data as SeguimientoData)
      setLoading(false)
    })
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-celeste-500 border-t-transparent" />
      </div>
    )
  }

  if (noEncontrado || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F9FC] p-6 text-center">
        <AlertTriangle size={40} className="text-amber-400 mb-3" />
        <h1 className="text-lg font-semibold text-gray-800">Pedido no encontrado</h1>
        <p className="text-sm text-gray-500 mt-1">El enlace de seguimiento no es válido o expiró.</p>
      </div>
    )
  }

  const noEntregado = data.estado === 'no_entregado'
  const entregado = data.estado === 'entregado'
  const idxActual = indiceEtapa(data.estado)

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      {/* Top bar */}
      <header className="bg-celeste-900 text-white px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <div className="bg-white/15 rounded-lg p-1.5"><Truck size={18} /></div>
          <span className="font-bold">{data.empresa ?? 'Akuarian Dispatch'}</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Estado principal */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Seguimiento de pedido</p>
          <p className="font-mono font-bold text-celeste-700 text-xl mt-1">{data.numero_pedido}</p>
          <div className="mt-3 inline-flex items-center gap-2">
            {entregado ? <CheckCircle className="text-menta-500" size={22} />
              : noEntregado ? <XCircle className="text-coral-500" size={22} />
              : <Truck className="text-celeste-500" size={22} />}
            <span className={`text-lg font-semibold ${entregado ? 'text-menta-700' : noEntregado ? 'text-coral-700' : 'text-celeste-700'}`}>
              {ESTADO_LABELS[data.estado]}
            </span>
          </div>
          {entregado && data.fecha_entrega_real && (
            <p className="text-sm text-gray-500 mt-1">Entregado el {formatFechaHora(data.fecha_entrega_real)}</p>
          )}
        </div>

        {/* Stepper de etapas */}
        {!noEntregado && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              {ETAPAS.map((et, i) => {
                const hecho = i <= idxActual
                const actual = i === idxActual
                return (
                  <div key={et.estado} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && (
                      <div className={`absolute right-1/2 top-3 h-0.5 w-full -z-0 ${i <= idxActual ? 'bg-celeste-400' : 'bg-gray-200'}`} />
                    )}
                    <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                      ${hecho ? 'bg-celeste-500 text-white' : 'bg-gray-200 text-gray-400'} ${actual ? 'ring-4 ring-celeste-100' : ''}`}>
                      {i + 1}
                    </div>
                    <span className={`mt-1.5 text-[10px] text-center ${hecho ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{et.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {noEntregado && (
          <div className="bg-coral-50 border border-coral-100 rounded-2xl p-4 flex items-start gap-2">
            <AlertTriangle size={16} className="text-coral-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-coral-700">No pudimos completar la entrega. Nos pondremos en contacto para coordinar un nuevo intento.</p>
          </div>
        )}

        {/* Detalles */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 shadow-sm">
          <Detalle icon={<MapPin size={15} />} label="Dirección de entrega"
            value={[data.direccion, data.distrito].filter(Boolean).join(' — ') || '—'} hint={data.referencia} />
          <Detalle icon={<CalendarDays size={15} />} label="Fecha programada" value={formatFecha(data.fecha_programada)} />
          {data.ventana_inicio && data.ventana_fin && (
            <Detalle icon={<Clock size={15} />} label="Ventana de entrega (CITA)"
              value={`${data.ventana_inicio.slice(0, 5)}–${data.ventana_fin.slice(0, 5)}`} />
          )}
          <Detalle icon={<Package size={15} />} label="Bultos" value={`${data.bultos}`} />
          {data.repartidor && <Detalle icon={<Truck size={15} />} label="Repartidor" value={data.repartidor} />}
        </div>

        {/* Timeline de eventos */}
        {data.eventos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Clock size={13} /> Historial
            </h2>
            <ol className="space-y-3">
              {[...data.eventos].reverse().map((ev, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-celeste-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{ESTADO_LABELS[ev.estado] ?? ev.estado}</p>
                    <p className="text-xs text-gray-400">{formatFechaHora(ev.en)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Calificación / NPS (Fase 3.4) */}
        {entregado && <Calificacion token={token!} inicial={data.calificacion} />}

        {/* Contacto */}
        {data.empresa_telefono && (
          <a href={`tel:${data.empresa_telefono}`}
             className="block text-center text-sm text-celeste-600 hover:text-celeste-700 py-2">
            <Phone size={13} className="inline mr-1" /> ¿Dudas? Contáctanos: {data.empresa_telefono}
          </a>
        )}

        <p className="text-center text-[11px] text-gray-400 pb-4">
          {data.empresa ?? 'Akuarian'} · Seguimiento de despachos
        </p>
      </div>
    </div>
  )
}

function Calificacion({ token, inicial }: { token: string; inicial: number | null }) {
  const [valor, setValor] = useState(inicial ?? 0)
  const [hover, setHover] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviada, setEnviada] = useState(inicial != null)
  const [guardando, setGuardando] = useState(false)

  async function enviar() {
    if (valor < 1) return
    setGuardando(true)
    const { data, error } = await supabase.rpc('registrar_resena', {
      p_token: token, p_calificacion: valor, p_comentario: comentario || null,
    })
    setGuardando(false)
    if (!error && data) setEnviada(true)
  }

  if (enviada) {
    return (
      <div className="bg-menta-50 border border-menta-200 rounded-2xl p-5 text-center">
        <div className="flex justify-center gap-1 mb-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={22} className={n <= valor ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
          ))}
        </div>
        <p className="text-sm text-menta-700 font-medium">¡Gracias por tu calificación!</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center">
      <p className="text-sm font-medium text-gray-700 mb-3">¿Cómo fue tu entrega?</p>
      <div className="flex justify-center gap-1.5 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setValor(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}>
            <Star size={30} className={n <= (hover || valor) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
          </button>
        ))}
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentario (opcional)"
        rows={2}
        className="w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-celeste-300 resize-none"
      />
      <button
        onClick={enviar}
        disabled={valor < 1 || guardando}
        className="mt-3 w-full bg-celeste-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:bg-gray-200 disabled:text-gray-400"
      >
        {guardando ? 'Enviando…' : 'Enviar calificación'}
      </button>
    </div>
  )
}

function Detalle({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-700">{value}</p>
        {hint && <p className="text-xs text-gray-400 italic">{hint}</p>}
      </div>
    </div>
  )
}
