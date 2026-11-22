import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  Search,
  Printer,
  MessageCircle,
  Eye,
  X,
  RefreshCw,
  Ban
} from 'lucide-react'
import { formatWhatsAppPhone } from '../utils/phone'
import { getAnulacionUpdate, isFacturaAnulada } from '../utils/facturas'

const toDateKey = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')

const getLocalDateKey = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : toDateKey(date)
}

export default function HistorialFacturas({ storeConfig = {}, onInventoryUpdated }) {
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [rangoFecha, setRangoFecha] = useState('todas')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [rangoFechaBounds, setRangoFechaBounds] = useState({
    todayKey: '',
    weekStartKey: '',
    currentMonth: ''
  })
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [facturaAnular, setFacturaAnular] = useState(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anulandoFacturaId, setAnulandoFacturaId] = useState(null)

  const cargarFacturas = async () => {
    setLoading(true)
    setErrorMsg('')

    const { data, error } = await supabase
      .from('facturas')
      .select(`
        *,
        clientes (
          id,
          nombre,
          telefono
        ),
        detalle_facturas (
          id,
          variante_id,
          cantidad,
          precio_unitario,
          subtotal,
          variantes (
            id,
            sku,
            talla,
            color,
            presentacion,
            productos (
              nombre,
              marca
            )
          )
        )
      `)
      .order('fecha', { ascending: false })

    if (error) {
      setErrorMsg(error.message)
      setFacturas([])
    } else {
      setFacturas(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarFacturas()
  }, [])

  const showFeedback = (type, message) => {
    setFeedback({ type, message })
    window.setTimeout(() => setFeedback(null), 5000)
  }

  const anularFactura = async () => {
    if (!facturaAnular || anulandoFacturaId) return

    const facturaSeleccionadaParaAnular = facturaAnular
    const facturaId = facturaSeleccionadaParaAnular.id
    const numero = facturaSeleccionadaParaAnular.numero_factura ?? facturaId
    setAnulandoFacturaId(facturaId)
    setErrorMsg('')

    let stockActualizado = []
    let facturaMarcada = false
    let facturaActual = null
    let movimientosError = null

    try {
      const { data: facturaLeida, error: facturaError } = await supabase
        .from('facturas')
        .select('*')
        .eq('id', facturaId)
        .single()
      if (facturaError) throw facturaError
      facturaActual = facturaLeida
      if (isFacturaAnulada(facturaActual)) {
        throw new Error('Esta factura ya fue anulada.')
      }

      const { data: detalles, error: detallesError } = await supabase
        .from('detalle_facturas')
        .select('variante_id, cantidad')
        .eq('factura_id', facturaId)
      if (detallesError) throw detallesError

      const cantidadesPorVariante = new Map()
      for (const detalle of detalles || []) {
        if (!detalle.variante_id || Number(detalle.cantidad) <= 0) {
          throw new Error('La factura contiene un artículo sin variante o cantidad válida.')
        }
        cantidadesPorVariante.set(
          detalle.variante_id,
          (cantidadesPorVariante.get(detalle.variante_id) || 0) +
            Number(detalle.cantidad)
        )
      }

      for (const [varianteId, cantidad] of cantidadesPorVariante) {
        const { data: variante, error: varianteError } = await supabase
          .from('variantes')
          .select('id, stock_actual')
          .eq('id', varianteId)
          .single()
        if (varianteError) throw varianteError

        const stockAnteriorOriginal = variante.stock_actual
        const stockAnterior = Number(stockAnteriorOriginal || 0)
        const stockNuevo = stockAnterior + cantidad
        let updateStockQuery = supabase
          .from('variantes')
          .update({ stock_actual: stockNuevo })
          .eq('id', varianteId)
        updateStockQuery =
          stockAnteriorOriginal === null
            ? updateStockQuery.is('stock_actual', null)
            : updateStockQuery.eq('stock_actual', stockAnteriorOriginal)
        const { data: varianteActualizada, error: stockError } = await updateStockQuery
          .select('id')
          .maybeSingle()
        if (stockError) throw stockError
        if (!varianteActualizada) {
          throw new Error('El stock cambió durante la anulación. Actualiza e inténtalo de nuevo.')
        }
        stockActualizado.push({
          varianteId,
          stockAnteriorOriginal,
          stockNuevo,
          cantidad
        })
      }

      const updateFactura = getAnulacionUpdate(facturaActual, motivoAnulacion)
      let facturaUpdateQuery = supabase
        .from('facturas')
        .update(updateFactura)
        .eq('id', facturaId)
      if (Object.prototype.hasOwnProperty.call(facturaActual, 'estado')) {
        facturaUpdateQuery =
          facturaActual.estado === null
            ? facturaUpdateQuery.is('estado', null)
            : facturaUpdateQuery.eq('estado', facturaActual.estado)
      } else {
        facturaUpdateQuery =
          facturaActual.estado_pago === null
            ? facturaUpdateQuery.is('estado_pago', null)
            : facturaUpdateQuery.eq('estado_pago', facturaActual.estado_pago)
      }
      const { data: facturaActualizada, error: actualizarFacturaError } =
        await facturaUpdateQuery.select('id').maybeSingle()
      if (actualizarFacturaError) throw actualizarFacturaError
      if (!facturaActualizada) {
        throw new Error('La factura cambió durante la anulación. Actualiza e inténtalo de nuevo.')
      }
      facturaMarcada = true

      if (stockActualizado.length > 0) {
        const { error: movimientoError } = await supabase
          .from('movimientos_inventario')
          .insert(
            stockActualizado.map(({ varianteId, cantidad }) => ({
              variante_id: varianteId,
              tipo: 'Entrada',
              cantidad,
              motivo: `Anulación factura #${numero}${
                motivoAnulacion.trim() ? `: ${motivoAnulacion.trim()}` : ''
              }`
            }))
          )
        movimientosError = movimientoError
      }
    } catch (error) {
      const rollbackErrors = []
      for (const {
        varianteId,
        stockAnteriorOriginal,
        stockNuevo
      } of stockActualizado.reverse()) {
        const rollbackQuery = supabase
          .from('variantes')
          .update({ stock_actual: stockAnteriorOriginal })
          .eq('id', varianteId)
          .eq('stock_actual', stockNuevo)
        const { data: varianteRevertida, error: rollbackError } = await rollbackQuery
          .select('id')
          .maybeSingle()
        if (rollbackError || !varianteRevertida) {
          rollbackErrors.push(
            rollbackError?.message || `No se pudo revertir el stock de la variante ${varianteId}.`
          )
        }
      }

      if (facturaMarcada) {
        const rollbackFactura = Object.prototype.hasOwnProperty.call(facturaActual, 'estado')
          ? { estado: facturaActual.estado }
          : { estado_pago: facturaActual.estado_pago }
        if (Object.prototype.hasOwnProperty.call(facturaActual, 'anulada_en')) {
          rollbackFactura.anulada_en = facturaActual.anulada_en
        }
        if (Object.prototype.hasOwnProperty.call(facturaActual, 'motivo_anulacion')) {
          rollbackFactura.motivo_anulacion = facturaActual.motivo_anulacion
        }
        const rollbackStatus = Object.prototype.hasOwnProperty.call(facturaActual, 'estado')
          ? 'estado'
          : 'estado_pago'
        const rollbackStatusValue =
          rollbackStatus === 'estado' ? 'anulada' : 'Anulada'
        const { error: rollbackFacturaError } = await supabase
          .from('facturas')
          .update(rollbackFactura)
          .eq('id', facturaId)
          .eq(rollbackStatus, rollbackStatusValue)
        if (rollbackFacturaError) rollbackErrors.push(rollbackFacturaError.message)
      }

      await cargarFacturas()
      if (rollbackErrors.length > 0) {
        showFeedback(
          'error',
          `${error.message || 'No se pudo anular la factura.'} También hubo errores al revertir los cambios: ${rollbackErrors.join('; ')}`
        )
      } else {
        showFeedback('error', error.message || 'No se pudo anular la factura.')
      }
      setAnulandoFacturaId(null)
      return
    }

    setFacturaAnular(null)
    setMotivoAnulacion('')
    await cargarFacturas()
    if (onInventoryUpdated) {
      try {
        await onInventoryUpdated()
      } catch (error) {
        showFeedback(
          'error',
          `La factura fue anulada, pero no se pudieron recargar los datos: ${error.message}`
        )
        setAnulandoFacturaId(null)
        return
      }
    }
    showFeedback(
      movimientosError
        ? 'error'
        : 'success',
      movimientosError
        ? `Factura #${numero} anulada y stock devuelto, pero no se pudo registrar el movimiento: ${movimientosError.message}`
        : `Factura #${numero} anulada y stock devuelto.`
    )
    setAnulandoFacturaId(null)
  }

  const obtenerNombreItem = (det) => {
    const prod = det?.variantes?.productos?.nombre || 'Artículo'
    const marca = det?.variantes?.productos?.marca
    const extras = [
      det?.variantes?.presentacion,
      det?.variantes?.talla,
      det?.variantes?.color,
    ]
      .filter(Boolean)
      .join(' / ')

    const base = marca ? `${prod} (${marca})` : prod
    return extras ? `${base} - ${extras}` : base
  }

  const seleccionarRangoFecha = (range) => {
    if (['hoy', 'semana', 'mes'].includes(range)) {
      const today = new Date()
      const todayKey = toDateKey(today)
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
      setRangoFechaBounds({
        todayKey,
        weekStartKey: toDateKey(weekStart),
        currentMonth: todayKey.slice(0, 7)
      })
    }
    setRangoFecha(range)
  }

  const facturasFiltradas = facturas.filter((f) => {
    const texto = busqueda.trim().toLowerCase()
    const nombreCliente = f.clientes?.nombre || ''
    const coincideTexto =
      !texto ||
      String(f.numero_factura ?? '').toLowerCase().includes(texto) ||
      String(f.id ?? '').toLowerCase().includes(texto) ||
      nombreCliente.toLowerCase().includes(texto) ||
      String(f.metodo_pago ?? '').toLowerCase().includes(texto) ||
      String(f.estado_pago ?? '').toLowerCase().includes(texto) ||
      String(f.estado ?? '').toLowerCase().includes(texto) ||
      String(f.motivo_anulacion ?? '').toLowerCase().includes(texto)

    const fechaReg = getLocalDateKey(f.fecha)
    const coincideFecha =
      rangoFecha === 'hoy'
        ? fechaReg === rangoFechaBounds.todayKey
        : rangoFecha === 'semana'
        ? fechaReg >= rangoFechaBounds.weekStartKey &&
          fechaReg <= rangoFechaBounds.todayKey
        : rangoFecha === 'mes'
        ? fechaReg.startsWith(rangoFechaBounds.currentMonth) &&
          fechaReg <= rangoFechaBounds.todayKey
        : rangoFecha === 'personalizada'
        ? !fechaFiltro || fechaReg === fechaFiltro
        : true

    return coincideTexto && coincideFecha
  })

  const enviarWhatsApp = (factura) => {
    const detalles = factura.detalle_facturas || []
    const detalleTexto = detalles
      .map((det) => {
        const cant = Number(det.cantidad || 1)
        const sub = Number(det.subtotal ?? cant * Number(det.precio_unitario || 0))
        return `• ${obtenerNombreItem(det)} x${cant} — $${sub.toFixed(2)}`
      })
      .join('\n')

    const numFactura = factura.numero_factura ?? factura.id
    const clienteNom = factura.clientes?.nombre || 'Consumidor Final'
    const total = Number(factura.total || 0).toFixed(2)
    const pagado = Number(factura.monto_pagado ?? factura.total ?? 0).toFixed(2)

    const storeHeader = [
      storeConfig.nombre_tienda || 'Tienda & POS',
      ...(storeConfig.nombre_vendedor ? [`Vendedor: ${storeConfig.nombre_vendedor}`] : []),
      ...(storeConfig.telefono ? [`Teléfono: ${storeConfig.telefono}`] : []),
      ...(storeConfig.direccion ? [`Dirección: ${storeConfig.direccion}`] : []),
      '-----------------'
    ]
    const msg = [
      ...storeHeader,
      '*RECIBO DE COMPRA* (Reimpresión)',
      `Factura: #${numFactura}`,
      `Cliente: ${clienteNom}`,
      `Fecha: ${factura.fecha ? new Date(factura.fecha).toLocaleString() : ''}`,
      '-----------------',
      detalleTexto,
      '-----------------',
      `*Total: $${total}*`,
      `Pagado: $${pagado} (${factura.metodo_pago || 'Efectivo'} - ${factura.estado_pago || 'Pagada'})`
    ].join('\n')

    const tel = formatWhatsAppPhone(factura.clientes?.telefono)
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Historial de Facturas</h2>
          <p className="text-sm text-gray-500">
            Consulta facturas registradas, reimprime comprobantes o reenvía por WhatsApp
          </p>
        </div>
        <button
          onClick={cargarFacturas}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="space-y-3 bg-white p-4 rounded-xl shadow-sm border">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por # factura, cliente, método o estado..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'hoy', label: 'Hoy' },
              { id: 'semana', label: 'Esta semana' },
              { id: 'mes', label: 'Este mes' },
              { id: 'todas', label: 'Todas' },
              { id: 'personalizada', label: 'Personalizada' }
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => seleccionarRangoFecha(option.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer ${
                  rangoFecha === option.id
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {rangoFecha === 'personalizada' && (
          <input
            type="date"
            aria-label="Filtrar facturas por fecha"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border rounded-lg text-sm"
          />
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {errorMsg}
        </div>
      )}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500 text-sm">Cargando facturas...</div>
        ) : facturasFiltradas.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            No se encontraron facturas con esos criterios.
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="py-3 px-4"># Factura</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Estado / Pago</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {facturasFiltradas.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-mono font-medium">
                    #{f.numero_factura ?? String(f.id).slice(0, 8)}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {f.fecha ? new Date(f.fecha).toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4">{f.clientes?.nombre || 'Consumidor Final'}</td>
                  <td className="py-3 px-4">
                    {isFacturaAnulada(f) ? (
                      <span className="inline-flex rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Anulada
                      </span>
                    ) : (
                      <span className="font-medium">
                        {f.estado_pago || 'Pagada'}
                      </span>
                    )}
                    <span className="text-gray-400"> · </span>
                    <span className="text-gray-600">{f.metodo_pago || 'Efectivo'}</span>
                    {f.motivo_anulacion && (
                      <p className="text-xs text-gray-500 mt-1">
                        Motivo: {f.motivo_anulacion}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">
                    ${Number(f.total || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setFacturaSeleccionada(f)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Recibo
                      </button>
                      <button
                        onClick={() => enviarWhatsApp(f)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </button>
                      {isFacturaAnulada(f) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold">
                          Anulada
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFacturaAnular(f)
                            setMotivoAnulacion('')
                          }}
                          disabled={Boolean(anulandoFacturaId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 text-xs font-medium"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {facturaAnular && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800">Confirmar anulación</h3>
              <button
                type="button"
                onClick={() => setFacturaAnular(null)}
                disabled={Boolean(anulandoFacturaId)}
                className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                aria-label="Cerrar confirmación"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 text-sm">
              <p>
                <span className="font-semibold">Factura:</span> #
                {facturaAnular.numero_factura ?? facturaAnular.id}
              </p>
              <p>
                <span className="font-semibold">Cliente:</span>{' '}
                {facturaAnular.clientes?.nombre || 'Consumidor Final'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 divide-y max-h-52 overflow-y-auto">
              {(facturaAnular.detalle_facturas || []).length === 0 ? (
                <p className="p-3 text-sm text-gray-500">La factura no tiene artículos.</p>
              ) : (
                facturaAnular.detalle_facturas.map((detalle) => (
                  <div key={detalle.id} className="p-3 flex justify-between gap-3 text-sm">
                    <span>{obtenerNombreItem(detalle)}</span>
                    <span className="font-semibold shrink-0">
                      {Number(detalle.cantidad || 0)} und. al stock
                    </span>
                  </div>
                ))
              )}
            </div>

            <label className="block text-sm font-medium text-gray-700">
              Motivo de anulación (opcional)
              <textarea
                value={motivoAnulacion}
                onChange={(event) => setMotivoAnulacion(event.target.value)}
                rows={3}
                disabled={Boolean(anulandoFacturaId)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Escribe el motivo..."
              />
            </label>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => setFacturaAnular(null)}
                disabled={Boolean(anulandoFacturaId)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={anularFactura}
                disabled={Boolean(anulandoFacturaId)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-semibold disabled:opacity-50"
              >
                <Ban className="w-4 h-4" />
                {anulandoFacturaId ? 'Anulando...' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Recibo / Reimpresión */}
      {facturaSeleccionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <h3 className="font-bold text-gray-800">
                Factura #{facturaSeleccionada.numero_factura ?? facturaSeleccionada.id}
              </h3>
              <button
                onClick={() => setFacturaSeleccionada(null)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="text-center border-b pb-3">
                <p className="font-bold text-base">COMPROBANTE DE VENTA</p>
                <p className="text-xs text-gray-500">
                  {facturaSeleccionada.fecha
                    ? new Date(facturaSeleccionada.fecha).toLocaleString()
                    : ''}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Cliente: {facturaSeleccionada.clientes?.nombre || 'Consumidor Final'}
                </p>
                {facturaSeleccionada.clientes?.telefono && (
                  <p className="text-xs text-gray-500">
                    Tel: {facturaSeleccionada.clientes.telefono}
                  </p>
                )}
              </div>

              <div className="divide-y max-h-60 overflow-y-auto">
                {(facturaSeleccionada.detalle_facturas || []).map((det) => {
                  const cant = Number(det.cantidad || 1)
                  const precio = Number(det.precio_unitario || 0)
                  const sub = Number(det.subtotal ?? cant * precio)
                  return (
                    <div key={det.id} className="py-2 flex justify-between gap-2">
                      <div>
                        <p className="font-medium">{obtenerNombreItem(det)}</p>
                        <p className="text-xs text-gray-500">
                          {cant} x ${precio.toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold">${sub.toFixed(2)}</p>
                    </div>
                  )
                })}
              </div>

              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>${Number(facturaSeleccionada.subtotal ?? facturaSeleccionada.total ?? 0).toFixed(2)}</span>
                </div>
                {Number(facturaSeleccionada.descuento || 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Descuento</span>
                    <span>-${Number(facturaSeleccionada.descuento).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-base font-bold pt-1">
                  <span>Total</span>
                  <span>${Number(facturaSeleccionada.total || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 pt-1">
                  <span>
                    Pago: {facturaSeleccionada.metodo_pago || 'Efectivo'} (
                    <span
                      className={
                        isFacturaAnulada(facturaSeleccionada)
                          ? 'text-red-600 font-semibold'
                          : ''
                      }
                    >
                      {isFacturaAnulada(facturaSeleccionada)
                        ? 'Anulada'
                        : facturaSeleccionada.estado_pago || 'Pagada'}
                    </span>
                    )
                  </span>
                  <span>
                    Pagado: ${Number(facturaSeleccionada.monto_pagado ?? facturaSeleccionada.total ?? 0).toFixed(2)}
                  </span>
                </div>
                {facturaSeleccionada.notas && (
                  <p className="text-xs text-gray-500 pt-2 border-t">
                    Nota: {facturaSeleccionada.notas}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => enviarWhatsApp(facturaSeleccionada)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-sm font-medium"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}