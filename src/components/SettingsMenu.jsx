import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { downloadStoreBackup } from '../utils/storeBackup'
import {
  MoreVertical,
  Store,
  Settings,
  Download,
  LogOut,
  X,
  Pencil,
  Trash2,
  Plus
} from 'lucide-react'

const EMPTY_PROFILE = {
  nombre_tienda: '',
  nombre_vendedor: '',
  telefono: '',
  direccion: ''
}
const PROFILE_FIELDS = Object.keys(EMPTY_PROFILE)

const normalizeProfile = (values = {}) => ({
  id: 1,
  ...Object.fromEntries(PROFILE_FIELDS.map((field) => [field, values[field] ?? '']))
})

function MenuItem({ icon: Icon, children, onClick, className = '', disabled = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </button>
  )
}

export default function SettingsMenu({
  onLogout,
  storeConfig,
  storeConfigError,
  onStoreUpdated,
  onCategoriesUpdated,
  onNotify
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState('')
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryDeletingId, setCategoryDeletingId] = useState(null)
  const [categoryError, setCategoryError] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const openProfile = async () => {
    setMenuOpen(false)
    setModal('profile')
    setProfileLoading(true)
    setProfileError(storeConfigError || '')

    try {
      const { data, error } = await supabase
        .from('configuracion_tienda')
        .select('id, nombre_tienda, nombre_vendedor, telefono, direccion')
        .eq('id', 1)
        .maybeSingle()

      if (error) throw error
      const currentProfile = normalizeProfile(data || storeConfig)
      setProfile(currentProfile)
      if (data) onStoreUpdated(currentProfile)
      setProfileError('')
    } catch (error) {
      setProfileError(error.message || String(error))
    } finally {
      setProfileLoading(false)
    }
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    setProfileSaving(true)
    setProfileError('')

    try {
      const values = Object.fromEntries(
        PROFILE_FIELDS.map((field) => [field, profile[field].trim()])
      )
      const { data, error } = await supabase
        .from('configuracion_tienda')
        .upsert({ id: 1, ...values })
        .select('id, nombre_tienda, nombre_vendedor, telefono, direccion')
        .single()

      if (error) throw error
      const updatedProfile = normalizeProfile(data)
      onStoreUpdated(updatedProfile)
      setModal('')
      onNotify('success', 'Datos de la tienda guardados.')
    } catch (error) {
      setProfileError(error.message || String(error))
    } finally {
      setProfileSaving(false)
    }
  }

  const loadCategories = async () => {
    setCategoriesLoading(true)
    setCategoryError('')
    setCategories([])
    try {
      const { data, error } = await supabase
        .from('categorias')
        .select('id, nombre')
        .order('nombre')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      setCategoryError(error.message || String(error))
    } finally {
      setCategoriesLoading(false)
    }
  }

  const openCategoryManager = () => {
    setMenuOpen(false)
    setModal('categories')
    setCategoryName('')
    setEditingCategory(null)
    loadCategories()
  }

  const saveCategory = async (event) => {
    event.preventDefault()
    const name = categoryName.trim()
    if (!name) {
      setCategoryError('Escribe un nombre para la categoría.')
      return
    }

    const duplicate = categories.some(
      (category) =>
        String(category.id) !== String(editingCategory?.id) &&
        category.nombre.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    )
    if (duplicate) {
      setCategoryError('Ya existe una categoría con ese nombre.')
      return
    }

    setCategorySaving(true)
    setCategoryError('')
    try {
      const query = editingCategory
        ? supabase
            .from('categorias')
            .update({ nombre: name })
            .eq('id', editingCategory.id)
            .select('id, nombre')
            .single()
        : supabase.from('categorias').insert([{ nombre: name }]).select('id, nombre').single()
      const { error } = await query

      if (error) throw error
      setCategoryName('')
      setEditingCategory(null)
      await Promise.all([loadCategories(), onCategoriesUpdated()])
      onNotify('success', 'Categoría guardada.')
    } catch (error) {
      setCategoryError(error.message || String(error))
    } finally {
      setCategorySaving(false)
    }
  }

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(`¿Eliminar la categoría "${category.nombre}"?`)
    if (!confirmed) return

    setCategoryDeletingId(category.id)
    setCategoryError('')
    try {
      const { count, error: productsError } = await supabase
        .from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('categoria_id', category.id)

      if (productsError) throw productsError
      if (count > 0) {
        setCategoryError(
          `No se puede eliminar: ${count} producto(s) todavía usan esta categoría.`
        )
        return
      }

      const { error } = await supabase.from('categorias').delete().eq('id', category.id)
      if (error) throw error
      await Promise.all([loadCategories(), onCategoriesUpdated()])
      onNotify('success', 'Categoría eliminada.')
    } catch (error) {
      setCategoryError(error.message || String(error))
    } finally {
      setCategoryDeletingId(null)
    }
  }

  const handleBackup = async () => {
    if (backupLoading) return
    setMenuOpen(false)
    setBackupLoading(true)
    onNotify('info', 'Generando respaldo...')
    try {
      const filename = await downloadStoreBackup()
      onNotify('success', `Respaldo descargado: ${filename}`)
    } catch (error) {
      onNotify('error', `No se pudo generar el respaldo: ${error.message || error}`)
    } finally {
      setBackupLoading(false)
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Abrir menú de opciones"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <MoreVertical className="h-5 w-5" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            <MenuItem icon={Store} onClick={openProfile}>Mi Perfil</MenuItem>
            <MenuItem icon={Settings} onClick={openCategoryManager}>Categorías</MenuItem>
            <MenuItem
              icon={Download}
              onClick={handleBackup}
              disabled={backupLoading}
              className={backupLoading ? 'text-slate-400' : 'text-slate-700'}
            >
              {backupLoading ? 'Generando respaldo...' : 'Descargar Respaldo'}
            </MenuItem>
            <div className="my-1 border-t border-slate-100" />
            <MenuItem
              icon={LogOut}
              onClick={() => {
                setMenuOpen(false)
                onLogout()
              }}
              className="text-red-600 hover:bg-red-50"
            >
              Cerrar sesión
            </MenuItem>
          </div>
        )}
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal('')
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="settings-modal-title" className="font-bold text-base text-slate-900">
                {modal === 'profile' ? 'Mi Perfil' : 'Categorías'}
              </h2>
              <button
                type="button"
                onClick={() => setModal('')}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modal === 'profile' ? (
              profileLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Cargando datos de la tienda...
                </p>
              ) : (
                <form onSubmit={saveProfile} className="space-y-3">
                  {[
                    ['nombre_tienda', 'Nombre de la tienda'],
                    ['nombre_vendedor', 'Nombre de quien vende'],
                    ['telefono', 'Teléfono']
                  ].map(([field, label]) => (
                    <label key={field} className="block text-xs font-medium text-slate-700">
                      {label}
                      <input
                        type="text"
                        value={profile[field]}
                        onChange={(event) =>
                          setProfile({ ...profile, [field]: event.target.value })
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  ))}
                  <label className="block text-xs font-medium text-slate-700">
                    Dirección
                    <textarea
                      rows="2"
                      value={profile.direccion}
                      onChange={(event) =>
                        setProfile({ ...profile, direccion: event.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  {profileError && (
                    <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                      No se pudo cargar o guardar el perfil: {profileError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="w-full rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    {profileSaving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </form>
              )
            ) : (
              <div className="space-y-4">
                <form onSubmit={saveCategory} className="flex gap-2">
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    placeholder="Nombre de la categoría"
                    aria-label="Nombre de la categoría"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={categorySaving || categoriesLoading}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    {editingCategory ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {editingCategory ? 'Guardar' : 'Agregar'}
                  </button>
                </form>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null)
                      setCategoryName('')
                      setCategoryError('')
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancelar edición
                  </button>
                )}
                {categoryError && (
                  <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                    {categoryError}
                  </p>
                )}
                {categoriesLoading ? (
                  <p className="py-5 text-center text-sm text-slate-500">Cargando categorías...</p>
                ) : categories.length === 0 ? (
                  <p className="py-5 text-center text-sm text-slate-500">
                    No hay categorías registradas.
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
                    {categories.map((category) => (
                      <li
                        key={category.id}
                        className="flex items-center justify-between gap-2 px-3 py-2.5"
                      >
                        <span className="min-w-0 truncate text-sm text-slate-800">
                          {category.nombre}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategory(category)
                              setCategoryName(category.nombre)
                              setCategoryError('')
                            }}
                            aria-label={`Editar ${category.nombre}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCategory(category)}
                            disabled={categoryDeletingId === category.id}
                            aria-label={`Eliminar ${category.nombre}`}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
