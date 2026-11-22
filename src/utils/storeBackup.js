import { supabase } from '../supabase'

const BACKUP_TABLES = [
  'categorias',
  'productos',
  'variantes',
  'clientes',
  'facturas',
  'detalle_facturas',
  'abonos',
  'movimientos_inventario',
  'configuracion_tienda'
]
const PAGE_SIZE = 1000

const fetchAllRows = async (table) => {
  const rows = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export async function downloadStoreBackup() {
  const entries = await Promise.all(
    BACKUP_TABLES.map(async (table) => [table, await fetchAllRows(table)])
  )
  const exportedAt = new Date()
  const backup = {
    exportedAt: exportedAt.toISOString(),
    data: Object.fromEntries(entries)
  }
  const date = [
    exportedAt.getFullYear(),
    String(exportedAt.getMonth() + 1).padStart(2, '0'),
    String(exportedAt.getDate()).padStart(2, '0')
  ].join('-')
  const filename = `respaldo-tienda-${date}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)

  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return filename
}
