export type EstadoPedido =
  | 'recibido'
  | 'verificado'
  | 'en_preparacion'
  | 'listo_despacho'
  | 'recogido'
  | 'en_camino'
  | 'entregado'
  | 'no_entregado'
  | 'reprogramado'

export type EstadoRepartidor = 'disponible' | 'en_ruta' | 'descanso' | 'inactivo'

export type EstadoRuta = 'pendiente' | 'en_curso' | 'completada' | 'cancelada'

export type RolUsuario = 'admin' | 'operador' | 'supervisor' | 'repartidor'

export type MotivoNoEntrega =
  | 'cliente_ausente'
  | 'direccion_incorrecta'
  | 'rechazo_cliente'
  | 'producto_danado'
  | 'zona_inaccesible'
  | 'otro'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: RolUsuario
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  direccion_ref: string | null
  distrito: string | null
  provincia: string
  departamento: string
  coordenadas: string | null
  activo: boolean
  notas: string | null
  creado_en: string
  actualizado_en: string
}

export interface Repartidor {
  id: string
  nombre: string
  telefono: string
  dni: string | null
  vehiculo: string | null
  placa: string | null
  licencia: string | null
  estado: EstadoRepartidor
  usuario_id: string | null
  auth_user_id: string | null
  pin_acceso: string | null
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export interface Ruta {
  id: string
  nombre: string
  repartidor_id: string | null
  fecha: string
  estado: EstadoRuta
  total_pedidos: number
  entregados: number
  no_entregados: number
  notas: string | null
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export interface Pedido {
  id: string
  numero_pedido: string
  cliente_id: string
  ruta_id: string | null
  creado_por: string | null
  estado: EstadoPedido
  direccion_entrega: string
  distrito_entrega: string | null
  referencia_entrega: string | null
  coordenadas_entrega: string | null
  bultos: number
  peso_kg: number | null
  descripcion_carga: string | null
  fecha_programada: string
  fecha_entrega_real: string | null
  foto_evidencia_url: string | null
  firma_url: string | null
  nombre_receptor: string | null
  dni_receptor: string | null
  motivo_no_entrega: MotivoNoEntrega | null
  detalle_no_entrega: string | null
  fecha_reprogramada: string | null
  intento_numero: number
  observaciones: string | null
  prioridad: number
  foto_recogido_url: string | null
  foto_entregado_url: string | null
  foto_no_entregado_url: string | null
  recogido_en: string | null
  requiere_foto: boolean
  codigo_qr: string | null
  creado_en: string
  actualizado_en: string
}

export interface Evidencia {
  id: string
  pedido_id: string
  subido_por: string | null
  tipo: 'recogido' | 'entregado' | 'no_entregado' | 'firma' | 'otro'
  foto_url: string
  notas: string | null
  subido_en: string
}

export interface HistorialEstado {
  id: string
  pedido_id: string
  usuario_id: string | null
  estado_anterior: EstadoPedido | null
  estado_nuevo: EstadoPedido
  motivo: string | null
  cambiado_en: string
}

export interface Notificacion {
  id: string
  pedido_id: string | null
  usuario_id: string | null
  tipo: string
  mensaje: string
  leida: boolean
  creado_en: string
}

export interface Configuracion {
  clave: string
  valor: string
  descripcion: string | null
  actualizado_en: string
}

// View types
export interface VPedidoDetalle {
  id: string
  numero_pedido: string
  estado: EstadoPedido
  prioridad: number
  fecha_programada: string
  recogido_en: string | null
  fecha_entrega_real: string | null
  bultos: number
  peso_kg: number | null
  descripcion_carga: string | null
  direccion_entrega: string
  distrito_entrega: string | null
  referencia_entrega: string | null
  motivo_no_entrega: MotivoNoEntrega | null
  detalle_no_entrega: string | null
  intento_numero: number
  requiere_foto: boolean
  foto_recogido_url: string | null
  foto_entregado_url: string | null
  foto_no_entregado_url: string | null
  observaciones: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_email: string | null
  ruta_nombre: string | null
  ruta_fecha: string | null
  repartidor_nombre: string | null
  repartidor_telefono: string | null
  repartidor_vehiculo: string | null
  total_evidencias: number
  fotos_entrega: number
  creado_en: string
  actualizado_en: string
}

export interface VRepartidorMisPedido {
  id: string
  numero_pedido: string
  estado: EstadoPedido
  prioridad: number
  requiere_foto: boolean
  bultos: number
  peso_kg: number | null
  descripcion_carga: string | null
  direccion_entrega: string
  distrito_entrega: string | null
  referencia_entrega: string | null
  observaciones: string | null
  motivo_no_entrega: MotivoNoEntrega | null
  fecha_programada: string
  recogido_en: string | null
  fecha_entrega_real: string | null
  foto_recogido_url: string | null
  foto_entregado_url: string | null
  foto_no_entregado_url: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  ruta_nombre: string | null
  repartidor_id: string | null
  auth_user_id: string | null
}

export interface VResumenDia {
  total_pedidos: number
  recibidos: number
  verificados: number
  en_preparacion: number
  listos_despacho: number
  recogidos: number
  en_camino: number
  entregados: number
  no_entregados: number
  reprogramados: number
  tasa_entrega_pct: number | null
}
