import type { EstadoPedido } from '../types'

export type SubestadoTono = 'menta' | 'celeste' | 'lavanda' | 'coral' | 'amber' | 'neutral'

export interface SubestadoDef {
  codigo: string
  label: string
  descripcion: string
  categoria: string
  /** Estados principales en los que tiene sentido este subestado. */
  estados: EstadoPedido[]
  tono: SubestadoTono
}

/**
 * Catálogo de subestados. El `codigo` es lo que se persiste en `pedidos.subestado`.
 * Agrupados por categoría operativa (preparación, tránsito, excepciones, entregas, devoluciones).
 */
export const SUBESTADOS: SubestadoDef[] = [
  // 1. Preparación y bodega
  { codigo: 'pendiente_verificacion', label: 'Pendiente de verificación', descripcion: 'El pedido espera validación de datos o stock.', categoria: 'Preparación y bodega', estados: ['recibido', 'verificado'], tono: 'neutral' },
  { codigo: 'stock_confirmado', label: 'Stock confirmado', descripcion: 'Inventario verificado y reservado para el pedido.', categoria: 'Preparación y bodega', estados: ['verificado', 'en_preparacion'], tono: 'celeste' },
  { codigo: 'en_preparacion', label: 'En preparación', descripcion: 'El producto se está seleccionando y empacando.', categoria: 'Preparación y bodega', estados: ['en_preparacion'], tono: 'celeste' },
  { codigo: 'empaquetado', label: 'Empaquetado', descripcion: 'El paquete está listo, esperando ser recolectado por la flota.', categoria: 'Preparación y bodega', estados: ['listo_despacho'], tono: 'lavanda' },
  { codigo: 'retraso_bodega', label: 'Retraso en bodega', descripcion: 'Problemas de stock o roturas que impiden embalar el producto.', categoria: 'Preparación y bodega', estados: ['en_preparacion', 'listo_despacho'], tono: 'amber' },

  // 2. En tránsito
  { codigo: 'en_ruta_reparto', label: 'En ruta de reparto', descripcion: 'El paquete ya está en el vehículo camino a la zona de entrega.', categoria: 'En tránsito', estados: ['recogido', 'en_camino'], tono: 'celeste' },
  { codigo: 'proximo_destino', label: 'Próximo a destino', descripcion: 'El repartidor está llegando al domicilio del cliente.', categoria: 'En tránsito', estados: ['en_camino'], tono: 'celeste' },
  { codigo: 'alta_congestion', label: 'Alta congestión', descripcion: 'El pedido se retrasará debido al tráfico o problemas climáticos.', categoria: 'En tránsito', estados: ['en_camino', 'recogido'], tono: 'amber' },
  { codigo: 'vehiculo_averiado', label: 'Vehículo averiado', descripcion: 'El repartidor sufrió un percance mecánico en ruta.', categoria: 'En tránsito', estados: ['en_camino', 'recogido'], tono: 'coral' },

  // 3. Intentos de entrega y excepciones
  { codigo: 'ausente', label: 'Ausente', descripcion: 'El cliente no se encontraba en el domicilio al momento de la visita.', categoria: 'Intentos y excepciones', estados: ['en_camino', 'no_entregado'], tono: 'amber' },
  { codigo: 'direccion_incorrecta', label: 'Dirección incorrecta / incompleta', descripcion: 'Faltan datos (interior, referencia) o la calle no fue encontrada.', categoria: 'Intentos y excepciones', estados: ['en_camino', 'no_entregado'], tono: 'amber' },
  { codigo: 'cliente_no_responde', label: 'Cliente no responde', descripcion: 'No fue posible contactar por teléfono al destinatario.', categoria: 'Intentos y excepciones', estados: ['en_camino', 'no_entregado'], tono: 'amber' },
  { codigo: 'zona_inaccesible', label: 'Zona de difícil acceso', descripcion: 'Zona insegura o inaccesible para la unidad de reparto.', categoria: 'Intentos y excepciones', estados: ['no_entregado'], tono: 'amber' },
  { codigo: 'fuera_horario', label: 'Fuera de horario de atención', descripcion: 'El establecimiento estaba cerrado al momento de la visita.', categoria: 'Intentos y excepciones', estados: ['no_entregado'], tono: 'amber' },

  // 4. Entregas exitosas
  { codigo: 'entregado_destinatario', label: 'Entregado al destinatario', descripcion: 'El paquete fue recibido por la persona correcta.', categoria: 'Entregas exitosas', estados: ['entregado'], tono: 'menta' },
  { codigo: 'entregado_conserje', label: 'Entregado a conserje / recepción', descripcion: 'Dejado en la administración del edificio o garita de seguridad.', categoria: 'Entregas exitosas', estados: ['entregado'], tono: 'menta' },
  { codigo: 'firmado_verificado', label: 'Firmado y verificado', descripcion: 'Se confirmó la firma y la foto de la entrega en la plataforma.', categoria: 'Entregas exitosas', estados: ['entregado'], tono: 'menta' },
  { codigo: 'entrega_con_observaciones', label: 'Entregado con observaciones', descripcion: 'Recibido con notas o reparos por parte del cliente.', categoria: 'Entregas exitosas', estados: ['entregado'], tono: 'amber' },

  // 5. Devoluciones e incidentes críticos
  { codigo: 'devolucion_en_proceso', label: 'Devolución en proceso', descripcion: 'El paquete vuelve a bodega central tras intentos fallidos.', categoria: 'Devoluciones e incidentes', estados: ['no_entregado', 'reprogramado'], tono: 'lavanda' },
  { codigo: 'rechazado_cliente', label: 'Rechazado por el cliente', descripcion: 'El destinatario no aceptó el paquete (por daños o error de compra).', categoria: 'Devoluciones e incidentes', estados: ['no_entregado'], tono: 'coral' },
  { codigo: 'paquete_extraviado', label: 'Paquete extraviado', descripcion: 'La unidad o la mercancía se perdió en tránsito.', categoria: 'Devoluciones e incidentes', estados: ['no_entregado'], tono: 'coral' },
  { codigo: 'producto_danado', label: 'Producto dañado en tránsito', descripcion: 'La mercancía sufrió daños durante el transporte.', categoria: 'Devoluciones e incidentes', estados: ['no_entregado', 'reprogramado'], tono: 'coral' },
  { codigo: 'reprogramado_cliente', label: 'Reprogramado por el cliente', descripcion: 'El cliente solicitó una nueva fecha de entrega.', categoria: 'Devoluciones e incidentes', estados: ['reprogramado', 'no_entregado'], tono: 'lavanda' },
]

export const SUBESTADO_MAP: Record<string, SubestadoDef> = Object.fromEntries(SUBESTADOS.map((s) => [s.codigo, s]))

export const SUBESTADO_TONO_CLS: Record<SubestadoTono, string> = {
  menta: 'bg-menta-100 text-menta-700',
  celeste: 'bg-celeste-100 text-celeste-700',
  lavanda: 'bg-lavanda-100 text-lavanda-700',
  coral: 'bg-coral-100 text-coral-700',
  amber: 'bg-amber-100 text-amber-700',
  neutral: 'bg-gray-100 text-gray-600',
}

/** Subestados aplicables a un estado principal (para los selectores). */
export function subestadosDe(estado: EstadoPedido): SubestadoDef[] {
  return SUBESTADOS.filter((s) => s.estados.includes(estado))
}

export function labelSubestado(codigo: string | null): string {
  if (!codigo) return '—'
  return SUBESTADO_MAP[codigo]?.label ?? codigo
}
