/**
 * Comprime una imagen en el navegador antes de subirla:
 * redimensiona al lado máximo indicado y re-encodea a JPEG.
 * Fotos de celular (3-6 MB) → típicamente 150-350 KB.
 */
export async function comprimirImagen(
  file: File,
  opts: { maxLado?: number; calidad?: number } = {},
): Promise<Blob> {
  const maxLado = opts.maxLado ?? 1600
  const calidad = opts.calidad ?? 0.7

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
    image.src = dataUrl
  })

  let { width, height } = img
  const lado = Math.max(width, height)
  if (lado > maxLado) {
    const escala = maxLado / lado
    width = Math.round(width * escala)
    height = Math.round(height * escala)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', calidad),
  )
  if (!blob) throw new Error('No se pudo comprimir la imagen')
  return blob
}
