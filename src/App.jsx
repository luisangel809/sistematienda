import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import HistorialFacturas from './components/HistorialFacturas'
import ClientesAbonos from './components/ClientesAbonos'
import InventarioManager from './components/InventarioManager'
import DashboardStats from './components/DashboardStats'
import {
  LogOut,
  ShoppingBag,
  PackagePlus,
  ReceiptText,
  Users,
  BarChart3,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Share2,
  Store
} from 'lucide-react'

const CART_STORAGE_KEY = 'pos_tienda_cart_v1'

const formatMoney = (amount) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(Number(amount || 0))

export default function App() {
  const [session, setSession] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  // Login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [submittingAuth, setSubmittingAuth] = useState(false)

  // Navigation: 'pos' | 'inventory' | 'clientes' | 'historial' | 'dashboard'
  const [activeTab, setActiveTab] = useState('pos')

  // Data state
  const [categorias, setCategorias] = useState([])
  const [variantes, setVariantes] = useState([])
  const [clientesList, setClientesList] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoria, setSelectedCategoria] = useState('ALL')

  // POS cart state (persistido en localStorage)
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [selectedClienteId, setSelectedClienteId] = useState('')
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('Efectivo')
  const [amountPaid, setAmountPaid] = useState('')
  const [processingSale, setProcessingSale] = useState(false)
  const [lastReceipt, setLastReceipt] = useState(null)

  const [feedback, setFeedback] = useState(null)
  const checkoutSectionRef = useRef(null)

  // Guardar carrito automáticamente en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // Ignorar errores en modo privado restringido
    }
  }, [cart])

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoadingAuth(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoadingAuth(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load categories, variants & clients when logged in
  const loadStoreData = async () => {
    setLoadingData(true)
    const [{ data: cats }, { data: vars, error: varsErr }, { data: clis }] = await Promise.all([
      supabase.from('categorias').select('*').order('nombre'),
      supabase
        .from('variantes')
        .select(`
          *,
          productos (
            id,
            nombre,
            marca,
            categoria_id,
            categorias ( id, nombre )
          )
        `)
        .eq('activo', true)
        .order('creado_en', { ascending: false }),
      supabase
        .from('clientes')
        .select(`
          id,
          nombre,
          telefono,
          notas,
          facturas (
            total,
            monto_pagado
          )
        `)
        .order('nombre')
    ])

    if (cats) {
      setCategorias(cats)
    }
    if (!varsErr && vars) {
      setVariantes(vars)

      // Sincronizar datos actuales de stock y precio en artículos guardados en carrito
      setCart((prevCart) =>
        prevCart
          .map((item) => {
            const freshVar = vars.find((fv) => fv.id === item.variante.id)
            if (!freshVar) return null
            const maxStock = Math.max(0, Number(freshVar.stock_actual || 0))
            if (maxStock <= 0) return null
            return {
              variante: freshVar,
              cantidad: Math.min(item.cantidad, maxStock)
            }
          })
          .filter(Boolean)
      )
    }
    if (clis) {
      const clientesConDeuda = clis.map((c) => {
        const deuda = (c.facturas || []).reduce(
          (acc, f) => acc + Math.max(0, Number(f.total || 0) - Number(f.monto_pagado || 0)),
          0
        )
        return { ...c, deuda }
      })
      setClientesList(clientesConDeuda)
    }
    setLoadingData(false)
  }

  useEffect(() => {
    if (session) {
      loadStoreData()
    }
  }, [session])

  const showToast = (type, message) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthError('')
    setSubmittingAuth(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })
    setSubmittingAuth(false)
    if (error) {
      setAuthError('Correo o contraseña incorrectos.')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setCart([])
    localStorage.removeItem(CART_STORAGE_KEY)
    setLastReceipt(null)
  }

  // Client autocomplete helpers in POS
  const clienteSeleccionadoObj = useMemo(
    () => clientesList.find((c) => c.id === selectedClienteId) || null,
    [clientesList, selectedClienteId]
  )

  const sugerenciasClientes = useMemo(() => {
    const q = customerName.trim().toLowerCase()
    if (!q || selectedClienteId) return []
    return clientesList
      .filter(
        (c) =>
          (c.nombre || '').toLowerCase().includes(q) ||
          (c.telefono || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [clientesList, customerName, selectedClienteId])

  const handleSelectClientePOS = (cliente) => {
    if (!cliente) {
      setSelectedClienteId('')
      setCustomerName('')
      setCustomerPhone('')
      setShowClienteSuggestions(false)
      return
    }
    setSelectedClienteId(cliente.id)
    setCustomerName(cliente.nombre || '')
    setCustomerPhone(cliente.telefono || '')
    setShowClienteSuggestions(false)
  }

  // Filtered variants
  const filteredVariantes = useMemo(() => {
    return variantes.filter((v) => {
      const catId = v.productos?.categoria_id
      const matchesCat = selectedCategoria === 'ALL' || catId === selectedCategoria
      const q = searchQuery.trim().toLowerCase()
      if (!q) return matchesCat
      const haystack = [
        v.productos?.nombre,
        v.productos?.marca,
        v.productos?.categorias?.nombre,
        v.sku,
        v.talla,
        v.color,
        v.presentacion
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return matchesCat && haystack.includes(q)
    })
  }, [variantes, selectedCategoria, searchQuery])

  // Cart helpers
  const addToCart = (variante) => {
    if ((variante.stock_actual || 0) <= 0) {
      showToast('error', 'Esta variante no tiene stock disponible.')
      return
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.variante.id === variante.id)
      if (existing) {
        if (existing.cantidad >= variante.stock_actual) {
          showToast('error', `Solo hay ${variante.stock_actual} unidades disponibles.`)
          return prev
        }
        return prev.map((item) =>
          item.variante.id === variante.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      }
      return [...prev, { variante, cantidad: 1 }]
    })
  }

  const updateCartQty = (varianteId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variante.id !== varianteId) return item
          const nextQty = item.cantidad + delta
          if (nextQty <= 0) return null
          if (nextQty > item.variante.stock_actual) {
            showToast('error', `Máximo disponible: ${item.variante.stock_actual}`)
            return item
          }
          return { ...item, cantidad: nextQty }
        })
        .filter(Boolean)
    )
  }

  const removeFromCart = (varianteId) => {
    setCart((prev) => prev.filter((item) => item.variante.id !== varianteId))
  }

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (acc, item) => acc + Number(item.variante.precio_venta || 0) * item.cantidad,
        0
      ),
    [cart]
  )

  const total = useMemo(
    () => Math.max(0, subtotal - Number(discount || 0)),
    [subtotal, discount]
  )

  const scrollToCheckout = () => {
    checkoutSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Process sale
  const handleCheckout = async (e) => {
    e.preventDefault()
    if (cart.length === 0) {
      showToast('error', 'Agrega al menos un producto al carrito.')
      return
    }

    const rawPaid =
      amountPaid === '' ? (paymentMethod === 'Credito' ? 0 : total) : parseFloat(amountPaid) || 0
    const estadoPago =
      rawPaid >= total ? 'Pagada' : rawPaid > 0 ? 'Parcial' : 'Pendiente'

    if (estadoPago !== 'Pagada' && !selectedClienteId && !customerName.trim()) {
      showToast(
        'error',
        'Para ventas a crédito o abono debes seleccionar o escribir el nombre del cliente.'
      )
      return
    }

    setProcessingSale(true)
    try {
      let clienteId = selectedClienteId || null

      if (clienteId) {
        if (customerName.trim()) {
          await supabase
            .from('clientes')
            .update({
              nombre: customerName.trim(),
              telefono: customerPhone.trim() || null
            })
            .eq('id', clienteId)
        }
      } else if (customerName.trim()) {
        const { data: cliData, error: cliErr } = await supabase
          .from('clientes')
          .insert([
            {
              nombre: customerName.trim(),
              telefono: customerPhone.trim() || null
            }
          ])
          .select()
          .single()
        if (cliErr) throw cliErr
        clienteId = cliData.id
      }

      const { data: factura, error: facErr } = await supabase
        .from('facturas')
        .insert([
          {
            cliente_id: clienteId,
            subtotal,
            descuento: Number(discount || 0),
            total,
            monto_pagado: rawPaid,
            metodo_pago: paymentMethod,
            estado_pago: estadoPago,
            notas: customerName.trim() ? `Cliente: ${customerName.trim()}` : 'Venta mostrador'
          }
        ])
        .select()
        .single()

      if (facErr) throw facErr

      for (const item of cart) {
        const precioUnit = Number(item.variante.precio_venta || 0)
        const costoUnit = Number(item.variante.precio_costo || 0)
        const lineSubtotal = precioUnit * item.cantidad

        const { error: detErr } = await supabase.from('detalle_facturas').insert([
          {
            factura_id: factura.id,
            variante_id: item.variante.id,
            cantidad: item.cantidad,
            precio_unitario: precioUnit,
            costo_unitario: costoUnit,
            subtotal: lineSubtotal
          }
        ])
        if (detErr) throw detErr

        const nuevoStock = Math.max(0, Number(item.variante.stock_actual || 0) - item.cantidad)
        const { error: stockErr } = await supabase
          .from('variantes')
          .update({ stock_actual: nuevoStock })
          .eq('id', item.variante.id)
        if (stockErr) throw stockErr

        await supabase.from('movimientos_inventario').insert([
          {
            variante_id: item.variante.id,
            tipo: 'Venta',
            cantidad: -item.cantidad,
            motivo: `Factura #${factura.numero_factura}`
          }
        ])
      }

      if (rawPaid > 0 && estadoPago !== 'Pagada') {
        await supabase.from('abonos').insert([
          {
            factura_id: factura.id,
            monto: rawPaid,
            metodo_pago: paymentMethod === 'Credito' ? 'Efectivo' : paymentMethod
          }
        ])
      }

      setLastReceipt({
        numero: factura.numero_factura,
        fecha: new Date().toLocaleString('es-DO'),
        cliente: customerName.trim() || 'Cliente general',
        telefono: customerPhone.trim(),
        items: cart.map((i) => ({
          nombre: i.variante.productos?.nombre,
          detalle: [i.variante.talla, i.variante.color, i.variante.presentacion]
            .filter(Boolean)
            .join(' · '),
          cantidad: i.cantidad,
          precio: Number(i.variante.precio_venta || 0)
        })),
        subtotal,
        descuento: Number(discount || 0),
        total,
        pagado: rawPaid,
        pendiente: Math.max(0, total - rawPaid),
        metodoPago: paymentMethod,
        estadoPago
      })

      setCart([])
      localStorage.removeItem(CART_STORAGE_KEY)
      setSelectedClienteId('')
      setCustomerName('')
      setCustomerPhone('')
      setDiscount(0)
      setAmountPaid('')
      await loadStoreData()
      showToast('success', `Factura #${factura.numero_factura} registrada.`)
    } catch (err) {
      showToast('error', err.message || 'No se pudo completar la venta.')
    } finally {
      setProcessingSale(false)
    }
  }

  const shareReceiptWhatsApp = (r) => {
    const lines = [
      `*RECIBO DE VENTA #${r.numero}*`,
      `Fecha: ${r.fecha}`,
      `Cliente: ${r.cliente}`,
      `----------------`,
      ...r.items.map(
        (it) =>
          `${it.cantidad}x ${it.nombre}${it.detalle ? ` (${it.detalle})` : ''} - ${formatMoney(
            it.cantidad * it.precio
          )}`
      ),
      `----------------`,
      `Total: *${formatMoney(r.total)}*`,
      `Pagado: ${formatMoney(r.pagado)} (${r.metodoPago})`,
      ...(r.pendiente > 0 ? [`Saldo pendiente: *${formatMoney(r.pendiente)}*`] : [])
    ]
    const phoneDigits = (r.telefono || '').replace(/\D/g, '')
    const url = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Cargando sistema...
      </div>
    )
  }

  // LOGIN SCREEN
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Tienda & POS</h1>
              <p className="text-xs text-slate-500">Inicia sesión para continuar</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tienda.com"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {authError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={submittingAuth}
              className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold py-2.5 text-sm transition cursor-pointer"
            >
              {submittingAuth ? 'Entrando...' : 'Entrar al sistema'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const cartItemsCount = cart.reduce((a, b) => a + b.cantidad, 0)

  return (
    <div
      className={`min-h-screen bg-slate-50 text-slate-900 ${
        activeTab === 'pos' && cart.length > 0 ? 'pb-36 md:pb-8' : 'pb-24 md:pb-8'
      }`}
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base leading-tight">Tienda & POS</h1>
              <p className="text-[11px] text-slate-500 truncate max-w-45 sm:max-w-xs">
                {session.user.email}
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setActiveTab('pos')}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
                activeTab === 'pos'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Facturar (POS)
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <PackagePlus className="w-4 h-4" />
              Inventario
            </button>
            <button
              onClick={() => setActiveTab('clientes')}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
                activeTab === 'clientes'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Clientes
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
                activeTab === 'historial'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ReceiptText className="w-4 h-4" />
              Historial
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Toast Feedback */}
      {feedback && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div
            className={`rounded-xl px-4 py-2.5 text-sm font-medium border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {feedback.message}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {lastReceipt && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
              <h2 className="font-bold text-base">Factura #{lastReceipt.numero}</h2>
            </div>

            <div className="text-xs text-slate-600 space-y-1 border-y border-slate-200 py-3">
              <p>
                <strong>Fecha:</strong> {lastReceipt.fecha}
              </p>
              <p>
                <strong>Cliente:</strong> {lastReceipt.cliente}
              </p>
              <p>
                <strong>Pago:</strong> {lastReceipt.metodoPago} ({lastReceipt.estadoPago})
              </p>
            </div>

            <div className="space-y-1.5 text-xs max-h-44 overflow-y-auto">
              {lastReceipt.items.map((it, idx) => (
                <div key={idx} className="flex justify-between gap-2">
                  <span>
                    {it.cantidad}x {it.nombre}{' '}
                    {it.detalle && <span className="text-slate-400">({it.detalle})</span>}
                  </span>
                  <span className="font-medium">{formatMoney(it.cantidad * it.precio)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>{formatMoney(lastReceipt.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Pagado</span>
                <span>{formatMoney(lastReceipt.pagado)}</span>
              </div>
              {lastReceipt.pendiente > 0 && (
                <div className="flex justify-between text-xs text-amber-700 font-semibold">
                  <span>Pendiente / Abono</span>
                  <span>{formatMoney(lastReceipt.pendiente)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => shareReceiptWhatsApp(lastReceipt)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={() => setLastReceipt(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2.5 text-xs font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Catalog Column */}
            <div className="lg:col-span-7 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar producto, talla, color, ml/g o SKU..."
                  className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Category Chips */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedCategoria('ALL')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                    selectedCategoria === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  Todos
                </button>
                {categorias.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategoria(c.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer ${
                      selectedCategoria === c.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>

              {loadingData ? (
                <p className="text-sm text-slate-500 py-8 text-center">Cargando catálogo...</p>
              ) : filteredVariantes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                  No hay variantes que coincidan. Ve a la pestaña <strong>Inventario</strong> para agregar productos.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredVariantes.map((v) => {
                    const specs = [v.talla, v.color, v.presentacion].filter(Boolean).join(' · ')
                    const lowStock = (v.stock_actual || 0) <= (v.stock_minimo || 3)
                    return (
                      <button
                        key={v.id}
                        onClick={() => addToCart(v)}
                        className="text-left bg-white rounded-2xl border border-slate-200 hover:border-rose-400 active:scale-[0.99] p-4 transition flex flex-col justify-between gap-3 cursor-pointer"
                      >
                        <div>
                          {v.imagen_url && (
                            <img
                              src={v.imagen_url}
                              alt={v.productos?.nombre}
                              className="w-full h-28 object-cover rounded-xl mb-2.5 border border-slate-100"
                            />
                          )}
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                              {v.productos?.categorias?.nombre || 'General'}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                                (v.stock_actual || 0) <= 0
                                  ? 'bg-red-100 text-red-700'
                                  : lowStock
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              Stock: {v.stock_actual}
                            </span>
                          </div>
                          <h3 className="font-semibold text-sm text-slate-900 mt-2">
                            {v.productos?.nombre}
                          </h3>
                          {specs && <p className="text-xs text-slate-500 mt-0.5">{specs}</p>}
                          {v.fecha_vencimiento && (
                            <p className="text-[11px] text-amber-700 mt-1">
                              Vence: {v.fecha_vencimiento}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="font-bold text-base text-slate-900">
                            {formatMoney(v.precio_venta)}
                          </span>
                          <span className="text-xs font-semibold text-rose-600">+ Agregar</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cart / Checkout Column */}
            <div ref={checkoutSectionRef} className="lg:col-span-5 scroll-mt-20">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 lg:sticky lg:top-20 lg:flex lg:flex-col lg:max-h-[calc(100vh-6rem)]">
                <h2 className="font-bold text-base flex items-center justify-between shrink-0">
                  <span>Orden de Venta</span>
                  <span className="text-xs font-normal text-slate-500">
                    {cartItemsCount} art.
                  </span>
                </h2>

                {cart.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                    Toca un producto para agregarlo a la venta.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-60 lg:max-h-none lg:flex-1 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={item.variante.id}
                        className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl p-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {item.variante.productos?.nombre}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatMoney(item.variante.precio_venta)} c/u
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.variante.id, -1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-bold w-5 text-center">
                            {item.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.variante.id, 1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.variante.id)}
                            className="w-7 h-7 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                 <form
                  onSubmit={handleCheckout}
                  className="space-y-4 pt-2 border-t border-slate-100"
                >
                  {/* Autocompletado inteligente de cliente */}
                  <div className="space-y-2 pt-1 relative">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={customerName}
                          onFocus={() => setShowClienteSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowClienteSuggestions(false), 180)}
                          onChange={(e) => {
                            setCustomerName(e.target.value)
                            if (selectedClienteId) setSelectedClienteId('')
                            setShowClienteSuggestions(true)
                          }}
                          placeholder="Buscar o escribir cliente (ej. Mari...)"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />

                        {showClienteSuggestions && sugerenciasClientes.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-52 overflow-y-auto divide-y divide-slate-100">
                            {sugerenciasClientes.map((cli) => (
                              <button
                                key={cli.id}
                                type="button"
                                onMouseDown={() => handleSelectClientePOS(cli)}
                                className="w-full text-left px-3 py-2 hover:bg-rose-50 transition flex items-center justify-between gap-2 cursor-pointer"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">
                                    {cli.nombre}
                                  </p>
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {cli.telefono || 'Sin teléfono'}
                                    {cli.notas ? ` · ${cli.notas}` : ''}
                                  </p>
                                </div>
                                {cli.deuda > 0 && (
                                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                    Debe {formatMoney(cli.deuda)}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="WhatsApp cliente"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>

                    {clienteSeleccionadoObj && (
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            Cliente vinculado: {clienteSeleccionadoObj.nombre}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectClientePOS(null)}
                            className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                          >
                            Quitar
                          </button>
                        </div>

                        {clienteSeleccionadoObj.deuda > 0 ? (
                          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 font-semibold">
                            Saldo pendiente acumulado: {formatMoney(clienteSeleccionadoObj.deuda)}
                          </p>
                        ) : (
                          <p className="text-emerald-700 text-[11px]">Sin deudas pendientes</p>
                        )}

                        {clienteSeleccionadoObj.notas && (
                          <p className="text-slate-600 text-[11px]">
                            <strong>Nota:</strong> {clienteSeleccionadoObj.notas}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Método de pago</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white"
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Tarjeta">Tarjeta</option>
                        <option value="Credito">Crédito / Abono</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Descuento</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Monto pagado hoy (vacío = paga total)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder={String(total)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="border-t border-slate-200 pt-3 space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Subtotal</span>
                      <span>{formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg text-slate-900">
                      <span>Total</span>
                      <span>{formatMoney(total)}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={processingSale || cart.length === 0}
                    className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-3 text-sm transition cursor-pointer"
                  >
                    {processingSale ? 'Procesando...' : 'Cobrar y Generar Recibo'}
                  </button>
                </form> 
              </div>
            </div>

            {/* Barra flotante fija para móvil cuando hay artículos en el carrito */}
            {cart.length > 0 && (
              <button
                type="button"
                onClick={scrollToCheckout}
                className="md:hidden fixed bottom-16 inset-x-2 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between z-30 text-left cursor-pointer"
              >
                <div>
                  <p className="text-[10px] text-slate-400">Carrito activo · Toca para cobrar</p>
                  <p className="text-sm font-bold">{cartItemsCount} artículos</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400">Total a cobrar</p>
                  <p className="text-base font-extrabold text-rose-400">{formatMoney(total)}</p>
                </div>
              </button>
            )}
          </div>
        )}

        {activeTab === 'inventory' && (
          <InventarioManager
            categorias={categorias}
            variantes={variantes}
            onInventoryUpdated={loadStoreData}
          />
        )}

        {activeTab === 'clientes' && <ClientesAbonos onClientesUpdated={loadStoreData} />}

        {activeTab === 'historial' && <HistorialFacturas />}

        {activeTab === 'dashboard' && <DashboardStats variantes={variantes} />}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 grid grid-cols-5">
        <button
          onClick={() => setActiveTab('pos')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'pos' ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Facturar
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'inventory' ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          <PackagePlus className="w-4 h-4" />
          Stock
        </button>
        <button
          onClick={() => setActiveTab('clientes')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'clientes' ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          <Users className="w-4 h-4" />
          Clientes
        </button>
        <button
          onClick={() => setActiveTab('historial')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'historial' ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          <ReceiptText className="w-4 h-4" />
          Historial
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`py-2.5 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'dashboard' ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Stats
        </button>
      </nav>
    </div>
  )
}