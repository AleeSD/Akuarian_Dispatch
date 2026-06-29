import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { EstadoPedido, MotivoNoEntrega } from '../types'

export function formatFecha(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: es })
  } catch {
    return dateStr
  }
}

export function formatFechaHora(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy hh:mm a", { locale: es })
  } catch {
    return dateStr
  }
}

export function formatHora(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'hh:mm a', { locale: es })
  } catch {
    return dateStr
  }
}

export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Saludo según la hora del día (zona horaria del dispositivo). */
export function saludoHora(date: Date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * Tiempo relativo legible estilo DispatchTrack/Beetrack.
 * - Fecha futura → "Estimado para 11 minutos"
 * - Fecha pasada → "Gestionado hace 17 horas"
 * Mostrar siempre junto a la fecha absoluta.
 */
export function formatRelativo(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    const distancia = formatDistanceToNow(d, { locale: es }).replace(/^alrededor de /, '')
    return d.getTime() > Date.now() ? `Estimado para ${distancia}` : `Gestionado hace ${distancia}`
  } catch {
    return dateStr
  }
}

export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  verificado: 'Verificado',
  en_preparacion: 'En preparación',
  listo_despacho: 'Listo para despacho',
  recogido: 'Recogido',
  en_camino: 'En camino',
  entregado: 'Entregado',
  no_entregado: 'No entregado',
  reprogramado: 'Reprogramado',
}

export const MOTIVO_LABELS: Record<MotivoNoEntrega, string> = {
  cliente_ausente: 'Cliente ausente',
  direccion_incorrecta: 'Dirección incorrecta',
  rechazo_cliente: 'Cliente rechazó el pedido',
  producto_danado: 'Producto dañado',
  zona_inaccesible: 'Zona inaccesible',
  otro: 'Otro',
}

export const PRIORIDAD_LABELS = ['Normal', 'Media', 'Alta', 'Urgente']

export const PRIORIDAD_COLORS = [
  'bg-gray-100 text-gray-600',
  'bg-blue-100 text-blue-600',
  'bg-orange-100 text-orange-700',
  'bg-red-100 text-red-700',
]

export function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
