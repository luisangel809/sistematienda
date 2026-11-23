ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

UPDATE public.clientes
SET activo = true
WHERE activo IS NULL;

ALTER TABLE public.clientes
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN activo SET NOT NULL;
