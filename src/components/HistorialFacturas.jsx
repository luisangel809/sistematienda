import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Search, Printer, MessageCircle, Eye, X, RefreshCw } from 'lucide-react'

export default function HistorialFacturas() {
  const [facturas, setFacturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)

  const cargarFacturas = async () => {
    setLoading(true)
    setErrorMsg('')

    const { data, error } = await supabase
      .from('facturas')
      .select(`
        id,
        numero_factura,
        cliente_id,
        subtotal,
        descuento,
        total,
        monto_pagado,
        metodo_pago,
        estado_pago,
        notas,
        fecha,
        clientes (
          id,
          nombre,
          telefono
        ),
        detalle_facturas (
          id,
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

  const facturasFiltradas = facturas.filter((f) => {
    const texto = busqueda.trim().toLowerCase()
    const nombreCliente = f.clientes?.nombre || ''
    const coincideTexto =
      !texto ||
      String(f.numero_factura ?? '').toLowerCase().includes(texto) ||
      String(f.id ?? '').toLowerCase().includes(texto) ||
      nombreCliente.toLowerCase().includes(texto) ||
      String(f.metodo_pago ?? '').toLowerCase().includes(texto) ||
      String(f.estado_pago ?? '').toLowerCase().includes(texto)

    const fechaReg = f.fecha ? new Date(f.fecha).toISOString().slice(0, 10) : ''
    const coincideFecha = !fechaFiltro || fechaReg === fechaFiltro

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
      .join('%0A')

    const numFactura = factura.numero_factura ?? factura.id
    const clienteNom = factura.clientes?.nombre || 'Consumidor Final'
    const total = Number(factura.total || 0).toFixed(2)
    const pagado = Number(factura.monto_pagado ?? factura.total ?? 0).toFixed(2)

    const msg =
      `*RECIBO DE COMPRA* (Reimpresión)%0A` +
      `Factura: #${numFactura}%0A` +
      `Cliente: ${clienteNom}%0A` +
      `Fecha: ${factura.fecha ? new Date(factura.fecha).toLocaleString() : ''}%0A` +
      `-----------------%0A` +
      `${detalleTexto}%0A` +
      `-----------------%0A` +
      `*Total: $${total}*%0A` +
      `Pagado: $${pagado} (${factura.metodo_pago || 'Efectivo'} - ${factura.estado_pago || 'Pagada'})`

    const tel = String(factura.clientes?.telefono || '').replace(/\D/g, '')
    const url = tel
      ? `https://wa.me/${tel}?text=${msg}`
      : `https://wa.me/?text=${msg}`

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl shadow-sm border">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por # factura, cliente, método o estado..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <input
          type="date"
          value={fechaFiltro}
          onChange={(e) => setFechaFiltro(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        />
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {errorMsg}
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
                    <span className="font-medium">{f.estado_pago || 'Pagada'}</span>
                    <span className="text-gray-400"> · </span>
                    <span className="text-gray-600">{f.metodo_pago || 'Efectivo'}</span>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
                    Pago: {facturaSeleccionada.metodo_pago || 'Efectivo'} ({facturaSeleccionada.estado_pago || 'Pagada'})
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