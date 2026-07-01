import { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react'
import { Eraser } from 'lucide-react'

export interface FirmaPadHandle {
  /** Devuelve la firma como Blob PNG, o null si está vacía. */
  getBlob: () => Promise<Blob | null>
  isEmpty: () => boolean
  clear: () => void
}

/**
 * Panel de firma digital (Fase 2.1). Captura trazos con mouse o dedo sobre un
 * canvas y los exporta como imagen PNG para subir como evidencia.
 */
export const FirmaPad = forwardRef<FirmaPadHandle, { className?: string; onChange?: (isEmpty: boolean) => void }>(function FirmaPad(
  { className, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const vacio = useRef(true)
  const [tieneTrazo, setTieneTrazo] = useState(false)

  useImperativeHandle(ref, () => ({
    isEmpty: () => vacio.current,
    clear: () => {
      pintarFondo()
      vacio.current = true
      setTieneTrazo(false)
      onChange?.(true)
    },
    getBlob: () =>
      new Promise((resolve) => {
        const c = canvasRef.current
        if (!c || vacio.current) return resolve(null)
        c.toBlob((b) => resolve(b), 'image/png')
      }),
  }))

  // Ajusta el tamaño del canvas al contenedor (con densidad de pantalla).
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, rect.height)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1A5276'
    }
  }, [])

  function pintarFondo() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#1A5276'
  }

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent) {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    dibujando.current = true
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    try { canvasRef.current?.setPointerCapture(e.pointerId) } catch { /* sin puntero activo */ }
  }

  function move(e: React.PointerEvent) {
    if (!dibujando.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (vacio.current) {
      vacio.current = false
      setTieneTrazo(true)
      onChange?.(false)
    }
  }

  function end() {
    dibujando.current = false
  }

  function limpiar() {
    pintarFondo()
    vacio.current = true
    setTieneTrazo(false)
    onChange?.(true)
  }

  return (
    <div className={className}>
      <div className="relative rounded-xl border-2 border-dashed border-celeste-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-40 touch-none block"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!tieneTrazo && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none">
            Firma aquí
          </span>
        )}
      </div>
      {tieneTrazo && (
        <button
          type="button"
          onClick={limpiar}
          className="mt-1.5 text-xs text-gray-500 hover:text-coral-600 flex items-center gap-1"
        >
          <Eraser size={12} /> Borrar firma
        </button>
      )}
    </div>
  )
})
