export type CsvCell = string | number | null | undefined

/** One value, quoted for CSV (inner quotes doubled). */
export function csvCell(value: CsvCell) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

/** Downloads rows as a CSV file, which opens straight in Excel. The first row is the header. */
export function downloadCsvRows(filename: string, rows: CsvCell[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
