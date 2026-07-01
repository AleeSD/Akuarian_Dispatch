import { useEffect, useState } from 'react'
import { AlertTriangle, XCircle, Clock, PackageX, RefreshCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { VAlerta } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { KpiStrip } from '../components/ui/KpiStrip'
import type { Kpi } from '../components/ui/KpiStrip'
import { EmptyState } from '../components/ui/EmptyState'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { SkeletonCard } from '../components/ui/Skeleton'
import { PedidoDetalle } from './PedidoDetalle'
import { formatFecha } from '../lib/utils'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

export default function Alertas() {
  const [alertas, setAlertas] = useState<VAlerta[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function fetchAlertas() {
    setLoading(true)
    const { data } = await supabase.from('v_alertas').select('*').order('fecha_programada', { ascending: false })
    setAlertas((data as VAlerta[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAlertas() }, [])

  const kpis: Kpi[] = [
    { label: 'Total alertas', value: alertas.length, tone: 'coral', icon: <AlertTriangle size={18} /> },
    { label: 'No entregadas', value: alertas.filter((a) => a.alerta_no_entregado).length, tone: 'coral', icon: <XCircle size={18} /> },
    { label: 'Fuera de ventana', value: alertas.filter((a) => a.alerta_fuera_ventana).length, tone: 'lavanda', icon: <Clock size={18} /> },
    { label: 'Entregas parciales', value: alertas.filter((a) => a.alerta_parcial).length, tone: 'celeste', icon: <PackageX size={18} /> },
    { label: 'Reintentos excedidos', value: alertas.filter((a) => a.alerta_reintentos).length, tone: 'neutral', icon: <RefreshCcw size={18} /> },
  ]

  function badges(a: VAlerta) {
    const items: { label: string; cls: string }[] = []
    if (a.alerta_no_entregado) items.push({ label: 'No entregado', cls: 'bg-coral-100 text-coral-700' })
    if (a.alerta_fuera_ventana) items.push({ label: 'Fuera de ventana', cls: 'bg-lavanda-100 text-lavanda-700' })
    if (a.alerta_parcial) items.push({ label: 'Entrega parcial', cls: 'bg-amber-100 text-amber-700' })
    if (a.alerta_reintentos) items.push({ label: 'Reintentos excedidos', cls: 'bg-gray-200 text-gray-700' })
    return items
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Alertas</h1>
          <p className="text-sm text-gray-500">Pedidos que requieren atención de la operación</p>
        </div>

        <KpiStrip items={kpis} />

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : alertas.length === 0 ? (
          <Card className="p-2">
            <EmptyState icon={<AlertTriangle size={40} />} title="Sin alertas activas"
              description="No hay pedidos con incidencias en este momento." />
          </Card>
        ) : (
          <div className="space-y-2">
            {alertas.map((a) => (
              <Card key={a.id} className="p-4" onClick={() => setSelectedId(a.id)}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-bold text-celeste-700">{a.numero_pedido}</span>
                      <EstadoBadge estado={a.estado} />
                      {badges(a).map((b) => (
                        <span key={b.label} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
                      ))}
                    </div>
                    <p className="text-sm font-medium text-gray-800 truncate">{a.cliente_nombre ?? '—'}</p>
                    <p className="text-xs text-gray-500">
                      {a.ruta_nombre ?? 'Sin ruta'}{a.repartidor_nombre ? ` · ${a.repartidor_nombre}` : ''}
                      {a.ventana_inicio && a.ventana_fin ? ` · CITA ${hhmm(a.ventana_inicio)}–${hhmm(a.ventana_fin)}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{formatFecha(a.fecha_programada)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedId && (
        <PedidoDetalle pedidoId={selectedId} onClose={() => setSelectedId(null)} onUpdated={fetchAlertas} />
      )}
    </Layout>
  )
}
