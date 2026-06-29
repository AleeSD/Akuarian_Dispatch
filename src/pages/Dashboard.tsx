import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, CheckCircle, Truck, XCircle, Target, ClipboardCheck,
  SlidersHorizontal, X, Camera, Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { VPedidoDetalle, Ruta, Repartidor, EstadoPedido } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { KpiStrip } from '../components/ui/KpiStrip'
import type { Kpi } from '../components/ui/KpiStrip'
import { EmptyState } from '../components/ui/EmptyState'
import { EstadoBadge } from '../components/shared/EstadoBadge'
import { RepartidorAvatar } from '../components/shared/RepartidorAvatar'
import { SkeletonCard, Skeleton } from '../components/ui/Skeleton'
import { formatHora, formatFecha, today, cn } from '../lib/utils'

type PedidoDia = {
  id: string
  estado: EstadoPedido
  ruta_id: string | null
  recogido_en: string | null
  fecha_entrega_real: string | null
  creado_en: string
}
type RutaDia = Ruta & { repartidor?: Repartidor }

const START_H = 6
const END_H = 21

const EVENTO_COLOR: Partial<Record<EstadoPedido, string>> = {
  entregado: 'bg-menta-500',
  no_entregado: 'bg-coral-500',
  recogido: 'bg-celeste-500',
  en_camino: 'bg-celeste-500',
}

function TimelineHorario({ pedidos }: { pedidos: PedidoDia[] }) {
  const eventos = pedidos
    .map((p) => {
      const ts = p.fecha_entrega_real ?? p.recogido_en
      if (!ts) return null
      const d = new Date(ts)
      const hora = d.getHours() + d.getMinutes() / 60
      return { hora, estado: p.estado }
    })
    .filter((e): e is { hora: number; estado: EstadoPedido } => e !== null)

  const horas = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i)

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-celeste-500" />
        <h2 className="font-semibold text-gray-800">Actividad del día</h2>
        <span className="ml-auto text-xs text-gray-400">{eventos.length} evento{eventos.length !== 1 ? 's' : ''} con hora registrada</span>
      </div>
      {eventos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Sin recogidas ni entregas registradas para esta fecha</p>
      ) : (
        <div className="relative h-16">
          <div className="absolute inset-x-0 top-6 h-0.5 bg-gray-200" />
          {eventos.map((e, i) => {
            const pct = Math.min(100, Math.max(0, ((e.hora - START_H) / (END_H - START_H)) * 100))
            return (
              <div
                key={i}
                className={cn('absolute w-2.5 h-2.5 rounded-full ring-4 ring-white', EVENTO_COLOR[e.estado] ?? 'bg-gray-400')}
                style={{ left: `${pct}%`, top: 'calc(1.5rem - 4px)', transform: 'translateX(-50%)' }}
                title={`${Math.floor(e.hora)}:${String(Math.round((e.hora % 1) * 60)).padStart(2, '0')}`}
              />
            )
          })}
          <div className="absolute inset-x-0 top-10 flex justify-between">
            {horas.filter((_, i) => i % 3 === 0).map((h) => (
              <span key={h} className="text-[10px] text-gray-400">{String(h).padStart(2, '0')}:00</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState(today())
  const [pedidosDia, setPedidosDia] = useState<PedidoDia[]>([])
  const [rutasDia, setRutasDia] = useState<RutaDia[]>([])
  const [recientes, setRecientes] = useState<VPedidoDetalle[]>([])
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [loading, setLoading] = useState(true)

  const [repFiltro, setRepFiltro] = useState('')
  const [showFiltros, setShowFiltros] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [pedRes, rutasRes, recientesRes] = await Promise.all([
      supabase.from('pedidos').select('id, estado, ruta_id, recogido_en, fecha_entrega_real, creado_en').eq('fecha_programada', fecha),
      supabase.from('rutas').select('*, repartidor:repartidores(*)').eq('fecha', fecha),
      supabase.from('v_pedidos_detalle').select('*').eq('fecha_programada', fecha).order('creado_en', { ascending: false }).limit(8),
    ])
    setPedidosDia((pedRes.data as PedidoDia[]) ?? [])
    setRutasDia((rutasRes.data as RutaDia[]) ?? [])
    setRecientes(recientesRes.data ?? [])
    setLoading(false)
  }, [fecha])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    supabase.from('repartidores').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setRepartidores(data ?? [])
    })
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => fetchDashboard(true), 15000)
    return () => clearInterval(t)
  }, [autoRefresh, fetchDashboard])

  // Mapa ruta → repartidor para filtrar por unidad
  const rutaRep: Record<string, string | null> = {}
  rutasDia.forEach((r) => { rutaRep[r.id] = r.repartidor_id })

  const pedidosFiltrados = repFiltro
    ? pedidosDia.filter((p) => p.ruta_id && rutaRep[p.ruta_id] === repFiltro)
    : pedidosDia
  const rutasFiltradas = repFiltro ? rutasDia.filter((r) => r.repartidor_id === repFiltro) : rutasDia

  // KPIs
  const c = { asignadas: 0, entregadas: 0, noEntregadas: 0, recogidas: 0, enCamino: 0, reprogramadas: 0 }
  pedidosFiltrados.forEach((p) => {
    c.asignadas++
    if (p.estado === 'entregado') c.entregadas++
    else if (p.estado === 'no_entregado') c.noEntregadas++
    else if (p.estado === 'recogido') c.recogidas++
    else if (p.estado === 'en_camino') c.enCamino++
    else if (p.estado === 'reprogramado') c.reprogramadas++
  })
  const gestionadas = c.entregadas + c.noEntregadas + c.reprogramadas
  const cumplimiento = c.asignadas > 0 ? Math.round((c.entregadas / c.asignadas) * 100) : 0

  const kpis: Kpi[] = [
    { label: 'Cumplimiento', value: `${cumplimiento}%`, tone: 'celeste', icon: <Target size={16} /> },
    { label: 'Asignadas', value: c.asignadas, tone: 'neutral', icon: <Package size={16} /> },
    { label: 'Gestionadas', value: gestionadas, tone: 'lavanda', icon: <ClipboardCheck size={16} /> },
    { label: 'Entregadas', value: c.entregadas, tone: 'menta', icon: <CheckCircle size={16} /> },
    { label: 'En camino', value: c.recogidas + c.enCamino, tone: 'celeste', icon: <Truck size={16} /> },
    { label: 'No entregadas', value: c.noEntregadas, tone: 'coral', icon: <XCircle size={16} /> },
  ]

  function statsRuta(rutaId: string) {
    const ps = pedidosDia.filter((p) => p.ruta_id === rutaId)
    const asignadas = ps.length
    const recogidas = ps.filter((p) => p.estado === 'recogido' || p.estado === 'en_camino').length
    const entregas = ps.filter((p) => p.estado === 'entregado').length
    const gest = ps.filter((p) => ['entregado', 'no_entregado', 'reprogramado'].includes(p.estado)).length
    const pct = asignadas > 0 ? Math.round((entregas / asignadas) * 100) : 0
    return { asignadas, recogidas, entregas, gest, pct }
  }

  function limpiarFiltros() {
    setRepFiltro('')
    setFecha(today())
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Actividad</h1>
            <p className="text-sm text-gray-500">Resumen del {formatFecha(fecha)}{repFiltro && ' · filtrado por unidad'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={() => setShowFiltros(true)}>
              <SlidersHorizontal size={16} /> Filtros
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        {loading ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 flex-1 min-w-[140px]" />)}
          </div>
        ) : (
          <div className="animate-fadeIn"><KpiStrip items={kpis} /></div>
        )}

        {/* Timeline horario */}
        {loading ? <Skeleton className="h-32 w-full" /> : <TimelineHorario pedidos={pedidosFiltrados} />}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Unidades activas */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="font-semibold text-gray-800">Unidades del día</h2>
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : rutasFiltradas.length === 0 ? (
              <Card className="p-2"><EmptyState icon={<Truck size={32} />} title="Sin unidades para esta fecha" /></Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3 animate-fadeIn">
                {rutasFiltradas.map((ruta) => {
                  const s = statsRuta(ruta.id)
                  const rep = ruta.repartidor
                  return (
                    <Card key={ruta.id} className="p-4" onClick={() => navigate(`/rutas/${ruta.id}`)}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {rep ? <RepartidorAvatar nombre={rep.nombre} size="sm" /> : <Truck size={18} className="text-gray-300" />}
                          <div className="leading-tight min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{rep?.nombre ?? ruta.nombre}</p>
                            <p className="text-[10px] text-gray-400 truncate">{rep ? `${rep.vehiculo ?? ''} ${rep.placa ?? ''}`.trim() || ruta.nombre : ruta.nombre}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-celeste-700">{s.pct}%</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mb-3 text-center">
                        {[['Asign.', s.asignadas], ['Recog.', s.recogidas], ['Entreg.', s.entregas], ['Gest.', s.gest]].map(([l, v]) => (
                          <div key={l as string}>
                            <p className="text-sm font-bold text-gray-800">{v}</p>
                            <p className="text-[10px] text-gray-400">{l}</p>
                          </div>
                        ))}
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-menta-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${s.pct}%` }} />
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pedidos recientes */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-800">Pedidos recientes</h2>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
            ) : recientes.length === 0 ? (
              <Card className="p-2"><EmptyState icon={<Package size={32} />} title="No hay pedidos para esta fecha" /></Card>
            ) : (
              <div className="space-y-2 animate-fadeIn">
                {recientes.map((p) => (
                  <Card key={p.id} className="p-3.5" onClick={() => navigate(`/pedidos/${p.id}`)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-celeste-700">{p.numero_pedido}</span>
                      <EstadoBadge estado={p.estado} />
                      {(p.total_evidencias ?? 0) > 0 && <Camera size={13} className="text-menta-500" />}
                      <span className="ml-auto text-xs text-gray-400">{formatHora(p.creado_en)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{p.cliente_nombre} — {p.distrito_entrega}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel de filtros */}
      {showFiltros && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fadeIn" onClick={() => setShowFiltros(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-80 bg-white shadow-2xl flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2"><SlidersHorizontal size={18} /> Filtros</h2>
              <button onClick={() => setShowFiltros(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <Select label="Unidad / repartidor" value={repFiltro} onChange={(e) => setRepFiltro(e.target.value)}>
                <option value="">Todas las unidades</option>
                {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </Select>

              <label className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">Actualización automática</span>
                <input type="checkbox" className="rounded text-celeste-500 focus:ring-celeste-300" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              </label>
              {autoRefresh && <p className="text-[11px] text-gray-400 -mt-2">Refrescando cada 15 segundos.</p>}

              <div className="pt-2 border-t border-gray-100 space-y-3 opacity-50">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Próximamente</p>
                <Select label="Centro de distribución" disabled><option>Todos</option></Select>
                <Select label="Agrupaciones" disabled><option>Sin agrupar</option></Select>
                <label className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-700">Modo comprimido</span>
                  <input type="checkbox" disabled className="rounded" />
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={limpiarFiltros}>Limpiar</Button>
              <Button className="flex-1" onClick={() => setShowFiltros(false)}>Aplicar</Button>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
