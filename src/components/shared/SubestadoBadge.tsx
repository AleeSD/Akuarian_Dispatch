import { SUBESTADO_MAP, SUBESTADO_TONO_CLS } from '../../lib/subestados'
import { cn } from '../../lib/utils'

interface SubestadoBadgeProps {
  codigo: string | null
  className?: string
}

export function SubestadoBadge({ codigo, className }: SubestadoBadgeProps) {
  if (!codigo) return null
  const def = SUBESTADO_MAP[codigo]
  const label = def?.label ?? codigo
  const tono = def?.tono ?? 'neutral'
  return (
    <span
      title={def?.descripcion}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        SUBESTADO_TONO_CLS[tono],
        className,
      )}
    >
      {label}
    </span>
  )
}
