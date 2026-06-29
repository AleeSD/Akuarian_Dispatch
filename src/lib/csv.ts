/**
 * Parser CSV mínimo y robusto (maneja comillas, comas y saltos de línea dentro de campos).
 * Sin dependencias externas.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Convierte un CSV en objetos usando la primera fila como encabezados (en minúsculas). */
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text.replace(/^﻿/, ''))
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])),
  )
}

/** Genera un CSV (con BOM para Excel) a partir de encabezados + filas y lo descarga. */
export function descargarCSV(nombre: string, headers: string[], filas: (string | number)[][]) {
  const csv = '﻿' + [headers, ...filas]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
