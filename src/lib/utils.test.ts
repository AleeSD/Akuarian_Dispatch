import { describe, it, expect } from 'vitest'
import {
  formatFecha, formatRelativo, iniciales, cn,
  ESTADO_LABELS, MOTIVO_LABELS, PRIORIDAD_LABELS,
} from './utils'

describe('formatFecha', () => {
  it('formatea ISO a dd/MM/yyyy', () => {
    expect(formatFecha('2026-06-17')).toBe('17/06/2026')
  })
  it('devuelve guion para null', () => {
    expect(formatFecha(null)).toBe('—')
  })
})

describe('formatRelativo', () => {
  it('fecha pasada → "Gestionado hace …"', () => {
    const pasado = new Date(Date.now() - 3 * 86400000).toISOString()
    expect(formatRelativo(pasado)).toMatch(/^Gestionado hace /)
  })
  it('fecha futura → "Estimado para …"', () => {
    const futuro = new Date(Date.now() + 3 * 86400000).toISOString()
    expect(formatRelativo(futuro)).toMatch(/^Estimado para /)
  })
  it('devuelve guion para null', () => {
    expect(formatRelativo(null)).toBe('—')
  })
})

describe('iniciales', () => {
  it('toma 2 iniciales en mayúscula', () => {
    expect(iniciales('Carlos Quispe')).toBe('CQ')
  })
  it('funciona con un solo nombre', () => {
    expect(iniciales('Pedro')).toBe('P')
  })
})

describe('cn', () => {
  it('une solo clases verdaderas', () => {
    expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c')
  })
})

describe('catálogos de etiquetas', () => {
  it('ESTADO_LABELS cubre los 9 estados', () => {
    expect(Object.keys(ESTADO_LABELS)).toHaveLength(9)
    expect(ESTADO_LABELS.entregado).toBe('Entregado')
  })
  it('MOTIVO_LABELS cubre los 6 motivos', () => {
    expect(Object.keys(MOTIVO_LABELS)).toHaveLength(6)
  })
  it('PRIORIDAD_LABELS tiene 4 niveles', () => {
    expect(PRIORIDAD_LABELS).toHaveLength(4)
    expect(PRIORIDAD_LABELS[3]).toBe('Urgente')
  })
})
