// Fase 2.5 — Cola offline para la app del repartidor.
//
// Cuando el repartidor confirma una acción (recogido/entregado/no entregado) sin
// conexión, la acción + sus imágenes (foto, firma) se guardan en IndexedDB. Al
// recuperar señal se sincronizan automáticamente: se suben las evidencias y se
// actualiza el pedido con la misma lógica que el envío en línea.
import { supabase } from './supabase'
import { subirEvidencia } from './r2'
import type { EstadoPedido, MotivoNoEntrega } from '../types'

export interface AccionPendiente {
  id: string
  pedidoId: string
  numeroPedido: string
  accion: 'recogido' | 'entregado' | 'no_entregado'
  estadoNuevo: EstadoPedido
  repartidorId: string | null
  motivo?: MotivoNoEntrega | null
  detalleMotivo?: string
  receptor?: string
  dni?: string
  bultosEntregados?: number | null
  subestado?: string | null
  fotoBlob?: Blob | null
  firmaBlob?: Blob | null
  creadoEn: number
}

const DB_NAME = 'akuarian-offline'
const STORE = 'acciones'
const VERSION = 1

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function prom<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await abrirDB()
  return db.transaction(STORE, mode).objectStore(STORE)
}

// --- Pub/sub para que la UI reaccione a cambios en la cola ---
type Listener = (n: number) => void
const listeners = new Set<Listener>()
async function notificar() {
  const n = await contarPendientes()
  listeners.forEach((l) => l(n))
}
export function suscribir(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

// --- CRUD de la cola ---
export async function encolarAccion(a: AccionPendiente): Promise<void> {
  const s = await store('readwrite')
  await prom(s.add(a))
  await notificar()
}

export async function listarPendientes(): Promise<AccionPendiente[]> {
  const s = await store('readonly')
  return prom(s.getAll() as IDBRequest<AccionPendiente[]>)
}

export async function contarPendientes(): Promise<number> {
  const s = await store('readonly')
  return prom(s.count())
}

async function eliminarAccion(id: string): Promise<void> {
  const s = await store('readwrite')
  await prom(s.delete(id))
}

/**
 * Envía UNA acción al servidor: sube evidencias y actualiza el pedido.
 * Es la misma lógica para el envío en línea y para la sincronización diferida.
 * Lanza si falla (para que la acción permanezca en la cola).
 */
export async function commitAccion(a: AccionPendiente): Promise<void> {
  const updatePayload: Record<string, unknown> = { estado: a.estadoNuevo }

  // Foto de evidencia
  if (a.fotoBlob) {
    const file = new File([a.fotoBlob], `${a.accion}.jpg`, { type: 'image/jpeg' })
    const fotoUrl = await subirEvidencia(file, a.pedidoId, a.accion)
    await supabase.from('evidencias').insert({
      pedido_id: a.pedidoId, subido_por: a.repartidorId ?? null, tipo: a.accion, foto_url: fotoUrl,
    })
    if (a.accion === 'recogido') updatePayload.foto_recogido_url = fotoUrl
    else if (a.accion === 'entregado') updatePayload.foto_entregado_url = fotoUrl
    else updatePayload.foto_no_entregado_url = fotoUrl
  }

  if (a.accion === 'recogido') {
    updatePayload.recogido_en = new Date(a.creadoEn).toISOString()
  } else if (a.accion === 'entregado') {
    updatePayload.fecha_entrega_real = new Date(a.creadoEn).toISOString()
    if (a.receptor) updatePayload.nombre_receptor = a.receptor
    if (a.dni) updatePayload.dni_receptor = a.dni
    if (a.firmaBlob) {
      const firmaFile = new File([a.firmaBlob], 'firma.png', { type: 'image/png' })
      const firmaUrl = await subirEvidencia(firmaFile, a.pedidoId, 'firma')
      updatePayload.firma_url = firmaUrl
      await supabase.from('evidencias').insert({
        pedido_id: a.pedidoId, subido_por: a.repartidorId ?? null, tipo: 'firma', foto_url: firmaUrl,
      })
    }
    if (a.bultosEntregados != null) updatePayload.bultos_entregados = a.bultosEntregados
    if (a.subestado) updatePayload.subestado = a.subestado
  } else if (a.accion === 'no_entregado') {
    if (a.motivo) updatePayload.motivo_no_entrega = a.motivo
    if (a.detalleMotivo) updatePayload.detalle_no_entrega = a.detalleMotivo
  }

  const { error } = await supabase.from('pedidos').update(updatePayload).eq('id', a.pedidoId)
  if (error) throw error
}

// --- Motor de sincronización ---
let sincronizando = false

/** Procesa la cola. Devuelve cuántas acciones se sincronizaron con éxito. */
export async function sincronizar(): Promise<number> {
  if (sincronizando || !navigator.onLine) return 0
  sincronizando = true
  let ok = 0
  try {
    const pendientes = await listarPendientes()
    for (const a of pendientes) {
      try {
        await commitAccion(a)
        await eliminarAccion(a.id)
        ok++
      } catch {
        // Falló (¿sin red de nuevo?). Se deja en la cola y se corta el lote.
        if (!navigator.onLine) break
      }
    }
  } finally {
    sincronizando = false
    await notificar()
  }
  return ok
}

// --- Auto-sync: al reconectar y al cargar la app (idempotente) ---
let autoSyncIniciado = false
export function iniciarAutoSync() {
  if (autoSyncIniciado) return
  autoSyncIniciado = true
  window.addEventListener('online', () => { sincronizar() })
  if (navigator.onLine) sincronizar()
}

export function generarId(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)
}
