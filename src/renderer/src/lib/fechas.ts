/**
 * Atajos de fecha para apuntar rapido.
 *
 * Casi todo lo que se apunta vence hoy, manana, el viernes o la semana que
 * viene. Abrir el calendario y buscar el dia para eso es un gesto de mas cada
 * vez, y son las cuatro veces de cada cinco.
 */

/** Formato que espera un <input type="date">, en hora local. */
export function paraInput(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

const sumarDias = (fecha: Date, dias: number): Date => {
  const d = new Date(fecha)
  d.setDate(d.getDate() + dias)
  return d
}

export interface AtajoFecha {
  id: string
  etiqueta: string
  /** Valor listo para el <input type="date">. */
  valor: string
}

/**
 * Los atajos que tienen sentido hoy.
 *
 * El viernes se omite cuando ya es hoy o manana: tener dos botones que hacen lo
 * mismo con nombres distintos hace dudar de si de verdad hacen lo mismo.
 */
export function atajosFecha(hoy: Date = new Date()): AtajoFecha[] {
  const base = new Date(hoy)
  base.setHours(0, 0, 0, 0)

  const atajos: AtajoFecha[] = [
    { id: 'hoy', etiqueta: 'Hoy', valor: paraInput(base) },
    { id: 'manana', etiqueta: 'Manana', valor: paraInput(sumarDias(base, 1)) }
  ]

  // Proximo viernes contando desde hoy. Si hoy es viernes, es hoy mismo.
  const haciaElViernes = (5 - base.getDay() + 7) % 7
  if (haciaElViernes > 1) {
    atajos.push({ id: 'viernes', etiqueta: 'Viernes', valor: paraInput(sumarDias(base, haciaElViernes)) })
  }

  atajos.push({
    id: 'semana',
    etiqueta: 'En una semana',
    valor: paraInput(sumarDias(base, 7))
  })

  return atajos
}
