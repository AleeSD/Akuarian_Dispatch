import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Download, Send, Package, CheckCircle, Target, Clock, Timer, Truck, Route,
} from 'lucide-react'
import { subDays, format, parseISO, getDay, differenceInMinutes } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { EstadoPedido } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { FilterBar } from '../components/ui/FilterBar'
import { KpiStrip } from '../components/ui/KpiStrip'
import type { Kpi } from '../components/ui/KpiStrip'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { formatFecha, cn } from '../lib/utils'
import { labelSubestado } from '../lib/subestados'
import { exportarXlsx } from '../lib/xlsx'
import type { XlsxCell } from '../lib/xlsx'
import toast from 'react-hot-toast'

type PedidoRow = {
  id: string
  numero_pedido: string
  estado: EstadoPedido
  fecha_programada: string
  ruta_id: string | null
  cliente_id: string
  creado_en: string
  fecha_entrega_real: string | null
  subestado: string | null
}
type RutaRow = {
  id: string
  repartidor_id: string | null
  total_pedidos: number
  entregados: number
  no_entregados: number
  repartidor: { nombre: string; vehiculo: string | null } | null
}
type Tab = 'envios' | 'rutas'

const CAT_COLOR: Record<string, string> = {
  Entregado: '#4CAF91',
  'No entregado': '#E57373',
  'En camino': '#5BB8D4',
  Pendiente: '#9CA3AF',
}
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function categoria(estado: EstadoPedido): string {
  if (estado === 'entregado') return 'Entregado'
  if (estado === 'no_entregado') return 'No entregado'
  if (estado === 'recogido' || estado === 'en_camino') return 'En camino'
  return 'Pendiente'
}

function ChartCard({ title, icon: Icon, children, empty }: {
  title: string; icon: React.ElementType; children: React.ReactNode; empty?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-celeste-500" />
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      {empty ? <p className="text-sm text-gray-400 text-center py-12">Sin datos para el período</p> : children}
    </Card>
  )
}

export default function Reportes() {
  const end = new Date()
  const [desde, setDesde] = useState(format(subDays(end, 6), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(end, 'yyyy-MM-dd'))
  const [repFiltro, setRepFiltro] = useState('')
  const [tab, setTab] = useState<Tab>('envios')

  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [rutas, setRutas] = useState<RutaRow[]>([])
  const [clientesMap, setClientesMap] = useState<Record<string, string>>({})
  const [repartidores, setRepartidores] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pedRes, rutasRes, cliRes] = await Promise.all([
      supabase.from('pedidos')
        .select('id, numero_pedido, estado, fecha_programada, ruta_id, cliente_id, creado_en, fecha_entrega_real, subestado')
        .gte('fecha_programada', desde).lte('fecha_programada', hasta),
      supabase.from('rutas')
        .select('id, repartidor_id, total_pedidos, entregados, no_entregados, repartidor:repartidores(nombre, vehiculo)')
        .gte('fecha', desde).lte('fecha', hasta),
      supabase.from('clientes').select('id, nombre'),
    ])
    setPedidos((pedRes.data as PedidoRow[]) ?? [])
    setRutas((rutasRes.data as unknown as RutaRow[]) ?? [])
    setClientesMap(Object.fromEntries((cliRes.data ?? []).map((c) => [c.id, c.nombre])))
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    supabase.from('repartidores').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      setRepartidores(data ?? [])
    })
  }, [])

  // Mapas
  const rutaRep: Record<string, string | null> = {}
  const repInfo: Record<string, { nombre: string; vehiculo: string | null }> = {}
  rutas.forEach((r) => {
    rutaRep[r.id] = r.repartidor_id
    if (r.repartidor_id && r.repartidor) repInfo[r.repartidor_id] = { nombre: r.repartidor.nombre, vehiculo: r.repartidor.vehiculo }
  })

  const pedidosF = repFiltro ? pedidos.filter((p) => p.ruta_id && rutaRep[p.ruta_id] === repFiltro) : pedidos
  const rutasF = repFiltro ? rutas.filter((r) => r.repartidor_id === repFiltro) : rutas

  const repDe = (rutaId: string | null) => (rutaId && rutaRep[rutaId] && repInfo[rutaRep[rutaId]!]) ? repInfo[rutaRep[rutaId]!].nombre : 'Sin asignar'

  // ---- Envíos ----
  const totalDesp = pedidosF.length
  const entregadosN = pedidosF.filter((p) => p.estado === 'entregado').length
  const tasa = totalDesp > 0 ? Math.round((entregadosN / totalDesp) * 100) : 0
  const tiempos = pedidosF
    .filter((p) => p.estado === 'entregado' && p.fecha_entrega_real)
    .map((p) => differenceInMinutes(parseISO(p.fecha_entrega_real!), parseISO(p.creado_en)))
    .filter((m) => m >= 0)
  const minProm = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0
  const minMax = tiempos.length ? Math.max(...tiempos) : 0

  const distrib: Record<string, number> = {}
  pedidosF.forEach((p) => { const c = categoria(p.estado); distrib[c] = (distrib[c] ?? 0) + 1 })
  const donaData = Object.entries(distrib).map(([name, value]) => ({ name, value }))

  const dias: Record<string, { entregado: number; no_entregado: number; en_camino: number }> = {}
  let cur = parseISO(desde); const fin = parseISO(hasta)
  while (cur <= fin) { dias[format(cur, 'yyyy-MM-dd')] = { entregado: 0, no_entregado: 0, en_camino: 0 }; cur = new Date(cur.getTime() + 86400000) }
  pedidosF.forEach((p) => {
    const d = dias[p.fecha_programada]
    if (!d) return
    if (p.estado === 'entregado') d.entregado++
    else if (p.estado === 'no_entregado') d.no_entregado++
    else if (p.estado === 'en_camino' || p.estado === 'recogido') d.en_camino++
  })
  const barDia = Object.entries(dias).map(([f, v]) => ({ fecha: format(parseISO(f), 'dd/MM'), ...v }))

  const userCount: Record<string, number> = {}
  pedidosF.forEach((p) => { const n = repDe(p.ruta_id); userCount[n] = (userCount[n] ?? 0) + 1 })
  const barUsuario = Object.entries(userCount).map(([nombre, pedidos]) => ({ nombre, pedidos })).sort((a, b) => b.pedidos - a.pedidos)

  const cliCount: Record<string, number> = {}
  pedidosF.forEach((p) => { const n = clientesMap[p.cliente_id] ?? '—'; cliCount[n] = (cliCount[n] ?? 0) + 1 })
  const barClientes = Object.entries(cliCount).map(([nombre, pedidos]) => ({ nombre, pedidos })).sort((a, b) => b.pedidos - a.pedidos).slice(0, 8)

  const horasArr = Array.from({ length: 24 }, (_, h) => ({ hora: String(h).padStart(2, '0'), entregas: 0 }))
  const dowArr = DOW.map((d) => ({ dia: d, entregas: 0 }))
  pedidosF.forEach((p) => {
    if (p.estado === 'entregado' && p.fecha_entrega_real) {
      const dt = parseISO(p.fecha_entrega_real)
      horasArr[dt.getHours()].entregas++
      dowArr[getDay(dt)].entregas++
    }
  })
  const barHora = horasArr.slice(6, 22)

  const subCount: Record<string, number> = {}
  pedidosF.forEach((p) => { if (p.subestado) { const l = labelSubestado(p.subestado); subCount[l] = (subCount[l] ?? 0) + 1 } })
  const barSubestado = Object.entries(subCount).map(([nombre, pedidos]) => ({ nombre, pedidos })).sort((a, b) => b.pedidos - a.pedidos)

  const rendMap: Record<string, { nombre: string; asignados: number; entregados: number; no_entregados: number }> = {}
  pedidosF.forEach((p) => {
    const n = repDe(p.ruta_id)
    if (!rendMap[n]) rendMap[n] = { nombre: n, asignados: 0, entregados: 0, no_entregados: 0 }
    rendMap[n].asignados++
    if (p.estado === 'entregado') rendMap[n].entregados++
    if (p.estado === 'no_entregado') rendMap[n].no_entregados++
  })
  const rendimiento = Object.values(rendMap)
    .map((r) => ({ ...r, tasa: r.asignados > 0 ? Math.round((r.entregados / r.asignados) * 100) : 0 }))
    .sort((a, b) => b.asignados - a.asignados)

  const ultimas = [...pedidosF].sort((a, b) => b.creado_en.localeCompare(a.creado_en)).slice(0, 8).map((p) => {
    const t = p.estado === 'entregado' && p.fecha_entrega_real ? differenceInMinutes(parseISO(p.fecha_entrega_real), parseISO(p.creado_en)) : null
    return { numero: p.numero_pedido, fecha: p.fecha_programada, rep: repDe(p.ruta_id), tiempo: t !== null && t >= 0 ? `${t} min` : '—' }
  })

  // ---- Rutas ----
  const totalRutas = rutasF.length
  const sumaDesp = rutasF.reduce((a, r) => a + r.total_pedidos, 0)
  const promDesp = totalRutas > 0 ? Math.round((sumaDesp / totalRutas) * 10) / 10 : 0
  const cumplVals = rutasF.filter((r) => r.total_pedidos > 0).map((r) => (r.entregados / r.total_pedidos) * 100)
  const cumpl = cumplVals.length ? Math.round(cumplVals.reduce((a, b) => a + b, 0) / cumplVals.length) : 0
  const despArr = rutasF.map((r) => r.total_pedidos)
  const minD = despArr.length ? Math.min(...despArr) : 0
  const maxD = despArr.length ? Math.max(...despArr) : 0
  const rxu: Record<string, number> = {}
  const rxv: Record<string, number> = {}
  rutasF.forEach((r) => {
    const info = r.repartidor_id ? repInfo[r.repartidor_id] : undefined
    const n = info ? info.nombre : 'Sin asignar'
    const v = info?.vehiculo ?? '—'
    rxu[n] = (rxu[n] ?? 0) + 1
    rxv[v] = (rxv[v] ?? 0) + 1
  })
  const barRutasUsuario = Object.entries(rxu).map(([nombre, rutas]) => ({ nombre, rutas }))
  const barRutasVehiculo = Object.entries(rxv).map(([vehiculo, rutas]) => ({ vehiculo, rutas }))

  const kpisEnvios: Kpi[] = [
    { label: 'Total despachos', value: totalDesp, tone: 'neutral', icon: <Package size={16} /> },
    { label: 'Entregados', value: entregadosN, tone: 'menta', icon: <CheckCircle size={16} /> },
    { label: 'Tasa de entrega', value: `${tasa}%`, tone: 'celeste', icon: <Target size={16} /> },
    { label: 'Min. promedio gestión', value: minProm, tone: 'lavanda', icon: <Clock size={16} /> },
    { label: 'Entrega más larga', value: `${minMax} min`, tone: 'coral', icon: <Timer size={16} /> },
  ]
  const kpisRutas: Kpi[] = [
    { label: 'Total de rutas', value: totalRutas, tone: 'neutral', icon: <Route size={16} /> },
    { label: 'Prom. despachos/ruta', value: promDesp, tone: 'celeste', icon: <Package size={16} /> },
    { label: 'Cumplimiento rutas', value: `${cumpl}%`, tone: 'menta', icon: <Target size={16} /> },
    { label: 'Mín. despachos', value: minD, tone: 'lavanda', icon: <Truck size={16} /> },
    { label: 'Máx. despachos', value: maxD, tone: 'coral', icon: <Truck size={16} /> },
  ]

  async function exportarExcel() {
    setExportando(true)
    try {
      const H = (t: string): XlsxCell => ({ value: t, header: true })
      const vacio: XlsxCell[] = [{ value: '' }]

      const resumen: XlsxCell[][] = [
        [{ value: `Estadísticas — ${formatFecha(desde)} a ${formatFecha(hasta)}`, bold: true }],
        vacio,
        [H('Métrica'), H('Valor')],
        [{ value: 'Total despachos' }, { value: totalDesp }],
        [{ value: 'Entregados' }, { value: entregadosN }],
        [{ value: 'Tasa de entrega (%)' }, { value: tasa }],
        [{ value: 'Min. promedio de gestión' }, { value: minProm }],
        [{ value: 'Entrega más larga (min)' }, { value: minMax }],
        vacio,
        [{ value: 'Total de rutas' }, { value: totalRutas }],
        [{ value: 'Prom. despachos por ruta' }, { value: promDesp }],
        [{ value: 'Cumplimiento de rutas (%)' }, { value: cumpl }],
        [{ value: 'Mín. despachos' }, { value: minD }],
        [{ value: 'Máx. despachos' }, { value: maxD }],
      ]
      const rend: XlsxCell[][] = [
        [H('Repartidor'), H('Asignados'), H('Entregados'), H('No entregados'), H('Tasa éxito (%)')],
        ...rendimiento.map((r): XlsxCell[] => [{ value: r.nombre }, { value: r.asignados }, { value: r.entregados }, { value: r.no_entregados }, { value: r.tasa }]),
      ]
      const subs: XlsxCell[][] = [
        [H('Subestado'), H('Despachos')],
        ...barSubestado.map((s): XlsxCell[] => [{ value: s.nombre }, { value: s.pedidos }]),
      ]
      const ords: XlsxCell[][] = [
        [H('Orden'), H('Fecha de entrega'), H('Usuario móvil'), H('Tiempo de entrega')],
        ...ultimas.map((u): XlsxCell[] => [{ value: u.numero }, { value: formatFecha(u.fecha) }, { value: u.rep }, { value: u.tiempo }]),
      ]
      const rutasSheet: XlsxCell[][] = [
        [H('Rutas por usuario móvil'), H('')],
        ...barRutasUsuario.map((r): XlsxCell[] => [{ value: r.nombre }, { value: r.rutas }]),
        vacio,
        [H('Rutas por vehículo'), H('')],
        ...barRutasVehiculo.map((r): XlsxCell[] => [{ value: r.vehiculo }, { value: r.rutas }]),
      ]

      await exportarXlsx([
        { nombre: 'Resumen', anchos: [30, 16], filas: resumen },
        { nombre: 'Rendimiento', anchos: [24, 12, 12, 14, 14], filas: rend },
        { nombre: 'Subestados', anchos: [32, 12], filas: subs },
        { nombre: 'Últimas órdenes', anchos: [22, 16, 22, 16], filas: ords },
        { nombre: 'Rutas', anchos: [26, 12], filas: rutasSheet },
      ], `estadisticas_${desde}_${hasta}.xlsx`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setExportando(false)
    }
  }

  const sinDatos = !loading && pedidos.length === 0 && rutas.length === 0

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Estadísticas</h1>
            <p className="text-sm text-gray-500">{formatFecha(desde)} — {formatFecha(hasta)}</p>
          </div>
          <Button variant="secondary" onClick={exportarExcel} loading={exportando}><Download size={16} /> Exportar Excel</Button>
        </div>

        {/* Filtros */}
        <FilterBar onClear={() => { setDesde(format(subDays(new Date(), 6), 'yyyy-MM-dd')); setHasta(format(new Date(), 'yyyy-MM-dd')); setRepFiltro('') }}>
          <div className="w-full sm:w-40"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="w-full sm:w-40"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <div className="w-full sm:w-52">
            <Select value={repFiltro} onChange={(e) => setRepFiltro(e.target.value)}>
              <option value="">Todos los repartidores</option>
              {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </Select>
          </div>
        </FilterBar>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-100">
          {([['envios', 'Envíos', Send], ['rutas', 'Rutas', Route]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === id ? 'border-celeste-500 text-celeste-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : sinDatos ? (
          <Card className="p-2"><EmptyState icon={<Package size={36} />} title="Sin datos para el período seleccionado" /></Card>
        ) : tab === 'envios' ? (
          <div className="space-y-5 animate-fadeIn">
            <KpiStrip items={kpisEnvios} />

            <div className="grid lg:grid-cols-2 gap-5">
              <ChartCard title="Distribución de estados" icon={Target} empty={donaData.length === 0}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={donaData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" nameKey="name"
                      label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {donaData.map((e) => <Cell key={e.name} fill={CAT_COLOR[e.name] ?? '#9CA3AF'} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Despachos por día" icon={Package}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barDia}>
                    <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="entregado" name="Entregado" stackId="a" fill="#4CAF91" />
                    <Bar dataKey="no_entregado" name="No entregado" stackId="a" fill="#E57373" />
                    <Bar dataKey="en_camino" name="En camino" stackId="a" fill="#5BB8D4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Despachos por usuario móvil" icon={Truck} empty={barUsuario.length === 0}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barUsuario} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="pedidos" name="Despachos" fill="#5BB8D4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Principales clientes" icon={Package} empty={barClientes.length === 0}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barClientes} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip />
                    <Bar dataKey="pedidos" name="Pedidos" fill="#9B7FD4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Entregas por hora del día" icon={Clock} empty={minMax === 0 && entregadosN === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barHora}>
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="entregas" name="Entregas" fill="#4CAF91" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Entregas por día de la semana" icon={Clock} empty={minMax === 0 && entregadosN === 0}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dowArr}>
                    <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="entregas" name="Entregas" fill="#5BB8D4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Despachos por subestado" icon={Package} empty={barSubestado.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(240, barSubestado.length * 30)}>
                <BarChart data={barSubestado} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={190} />
                  <Tooltip />
                  <Bar dataKey="pedidos" name="Despachos" fill="#9B7FD4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Rendimiento por repartidor */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Rendimiento por repartidor</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="py-2 px-3">Repartidor</th>
                      <th className="py-2 px-3">Asignados</th>
                      <th className="py-2 px-3">Entregados</th>
                      <th className="py-2 px-3">No entregados</th>
                      <th className="py-2 px-3">Tasa éxito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rendimiento.map((r) => (
                      <tr key={r.nombre} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-medium text-gray-800">{r.nombre}</td>
                        <td className="py-2.5 px-3 text-gray-600">{r.asignados}</td>
                        <td className="py-2.5 px-3 text-menta-700 font-medium">{r.entregados}</td>
                        <td className="py-2.5 px-3 text-coral-700">{r.no_entregados}</td>
                        <td className="py-2.5 px-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold',
                            r.tasa >= 80 ? 'bg-menta-100 text-menta-700' : r.tasa >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-coral-100 text-coral-700')}>
                            {r.tasa}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {rendimiento.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Tabla resumen últimas órdenes */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Últimas órdenes ingresadas</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="py-2 px-3">Orden</th>
                      <th className="py-2 px-3">Fecha de entrega</th>
                      <th className="py-2 px-3">Usuario móvil</th>
                      <th className="py-2 px-3">Tiempo de entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimas.map((u) => (
                      <tr key={u.numero} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-mono text-celeste-700">{u.numero}</td>
                        <td className="py-2.5 px-3 text-gray-600">{formatFecha(u.fecha)}</td>
                        <td className="py-2.5 px-3 text-gray-700">{u.rep}</td>
                        <td className="py-2.5 px-3 text-gray-600">{u.tiempo}</td>
                      </tr>
                    ))}
                    {ultimas.length === 0 && (
                      <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Sin órdenes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-5 animate-fadeIn">
            <KpiStrip items={kpisRutas} />
            <div className="grid lg:grid-cols-2 gap-5">
              <ChartCard title="Rutas por usuario móvil" icon={Truck} empty={barRutasUsuario.length === 0}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barRutasUsuario} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="rutas" name="Rutas" fill="#5BB8D4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Rutas por vehículo" icon={Truck} empty={barRutasVehiculo.length === 0}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barRutasVehiculo} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="vehiculo" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="rutas" name="Rutas" fill="#9B7FD4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
