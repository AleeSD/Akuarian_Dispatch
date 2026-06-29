/**
 * Wrapper ligero sobre write-excel-file / read-excel-file.
 * Las librerías pesadas se cargan con import() dinámico → van en su propio chunk
 * y solo se descargan cuando el usuario realmente exporta/importa un .xlsx.
 */

export interface XlsxCell {
  value: string | number | null
  bold?: boolean
  header?: boolean
}

export interface XlsxHoja {
  nombre: string
  anchos?: number[]
  filas: XlsxCell[][]
}

type LibCell = {
  value?: string | number | null
  type?: StringConstructor | NumberConstructor
  fontWeight?: 'bold'
  backgroundColor?: string
  color?: string
}

function toCell(c: XlsxCell): LibCell {
  const cell: LibCell = {}
  if (c.bold || c.header) cell.fontWeight = 'bold'
  if (c.header) { cell.backgroundColor = '#EBF8FF'; cell.color = '#1A5276' }
  if (c.value === null || c.value === '') { cell.value = null; return cell }
  if (typeof c.value === 'number') { cell.type = Number; cell.value = c.value; return cell }
  cell.type = String
  cell.value = String(c.value)
  return cell
}

/** Genera y descarga un libro .xlsx con una o varias hojas con formato. */
export async function exportarXlsx(hojas: XlsxHoja[], fileName: string) {
  const mod = await import('write-excel-file/browser')
  const writeXlsxFile = mod.default as unknown as (
    sheets: { data: LibCell[][]; sheet: string; columns: { width?: number }[] }[],
  ) => { toBlob(): Promise<Blob> }

  const sheets = hojas.map((h) => ({
    data: h.filas.map((row) => row.map(toCell)),
    sheet: h.nombre,
    columns: (h.anchos ?? []).map((w) => ({ width: w })),
  }))
  const blob = await writeXlsxFile(sheets).toBlob()

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** Convierte filas crudas (2D) en objetos usando la primera fila como encabezados. */
export function rowsToObjects(rows: unknown[][]): Record<string, string>[] {
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => String(h ?? '').trim().toLowerCase())
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] == null ? '' : String(r[i]).trim()])),
  )
}

/** Lee un archivo .xlsx y lo devuelve como objetos (primera fila = encabezados). */
export async function leerXlsx(file: File): Promise<Record<string, string>[]> {
  const mod = await import('read-excel-file/browser')
  const readXlsxFile = mod.default as unknown as (f: File) => Promise<unknown>
  const result = await readXlsxFile(file)

  // La build browser de read-excel-file devuelve [{ sheet, data }]; tomamos la 1ª hoja.
  let rows: unknown[][] = []
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as { data?: unknown[][] }
    rows = (first && typeof first === 'object' && Array.isArray(first.data))
      ? first.data
      : (result as unknown[][])
  }
  return rowsToObjects(rows)
}
