import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Download, BarChart2, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Repartidor } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { subDays, format, parseISO } from 'date-fns'

function getFechaRango() {
  const end = new Date()
  const start = subDays(end, 6)
  return {
    desde: format(start, 'yyyy-MM-dd'),
    hasta: format(end, 'yyyy-MM-dd'),
  }
}

const COLORES_ESTADO: Record<string, string> = {
  entregado: '#4CAF91',
  no_entregado: '#E57373',
  en_camino: '#5BB8D4',
  recibido: '#9CA3AF',
  en_preparacion: '#9B7FD4',
  listo_despacho: '#EAB308',
}

interface RendimientoRepartidor {
  nombre: string
  asignados: number
  entregados: number
  no_entregados: number
  tasa: number
}

export default function Reportes() {
  const { desde: defaultDesde, hasta: defaultHasta } = getFechaRango()
  const [desde, setDesde] = useState(defaultDesde)
  const [hasta, setHasta] = useState(defaultHasta)
  const [barData, setBarData] = useState<{ fecha: string; entregado: number; no_entregado: number; en_camino: number }[]>([])
  const [donaData, setDonaData] = useState<{ name: string; value: number }[]>([])
  const [rendimiento, setRendimiento] = useState<RendimientoRepartidor[]>([])
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [repFiltro, setRepFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortCol, setSortCol] = useState<keyof RendimientoRepartidor>('asignados')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    supabase.from('repartidores').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setRepartidores(data ?? [])
    })
  }, [])

  useEffect(() => {
    fetchReportes()
  }, [desde, hasta, repFiltro])

  async function fetchReportes() {
    setLoading(true)
    try {
      let query = supabase
        .from('pedidos')
        .select('estado, fecha_programada, ruta_id')
        .gte('fecha_programada', desde)
        .lte('fecha_programada', hasta)

      const { data: pedidos } = await query

      if (pedidos) {
        // Bar chart: pedidos por día
        const byDay: Record<string, { entregado: number; no_entregado: number; en_camino: number }> = {}
        let current = new Date(desde)
        const end = new Date(hasta)
        while (current <= end) {
          byDay[format(current, 'yyyy-MM-dd')] = { entregado: 0, no_entregado: 0, en_camino: 0 }
          current = new Date(current.getTime() + 86400000)
        }

        pedidos.forEach((p) => {
          const d = p.fecha_programada
          if (byDay[d]) {
            if (p.estado === 'entregado') byDay[d].entregado++
            else if (p.estado === 'no_entregado') byDay[d].no_entregado++
            else if (p.estado === 'en_camino' || p.estado === 'recogido') byDay[d].en_camino++
          }
        })

        setBarData(Object.entries(byDay).map(([fecha, counts]) => ({
          fecha: format(parseISO(fecha), 'dd/MM'),
          ...counts,
        })))

        // Donut: distribución de estados
        const countByEstado: Record<string, number> = {}
        pedidos.forEach((p) => {
          countByEstado[p.estado] = (countByEstado[p.estado] ?? 0) + 1
        })
        setDonaData(Object.entries(countByEstado).map(([name, value]) => ({ name, value })))
      }

      // Rendimiento por repartidor
      const { data: rutas } = await supabase
        .from('rutas')
        .select('id, repartidor_id, repartidor:repartidores(nombre)')
        .gte('fecha', desde)
        .lte('fecha', hasta)

      if (rutas) {
        const rutasPorRep: Record<string, { nombre: string; rutaIds: string[] }> = {}
        rutas.forEach((r) => {
          if (!r.repartidor_id) return
          if (repFiltro && r.repartidor_id !== repFiltro) return
          const repData = r.repartidor as unknown as { nombre: string } | null
          const nombre = repData?.nombre ?? 'Sin nombre'
          if (!rutasPorRep[r.repartidor_id]) {
            rutasPorRep[r.repartidor_id] = { nombre, rutaIds: [] }
          }
          rutasPorRep[r.repartidor_id].rutaIds.push(r.id)
        })

        const rend: RendimientoRepartidor[] = await Promise.all(
          Object.values(rutasPorRep).map(async ({ nombre, rutaIds }) => {
            const { data: peds } = await supabase
              .from('pedidos')
              .select('estado')
              .in('ruta_id', rutaIds)

            const asignados = peds?.length ?? 0
            const entregados = peds?.filter((p) => p.estado === 'entregado').length ?? 0
            const no_entregados = peds?.filter((p) => p.estado === 'no_entregado').length ?? 0
            const tasa = asignados > 0 ? Math.round((entregados / asignados) * 100) : 0

            return { nombre, asignados, entregados, no_entregados, tasa }
          })
        )

        setRendimiento(rend)
      }
    } finally {
      setLoading(false)
    }
  }

  function exportCSV() {
    const headers = ['Repartidor', 'Asignados', 'Entregados', 'No entregados', 'Tasa éxito']
    const rows = rendimiento.map((r) => [r.nombre, r.asignados, r.entregados, r.no_entregados, `${r.tasa}%`])
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${desde}_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleSort(col: keyof RendimientoRepartidor) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = [...rendimiento].sort((a, b) => {
    const av = a[sortCol]
    const bv = b[sortCol]
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av
    }
    return 0
  })

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Reportes</h1>
          </div>
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={16} /> Exportar Excel
          </Button>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" />
            <span className="text-gray-400 text-sm">—</span>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" />
          </div>
          <Select value={repFiltro} onChange={(e) => setRepFiltro(e.target.value)} className="w-52">
            <option value="">Todos los repartidores</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Bar chart */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={18} className="text-celeste-500" />
                <h2 className="font-semibold text-gray-800">Pedidos por día</h2>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData}>
                  <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="entregado" name="Entregado" stackId="a" fill={COLORES_ESTADO.entregado} />
                  <Bar dataKey="no_entregado" name="No entregado" stackId="a" fill={COLORES_ESTADO.no_entregado} />
                  <Bar dataKey="en_camino" name="En camino" stackId="a" fill={COLORES_ESTADO.en_camino} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Pie chart */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-lavanda-500" />
                <h2 className="font-semibold text-gray-800">Distribución de estados</h2>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={donaData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={true}
                  >
                    {donaData.map((entry) => (
                      <Cell key={entry.name} fill={COLORES_ESTADO[entry.name] ?? '#9CA3AF'} />
                    ))}
                  </Pie>
                  <Legend formatter={(value) => value.replace(/_/g, ' ')} />
                  <Tooltip formatter={(value, name) => [value, String(name).replace(/_/g, ' ')]} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            {/* Rendimiento table */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Rendimiento por repartidor</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {(['nombre', 'asignados', 'entregados', 'no_entregados', 'tasa'] as const).map((col) => (
                        <th
                          key={col}
                          className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700"
                          onClick={() => toggleSort(col)}
                        >
                          {col === 'nombre' ? 'Repartidor' :
                           col === 'asignados' ? 'Asignados' :
                           col === 'entregados' ? 'Entregados' :
                           col === 'no_entregados' ? 'No entregados' : 'Tasa éxito'}
                          {sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.nombre} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-medium text-gray-800">{r.nombre}</td>
                        <td className="py-2.5 px-3 text-gray-600">{r.asignados}</td>
                        <td className="py-2.5 px-3 text-menta-700 font-medium">{r.entregados}</td>
                        <td className="py-2.5 px-3 text-coral-700">{r.no_entregados}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            r.tasa >= 80 ? 'bg-menta-100 text-menta-700' :
                            r.tasa >= 60 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-coral-100 text-coral-700'
                          }`}>
                            {r.tasa}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                          Sin datos para el período seleccionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  )
}
