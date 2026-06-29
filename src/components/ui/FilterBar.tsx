import { Filter, X } from 'lucide-react'
import { Button } from './Button'
import { cn } from '../../lib/utils'

interface FilterBarProps {
  children: React.ReactNode
  onFilter?: () => void
  onClear?: () => void
  className?: string
}

/**
 * Fila horizontal de controles de filtro (estilo Órdenes/Rutas de Beetrack).
 * Los hijos son los <Input>/<Select> existentes; los botones son opcionales.
 */
export function FilterBar({ children, onFilter, onClear, className }: FilterBarProps) {
  return (
    <div className={cn('surface-panel p-3 flex flex-wrap items-end gap-3', className)}>
      {children}
      {(onFilter || onClear) && (
        <div className="flex items-center gap-2 ml-auto">
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X size={14} /> Limpiar
            </Button>
          )}
          {onFilter && (
            <Button size="sm" onClick={onFilter}>
              <Filter size={14} /> Filtrar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
