import { useState, useEffect, useRef } from 'react'
import {
  Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle, Users, Package, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { csvToObjects, descargarCSV } from '../lib/csv'
import { leerXlsx } from '../lib/xlsx'
import { formatFechaHora, today, cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

type Entidad = 'clientes' | 'pedidos'
type EstadoFila = 'listo' | 'observacion' | 'error'

interface FilaValidada {
  idx: number
  resumen: string
  estado: EstadoFila
  mensaje: string
  payload: Record<string, unknown> | null
}

interface ImportLog {
  id: string
  fecha: string
  entidad: Entidad
  archivo: string
  total: number
  importados: number
  observaciones: number
  errores: number
  usuario: string
}

const LOG_KEY = 'akuarian:importaciones'

const PLANTILLAS: Record<Entidad, { headers: string[]; ejemplo: (string | number)[] }> = {
  clientes: {
    headers: ['nombre', 'telefono', 'email', 'direccion', 'distrito', 'notas'],
    ejemplo: ['Ejemplo Cliente SAC', '987654321', 'cliente@correo.com', 'Av. Ejemplo 123', 'Miraflores', 'Cliente de prueba'],
  },
  pedidos: {
    headers: ['cliente', 'direccion_entrega', 'distrito_entrega', 'referencia_entrega', 'fecha_programada', 'prioridad', 'bultos', 'peso_kg', 'descripcion_carga', 'observaciones'],
    ejemplo: ['Distribuidora Lima Norte', 'Av. Destino 456', 'Independencia', 'Frente al parque', '2026-06-30', 1, 2, 15.5, 'Electrodomésticos', 'Entregar en horario de oficina'],
  },
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const ESTADO_CHIP: Record<EstadoFila, { cls: string; icon: typeof CheckCircle; label: string }> = {
  listo:       { cls: 'bg-menta-100 text-menta-700', icon: CheckCircle, label: 'Listo' },
  observacion: { cls: 'bg-amber-100 text-amber-700', icon: AlertTriangle, label: 'Con observación' },
  error:       { cls: 'bg-coral-100 text-coral-700', icon: XCircle, label: 'Error' },
}

function leerLog(): ImportLog[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') } catch { return [] }
}

export default function Importar() {
  const { user, nombreUsuario } = useAuth()
  const [entidad, setEntidad] = useState<Entidad>('clientes')
  const [archivo, setArchivo] = useState<string>('')
  const [filas, setFilas] = useState<FilaValidada[]>([])
  const [importando, setImportando] = useState(false)
  const [historial, setHistorial] = useState<ImportLog[]>(leerLog())
  const [clientes, setClientes] = useState<Cliente[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('clientes').select('*').eq('activo', true).then(({ data }) => setClientes(data ?? []))
  }, [])

  function reset() {
    setFilas([])
    setArchivo('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function cambiarEntidad(e: Entidad) {
    setEntidad(e)
    reset()
  }

  function descargarPlantilla() {
    const { headers, ejemplo } = PLANTILLAS[entidad]
    descargarCSV(`plantilla_${entidad}.csv`, headers, [ejemplo])
  }

  function validarClientes(objs: Record<string, string>[]): FilaValidada[] {
    return objs.map((o, i) => {
      const nombre = o.nombre ?? ''
      if (!nombre) return { idx: i + 1, resumen: '(sin nombre)', estado: 'error', mensaje: 'El nombre es obligatorio', payload: null }
      const email = o.email ?? ''
      const obs = email && !EMAIL_RE.test(email) ? 'Email con formato dudoso' : ''
      return {
        idx: i + 1,
        resumen: nombre,
        estado: obs ? 'observacion' : 'listo',
        mensaje: obs || 'Listo para importar',
        payload: {
          nombre,
          telefono: o.telefono || null,
          email: email || null,
          direccion_ref: o.direccion || null,
          distrito: o.distrito || null,
          notas: o.notas || null,
        },
      }
    })
  }

  function validarPedidos(objs: Record<string, string>[]): FilaValidada[] {
    return objs.map((o, i) => {
      const ref = (o.cliente ?? '').trim()
      const cli = clientes.find((c) => c.id === ref || c.nombre.toLowerCase() === ref.toLowerCase())
      if (!ref) return { idx: i + 1, resumen: '(sin cliente)', estado: 'error', mensaje: 'Falta el cliente', payload: null }
      if (!cli) return { idx: i + 1, resumen: ref, estado: 'error', mensaje: `Cliente "${ref}" no encontrado`, payload: null }

      const notas: string[] = []
      let direccion = (o.direccion_entrega ?? '').trim()
      if (!direccion) {
        if (cli.direccion_ref) { direccion = cli.direccion_ref; notas.push('Se usó la dirección del cliente') }
        else return { idx: i + 1, resumen: cli.nombre, estado: 'error', mensaje: 'Falta la dirección de entrega', payload: null }
      }

      let fecha = (o.fecha_programada ?? '').trim()
      if (!fecha) { fecha = today(); notas.push('Sin fecha: se usó hoy') }
      else if (!FECHA_RE.test(fecha)) return { idx: i + 1, resumen: cli.nombre, estado: 'error', mensaje: `Fecha inválida "${fecha}" (usa AAAA-MM-DD)`, payload: null }

      let prioridad = parseInt(o.prioridad ?? '', 10)
      if (isNaN(prioridad)) prioridad = 0
      else if (prioridad < 0 || prioridad > 3) { prioridad = Math.min(3, Math.max(0, prioridad)); notas.push('Prioridad ajustada a rango 0-3') }

      let bultos = parseInt(o.bultos ?? '', 10)
      if (isNaN(bultos) || bultos < 1) bultos = 1
      const peso = parseFloat(o.peso_kg ?? '')

      return {
        idx: i + 1,
        resumen: cli.nombre,
        estado: notas.length ? 'observacion' : 'listo',
        mensaje: notas.length ? notas.join(' · ') : 'Listo para importar',
        payload: {
          cliente_id: cli.id,
          creado_por: user?.id ?? null,
          estado: 'recibido',
          direccion_entrega: direccion,
          distrito_entrega: o.distrito_entrega || null,
          referencia_entrega: o.referencia_entrega || null,
          fecha_programada: fecha,
          prioridad,
          bultos,
          peso_kg: isNaN(peso) ? null : peso,
          descripcion_carga: o.descripcion_carga || null,
          observaciones: o.observaciones || null,
        },
      }
    })
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivo(file.name)
    try {
      const objs = file.name.toLowerCase().endsWith('.xlsx')
        ? await leerXlsx(file)
        : csvToObjects(await file.text())
      if (objs.length === 0) {
        toast.error('El archivo no tiene filas de datos')
        setFilas([])
        return
      }
      setFilas(entidad === 'clientes' ? validarClientes(objs) : validarPedidos(objs))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo leer el archivo')
      setFilas([])
    }
  }

  const validas = filas.filter((f) => f.estado !== 'error')
  const conteo = {
    listo: filas.filter((f) => f.estado === 'listo').length,
    observacion: filas.filter((f) => f.estado === 'observacion').length,
    error: filas.filter((f) => f.estado === 'error').length,
  }

  async function importar() {
    if (validas.length === 0) { toast.error('No hay filas válidas para importar'); return }
    setImportando(true)
    try {
      const payloads = validas.map((f) => f.payload as Record<string, unknown>)
      const { error } = await supabase.from(entidad).insert(payloads)
      if (error) throw error

      const log: ImportLog = {
        id: crypto.randomUUID(),
        fecha: new Date().toISOString(),
        entidad,
        archivo: archivo || 'archivo.csv',
        total: filas.length,
        importados: validas.length,
        observaciones: conteo.observacion,
        errores: conteo.error,
        usuario: nombreUsuario ?? '—',
      }
      const nuevo = [log, ...historial].slice(0, 20)
      setHistorial(nuevo)
      localStorage.setItem(LOG_KEY, JSON.stringify(nuevo))

      toast.success(`${validas.length} ${entidad} importado${validas.length !== 1 ? 's' : ''}`)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar')
    } finally {
      setImportando(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Importar</h1>
            <p className="text-sm text-gray-500">Carga masiva de registros desde un archivo CSV</p>
          </div>
          <Button variant="secondary" onClick={descargarPlantilla}>
            <Download size={16} /> Descargar plantilla
          </Button>
        </div>

        {/* Selector de entidad + carga */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            {([['clientes', 'Clientes', Users], ['pedidos', 'Pedidos', Package]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => cambiarEntidad(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                  entidad === id ? 'bg-celeste-50 border-celeste-300 text-celeste-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                )}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          <label className="block">
            <div className="border-2 border-dashed border-celeste-300 rounded-xl p-8 text-center cursor-pointer hover:bg-celeste-50/50 transition-colors">
              <Upload size={36} className="mx-auto mb-2 text-celeste-500" />
              <p className="text-sm font-medium text-gray-700">{archivo || `Selecciona un CSV o Excel de ${entidad}`}</p>
              <p className="text-xs text-gray-400 mt-1">Formatos .csv y .xlsx · la primera fila debe contener los encabezados de la plantilla</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={handleArchivo} />
          </label>
        </Card>

        {/* Vista previa */}
        {filas.length > 0 && (
          <Card className="p-5 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-semibold text-gray-800">{filas.length} filas</span>
                <span className="inline-flex items-center gap-1 text-menta-700"><CheckCircle size={14} /> {conteo.listo} listas</span>
                {conteo.observacion > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={14} /> {conteo.observacion} con observación</span>}
                {conteo.error > 0 && <span className="inline-flex items-center gap-1 text-coral-700"><XCircle size={14} /> {conteo.error} con error</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={reset}><X size={15} /> Descartar</Button>
                <Button onClick={importar} loading={importando} disabled={validas.length === 0}>
                  <Upload size={16} /> Importar {validas.length}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Registro</th>
                    <th className="py-2 px-3">Estado</th>
                    <th className="py-2 px-3">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const chip = ESTADO_CHIP[f.estado]
                    const Icon = chip.icon
                    return (
                      <tr key={f.idx} className="border-b border-gray-50">
                        <td className="py-2 px-3 text-gray-400">{f.idx}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{f.resumen}</td>
                        <td className="py-2 px-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', chip.cls)}>
                            <Icon size={12} /> {chip.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-500 text-xs">{f.mensaje}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Últimas importaciones */}
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Últimas importaciones</h2>
          {historial.length === 0 ? (
            <Card className="p-2"><EmptyState icon={<FileSpreadsheet size={32} />} title="Aún no hay importaciones" description="El historial de cargas aparecerá aquí." /></Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="py-2.5 px-3">Archivo</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3">Importados</th>
                      <th className="py-2.5 px-3">Usuario</th>
                      <th className="py-2.5 px-3">Fecha de carga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((h) => (
                      <tr key={h.id} className="border-b border-gray-50">
                        <td className="py-2.5 px-3 font-medium text-gray-800">{h.archivo}</td>
                        <td className="py-2.5 px-3 capitalize text-gray-600">{h.entidad}</td>
                        <td className="py-2.5 px-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            h.observaciones > 0 ? 'bg-amber-100 text-amber-700' : 'bg-menta-100 text-menta-700')}>
                            {h.observaciones > 0 ? 'Importado con observaciones' : 'Importado'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-700">{h.importados}/{h.total}</td>
                        <td className="py-2.5 px-3 text-gray-600">{h.usuario}</td>
                        <td className="py-2.5 px-3 text-gray-500">{formatFechaHora(h.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  )
}
