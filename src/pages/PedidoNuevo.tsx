import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { ChevronRight, ChevronLeft, Minus, Plus as PlusIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Cliente, Ruta, Repartidor } from '../types'
import { Layout } from '../components/layout/Layout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select, Textarea } from '../components/ui/Input'
import { today } from '../lib/utils'
import { cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

const step1Schema = z.object({
  cliente_id: z.string().min(1, 'Selecciona un cliente'),
  direccion_entrega: z.string().min(3, 'Dirección requerida'),
  distrito_entrega: z.string().optional(),
  referencia_entrega: z.string().optional(),
  fecha_programada: z.string().min(1, 'Fecha requerida'),
  prioridad: z.number().min(0).max(3),
  bultos: z.number().min(1, 'Mínimo 1 bulto'),
  peso_kg: z.number().optional(),
  descripcion_carga: z.string().optional(),
  observaciones: z.string().optional(),
})

const step2Schema = z.object({
  ruta_id: z.string().optional(),
})

type Step1Data = z.infer<typeof step1Schema>
type Step2Data = z.infer<typeof step2Schema>

const PRIORIDADES = ['Normal', 'Media', 'Alta', 'Urgente']
const PRIORIDAD_BTN = [
  'bg-gray-100 text-gray-600 hover:bg-gray-200',
  'bg-blue-50 text-blue-600 hover:bg-blue-100',
  'bg-orange-50 text-orange-600 hover:bg-orange-100',
  'bg-red-50 text-red-600 hover:bg-red-100',
]
const PRIORIDAD_ACTIVE = [
  'bg-gray-600 text-white',
  'bg-blue-600 text-white',
  'bg-orange-500 text-white',
  'bg-red-600 text-white',
]

export default function PedidoNuevo() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [rutas, setRutas] = useState<(Ruta & { repartidor?: Repartidor })[]>([])
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null)
  const [saving, setSaving] = useState(false)

  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      fecha_programada: today(),
      prioridad: 0,
      bultos: 1,
    },
  })

  const form2 = useForm<Step2Data>()

  useEffect(() => {
    supabase.from('clientes').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setClientes(data ?? [])
    })
    supabase.from('rutas').select('*, repartidor:repartidores(*)').eq('fecha', today()).in('estado', ['pendiente', 'en_curso']).then(({ data }) => {
      setRutas((data as (Ruta & { repartidor?: Repartidor })[]) ?? [])
    })
  }, [])

  function handleClienteChange(clienteId: string) {
    const cliente = clientes.find((c) => c.id === clienteId)
    if (cliente) {
      form1.setValue('direccion_entrega', cliente.direccion_ref ?? '')
      form1.setValue('distrito_entrega', cliente.distrito ?? '')
    }
  }

  const bultos = form1.watch('bultos')
  const prioridad = form1.watch('prioridad')

  async function onStep1(data: Step1Data) {
    setStep1Data(data)
    setStep(2)
  }

  async function onStep2(data: Step2Data) {
    if (!step1Data) return
    setSaving(true)
    try {
      const estado = data.ruta_id ? 'listo_despacho' : 'recibido'

      const { error } = await supabase.from('pedidos').insert({
        cliente_id: step1Data.cliente_id,
        ruta_id: data.ruta_id || null,
        creado_por: user?.id ?? null,
        estado,
        direccion_entrega: step1Data.direccion_entrega,
        distrito_entrega: step1Data.distrito_entrega || null,
        referencia_entrega: step1Data.referencia_entrega || null,
        fecha_programada: step1Data.fecha_programada,
        prioridad: step1Data.prioridad,
        bultos: step1Data.bultos,
        peso_kg: step1Data.peso_kg || null,
        descripcion_carga: step1Data.descripcion_carga || null,
        observaciones: step1Data.observaciones || null,
      })

      if (error) throw error
      toast.success('Pedido creado correctamente')
      navigate('/pedidos')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Nuevo pedido</h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                s === step ? 'bg-celeste-500 text-white' : s < step ? 'bg-menta-500 text-white' : 'bg-gray-200 text-gray-500',
              )}>
                {s}
              </div>
              <span className={cn('text-sm', s === step ? 'font-medium text-gray-800' : 'text-gray-400')}>
                {s === 1 ? 'Datos del pedido' : 'Asignación'}
              </span>
              {s < 2 && <ChevronRight size={16} className="text-gray-300" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card className="p-5 animate-fadeIn">
            <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
              <Controller
                name="cliente_id"
                control={form1.control}
                render={({ field }) => (
                  <Select
                    label="Cliente"
                    error={form1.formState.errors.cliente_id?.message}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e)
                      handleClienteChange(e.target.value)
                    }}
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre} — {c.distrito}</option>
                    ))}
                  </Select>
                )}
              />

              <Input
                label="Dirección de entrega"
                error={form1.formState.errors.direccion_entrega?.message}
                {...form1.register('direccion_entrega')}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Distrito"
                  {...form1.register('distrito_entrega')}
                />
                <Input
                  label="Fecha programada"
                  type="date"
                  error={form1.formState.errors.fecha_programada?.message}
                  {...form1.register('fecha_programada')}
                />
              </div>

              <Input
                label="Referencia"
                placeholder="2do piso, frente al parque..."
                {...form1.register('referencia_entrega')}
              />

              {/* Prioridad */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Prioridad</label>
                <div className="flex gap-2">
                  {PRIORIDADES.map((label, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => form1.setValue('prioridad', idx)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        prioridad === idx ? PRIORIDAD_ACTIVE[idx] : PRIORIDAD_BTN[idx],
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bultos */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Bultos</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => form1.setValue('bultos', Math.max(1, bultos - 1))}
                    className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-xl font-bold text-gray-800 w-8 text-center">{bultos}</span>
                  <button
                    type="button"
                    onClick={() => form1.setValue('bultos', bultos + 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Peso (kg)"
                  type="number"
                  step="0.1"
                  placeholder="Opcional"
                  {...form1.register('peso_kg', { valueAsNumber: true })}
                />
              </div>

              <Textarea
                label="Descripción de carga"
                rows={2}
                placeholder="Descripción breve de los productos..."
                {...form1.register('descripcion_carga')}
              />

              <Textarea
                label="Observaciones"
                rows={2}
                placeholder="Notas adicionales..."
                {...form1.register('observaciones')}
              />

              <Button type="submit" className="w-full">
                Continuar <ChevronRight size={16} />
              </Button>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-5 animate-fadeIn">
            <form onSubmit={form2.handleSubmit(onStep2)} className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Asignar a ruta (opcional)</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Si no asignas una ruta, el pedido se guardará como "Recibido".
                  Si asignas una ruta, quedará como "Listo para despacho".
                </p>
                <Select {...form2.register('ruta_id')}>
                  <option value="">Sin ruta por ahora</option>
                  {rutas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} — {(r.repartidor as Repartidor)?.nombre ?? 'Sin repartidor'} ({r.total_pedidos} pedidos)
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  <ChevronLeft size={16} /> Atrás
                </Button>
                <Button type="submit" loading={saving} className="flex-1">
                  Guardar pedido
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </Layout>
  )
}
