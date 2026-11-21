import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import {
  UserPlus,
  Search,
  Phone,
  DollarSign,
  CheckCircle2,
  X,
  RefreshCw,
  FileText
} from 'lucide-react'

const formatMoney = (amount) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(Number(amount || 0))

export default function ClientesAbonos({ onClientesUpdated }) {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloConDeuda, setSoloConDeuda] = useState(false)

  // Nuevo cliente
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Modal de abono / detalle de deuda
  const [clienteActivo, setClienteActivo] = useState(null)
  const [facturaAbono, setFacturaAbono] = useState(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [metodoAbono, setMetodoAbono] = useState('Efectivo')
  const [procesandoAbono, setProcesandoAbono] = useState(false)

  const showToast = (type, message) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const cargarClientes = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        id,
        nombre,
        telefono,
        notas,
        creado_en,
        facturas (
          id,
          numero_factura,
          total,
          monto_pagado,
          estado_pago,
          metodo_pago,
          fecha,
          abonos (
            id,
            monto,
            metodo_pago,
            fecha
          )
        )
      `)
      .order('nombre', { ascending: true })

    if (error) {
      showToast('error', error.message)
    } else {
      const procesados = (data || []).map((c) => {
        const facturasConSaldo = (c.facturas || []).map((f) => {
          const total = Number(f.total || 0)
          const pagado = Number(f.monto_pagado || 0)
          const pendiente = Math.max(0, total - pagado)
          return { ...f, totalNum: total, pagadoNum: pagado, pendiente }
        })
        const deudaTotal = facturasConSaldo.reduce((acc, f) => acc + f.pendiente, 0)
        return {
          ...c,
          facturas: facturasConSaldo.sort(
            (a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)
          ),
          deudaTotal
        }
      })
      setClientes(procesados)
      if (clienteActivo) {
        const actualizado = procesados.find((item) => item.id === clienteActivo.id)
        if (actualizado) setClienteActivo(actualizado)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarClientes()
  }, [])

  const handleCrearCliente = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) return

    setGuardando(true)
    const { error } = await supabase.from('clientes').insert([
      {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        notas: notas.trim() || null
      }
    ])
    setGuardando(false)

    if (error) {
      showToast('error', error.message)
      return
    }

    setNombre('')
    setTelefono('')
    setNotas('')
    showToast('success', 'Cliente registrado correctamente.')
    await cargarClientes()
    if (onClientesUpdated) onClientesUpdated()
  }

  const handleRegistrarAbono = async (e) => {
    e.preventDefault()
    if (!facturaAbono) return

    const monto = parseFloat(montoAbono)
    if (!monto || monto <= 0) {
      showToast('error', 'Ingresa un monto válido mayor a 0.')
      return
    }
    if (monto > facturaAbono.pendiente + 0.01) {
      showToast('error', `El abono no puede superar el saldo pendiente (${formatMoney(facturaAbono.pendiente)}).`)
      return
    }

    setProcesandoAbono(true)
    try {
      // 1. Insertar registro en tabla abonos
      const { error: abonoErr } = await supabase.from('abonos').insert([
        {
          factura_id: facturaAbono.id,
          monto,
          metodo_pago: metodoAbono
        }
      ])
      if (abonoErr) throw abonoErr

      // 2. Actualizar monto_pagado y estado_pago en facturas
      const nuevoPagado = facturaAbono.pagadoNum + monto
      const nuevoEstado = nuevoPagado >= facturaAbono.totalNum - 0.01 ? 'Pagada' : 'Parcial'

      const { error: facErr } = await supabase
        .from('facturas')
        .update({
          monto_pagado: nuevoPagado,
          estado_pago: nuevoEstado
        })
        .eq('id', facturaAbono.id)
      if (facErr) throw facErr

      setFacturaAbono(null)
      setMontoAbono('')
      showToast('success', `Abono de ${formatMoney(monto)} registrado.`)
      await cargarClientes()
    } catch (err) {
      showToast('error', err.message || 'Error al registrar el abono.')
    } finally {
      setProcesandoAbono(false)
    }
  }

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (soloConDeuda && c.deudaTotal <= 0) return false
      const q = busqueda.trim().toLowerCase()
      if (!q) return true
      return (
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.telefono || '').toLowerCase().includes(q) ||
        (c.notas || '').toLowerCase().includes(q)
      )
    })
  }, [clientes, busqueda, soloConDeuda])

  const totalPorCobrar = useMemo(
    () => clientes.reduce((acc, c) => acc + c.deudaTotal, 0),
    [clientes]
  )

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`rounded-xl px-4 py-2.5 text-sm font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Resumen superior */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-base text-slate-900">Clientes & Cuentas por Cobrar</h2>
          <p className="text-xs text-slate-500">
            Administra tus clientes frecuentes, saldos pendientes y abonos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2 text-right">
            <p className="text-[11px] text-amber-800 font-medium">Total por cobrar</p>
            <p className="text-sm font-bold text-amber-900">{formatMoney(totalPorCobrar)}</p>
          </div>
          <button
            onClick={cargarClientes}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Formulario Nuevo Cliente */}
        <form
          onSubmit={handleCrearCliente}
          className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-3 h-fit"
        >
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900">
            <UserPlus className="w-4 h-4 text-rose-600" />
            Registrar Cliente
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre completo *
            </label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. María Pérez"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Teléfono / WhatsApp
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej. 8095551234"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notas (dirección, referencia, etc.)
            </label>
            <textarea
              rows="2"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 text-sm cursor-pointer"
          >
            {guardando ? 'Guardando...' : 'Guardar Cliente'}
          </button>
        </form>

        {/* Listado de Clientes */}
        <div className="lg:col-span-8 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o teléfono..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soloConDeuda}
                onChange={(e) => setSoloConDeuda(e.target.checked)}
                className="rounded text-rose-600"
              />
              Solo con saldo pendiente
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {loading ? (
              <p className="p-6 text-center text-sm text-slate-500">Cargando clientes...</p>
            ) : clientesFiltrados.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                No hay clientes que coincidan con la búsqueda.
              </p>
            ) : (
              clientesFiltrados.map((c) => (
                <div
                  key={c.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-slate-900">{c.nombre}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {c.telefono && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {c.telefono}
                        </span>
                      )}
                      <span>{c.facturas.length} factura(s)</span>
                    </div>
                    {c.notas && <p className="text-xs text-slate-400">{c.notas}</p>}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Saldo pendiente</p>
                      <p
                        className={`text-sm font-bold ${
                          c.deudaTotal > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatMoney(c.deudaTotal)}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setClienteActivo(c)
                        setFacturaAbono(null)
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver Cuenta
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Cuenta del Cliente & Abonos */}
      {clienteActivo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">{clienteActivo.nombre}</h3>
                <p className="text-xs text-slate-500">
                  {clienteActivo.telefono || 'Sin teléfono'} · Deuda total:{' '}
                  <strong className="text-amber-700">
                    {formatMoney(clienteActivo.deudaTotal)}
                  </strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setClienteActivo(null)
                  setFacturaAbono(null)
                }}
                className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario rápido de abono si seleccionó una factura */}
            {facturaAbono && (
              <form
                onSubmit={handleRegistrarAbono}
                className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-900">
                    Abonar a Factura #{facturaAbono.numero_factura} (Pendiente:{' '}
                    {formatMoney(facturaAbono.pendiente)})
                  </p>
                  <button
                    type="button"
                    onClick={() => setFacturaAbono(null)}
                    className="text-xs text-amber-800 underline cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-amber-900 mb-1">Monto a abonar *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={facturaAbono.pendiente}
                      required
                      value={montoAbono}
                      onChange={(e) => setMontoAbono(e.target.value)}
                      placeholder={String(facturaAbono.pendiente)}
                      className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-amber-900 mb-1">Método</label>
                    <select
                      value={metodoAbono}
                      onChange={(e) => setMetodoAbono(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm"
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Tarjeta">Tarjeta</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={procesandoAbono}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 text-xs cursor-pointer"
                >
                  {procesandoAbono ? 'Registrando...' : 'Confirmar Abono'}
                </button>
              </form>
            )}

            {/* Lista de facturas del cliente */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-700">Historial de facturas</p>
              {clienteActivo.facturas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Este cliente aún no tiene facturas registradas.
                </p>
              ) : (
                clienteActivo.facturas.map((f) => (
                  <div
                    key={f.id}
                    className="border border-slate-200 rounded-xl p-3 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">
                          Factura #{f.numero_factura}
                        </span>
                        <span className="text-slate-400 ml-2">
                          {f.fecha ? new Date(f.fecha).toLocaleDateString('es-DO') : ''}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold ${
                          f.pendiente > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {f.estado_pago}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Total: {formatMoney(f.totalNum)}</span>
                      <span>Pagado: {formatMoney(f.pagadoNum)}</span>
                      <span className="font-bold text-slate-900">
                        Debe: {formatMoney(f.pendiente)}
                      </span>
                    </div>

                    {f.pendiente > 0 && (
                      <button
                        onClick={() => {
                          setFacturaAbono(f)
                          setMontoAbono(String(f.pendiente))
                        }}
                        className="w-full mt-1 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Registrar Abono
                      </button>
                    )}

                    {f.abonos && f.abonos.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                        <p className="font-medium text-slate-600">Abonos realizados:</p>
                        {f.abonos.map((ab) => (
                          <div key={ab.id} className="flex justify-between">
                            <span>
                              {ab.fecha ? new Date(ab.fecha).toLocaleDateString('es-DO') : ''} ·{' '}
                              {ab.metodo_pago}
                            </span>
                            <span className="text-emerald-700 font-semibold">
                              +{formatMoney(ab.monto)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}