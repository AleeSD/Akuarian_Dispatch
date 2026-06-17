import { useEffect, useMemo, useState } from 'react'
import { Settings, Building2, Bell, SlidersHorizontal, Palette, Save, type LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { Configuracion as ConfigRow } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SkeletonCard } from '../components/ui/Skeleton'

type Grupo = {
  titulo: string
  icon: LucideIcon
  claves: string[]
}

const GRUPOS: Grupo[] = [
  {
    titulo: 'Empresa',
    icon: Building2,
    claves: [
      'empresa_nombre', 'empresa_ruc', 'empresa_telefono', 'empresa_whatsapp',
      'empresa_email', 'empresa_direccion', 'logo_url',
    ],
  },
  {
    titulo: 'Operación',
    icon: SlidersHorizontal,
    claves: [
      'pedido_prefijo', 'horario_inicio', 'horario_fin', 'max_intentos_entrega',
      'max_bultos_por_pedido', 'peso_max_kg_por_pedido', 'permitir_reprogramacion',
      'foto_requerida_entrega', 'foto_requerida_no_entrega', 'requiere_firma_entrega',
    ],
  },
  {
    titulo: 'Notificaciones',
    icon: Bell,
    claves: [
      'notificaciones_email_activas', 'notificaciones_email_destino',
      'dias_alerta_pedido_atrasado',
    ],
  },
  {
    titulo: 'Sistema',
    icon: Palette,
    claves: [
      'moneda', 'zona_horaria', 'tema_color_primario', 'storage_bucket',
    ],
  },
]

function esBooleano(valor: string) {
  return valor === 'true' || valor === 'false'
}

function esNumerico(clave: string) {
  return /max_|dias_|horario_|peso_/.test(clave)
}

export default function Configuracion() {
  const [configs, setConfigs] = useState<ConfigRow[]>([])
  const [editados, setEditados] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function fetchConfigs() {
    setLoading(true)
    const { data, error } = await supabase
      .from('configuracion')
      .select('*')
      .order('clave')
    if (error) toast.error('Error al cargar configuración')
    setConfigs(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchConfigs() }, [])

  const mapaConfig = useMemo(() => {
    const m = new Map<string, ConfigRow>()
    configs.forEach((c) => m.set(c.clave, c))
    return m
  }, [configs])

  const cambiosPendientes = Object.keys(editados).length

  function handleChange(clave: string, valor: string) {
    const original = mapaConfig.get(clave)?.valor ?? ''
    setEditados((prev) => {
      const next = { ...prev }
      if (valor === original) delete next[clave]
      else next[clave] = valor
      return next
    })
  }

  async function guardarCambios() {
    if (cambiosPendientes === 0) return
    setSaving(true)
    try {
      const updates = Object.entries(editados).map(([clave, valor]) =>
        supabase.from('configuracion').update({ valor, actualizado_en: new Date().toISOString() }).eq('clave', clave),
      )
      const results = await Promise.all(updates)
      const errored = results.filter((r) => r.error)
      if (errored.length > 0) throw new Error(errored[0].error?.message)
      toast.success(`${cambiosPendientes} ${cambiosPendientes === 1 ? 'cambio guardado' : 'cambios guardados'}`)
      setEditados({})
      fetchConfigs()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function descartar() {
    setEditados({})
  }

  // Claves dentro de algún grupo
  const clavesAgrupadas = new Set(GRUPOS.flatMap((g) => g.claves))
  const otrasClaves = configs
    .filter((c) => !clavesAgrupadas.has(c.clave))
    .map((c) => c.clave)

  function renderCampo(clave: string) {
    const cfg = mapaConfig.get(clave)
    if (!cfg) return null
    const valorActual = editados[clave] ?? cfg.valor ?? ''
    const editado = clave in editados

    if (esBooleano(cfg.valor)) {
      return (
        <div key={clave} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-gray-800">{cfg.descripcion ?? clave}</p>
            <p className="text-xs text-gray-400 font-mono">{clave}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={valorActual === 'true'}
              onChange={(e) => handleChange(clave, e.target.checked ? 'true' : 'false')}
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-celeste-500 peer-focus:ring-2 peer-focus:ring-celeste-300 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
          </label>
        </div>
      )
    }

    return (
      <div key={clave} className="py-3 border-b border-gray-100 last:border-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{cfg.descripcion ?? clave}</p>
            <p className="text-xs text-gray-400 font-mono">{clave}</p>
          </div>
          {editado && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-celeste-700 bg-celeste-50 px-2 py-0.5 rounded">
              Modificado
            </span>
          )}
        </div>
        <Input
          value={valorActual}
          type={esNumerico(clave) ? (clave.startsWith('horario_') ? 'time' : 'number') : 'text'}
          onChange={(e) => handleChange(clave, e.target.value)}
          className={editado ? 'border-celeste-300 bg-celeste-50/30' : ''}
        />
      </div>
    )
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Settings size={22} /> Configuración
            </h1>
            <p className="text-sm text-gray-500">
              {configs.length} parámetros del sistema
              {cambiosPendientes > 0 && (
                <span className="ml-2 text-celeste-700 font-medium">
                  • {cambiosPendientes} {cambiosPendientes === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}
                </span>
              )}
            </p>
          </div>
          {cambiosPendientes > 0 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={descartar} disabled={saving}>
                Descartar
              </Button>
              <Button onClick={guardarCambios} loading={saving}>
                <Save size={16} /> Guardar cambios
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {GRUPOS.map(({ titulo, icon: Icon, claves }) => {
              const visibles = claves.filter((k) => mapaConfig.has(k))
              if (visibles.length === 0) return null
              return (
                <Card key={titulo} className="p-5">
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                    <div className="bg-celeste-50 text-celeste-700 rounded-lg p-1.5">
                      <Icon size={16} />
                    </div>
                    <h2 className="font-semibold text-gray-800">{titulo}</h2>
                    <span className="ml-auto text-xs text-gray-400">{visibles.length}</span>
                  </div>
                  <div>{visibles.map(renderCampo)}</div>
                </Card>
              )
            })}

            {otrasClaves.length > 0 && (
              <Card className="p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                  <div className="bg-gray-100 text-gray-600 rounded-lg p-1.5">
                    <SlidersHorizontal size={16} />
                  </div>
                  <h2 className="font-semibold text-gray-800">Otros</h2>
                  <span className="ml-auto text-xs text-gray-400">{otrasClaves.length}</span>
                </div>
                <div>{otrasClaves.map(renderCampo)}</div>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
