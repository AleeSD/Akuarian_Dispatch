import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, CheckCircle, Truck, AlertCircle, Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { VResumenDia, VPedidoDetalle, Ruta, Repartidor } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { SkeletonCard, Skeleton } from '../components/ui/Skeleton'
import { formatHora, today } from '../lib/utils'

function MetricCard({
  label, value, icon: Icon, color, progress,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  progress: number
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={16} className="text-current" />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-800 mb-3">{value}</p>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${color.replace('bg-', 'bg-').split(' ')[0]}`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const [resumen, setResumen] = useState<VResumenDia | null>(null)
  const [pedidosRecientes, setPedidosRecientes] = useState<VPedidoDetalle[]>([])
  const [rutas, setRutas] = useState<(Ruta & { repartidor?: Repartidor })[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetchDashboard() {
      const [resumenRes, pedidosRes, rutasRes] = await Promise.all([
        supabase.from('v_resumen_dia').select('*').single(),
        supabase.from('v_pedidos_detalle').select('*').eq('fecha_programada', today()).order('creado_en', { ascending: false }).limit(10),
        supabase.from('rutas').select('*, repartidor:repartidores(*)').eq('fecha', today()).in('estado', ['pendiente', 'en_curso']),
      ])

      setResumen(resumenRes.data)
      setPedidosRecientes(pedidosRes.data ?? [])
      setRutas((rutasRes.data as (Ruta & { repartidor?: Repartidor })[]) ?? [])
      setLoading(false)
    }
    fetchDashboard()
  }, [])

  const total = resumen?.total_pedidos ?? 0

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Inicio</h1>
          <p className="text-sm text-gray-500">Resumen del día de hoy</p>
        </div>

        {/* Metric cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-1.5 w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
            <MetricCard
              label="Total del día"
              value={total}
              icon={Package}
              color="bg-celeste-50 text-celeste-500"
              progress={100}
            />
            <MetricCard
              label="Entregados"
              value={resumen?.entregados ?? 0}
              icon={CheckCircle}
              color="bg-menta-50 text-menta-500"
              progress={total > 0 ? ((resumen?.entregados ?? 0) / total) * 100 : 0}
            />
            <MetricCard
              label="En camino"
              value={(resumen?.en_camino ?? 0) + (resumen?.recogidos ?? 0)}
              icon={Truck}
              color="bg-lavanda-50 text-lavanda-500"
              progress={total > 0 ? (((resumen?.en_camino ?? 0) + (resumen?.recogidos ?? 0)) / total) * 100 : 0}
            />
            <MetricCard
              label="Pendientes"
              value={(resumen?.recibidos ?? 0) + (resumen?.no_entregados ?? 0)}
              icon={AlertCircle}
              color="bg-coral-50 text-coral-500"
              progress={total > 0 ? (((resumen?.recibidos ?? 0) + (resumen?.no_entregados ?? 0)) / total) * 100 : 0}
            />
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recent orders */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="font-semibold text-gray-800">Pedidos recientes</h2>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : pedidosRecientes.length === 0 ? (
              <Card className="p-8 text-center text-gray-400">
                <Package size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay pedidos para hoy</p>
              </Card>
            ) : (
              <div className="space-y-2 animate-fadeIn">
                {pedidosRecientes.map((p) => (
                  <Card
                    key={p.id}
                    className="p-3.5"
                    onClick={() => navigate(`/pedidos/${p.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-celeste-700">{p.numero_pedido}</span>
                          <EstadoBadge estado={p.estado} />
                          {(p.total_evidencias ?? 0) > 0 && (
                            <Camera size={13} className="text-menta-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5 truncate">{p.cliente_nombre} — {p.distrito_entrega}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {p.repartidor_nombre && <RepartidorAvatar nombre={p.repartidor_nombre} size="sm" />}
                        <span className="text-xs text-gray-400">{formatHora(p.creado_en)}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Active routes */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-800">Rutas activas</h2>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : rutas.length === 0 ? (
              <Card className="p-6 text-center text-gray-400">
                <p className="text-sm">No hay rutas activas</p>
              </Card>
            ) : (
              <div className="space-y-2 animate-fadeIn">
                {rutas.map((ruta) => {
                  const pct = ruta.total_pedidos > 0
                    ? Math.round((ruta.entregados / ruta.total_pedidos) * 100)
                    : 0
                  return (
                    <Card key={ruta.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{ruta.nombre}</p>
                          {ruta.repartidor && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <RepartidorAvatar nombre={(ruta.repartidor as Repartidor).nombre} size="sm" />
                              <span className="text-xs text-gray-500">{(ruta.repartidor as Repartidor).nombre}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{ruta.entregados}/{ruta.total_pedidos}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-menta-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
