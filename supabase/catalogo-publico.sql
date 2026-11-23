-- Run once in Supabase SQL Editor to enable anonymous, read-only catalog access.
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS descripcion text;

ALTER TABLE public.configuracion_tienda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variantes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.configuracion_tienda FROM anon;
GRANT SELECT (id, nombre_tienda, telefono, direccion)
  ON TABLE public.configuracion_tienda TO anon;
DROP POLICY IF EXISTS catalogo_publico_anon_select ON public.configuracion_tienda;
CREATE POLICY catalogo_publico_anon_select
  ON public.configuracion_tienda FOR SELECT TO anon
  USING (id = 1);

REVOKE ALL ON TABLE public.categorias FROM anon;
GRANT SELECT (id, nombre) ON TABLE public.categorias TO anon;
DROP POLICY IF EXISTS catalogo_publico_anon_select ON public.categorias;
CREATE POLICY catalogo_publico_anon_select
  ON public.categorias FOR SELECT TO anon
  USING (true);

REVOKE ALL ON TABLE public.productos FROM anon;
GRANT SELECT (id, nombre, marca, descripcion, categoria_id)
  ON TABLE public.productos TO anon;
DROP POLICY IF EXISTS catalogo_publico_anon_select ON public.productos;
CREATE POLICY catalogo_publico_anon_select
  ON public.productos FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.variantes
      WHERE variantes.producto_id = productos.id
        AND variantes.activo IS TRUE
    )
  );

REVOKE ALL ON TABLE public.variantes FROM anon;
GRANT SELECT (
  id,
  producto_id,
  talla,
  color,
  stock_actual,
  presentacion,
  precio_venta,
  imagen_url,
  activo
)
  ON TABLE public.variantes TO anon;
DROP POLICY IF EXISTS catalogo_publico_anon_select ON public.variantes;
CREATE POLICY catalogo_publico_anon_select
  ON public.variantes FOR SELECT TO anon
  USING (activo IS TRUE);
