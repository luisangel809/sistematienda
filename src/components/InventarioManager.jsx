import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import {
  PackagePlus,
  Plus,
  Pencil,
  PlusCircle,
  Search,
  AlertTriangle,
  ImagePlus,
  X,
  Trash2,
  Package
} from 'lucide-react'

const formatMoney = (amount) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(Number(amount || 0))

const createVariantRow = () => ({ talla: '', color: '', sku: '', stock_inicial: '' })

export default function InventarioManager({ categorias, variantes, onInventoryUpdated }) {
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('ALL')
  const [soloStockBajo, setSoloStockBajo] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Estado formulario Nuevo Producto
  const [newProd, setNewProd] = useState({
    nombre: '',
    marca: '',
    descripcion: '',
    categoria_id: categorias[0]?.id || '',
    presentacion: '',
    fecha_vencimiento: '',
    precio_costo: '',
    precio_venta: '',
    stock_minimo: '3'
  })
  const [newVariantRows, setNewVariantRows] = useState([createVariantRow()])
  const [newPhotoFile, setNewPhotoFile] = useState(null)
  const [newPhotoPreview, setNewPhotoPreview] = useState('')
  const [savingProd, setSavingProd] = useState(false)
  const [mobileProductFormOpen, setMobileProductFormOpen] = useState(false)
  const newProductFormRef = useRef(null)
  const [addingVariantProduct, setAddingVariantProduct] = useState(null)
  const [variantDraft, setVariantDraft] = useState({
    talla: '',
    color: '',
    sku: '',
    stock_inicial: '',
    precio_costo: '',
    precio_venta: ''
  })
  const [savingVariant, setSavingVariant] = useState(false)

  // Estado Modal Edición
  const [editingVar, setEditingVar] = useState(null)
  const [editPhotoFile, setEditPhotoFile] = useState(null)
  const [editPhotoPreview, setEditPhotoPreview] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Estado Modal Entrada/Ajuste de Stock
  const [stockModalVar, setStockModalVar] = useState(null)
  const [stockDelta, setStockDelta] = useState('')
  const [stockMotivo, setStockMotivo] = useState('Reabastecimiento de mercancía')
  const [savingStock, setSavingStock] = useState(false)

  useEffect(() => {
    if (mobileProductFormOpen) {
      newProductFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [mobileProductFormOpen])

  const showToast = (type, message) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }

  const updateNewVariantRow = (index, changes) => {
    setNewVariantRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row))
    )
  }

  const selectedNewCategoryId = categorias.some(
    (category) => String(category.id) === String(newProd.categoria_id)
  )
    ? newProd.categoria_id
    : categorias[0]?.id || ''

  const openAddVariantModal = (group) => {
    const baseVariant = group.variantes[0]
    setAddingVariantProduct({
      id: group.id,
      nombre: group.producto?.nombre,
      baseVariant
    })
    setVariantDraft({
      talla: '',
      color: '',
      sku: '',
      stock_inicial: '',
      precio_costo: String(baseVariant.precio_costo ?? ''),
      precio_venta: String(baseVariant.precio_venta ?? '')
    })
  }

  // Subir foto a Supabase Storage
  const uploadProductPhoto = async (file) => {
    if (!file) return null
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('productos')
      .upload(fileName, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('productos').getPublicUrl(fileName)
    return data.publicUrl
  }

  // Crear producto + variante inicial
  const handleCreateProduct = async (e) => {
    e.preventDefault()
    if (!newProd.nombre.trim() || !newProd.precio_venta) {
      showToast('error', 'Completa al menos el nombre y el precio de venta.')
      return
    }

    const variantKeys = newVariantRows.map((variant) =>
      JSON.stringify([variant.talla.trim().toLowerCase(), variant.color.trim().toLowerCase()])
    )
    if (
      newVariantRows.length > 1 &&
      newVariantRows.some((variant) => !variant.talla.trim() && !variant.color.trim())
    ) {
      showToast('error', 'Cada variante debe tener una talla o un color.')
      return
    }
    if (new Set(variantKeys).size !== variantKeys.length) {
      showToast('error', 'No repitas la misma combinación de talla y color.')
      return
    }

    setSavingProd(true)
    try {
      let imagenUrl = null
      if (newPhotoFile) {
        imagenUrl = await uploadProductPhoto(newPhotoFile)
      }

      const { data: prodData, error: prodError } = await supabase
        .from('productos')
        .insert([
          {
            nombre: newProd.nombre.trim(),
            marca: newProd.marca.trim() || null,
            descripcion: newProd.descripcion.trim() || null,
            categoria_id: selectedNewCategoryId || null
          }
        ])
        .select()
        .single()

      if (prodError) throw prodError

      const { data: varData, error: varError } = await supabase
        .from('variantes')
        .insert(
          newVariantRows.map((variant) => ({
            producto_id: prodData.id,
            sku: variant.sku.trim() || null,
            talla: variant.talla.trim() || null,
            color: variant.color.trim() || null,
            presentacion: newProd.presentacion.trim() || null,
            fecha_vencimiento: newProd.fecha_vencimiento || null,
            precio_costo: parseFloat(newProd.precio_costo || '0') || 0,
            precio_venta: parseFloat(newProd.precio_venta || '0') || 0,
            stock_actual: parseInt(variant.stock_inicial || '0', 10) || 0,
            stock_minimo: parseInt(newProd.stock_minimo || '3', 10) || 3,
            imagen_url: imagenUrl
          }))
        )
        .select()

      if (varError) throw varError

      const initialMovements = varData
        .filter((variant) => Number(variant.stock_actual) > 0)
        .map((variant) => ({
          variante_id: variant.id,
          tipo: 'Entrada',
          cantidad: variant.stock_actual,
          motivo: 'Inventario inicial'
        }))
      if (initialMovements.length > 0) {
        const { error: movementsError } = await supabase
          .from('movimientos_inventario')
          .insert(initialMovements)
        if (movementsError) throw movementsError
      }

      setNewProd({
        nombre: '',
        marca: '',
        descripcion: '',
        categoria_id: categorias[0]?.id || '',
        presentacion: '',
        fecha_vencimiento: '',
        precio_costo: '',
        precio_venta: '',
        stock_minimo: '3'
      })
      setNewVariantRows([createVariantRow()])
      setNewPhotoFile(null)
      setNewPhotoPreview('')

      await onInventoryUpdated()
      setMobileProductFormOpen(false)
      showToast('success', 'Producto agregado al inventario.')
    } catch (err) {
      showToast('error', err.message || 'Error al guardar el producto.')
    } finally {
      setSavingProd(false)
    }
  }

  const handleAddVariant = async (e) => {
    e.preventDefault()
    if (!addingVariantProduct) return
    if (!variantDraft.talla.trim() && !variantDraft.color.trim()) {
      showToast('error', 'Ingresa una talla o un color para la nueva variante.')
      return
    }

    const combination = JSON.stringify([
      variantDraft.talla.trim().toLowerCase(),
      variantDraft.color.trim().toLowerCase()
    ])
    const alreadyExists = variantes.some(
      (variant) =>
        variant.producto_id === addingVariantProduct.id &&
        JSON.stringify([
          (variant.talla || '').trim().toLowerCase(),
          (variant.color || '').trim().toLowerCase()
        ]) === combination
    )
    if (alreadyExists) {
      showToast('error', 'Esta combinación de talla y color ya existe en el producto.')
      return
    }

    setSavingVariant(true)
    try {
      const baseVariant = addingVariantProduct.baseVariant
      const initialStock = parseInt(variantDraft.stock_inicial || '0', 10) || 0
      const { data: variant, error: variantError } = await supabase
        .from('variantes')
        .insert([
          {
            producto_id: addingVariantProduct.id,
            sku: variantDraft.sku.trim() || null,
            talla: variantDraft.talla.trim() || null,
            color: variantDraft.color.trim() || null,
            presentacion: baseVariant.presentacion || null,
            fecha_vencimiento: baseVariant.fecha_vencimiento || null,
            precio_costo: parseFloat(variantDraft.precio_costo || '0') || 0,
            precio_venta: parseFloat(variantDraft.precio_venta || '0') || 0,
            stock_actual: initialStock,
            stock_minimo: baseVariant.stock_minimo || 3,
            imagen_url: baseVariant.imagen_url || null
          }
        ])
        .select()
        .single()

      if (variantError) throw variantError

      if (initialStock > 0) {
        const { error: movementError } = await supabase
          .from('movimientos_inventario')
          .insert([
            {
              variante_id: variant.id,
              tipo: 'Entrada',
              cantidad: initialStock,
              motivo: 'Inventario inicial de variante'
            }
          ])
        if (movementError) throw movementError
      }

      setAddingVariantProduct(null)
      await onInventoryUpdated()
      showToast('success', 'Variante agregada al producto.')
    } catch (err) {
      showToast('error', err.message || 'No se pudo agregar la variante.')
    } finally {
      setSavingVariant(false)
    }
  }

  // Abrir modal de edición
  const openEditModal = (v) => {
    setEditingVar({
      id: v.id,
      producto_id: v.producto_id,
      nombre: v.productos?.nombre || '',
      marca: v.productos?.marca || '',
      descripcion: v.productos?.descripcion || '',
      categoria_id: v.productos?.categoria_id || '',
      categoria_nombre: v.productos?.categorias?.nombre || '',
      sku: v.sku || '',
      talla: v.talla || '',
      color: v.color || '',
      presentacion: v.presentacion || '',
      fecha_vencimiento: v.fecha_vencimiento || '',
      precio_costo: v.precio_costo ?? 0,
      precio_venta: v.precio_venta ?? 0,
      stock_minimo: v.stock_minimo ?? 3,
      imagen_url: v.imagen_url || ''
    })
    setEditPhotoFile(null)
    setEditPhotoPreview(v.imagen_url || '')
  }

  // Guardar edición
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingVar || !editingVar.nombre.trim()) return

    setSavingEdit(true)
    try {
      let imagenUrl = editingVar.imagen_url
      if (editPhotoFile) {
        imagenUrl = await uploadProductPhoto(editPhotoFile)
      }

      const { error: prodErr } = await supabase
        .from('productos')
        .update({
          nombre: editingVar.nombre.trim(),
          marca: editingVar.marca.trim() || null,
          descripcion: editingVar.descripcion.trim() || null,
          categoria_id: editingVar.categoria_id || null
        })
        .eq('id', editingVar.producto_id)

      if (prodErr) throw prodErr

      const { error: varErr } = await supabase
        .from('variantes')
        .update({
          sku: editingVar.sku.trim() || null,
          talla: editingVar.talla.trim() || null,
          color: editingVar.color.trim() || null,
          presentacion: editingVar.presentacion.trim() || null,
          fecha_vencimiento: editingVar.fecha_vencimiento || null,
          precio_costo: parseFloat(editingVar.precio_costo || '0') || 0,
          precio_venta: parseFloat(editingVar.precio_venta || '0') || 0,
          stock_minimo: parseInt(editingVar.stock_minimo || '3', 10) || 3,
          imagen_url: imagenUrl || null
        })
        .eq('id', editingVar.id)

      if (varErr) throw varErr

      setEditingVar(null)
      await onInventoryUpdated()
      showToast('success', 'Cambios guardados correctamente.')
    } catch (err) {
      showToast('error', err.message || 'No se pudo actualizar el artículo.')
    } finally {
      setSavingEdit(false)
    }
  }

  // Registrar entrada o ajuste de stock
  const handleAdjustStock = async (e) => {
    e.preventDefault()
    if (!stockModalVar) return

    const cantidad = parseInt(stockDelta, 10)
    if (!cantidad || cantidad === 0) {
      showToast('error', 'Ingresa una cantidad válida (positiva para sumar, negativa para restar).')
      return
    }

    const nuevoStock = Math.max(0, Number(stockModalVar.stock_actual || 0) + cantidad)
    setSavingStock(true)
    try {
      const { error: stockErr } = await supabase
        .from('variantes')
        .update({ stock_actual: nuevoStock })
        .eq('id', stockModalVar.id)

      if (stockErr) throw stockErr

      await supabase.from('movimientos_inventario').insert([
        {
          variante_id: stockModalVar.id,
          tipo: cantidad > 0 ? 'Entrada' : 'Ajuste',
          cantidad,
          motivo: stockMotivo.trim() || (cantidad > 0 ? 'Entrada de mercancía' : 'Ajuste manual')
        }
      ])

      setStockModalVar(null)
      setStockDelta('')
      await onInventoryUpdated()
      showToast('success', `Stock actualizado a ${nuevoStock} unidades.`)
    } catch (err) {
      showToast('error', err.message || 'Error al ajustar stock.')
    } finally {
      setSavingStock(false)
    }
  }

  // Archivar (desactivar) variante
  const handleArchiveVariante = async (v) => {
    const ok = window.confirm(
      `¿Ocultar "${v.productos?.nombre}" del inventario y del POS? (No afectará las facturas pasadas)`
    )
    if (!ok) return

    const { error } = await supabase
      .from('variantes')
      .update({ activo: false })
      .eq('id', v.id)

    if (error) {
      showToast('error', error.message)
      return
    }
    await onInventoryUpdated()
    showToast('success', 'Artículo ocultado del catálogo activo.')
  }

  const variantesFiltradas = useMemo(() => {
    return variantes.filter((v) => {
      const lowStock = (v.stock_actual || 0) <= (v.stock_minimo || 3)
      if (soloStockBajo && !lowStock) return false
      if (categoriaFiltro !== 'ALL' && v.productos?.categoria_id !== categoriaFiltro) {
        return false
      }

      const q = busqueda.trim().toLowerCase()
      if (!q) return true
      const text = [
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
      return text.includes(q)
    })
  }, [variantes, busqueda, soloStockBajo, categoriaFiltro])

  const productosAgrupados = useMemo(() => {
    const products = new Map()
    variantesFiltradas.forEach((variant) => {
      const productId = variant.producto_id || variant.productos?.id || variant.id
      if (!products.has(productId)) {
        products.set(productId, {
          id: productId,
          producto: variant.productos,
          variantes: []
        })
      }
      products.get(productId).variantes.push(variant)
    })
    return [...products.values()]
  }, [variantesFiltradas])

  const variantesModalStock = stockModalVar
    ? variantes.filter(
        (variant) =>
          (variant.producto_id || variant.productos?.id) ===
          (stockModalVar.producto_id || stockModalVar.productos?.id)
      )
    : []
  const tallasModalStock = [...new Set(variantesModalStock.map((variant) => variant.talla || ''))]
  const variantesDeTallaModal = variantesModalStock.filter(
    (variant) => (variant.talla || '') === (stockModalVar?.talla || '')
  )
  const coloresModalStock = [
    ...new Set(variantesDeTallaModal.map((variant) => variant.color || ''))
  ]
  const tieneTallasModalStock = variantesModalStock.some((variant) => variant.talla)
  const tieneColoresModalStock = variantesModalStock.some((variant) => variant.color)

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

      <button
        type="button"
        onClick={() => setMobileProductFormOpen(true)}
        className="md:hidden w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 px-4 text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        Nuevo producto
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Formulario Nuevo Producto */}
        <form
          ref={newProductFormRef}
          onSubmit={handleCreateProduct}
          className={`lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3 h-fit ${
            mobileProductFormOpen ? 'block' : 'hidden'
          } md:block`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-rose-600" />
              Nuevo Producto
            </h2>
            <button
              type="button"
              onClick={() => setMobileProductFormOpen(false)}
              className="md:hidden p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              aria-label="Cerrar formulario de nuevo producto"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Foto opcional */}
          <div className="flex items-center gap-3">
            <label className="w-16 h-16 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-rose-400 hover:text-rose-600 cursor-pointer overflow-hidden shrink-0 bg-slate-50">
              {newPhotoPreview ? (
                <img src={newPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px] mt-0.5">Foto</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setNewPhotoFile(file)
                    setNewPhotoPreview(URL.createObjectURL(file))
                  }
                }}
              />
            </label>
            <div className="text-xs text-slate-500">
              <p className="font-medium text-slate-700">Foto del artículo (opcional)</p>
              <p className="text-[11px]">Ayuda a identificar rápido colores y modelos en el POS.</p>
              {newPhotoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setNewPhotoFile(null)
                    setNewPhotoPreview('')
                  }}
                  className="text-[11px] text-rose-600 hover:underline mt-0.5 cursor-pointer"
                >
                  Quitar foto
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre del producto *
            </label>
            <input
              type="text"
              required
              value={newProd.nombre}
              onChange={(e) => setNewProd({ ...newProd, nombre: e.target.value })}
              placeholder="Ej. Crema Hidratante Vitamina C"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              Descripción del producto (opcional)
            </label>
            <textarea
              rows="3"
              value={newProd.descripcion}
              onChange={(e) => setNewProd({ ...newProd, descripcion: e.target.value })}
              placeholder="Ej. Tela fresca, corte ajustado, ideal para uso diario..."
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Se mostrará en el detalle del producto del catálogo público.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
              <select
                value={selectedNewCategoryId}
                onChange={(e) => setNewProd({ ...newProd, categoria_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Marca</label>
              <input
                type="text"
                value={newProd.marca}
                onChange={(e) => setNewProd({ ...newProd, marca: e.target.value })}
                placeholder="Opcional"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Presentación</label>
            <input
              type="text"
              value={newProd.presentacion}
              onChange={(e) => setNewProd({ ...newProd, presentacion: e.target.value })}
              placeholder="100ml, 50g (opcional)"
              className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Precio costo</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newProd.precio_costo}
                onChange={(e) => setNewProd({ ...newProd, precio_costo: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Precio venta *
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={newProd.precio_venta}
                onChange={(e) => setNewProd({ ...newProd, precio_venta: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">Tallas y colores</p>
                <p className="text-[11px] text-slate-500">
                  Cada fila se guarda como variante de este mismo producto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewVariantRows([...newVariantRows, createVariantRow()])}
                className="shrink-0 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Agregar
              </button>
            </div>
            <div className="space-y-2">
              {newVariantRows.map((variant, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">Variante {index + 1}</span>
                    {newVariantRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewVariantRows(newVariantRows.filter((_, rowIndex) => rowIndex !== index))
                        }
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label={`Quitar variante ${index + 1}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={variant.talla}
                      onChange={(e) => updateNewVariantRow(index, { talla: e.target.value })}
                      placeholder="Talla (S, M, L)"
                      aria-label={`Talla de variante ${index + 1}`}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white"
                    />
                    <input
                      type="text"
                      value={variant.color}
                      onChange={(e) => updateNewVariantRow(index, { color: e.target.value })}
                      placeholder="Color"
                      aria-label={`Color de variante ${index + 1}`}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white"
                    />
                    <input
                      type="text"
                      value={variant.sku}
                      onChange={(e) => updateNewVariantRow(index, { sku: e.target.value })}
                      placeholder="SKU / Código"
                      aria-label={`Código de variante ${index + 1}`}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white"
                    />
                    <input
                      type="number"
                      min="0"
                      value={variant.stock_inicial}
                      onChange={(e) =>
                        updateNewVariantRow(index, { stock_inicial: e.target.value })
                      }
                      placeholder="Stock inicial"
                      aria-label={`Stock inicial de variante ${index + 1}`}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento</label>
            <input
              type="date"
              value={newProd.fecha_vencimiento}
              onChange={(e) => setNewProd({ ...newProd, fecha_vencimiento: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={savingProd}
            className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 text-sm cursor-pointer"
          >
            {savingProd ? 'Guardando...' : 'Guardar en Inventario'}
          </button>
        </form>

        {/* Listado y Edición */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-base">
              Existencias actuales ({productosAgrupados.length} productos · {variantesFiltradas.length}{' '}
              variantes)
            </h2>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soloStockBajo}
                onChange={(e) => setSoloStockBajo(e.target.checked)}
                className="rounded text-rose-600"
              />
              Solo stock bajo
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px] gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Filtrar inventario por nombre, marca, talla, color o SKU..."
                className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-2 text-sm"
              />
            </div>
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              aria-label="Filtrar inventario por categoría"
              className="w-full rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ALL">Todas las categorías</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {variantesFiltradas.length === 0 ? (
              <p className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">
                No hay artículos que coincidan con el filtro.
              </p>
            ) : (
              productosAgrupados.map((group) => {
                const firstVariant = group.variantes[0]
                const stockTotal = group.variantes.reduce(
                  (total, variant) => total + Number(variant.stock_actual || 0),
                  0
                )
                return (
                  <section
                    key={group.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
                  >
                    <div className="p-3.5 flex items-center justify-between gap-3 bg-slate-50/70">
                      <div className="flex items-center gap-3 min-w-0">
                        {firstVariant.imagen_url ? (
                          <img
                            src={firstVariant.imagen_url}
                            alt={group.producto?.nombre}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">
                            {group.producto?.nombre}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {group.producto?.categorias?.nombre || 'Sin categoría'}
                            {group.producto?.marca ? ` · ${group.producto.marca}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-700">
                            {group.variantes.length} variante{group.variantes.length === 1 ? '' : 's'}
                          </p>
                          <p className="text-[11px] text-slate-500">Stock total: {stockTotal}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openAddVariantModal(group)}
                          className="rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 px-2.5 py-2 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          title={`Agregar talla o color a ${group.producto?.nombre}`}
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Agregar variante
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {group.variantes.map((v) => {
                        const specs = [
                          v.talla ? `Talla: ${v.talla}` : null,
                          v.color ? `Color: ${v.color}` : null,
                          v.presentacion
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Variante estándar'
                        const lowStock = (v.stock_actual || 0) <= (v.stock_minimo || 3)

                        return (
                          <div
                            key={v.id}
                            className="p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-slate-900">{specs}</p>
                              <p className="text-xs text-slate-500 truncate">
                                {v.sku ? `SKU: ${v.sku} · ` : ''}
                                Venta: {formatMoney(v.precio_venta)} · Costo:{' '}
                                {formatMoney(v.precio_costo)}
                              </p>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 ${
                                  lowStock ? 'text-amber-700' : 'text-emerald-700'
                                }`}
                              >
                                {lowStock && <AlertTriangle className="w-3.5 h-3.5" />}
                                Stock: {v.stock_actual} und.
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setStockModalVar(v)
                                  setStockDelta('')
                                  setStockMotivo('Reabastecimiento de mercancía')
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                title={`Reabastecer ${specs}`}
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                Reabastecer
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditModal(v)}
                                className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                title="Editar producto y variante"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Editar producto
                              </button>

                              <button
                                type="button"
                                onClick={() => handleArchiveVariante(v)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Ocultar variante del catálogo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: EDITAR PRODUCTO / VARIANTE */}
      {editingVar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-lg space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-base text-slate-900">Editar producto y variante</h3>
              <button
                type="button"
                onClick={() => setEditingVar(null)}
                className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cambiar foto */}
            <div className="flex items-center gap-3">
              <label className="w-16 h-16 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-rose-400 cursor-pointer overflow-hidden shrink-0 bg-slate-50">
                {editPhotoPreview ? (
                  <img
                    src={editPhotoPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus className="w-5 h-5" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setEditPhotoFile(file)
                      setEditPhotoPreview(URL.createObjectURL(file))
                    }
                  }}
                />
              </label>
              <div className="text-xs text-slate-500">
                <p className="font-medium text-slate-700">Imagen del artículo</p>
                <p className="text-[11px]">Toca el recuadro para subir o cambiar la foto.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre *</label>
              <input
                type="text"
                required
                value={editingVar.nombre}
                onChange={(e) => setEditingVar({ ...editingVar, nombre: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Descripción del producto (opcional)
              </label>
              <textarea
                rows="3"
                value={editingVar.descripcion}
                onChange={(e) =>
                  setEditingVar({ ...editingVar, descripcion: e.target.value })
                }
                placeholder="Ej. Tela fresca, corte ajustado, ideal para uso diario..."
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Se mostrará en el detalle del producto del catálogo público.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
                <select
                  value={editingVar.categoria_id}
                  onChange={(e) =>
                    setEditingVar({ ...editingVar, categoria_id: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  {editingVar.categoria_id &&
                    !categorias.some(
                      (category) =>
                        String(category.id) === String(editingVar.categoria_id)
                    ) && (
                      <option value={editingVar.categoria_id}>
                        {editingVar.categoria_nombre || 'Categoría actual'}
                      </option>
                    )}
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Marca</label>
                <input
                  type="text"
                  value={editingVar.marca}
                  onChange={(e) => setEditingVar({ ...editingVar, marca: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Talla</label>
                <input
                  type="text"
                  value={editingVar.talla}
                  onChange={(e) => setEditingVar({ ...editingVar, talla: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Color</label>
                <input
                  type="text"
                  value={editingVar.color}
                  onChange={(e) => setEditingVar({ ...editingVar, color: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Presentación</label>
                <input
                  type="text"
                  value={editingVar.presentacion}
                  onChange={(e) =>
                    setEditingVar({ ...editingVar, presentacion: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Precio costo
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingVar.precio_costo}
                  onChange={(e) =>
                    setEditingVar({ ...editingVar, precio_costo: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Precio venta *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={editingVar.precio_venta}
                  onChange={(e) =>
                    setEditingVar({ ...editingVar, precio_venta: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Stock mínimo</label>
                <input
                  type="number"
                  min="0"
                  value={editingVar.stock_minimo}
                  onChange={(e) =>
                    setEditingVar({ ...editingVar, stock_minimo: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">SKU</label>
                <input
                  type="text"
                  value={editingVar.sku}
                  onChange={(e) => setEditingVar({ ...editingVar, sku: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Vencimiento</label>
                <input
                  type="date"
                  value={editingVar.fecha_vencimiento}
                  onChange={(e) =>
                    setEditingVar({ ...editingVar, fecha_vencimiento: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingVar(null)}
                className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2.5 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 text-xs cursor-pointer"
              >
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {addingVariantProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddVariant}
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-lg space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Agregar variante</h3>
                <p className="text-xs text-slate-500">
                  Se agregará dentro de {addingVariantProduct.nombre}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddingVariantProduct(null)}
                className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Talla</label>
                <input
                  type="text"
                  value={variantDraft.talla}
                  onChange={(e) => setVariantDraft({ ...variantDraft, talla: e.target.value })}
                  placeholder="Ej. M"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Color</label>
                <input
                  type="text"
                  value={variantDraft.color}
                  onChange={(e) => setVariantDraft({ ...variantDraft, color: e.target.value })}
                  placeholder="Ej. Negro"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SKU / Código</label>
                <input
                  type="text"
                  value={variantDraft.sku}
                  onChange={(e) => setVariantDraft({ ...variantDraft, sku: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Stock inicial</label>
                <input
                  type="number"
                  min="0"
                  value={variantDraft.stock_inicial}
                  onChange={(e) =>
                    setVariantDraft({ ...variantDraft, stock_inicial: e.target.value })
                  }
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Precio costo</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={variantDraft.precio_costo}
                  onChange={(e) =>
                    setVariantDraft({ ...variantDraft, precio_costo: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Precio venta *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={variantDraft.precio_venta}
                  onChange={(e) =>
                    setVariantDraft({ ...variantDraft, precio_venta: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddingVariantProduct(null)}
                className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2.5 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingVariant}
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold py-2.5 text-xs cursor-pointer"
              >
                {savingVariant ? 'Guardando...' : 'Guardar variante'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ENTRADA / AJUSTE DE STOCK */}
      {stockModalVar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAdjustStock}
            className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-lg space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Reabastecer variante</h3>
                <p className="text-xs text-slate-700 mt-1">
                  {stockModalVar.productos?.nombre}
                </p>
                <p className="text-[11px] text-slate-500">
                  Stock actual de esta combinación: {stockModalVar.stock_actual} und.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStockModalVar(null)}
                className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(tieneTallasModalStock || tieneColoresModalStock) && (
              <div className="grid grid-cols-2 gap-2.5">
                {tieneTallasModalStock && (
                  <label className="block text-xs font-medium text-slate-700">
                    Talla
                    <select
                      value={stockModalVar.talla || ''}
                      onChange={(e) => {
                        const nextTalla = e.target.value
                        const nextVariant =
                          variantesModalStock.find(
                            (variant) =>
                              (variant.talla || '') === nextTalla &&
                              (variant.color || '') === (stockModalVar.color || '')
                          ) ||
                          variantesModalStock.find(
                            (variant) => (variant.talla || '') === nextTalla
                          )
                        if (nextVariant) {
                          setStockModalVar(nextVariant)
                          setStockDelta('')
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {tallasModalStock.map((talla) => (
                        <option key={talla || 'sin-talla'} value={talla}>
                          {talla || 'Sin talla'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {tieneColoresModalStock && (
                  <label className="block text-xs font-medium text-slate-700">
                    Color
                    <select
                      value={stockModalVar.color || ''}
                      onChange={(e) => {
                        const nextVariant = variantesDeTallaModal.find(
                          (variant) => (variant.color || '') === e.target.value
                        )
                        if (nextVariant) {
                          setStockModalVar(nextVariant)
                          setStockDelta('')
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {coloresModalStock.map((color) => (
                        <option key={color || 'sin-color'} value={color}>
                          {color || 'Sin color'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cantidad para esta talla y color (negativa para restar) *
              </label>
              <input
                type="number"
                required
                value={stockDelta}
                onChange={(e) => setStockDelta(e.target.value)}
                placeholder="Ej. 10 unidades"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Motivo</label>
              <input
                type="text"
                value={stockMotivo}
                onChange={(e) => setStockMotivo(e.target.value)}
                placeholder="Ej. Compra a suplidor, conteo físico..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStockModalVar(null)}
                className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2.5 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingStock}
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 text-xs cursor-pointer"
              >
                {savingStock ? 'Aplicando...' : 'Actualizar Stock'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}