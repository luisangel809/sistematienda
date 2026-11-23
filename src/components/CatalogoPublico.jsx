import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  X
} from 'lucide-react'
import { supabase } from '../supabase'
import { formatWhatsAppPhone } from '../utils/phone'

const EMPTY_STORE = {
  nombre_tienda: 'Catálogo Digital',
  telefono: '',
  direccion: ''
}

const CART_STORAGE_KEY = 'catalogo_carrito_tienda'

const readStoredCart = () => {
  try {
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!storedCart) return []

    const parsedCart = JSON.parse(storedCart)
    if (!Array.isArray(parsedCart)) {
      throw new Error('El carrito almacenado no tiene el formato esperado.')
    }

    const validCart = parsedCart.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        item.variant &&
        typeof item.variant === 'object' &&
        item.variant.id != null &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
    )
    if (validCart.length !== parsedCart.length) {
      console.warn('Se omitieron artículos inválidos del carrito almacenado.')
    }
    return validCart
  } catch (error) {
    console.error('No se pudo restaurar el carrito del catálogo.', error)
    return []
  }
}

const persistCart = (cart) => {
  try {
    if (cart.length === 0) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch (error) {
    console.error('No se pudo guardar el carrito del catálogo.', error)
  }
}

const getVariantDescription = (variant) =>
  [
    variant.talla ? `Talla ${variant.talla}` : null,
    variant.color ? `Color ${variant.color}` : null,
    variant.presentacion
  ]
    .filter(Boolean)
    .join(' · ') || 'Variante estándar'

const formatMoney = (amount) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(Number(amount || 0))

function CatalogProductCard({ product, variants, onOpen }) {
  const firstInStock = variants.find((variant) => Number(variant.stock_actual) > 0) || variants[0]
  const available = variants.some((variant) => Number(variant.stock_actual) > 0)

  return (
    <a
      href={`/catalogo?producto=${encodeURIComponent(product.id)}`}
      onClick={(event) => onOpen(event, product.id)}
      aria-label={`Ver ${product.nombre}`}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {firstInStock.imagen_url ? (
        <div className="relative">
          <img
            src={firstInStock.imagen_url}
            alt={product.nombre}
            loading="lazy"
            className="aspect-4/5 w-full bg-slate-100 object-cover"
          />
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-semibold text-white ${
              available ? 'bg-emerald-600' : 'bg-slate-600'
            }`}
          >
            {available ? 'Disponible' : 'Agotado'}
          </span>
        </div>
      ) : (
        <div className="relative flex aspect-4/5 items-center justify-center bg-slate-100 text-slate-400">
          <ShoppingBag className="h-9 w-9" />
          <span
            className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-semibold text-white ${
              available ? 'bg-emerald-600' : 'bg-slate-600'
            }`}
          >
            {available ? 'Disponible' : 'Agotado'}
          </span>
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 min-h-10 text-sm font-semibold text-slate-900">
            {product.nombre}
          </h2>
          <span
            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              available ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            aria-label={available ? 'Disponible' : 'Agotado'}
          />
        </div>
        {product.marca && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{product.marca}</p>
        )}
        <p className="mt-2 text-base font-bold text-slate-900">
          {formatMoney(firstInStock.precio_venta)}
        </p>
      </div>
    </a>
  )
}

function ProductDetailView({
  product,
  variants,
  cart,
  onBack,
  onAdd,
  onOrder
}) {
  const firstInStock = variants.find((variant) => Number(variant.stock_actual) > 0) || variants[0]
  const productDescription = product.descripcion?.trim()
  const [selectedTalla, setSelectedTalla] = useState(firstInStock.talla || '')
  const [selectedColor, setSelectedColor] = useState(firstInStock.color || '')
  const [selectedPresentacion, setSelectedPresentacion] = useState(
    firstInStock.presentacion || ''
  )
  const [quantity, setQuantity] = useState(1)
  const tallas = [...new Set(variants.map((variant) => variant.talla || ''))]
  const hasTallas = variants.some((variant) => variant.talla)
  const hasColors = variants.some((variant) => variant.color)
  const talla = tallas.includes(selectedTalla) ? selectedTalla : tallas[0]
  const variantsForTalla = variants.filter((variant) => (variant.talla || '') === talla)
  const colores = [...new Set(variantsForTalla.map((variant) => variant.color || ''))]
  const color = colores.includes(selectedColor) ? selectedColor : colores[0]
  const variantsForColor = variantsForTalla.filter((variant) => (variant.color || '') === color)
  const presentaciones = [
    ...new Set(variantsForColor.map((variant) => variant.presentacion || ''))
  ]
  const hasPresentaciones = presentaciones.length > 1
  const presentacion = presentaciones.includes(selectedPresentacion)
    ? selectedPresentacion
    : presentaciones[0]
  const selectedVariant =
    variantsForColor.find((variant) => (variant.presentacion || '') === presentacion) ||
    variants[0]
  const stock = Number(selectedVariant.stock_actual || 0)
  const cartQuantity =
    cart.find((item) => item.variant.id === selectedVariant.id)?.quantity || 0
  const remainingStock = Math.max(0, stock - cartQuantity)
  const available = remainingStock > 0

  const changeTalla = (nextTalla) => {
    const matchingVariants = variants.filter(
      (variant) => (variant.talla || '') === nextTalla
    )
    setSelectedTalla(nextTalla)
    setSelectedColor(matchingVariants[0]?.color || '')
    setSelectedPresentacion(matchingVariants[0]?.presentacion || '')
    setQuantity(1)
  }

  const changeColor = (nextColor) => {
    const matchingVariant = variantsForTalla.find(
      (variant) => (variant.color || '') === nextColor
    )
    setSelectedColor(nextColor)
    setSelectedPresentacion(matchingVariant?.presentacion || '')
    setQuantity(1)
  }

  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al catálogo
      </button>

      <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 md:p-6">
        <div>
          {selectedVariant.imagen_url ? (
            <img
              src={selectedVariant.imagen_url}
              alt={product.nombre}
              className="max-h-140 w-full rounded-xl bg-slate-100 object-cover"
            />
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <ShoppingBag className="h-12 w-12" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            {product.categorias?.nombre && (
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                {product.categorias.nombre}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{product.nombre}</h1>
            {product.marca && <p className="mt-1 text-sm text-slate-500">{product.marca}</p>}
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {formatMoney(selectedVariant.precio_venta)}
            </p>
          </div>

          {(hasTallas || hasColors || hasPresentaciones) && (
            <div className="grid grid-cols-2 gap-3">
              {hasTallas && (
                <label className="text-xs font-medium text-slate-600">
                  Talla
                  <select
                    value={talla}
                    onChange={(event) => changeTalla(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                  >
                    {tallas.map((value) => (
                      <option key={value || 'sin-talla'} value={value}>
                        {value || 'Sin talla'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasColors && (
                <label className="text-xs font-medium text-slate-600">
                  Color
                  <select
                    value={color}
                    onChange={(event) => changeColor(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                  >
                    {colores.map((value) => (
                      <option key={value || 'sin-color'} value={value}>
                        {value || 'Sin color'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasPresentaciones && (
                <label className="text-xs font-medium text-slate-600">
                  Presentación
                  <select
                    value={presentacion}
                    onChange={(event) => {
                      setSelectedPresentacion(event.target.value)
                      setQuantity(1)
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                  >
                    {presentaciones.map((value) => (
                      <option key={value || 'sin-presentacion'} value={value}>
                        {value || 'Sin presentación'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {productDescription && (
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Descripción</h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {productDescription}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <h2 className="text-sm font-semibold text-slate-800">Disponibilidad por variante</h2>
            <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
              {variants.map((variant) => {
                const variantStock = Number(variant.stock_actual || 0)
                return (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-slate-600">{getVariantDescription(variant)}</span>
                    <span
                      className={`shrink-0 font-semibold ${
                        variantStock > 0 ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {variantStock > 0 ? `${variantStock} disponibles` : 'Agotado'}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-700">
              {available ? `${remainingStock} disponibles para agregar` : 'Agotado'}
            </p>
          </div>

          <div className="mt-auto space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Cantidad</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                  aria-label="Disminuir cantidad"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-bold">{quantity}</span>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) => Math.min(Math.max(1, remainingStock), current + 1))
                  }
                  disabled={!available || quantity >= remainingStock}
                  aria-label="Aumentar cantidad"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onAdd(selectedVariant, quantity)}
              disabled={!available}
              className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {available ? 'Agregar al pedido' : 'Agotado'}
            </button>
            <button
              type="button"
              onClick={() => onOrder(selectedVariant, quantity)}
              disabled={!available}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Pedir por WhatsApp
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function CatalogoPublico() {
  const [store, setStore] = useState(EMPTY_STORE)
  const [categories, setCategories] = useState([])
  const [variants, setVariants] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('ALL')
  const [selectedProductId, setSelectedProductId] = useState(
    () => new URLSearchParams(window.location.search).get('producto')
  )
  const [cart, setCart] = useState(readStoredCart)
  const previousCart = useRef(cart)
  const [cartOpen, setCartOpen] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (previousCart.current === cart) return
    previousCart.current = cart
    persistCart(cart)
  }, [cart])

  useEffect(() => {
    const syncProductFromUrl = () => {
      setSelectedProductId(new URLSearchParams(window.location.search).get('producto'))
    }
    window.addEventListener('popstate', syncProductFromUrl)
    return () => window.removeEventListener('popstate', syncProductFromUrl)
  }, [])

  useEffect(() => {
    let active = true

    const loadCatalog = async () => {
      try {
        const [
          { data: storeData, error: storeError },
          { data: categoryData, error: categoryError },
          { data: variantData, error: variantError }
        ] = await Promise.all([
          supabase
            .from('configuracion_tienda')
            .select('nombre_tienda, telefono, direccion')
            .eq('id', 1)
            .maybeSingle(),
          supabase.from('categorias').select('id, nombre').order('nombre'),
          supabase
            .from('variantes')
            .select(`
              id,
              producto_id,
              talla,
              color,
              stock_actual,
              presentacion,
              precio_venta,
              imagen_url,
              productos!inner (
                id,
                nombre,
                marca,
                descripcion,
                categorias ( id, nombre )
              )
            `)
            .eq('activo', true)
        ])

        if (!active) return

        if (storeError) {
          setLoadError(storeError.message)
        } else {
          setStore({ ...EMPTY_STORE, ...(storeData || {}) })
        }

        if (categoryError) {
          setLoadError((current) =>
            [current, categoryError.message].filter(Boolean).join(' · ')
          )
        } else {
          setCategories(categoryData || [])
        }

        if (variantError) {
          setLoadError((current) => [current, variantError.message].filter(Boolean).join(' · '))
        } else {
          setVariants(variantData || [])
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'No se pudo cargar el catálogo.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCatalog()
    return () => {
      active = false
    }
  }, [])

  const allProducts = useMemo(() => {
    const groups = new Map()
    variants.forEach((variant) => {
      const product = variant.productos
      if (!product) return
      const id = product.id
      if (!groups.has(id)) groups.set(id, { product, variants: [] })
      groups.get(id).variants.push(variant)
    })
    return [...groups.values()]
  }, [variants])

  const products = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return allProducts.filter(({ product }) => {
      const matchesCategory =
        categoryId === 'ALL' ||
        String(product.categorias?.id || '') === String(categoryId)
      const matchesSearch =
        !query ||
        [product.nombre, product.marca]
          .filter(Boolean)
          .some((value) => value.toLocaleLowerCase().includes(query))
      return matchesCategory && matchesSearch
    })
  }, [allProducts, search, categoryId])

  const selectedProduct = allProducts.find(
    ({ product }) => String(product.id) === String(selectedProductId)
  )

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Number(item.variant.precio_venta || 0) * item.quantity,
        0
      ),
    [cart]
  )
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const showMessage = (message) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 3500)
  }

  const clearStoredCart = () => {
    try {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    } catch (error) {
      console.error('No se pudo vaciar el carrito almacenado.', error)
    }
  }

  const clearCart = () => {
    setCart([])
    clearStoredCart()
  }

  const addToCart = (variant, quantity = 1) => {
    const stock = Number(variant.stock_actual || 0)
    if (stock <= 0) return
    const requestedQuantity = Math.max(1, parseInt(quantity, 10) || 1)

    setCart((current) => {
      const existing = current.find((item) => item.variant.id === variant.id)
      if ((existing?.quantity || 0) + requestedQuantity > stock) {
        showMessage(`Solo quedan ${stock} unidades disponibles de esta variante.`)
        return current
      }
      if (existing) {
        return current.map((item) =>
          item.variant.id === variant.id
            ? { ...item, quantity: item.quantity + requestedQuantity }
            : item
        )
      }
      return [...current, { variant, quantity: requestedQuantity }]
    })
  }

  const updateQuantity = (variantId, delta) => {
    setCart((current) =>
      current
        .map((item) => {
          if (item.variant.id !== variantId) return item
          const nextQuantity = item.quantity + delta
          if (nextQuantity <= 0) return null
          if (nextQuantity > Number(item.variant.stock_actual || 0)) {
            showMessage(`Solo quedan ${item.variant.stock_actual} unidades disponibles.`)
            return item
          }
          return { ...item, quantity: nextQuantity }
        })
        .filter(Boolean)
    )
  }

  const removeFromCart = (variantId) => {
    setCart((current) => current.filter((item) => item.variant.id !== variantId))
  }

  const getWhatsAppOrderUrl = (orderItems) => {
    const phone = formatWhatsAppPhone(store.telefono)
    if (!phone || orderItems.length === 0) return ''

    const lines = [
      `Hola, quiero hacer un pedido en ${store.nombre_tienda || 'la tienda'}:`,
      '',
      ...orderItems.map(({ variant, quantity }) => {
        const details = [variant.talla, variant.color, variant.presentacion]
          .filter(Boolean)
          .join(' · ')
        return `${quantity} x ${variant.productos?.nombre}${details ? ` (${details})` : ''} — ${formatMoney(
          Number(variant.precio_venta || 0) * quantity
        )}`
      }),
      '',
      `Total: ${formatMoney(
        orderItems.reduce(
          (sum, item) => sum + Number(item.variant.precio_venta || 0) * item.quantity,
          0
        )
      )}`
    ]

    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
  }

  const sendWhatsAppOrder = (orderItems = cart) => {
    if (orderItems.length === 0) {
      showMessage('Agrega al menos un artículo a la bolsa.')
      return
    }

    const url = getWhatsAppOrderUrl(orderItems)
    if (!url) {
      showMessage('La tienda todavía no tiene un teléfono configurado.')
      return
    }

    clearCart()
    window.location.assign(url)
  }

  const validateCartOrderLink = (event) => {
    if (cart.length === 0) {
      event.preventDefault()
      showMessage('Agrega al menos un artículo a la bolsa.')
    } else if (!formatWhatsAppPhone(store.telefono)) {
      event.preventDefault()
      showMessage('La tienda todavía no tiene un teléfono configurado.')
    } else {
      clearStoredCart()
    }
  }

  const openProduct = (event, productId) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    event.preventDefault()
    const url = new URL(window.location.href)
    url.searchParams.set('producto', productId)
    window.history.pushState({ catalogProductId: String(productId) }, '', url)
    setSelectedProductId(String(productId))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const returnToCatalog = () => {
    if (window.history.state?.catalogProductId) {
      window.history.back()
      return
    }

    const url = new URL(window.location.href)
    url.searchParams.delete('producto')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setSelectedProductId(null)
  }

  const orderSelectedVariant = (variant, quantity) => {
    const existing = cart.find((item) => item.variant.id === variant.id)
    if ((existing?.quantity || 0) + quantity > Number(variant.stock_actual || 0)) {
      showMessage(`Solo quedan ${variant.stock_actual} unidades disponibles de esta variante.`)
      return
    }

    const orderItems = existing
      ? cart.map((item) =>
          item.variant.id === variant.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      : [...cart, { variant, quantity }]
    sendWhatsAppOrder(orderItems)
  }

  const contactStoreWhatsApp = () => {
    const phone = formatWhatsAppPhone(store.telefono)
    if (!phone) {
      showMessage('Aún no hay un teléfono de WhatsApp configurado para la tienda.')
      return
    }

    const greeting = `Hola, estoy viendo el catálogo digital de ${
      store.nombre_tienda || 'la tienda'
    } y me gustaría recibir información sobre sus productos.`
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28 text-slate-900">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white">
              <Store className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                Catálogo digital
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {store.nombre_tienda || 'Catálogo Digital'}
              </h1>
              {store.direccion && <p className="mt-2 text-sm text-slate-600">{store.direccion}</p>}
              {store.telefono && (
                <p className="mt-1 text-sm text-slate-600">WhatsApp: {store.telefono}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {feedback && (
          <p
            role="status"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {feedback}
          </p>
        )}
        {loadError && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            Hubo un problema al cargar parte del catálogo: {loadError}
          </p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-slate-500">Cargando catálogo...</p>
        ) : selectedProductId ? (
          selectedProduct ? (
            <ProductDetailView
              key={selectedProduct.product.id}
              product={selectedProduct.product}
              variants={selectedProduct.variants}
              cart={cart}
              onBack={returnToCatalog}
              onAdd={addToCart}
              onOrder={orderSelectedVariant}
            />
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm text-slate-600">No encontramos ese producto.</p>
              <button
                type="button"
                onClick={returnToCatalog}
                className="mt-3 text-sm font-semibold text-rose-600 hover:text-rose-700"
              >
                Volver al catálogo
              </button>
            </div>
          )
        ) : (
          <div>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o marca..."
                aria-label="Buscar productos por nombre o marca"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <nav
              aria-label="Filtrar por categoría"
              className="mt-4 flex gap-2 overflow-x-auto pb-2"
            >
              <button
                type="button"
                onClick={() => setCategoryId('ALL')}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
                  categoryId === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                Todas
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => setCategoryId(String(category.id))}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
                    String(categoryId) === String(category.id)
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {category.nombre}
                </button>
              ))}
            </nav>

            {products.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No encontramos productos con esos filtros.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {products.map(({ product, variants: productVariants }) => (
                  <CatalogProductCard
                    key={product.id}
                    product={product}
                    variants={productVariants}
                    onOpen={openProduct}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-center gap-3">
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Abrir bolsa de pedido, ${itemCount} artículo${itemCount === 1 ? '' : 's'}`}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-800"
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white shadow">
              {itemCount}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={contactStoreWhatsApp}
          aria-label="Contactar la tienda por WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-600"
        >
          <MessageCircle className="h-7 w-7" />
        </button>
      </div>

      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCartOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-cart-title"
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 id="public-cart-title" className="font-bold text-lg text-slate-900">
                  Bolsa de pedido
                </h2>
                <p className="text-xs text-slate-500">{itemCount} artículo(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Cerrar bolsa"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-4 space-y-3">
              {cart.map(({ variant, quantity }) => {
                const details = [variant.talla, variant.color].filter(Boolean).join(' · ')
                return (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {variant.productos?.nombre}
                      </p>
                      <p className="text-xs text-slate-500">
                        {details || variant.presentacion || 'Variante estándar'}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-700">
                        {formatMoney(variant.precio_venta)} c/u
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(variant.id, -1)}
                        aria-label="Quitar una unidad"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(variant.id, 1)}
                        aria-label="Agregar una unidad"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(variant.id)}
                        aria-label="Eliminar artículo"
                        className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-semibold text-slate-700">Total del pedido</span>
              <span className="text-xl font-bold text-slate-900">{formatMoney(total)}</span>
            </div>

            <a
              href={getWhatsAppOrderUrl(cart) || '#'}
              onClick={validateCartOrderLink}
              className="mt-4 block w-full rounded-xl bg-emerald-600 py-3 text-center text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              Hacer pedido por WhatsApp
            </a>
          </section>
        </div>
      )}
    </div>
  )
}
