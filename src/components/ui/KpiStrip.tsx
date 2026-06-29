import { cn } from '../../lib/utils'

export type KpiTone = 'celeste' | 'menta' | 'lavanda' | 'coral' | 'neutral'

export interface Kpi {
  label: string
  value: string | number
  tone?: KpiTone
  icon?: React.ReactNode
  hint?: string
}

const TONE_VALUE: Record<KpiTone, string> = {
  celeste: 'text-celeste-700',
  menta: 'text-menta-700',
  lavanda: 'text-lavanda-700',
  coral: 'text-coral-700',
  neutral: 'text-gray-800',
}

const TONE_ICON: Record<KpiTone, string> = {
  celeste: 'bg-celeste-50 text-celeste-500',
  menta: 'bg-menta-50 text-menta-500',
  lavanda: 'bg-lavanda-50 text-lavanda-500',
  coral: 'bg-coral-50 text-coral-500',
  neutral: 'bg-gray-100 text-gray-500',
}

interface KpiStripProps {
  items: Kpi[]
  className?: string
}

export function KpiStrip({ items, className }: KpiStripProps) {
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {items.map((kpi, i) => {
        const tone = kpi.tone ?? 'neutral'
        return (
          <div key={i} className="surface-panel px-4 py-3 flex items-center gap-3 flex-1 min-w-[140px]">
            {kpi.icon && (
              <div className={cn('p-2 rounded-lg flex-shrink-0', TONE_ICON[tone])}>{kpi.icon}</div>
            )}
            <div className="min-w-0">
              <p className={cn('text-xl font-bold leading-tight', TONE_VALUE[tone])}>{kpi.value}</p>
              <p className="text-xs text-gray-500 truncate" title={kpi.label}>{kpi.label}</p>
              {kpi.hint && <p className="text-[10px] text-gray-400 truncate">{kpi.hint}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
