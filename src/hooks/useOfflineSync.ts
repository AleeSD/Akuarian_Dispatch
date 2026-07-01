import { useEffect, useState } from 'react'
import { contarPendientes, sincronizar, suscribir, iniciarAutoSync } from '../lib/offline'

/**
 * Estado de conectividad + cola offline para la app del repartidor (Fase 2.5).
 * Arranca el auto-sync, refleja el nº de acciones pendientes y expone un
 * disparador manual de sincronización.
 */
export function useOfflineSync() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [pendientes, setPendientes] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)

  useEffect(() => {
    iniciarAutoSync()
    contarPendientes().then(setPendientes).catch(() => {})
    const unsub = suscribir(setPendientes)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      unsub()
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function sincronizarAhora() {
    setSincronizando(true)
    try {
      await sincronizar()
    } finally {
      setSincronizando(false)
    }
  }

  return { online, pendientes, sincronizando, sincronizarAhora }
}
