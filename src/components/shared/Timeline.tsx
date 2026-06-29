import { parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { HistorialEstado, EstadoPedido } from '../../types'
import { ESTADO_LABELS, formatHora } from '../../lib/utils'

interface EventTimelineProps {
  eventos: HistorialEstado[]
  estadoActual: EstadoPedido
  /** Mapa usuario_id → nombre para mostrar el autor del evento. */
  usuarios?: Record<string, string>
}

function fechaLarga(iso: string): string {
  try {
    return format(parseISO(iso), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  } catch {
    return iso
  }
}

/**
 * Log de eventos cronológico (estilo DispatchTrack/Beetrack): agrupado por día,
 * con la transición de estado, la hora y el autor. Más reciente primero.
 */
export function EventTimeline({ eventos, estadoActual, usuarios }: EventTimelineProps) {
  if (eventos.length === 0) {
    return (
      <div className="flex gap-3">
        <span className="mt-1 w-2.5 h-2.5 rounded-full bg-celeste-500 flex-shrink-0 ring-4 ring-celeste-50" />
        <div>
          <p className="text-sm font-medium text-gray-800">{ESTADO_LABELS[estadoActual]}</p>
          <p className="text-xs text-gray-400">Estado actual · sin historial de eventos</p>
        </div>
      </div>
    )
  }

  const ordenados = [...eventos].sort((a, b) => b.cambiado_en.localeCompare(a.cambiado_en))

  const grupos: { fecha: string; items: HistorialEstado[] }[] = []
  for (const ev of ordenados) {
    const dia = ev.cambiado_en.slice(0, 10)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === dia) ultimo.items.push(ev)
    else grupos.push({ fecha: dia, items: [ev] })
  }

  return (
    <div className="space-y-4">
      {grupos.map((grupo) => (
        <div key={grupo.fecha}>
          <p className="text-xs font-semibold text-gray-500 mb-2 capitalize">
            {fechaLarga(grupo.items[0].cambiado_en)}
          </p>
          <div className="space-y-0">
            {grupo.items.map((ev, i) => {
              const autor = ev.usuario_id ? usuarios?.[ev.usuario_id] : null
              return (
                <div key={ev.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-celeste-500 flex-shrink-0 ring-4 ring-celeste-50" />
                    {i < grupo.items.length - 1 && (
                      <span className="w-0.5 flex-1 bg-gray-200 my-1" style={{ minHeight: 18 }} />
                    )}
                  </div>
                  <div className="pb-4 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{ESTADO_LABELS[ev.estado_nuevo]}</p>
                    {ev.estado_anterior && (
                      <p className="text-xs text-gray-400">desde {ESTADO_LABELS[ev.estado_anterior]}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      Registrado: {formatHora(ev.cambiado_en)}{autor ? ` · ${autor}` : ''}
                    </p>
                    {ev.motivo && <p className="text-xs text-gray-400 mt-0.5">{ev.motivo}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
