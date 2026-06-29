import { useState, useMemo } from 'react'
import {
  ChevronUp, ChevronDown, ChevronsUpDown, MoreVertical, ChevronLeft, ChevronRight, Inbox,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  className?: string
  headerClassName?: string
}

export interface RowAction {
  label: string
  onClick: () => void
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  loading?: boolean
  selectable?: boolean
  selectedKeys?: Set<string>
  onSelectionChange?: (keys: Set<string>) => void
  rowActions?: (row: T) => RowAction[]
  onRowClick?: (row: T) => void
  pageSize?: number
  /** Slot superior: típicamente un <FilterBar> o acciones de cabecera. */
  toolbar?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/**
 * Tabla densa reutilizable (estilo DispatchTrack/Beetrack):
 * orden por columna, selección por fila + masiva, menú ⋮ por fila, paginación
 * y estados loading/empty integrados. Base de Pedidos, Rutas, Clientes, Alertas.
 */
export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  rowActions,
  onRowClick,
  pageSize = 10,
  toolbar,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  className,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  const sorted = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return data
    const getVal = col.sortValue ?? ((row: T) => {
      const v = (row as Record<string, unknown>)[sortKey]
      return typeof v === 'number' ? v : String(v ?? '')
    })
    return [...data].sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const paged = useMemo(
    () => sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [sorted, currentPage, pageSize],
  )

  const totalCols = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)

  const allKeys = data.map(rowKey)
  const allSelected = selectable && allKeys.length > 0 && allKeys.every((k) => selectedKeys?.has(k))
  const someSelected = selectable && allKeys.some((k) => selectedKeys?.has(k))

  function toggleSort(col: Column<T>) {
    if (!col.sortable) return
    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }

  function toggleAll() {
    if (!onSelectionChange) return
    const next = new Set(selectedKeys)
    if (allSelected) allKeys.forEach((k) => next.delete(k))
    else allKeys.forEach((k) => next.add(k))
    onSelectionChange(next)
  }

  function toggleRow(key: string) {
    if (!onSelectionChange) return
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange(next)
  }

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar}
      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {selectable && (
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-celeste-500 focus:ring-celeste-300"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = !allSelected && !!someSelected }}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col)}
                    className={cn(
                      'px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap',
                      ALIGN[col.align ?? 'left'],
                      col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : '',
                      col.headerClassName,
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        sortKey === col.key
                          ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
                          : <ChevronsUpDown size={13} className="text-gray-300" />
                      )}
                    </span>
                  </th>
                ))}
                {rowActions && <th className="w-10 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: totalCols }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="px-3 py-6">
                    <EmptyState icon={<Inbox size={32} />} title={emptyTitle} description={emptyDescription} />
                  </td>
                </tr>
              ) : (
                paged.map((row) => {
                  const key = rowKey(row)
                  const actions = rowActions?.(row) ?? []
                  return (
                    <tr
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'border-b border-gray-50 last:border-0',
                        onRowClick ? 'cursor-pointer hover:bg-gray-50' : '',
                        selectedKeys?.has(key) ? 'bg-celeste-50/40' : '',
                      )}
                    >
                      {selectable && (
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-celeste-500 focus:ring-celeste-300"
                            checked={selectedKeys?.has(key) ?? false}
                            onChange={() => toggleRow(key)}
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={cn('px-3 py-2.5 text-gray-700 align-middle', ALIGN[col.align ?? 'left'], col.className)}
                        >
                          {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              if (openMenu === key) { setOpenMenu(null); return }
                              const r = e.currentTarget.getBoundingClientRect()
                              setMenuPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
                              setOpenMenu(key)
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenu === key && menuPos && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                              <div
                                className="fixed z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 animate-fadeIn"
                                style={{ top: menuPos.top, right: menuPos.right }}
                              >
                                {actions.length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-gray-400">Sin acciones</p>
                                ) : actions.map((a, i) => (
                                  <button
                                    key={i}
                                    disabled={a.disabled}
                                    onClick={() => { setOpenMenu(null); a.onClick() }}
                                    className={cn(
                                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed',
                                      a.danger ? 'text-coral-700' : 'text-gray-700',
                                    )}
                                  >
                                    {a.icon}
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && sorted.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>
              Mostrando {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sorted.length)} de {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 font-medium text-gray-600">{currentPage + 1} / {totalPages}</span>
              <button
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
