import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { isFacturaAnulada } from '../utils/facturas'
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Award,
  RefreshCw
} from 'lucide-react'

const formatMoney = (amount) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(Number(amount || 0))

const getDateValue = (row) => row?.creado_en || row?.fecha || row?.created_at || null

const getStartDateForRange = (range) => {
  const now = new Date()
  if (range === 'hoy') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  }
  if (range === 'semana') {
    const start = new Date(now)
    start.setDate(now.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    return start
  }
  if (range === 'mes') {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  }
  return null
}

export default function DashboardStats({ variantes = [] }) {
  const [range, setRange] = useState('todo') // 'hoy' | 'semana' | 'mes' | 'todo'
  const [facturas, setFacturas] = useState([])
  const [abonos, setAbonos] = useState([])
  const [detalles, setDetalles] = useState([])
  const [loading, setLoading] = useState(true)
  const [queryError, setQueryError] = useState('')

  const fetchStatsData = async () => {
    setLoading(true)
    setQueryError('')

    const [
      { data: facData, error: facErr },
      { data: abData, error: abErr },
      { data: detData, error: detErr }
    ] = await Promise.all([
      supabase.from('facturas').select('*'),
      supabase.from('abonos').select('*'),
      supabase.from('detalle_facturas').select(`
        *,
        variantes (
          talla,
          color,
          presentacion,
          productos ( nombre )
        )
      `)
    ])

    const errMsg = facErr?.message || abErr?.message || detErr?.message
    if (errMsg) {
      setQueryError(errMsg)
    }

    const sortedFacturas = [...(facData || [])].sort((a, b) => {
      const da = new Date(getDateValue(a) || 0).getTime()
      const db = new Date(getDateValue(b) || 0).getTime()
      return da - db
    })

    setFacturas(sortedFacturas)
    setAbonos(abData || [])
    setDetalles(detData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchStatsData()
  }, [])

  const stats = useMemo(() => {
    const startDate = getStartDateForRange(range)
    const inRange = (row) => {
      if (!startDate) return true
      const rawDate = getDateValue(row)
      if (!rawDate) return true
      const parsed = new Date(rawDate)
      if (Number.isNaN(parsed.getTime())) return true
      return parsed >= startDate
    }

    const facturasActivas = facturas.filter((f) => !isFacturaAnulada(f))
    const facturasFiltradas = facturasActivas.filter((f) => inRange(f))
    const facturaIdsEnRango = new Set(facturasFiltradas.map((f) => f.id))
    const facturasActivasIds = new Set(facturasActivas.map((f) => f.id))

    const vendidoTotal = facturasFiltradas.reduce(
      (acc, f) => acc + Number(f.total || 0),
      0
    )

    // Cobrado: si la factura ya tiene monto_pagado registrado, lo sumamos;
    // y si hay abonos posteriores registrados en la tabla abonos, también los consideramos.
    const abonosEnRango = abonos.filter(
      (a) => facturasActivasIds.has(a.factura_id) && inRange(a)
    )
    const totalAbonosRango = abonosEnRango.reduce(
      (acc, a) => acc + Number(a.monto || 0),
      0
    )

    const pagadoEnFacturasRango = facturasFiltradas.reduce((acc, f) => {
      if (f.monto_pagado !== undefined && f.monto_pagado !== null) {
        return acc + Number(f.monto_pagado || 0)
      }
      return f.estado_pago === 'Pagada' ? acc + Number(f.total || 0) : acc
    }, 0)

    const cobradoReal = Math.max(pagadoEnFacturasRango, totalAbonosRango)

    const detallesFiltrados = detalles.filter((d) => facturaIdsEnRango.has(d.factura_id))
    const costoVendido = detallesFiltrados.reduce(
      (acc, d) => acc + Number(d.costo_unitario || 0) * Number(d.cantidad || 0),
      0
    )
    const gananciaBruta = vendidoTotal - costoVendido

    const porCobrarTotal = facturasActivas.reduce(
      (acc, f) => acc + Math.max(0, Number(f.total || 0) - Number(f.monto_pagado || 0)),
      0
    )

    // Serie diaria para gráfica de barras (últimos 7 días)
    const dayMap = new Map()
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric' })
      dayMap.set(key, { key, label, vendido: 0, cobrado: 0 })
    }

    facturasActivas.forEach((f) => {
      const rawDate = getDateValue(f)
      if (!rawDate) return
      const parsed = new Date(rawDate)
      if (Number.isNaN(parsed.getTime())) return
      const key = parsed.toISOString().slice(0, 10)
      if (dayMap.has(key)) {
        const row = dayMap.get(key)
        row.vendido += Number(f.total || 0)
        row.cobrado += Number(f.monto_pagado ?? (f.estado_pago === 'Pagada' ? f.total : 0) ?? 0)
      }
    })

    const dailySeries = Array.from(dayMap.values())
    const maxSeriesVal = Math.max(
      1,
      ...dailySeries.flatMap((d) => [d.vendido, d.cobrado])
    )

    // Top productos vendidos
    const topMap = new Map()
    detallesFiltrados.forEach((d) => {
      const prodName = d.variantes?.productos?.nombre || 'Producto'
      const variantInfo = [
        d.variantes?.talla,
        d.variantes?.color,
        d.variantes?.presentacion
      ]
        .filter(Boolean)
        .join(' · ')
      const fullName = variantInfo ? `${prodName} (${variantInfo})` : prodName
      const prev = topMap.get(fullName) || { name: fullName, qty: 0, revenue: 0 }
      prev.qty += Number(d.cantidad || 0)
      prev.revenue += Number(
        d.subtotal || Number(d.precio_unitario || 0) * Number(d.cantidad || 0)
      )
      topMap.set(fullName, prev)
    })

    const topProducts = Array.from(topMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    const lowStockItems = variantes.filter(
      (v) => Number(v.stock_actual || 0) <= Number(v.stock_minimo || 3)
    )

    const todayStr = new Date().toISOString().slice(0, 10)
    const expiringItems = variantes.filter((v) => {
      if (!v.fecha_vencimiento) return false
      const diffDays =
        (new Date(v.fecha_vencimiento) - new Date(todayStr)) / (1000 * 60 * 60 * 24)
      return diffDays <= 30
    })

    return {
      vendidoTotal,
      cobradoReal,
      costoVendido,
      gananciaBruta,
      porCobrarTotal,
      facturasCount: facturasFiltradas.length,
      dailySeries,
      maxSeriesVal,
      topProducts,
      lowStockItems,
      expiringItems
    }
  }, [range, facturas, abonos, detalles, variantes])

  return (
    <div className="space-y-5">
      {/* Encabezado y selector de rango */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4">
        <div>
          <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-rose-600" />
            Dashboard Estadístico
          </h2>
          <p className="text-xs text-slate-500">
            Control visual de ventas, ingresos cobrados, margen y alertas del negocio
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'hoy', label: 'Hoy' },
            { id: 'semana', label: '7 días' },
            { id: 'mes', label: 'Este mes' },
            { id: 'todo', label: 'Todo' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRange(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                range === tab.id
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            type="button"
            onClick={fetchStatsData}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            title="Actualizar estadísticas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {queryError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700">
          <strong>Error al consultar estadísticas:</strong> {queryError}
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Vendido ({stats.facturasCount} fact.)</span>
            <DollarSign className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-xl font-extrabold text-slate-900">
            {formatMoney(stats.vendidoTotal)}
          </p>
          <p className="text-[11px] text-slate-400">Incluye ventas al contado y crédito</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ingreso Cobrado Real</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-extrabold text-emerald-700">
            {formatMoney(stats.cobradoReal)}
          </p>
          <p className="text-[11px] text-slate-400">Monto pagado + abonos registrados</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Margen Bruto Estimado</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl font-extrabold text-slate-900">
            {formatMoney(stats.gananciaBruta)}
          </p>
          <p className="text-[11px] text-slate-400">
            Costo mercancía: {formatMoney(stats.costoVendido)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Por Cobrar (Clientes)</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-extrabold text-amber-700">
            {formatMoney(stats.porCobrarTotal)}
          </p>
          <p className="text-[11px] text-slate-400">Saldo pendiente acumulado</p>
        </div>
      </div>

      {/* Gráfica de barras + Top Productos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">
                Actividad Diaria (Vendido vs Cobrado)
              </h3>
              <p className="text-[11px] text-slate-500">Últimos 7 días</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Vendido
              </span>
              <span className="inline-flex items-center gap-1 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Cobrado
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4 border-b border-slate-100 pb-2">
            {stats.dailySeries.map((day) => {
              const vendidoPct = Math.round((day.vendido / stats.maxSeriesVal) * 100)
              const cobradoPct = Math.round((day.cobrado / stats.maxSeriesVal) * 100)

              return (
                <div key={day.key} className="flex flex-col items-center h-full justify-end gap-1">
                  <div className="w-full flex items-end justify-center gap-1 h-32">
                    <div
                      style={{ height: `${Math.max(day.vendido > 0 ? 8 : 2, vendidoPct)}%` }}
                      title={`Vendido: ${formatMoney(day.vendido)}`}
                      className="w-2.5 sm:w-3 rounded-t-md bg-rose-500 transition-all"
                    />
                    <div
                      style={{ height: `${Math.max(day.cobrado > 0 ? 8 : 2, cobradoPct)}%` }}
                      title={`Cobrado: ${formatMoney(day.cobrado)}`}
                      className="w-2.5 sm:w-3 rounded-t-md bg-emerald-500 transition-all"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate max-w-full">
                    {day.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            Productos con Mayor Rotación
          </h3>

          {stats.topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              Aún no hay ventas registradas en este rango.
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.topProducts.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      #{idx + 1} {item.name}
                    </p>
                    <p className="text-[11px] text-slate-500">{item.qty} unidades vendidas</p>
                  </div>
                  <span className="text-xs font-bold text-slate-800 shrink-0">
                    {formatMoney(item.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alertas de inventario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
          <h3 className="font-bold text-sm text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Stock Bajo o Agotado ({stats.lowStockItems.length})
          </h3>
          {stats.lowStockItems.length === 0 ? (
            <p className="text-xs text-slate-400">Todo el inventario está sobre el mínimo.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {stats.lowStockItems.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between text-xs bg-amber-50/70 border border-amber-100 rounded-xl px-3 py-2"
                >
                  <span className="font-medium text-slate-800 truncate">
                    {v.productos?.nombre}{' '}
                    <span className="text-slate-500">
                      {[v.talla, v.color, v.presentacion].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="font-bold text-amber-800 shrink-0 ml-2">
                    {v.stock_actual} und.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
          <h3 className="font-bold text-sm text-rose-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Próximos a Vencer (≤ 30 días) ({stats.expiringItems.length})
          </h3>
          {stats.expiringItems.length === 0 ? (
            <p className="text-xs text-slate-400">Sin artículos próximos a vencer.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {stats.expiringItems.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between text-xs bg-rose-50/70 border border-rose-100 rounded-xl px-3 py-2"
                >
                  <span className="font-medium text-slate-800 truncate">
                    {v.productos?.nombre}
                  </span>
                  <span className="font-bold text-rose-700 shrink-0 ml-2">
                    Vence: {v.fecha_vencimiento}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}