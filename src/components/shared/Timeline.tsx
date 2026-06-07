import { CheckCircle, Circle } from 'lucide-react'
import type { HistorialEstado, EstadoPedido } from '../../types'
import { ESTADO_LABELS, formatFechaHora } from '../../lib/utils'

const ESTADOS_ORDEN: EstadoPedido[] = [
  'recibido', 'verificado', 'en_preparacion', 'listo_despacho',
  'recogido', 'en_camino', 'entregado',
]

interface TimelineProps {
  historial: HistorialEstado[]
  estadoActual: EstadoPedido
}

export function Timeline({ historial, estadoActual }: TimelineProps) {
  const completados = new Set(historial.map((h) => h.estado_nuevo))

  return (
    <div className="space-y-0">
      {ESTADOS_ORDEN.map((estado, i) => {
        const registro = historial.find((h) => h.estado_nuevo === estado)
        const esActual = estadoActual === estado
        const esPasado = completados.has(estado)
        const esUltimo = i === ESTADOS_ORDEN.length - 1

        return (
          <div key={estado} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`rounded-full flex-shrink-0 ${esPasado || esActual ? 'text-celeste-500' : 'text-gray-300'}`}>
                {esPasado || esActual ? (
                  <CheckCircle size={18} />
                ) : (
                  <Circle size={18} />
                )}
              </div>
              {!esUltimo && (
                <div className={`w-0.5 flex-1 my-1 ${esPasado ? 'bg-celeste-300' : 'bg-gray-200'}`} style={{ minHeight: 20 }} />
              )}
            </div>
            <div className="pb-4 min-w-0">
              <p className={`text-sm font-medium ${esActual ? 'text-celeste-700' : esPasado ? 'text-gray-800' : 'text-gray-400'}`}>
                {ESTADO_LABELS[estado]}
              </p>
              {registro && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatFechaHora(registro.cambiado_en)}
                </p>
              )}
            </div>
          </div>
        )
      })}

      {(estadoActual === 'no_entregado' || estadoActual === 'reprogramado') && (
        <div className="flex gap-3">
          <div className="text-coral-500 flex-shrink-0">
            <CheckCircle size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-coral-700">
              {ESTADO_LABELS[estadoActual]}
            </p>
            {historial.find((h) => h.estado_nuevo === estadoActual) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatFechaHora(historial.find((h) => h.estado_nuevo === estadoActual)!.cambiado_en)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
