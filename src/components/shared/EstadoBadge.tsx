import type { EstadoPedido } from '../../types'
import { ESTADO_LABELS } from '../../lib/utils'
import { cn } from '../../lib/utils'

const ESTADO_STYLES: Record<EstadoPedido, string> = {
  recibido:       'bg-gray-100 text-gray-600',
  verificado:     'bg-celeste-100 text-celeste-700',
  en_preparacion: 'bg-lavanda-50 text-lavanda-700',
  listo_despacho: 'bg-yellow-100 text-yellow-700',
  recogido:       'bg-orange-100 text-orange-700',
  en_camino:      'bg-blue-100 text-blue-700',
  entregado:      'bg-menta-100 text-menta-700',
  no_entregado:   'bg-coral-100 text-coral-700',
  reprogramado:   'bg-amber-100 text-amber-700',
}

interface EstadoBadgeProps {
  estado: EstadoPedido
  className?: string
  size?: 'sm' | 'md'
}

export function EstadoBadge({ estado, className, size = 'sm' }: EstadoBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium transition-colors duration-300',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        ESTADO_STYLES[estado],
        className,
      )}
    >
      {ESTADO_LABELS[estado]}
    </span>
  )
}
