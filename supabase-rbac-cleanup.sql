-- =====================================================================
-- SCRIPT DE LIMPIEZA: ELIMINACIÓN DE ROLES (RBAC) EN SUPABASE
-- Ejecuta este script completo en el Editor SQL de tu panel de Supabase
-- para limpiar referencias residuales y recuperar acceso a los registros.
-- =====================================================================

-- 1. Deshabilitar RLS en 'asistencias' para permitir lectura/escritura libre (estado original)
ALTER TABLE public.asistencias DISABLE ROW LEVEL SECURITY;

-- 2. Eliminar las políticas RLS que hacen referencia a la columna 'rol'
DROP POLICY IF EXISTS "Usuarios leen sus registros, Admins leen todo" ON public.asistencias;
DROP POLICY IF EXISTS "Solo administradores pueden modificar asistencias" ON public.asistencias;
DROP POLICY IF EXISTS "Solo administradores pueden eliminar asistencias" ON public.asistencias;
DROP POLICY IF EXISTS "Usuarios pueden registrar su propia asistencia" ON public.asistencias;

-- 3. Reestablecer el trigger de nuevos usuarios sin la columna 'rol'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.usuarios (id, matricula, nombre, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'matricula', 'TEMP_' || encode(gen_random_bytes(4), 'hex')),
    coalesce(new.raw_user_meta_data->>'nombre', 'Usuario Nuevo'),
    new.email
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = excluded.email,
    nombre = coalesce(nullif(excluded.nombre, 'Usuario Nuevo'), public.usuarios.nombre);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Eliminar físicamente la columna 'rol' de la tabla 'usuarios' si aún existe
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS rol;

-- 5. Forzar recarga del esquema en PostgREST
NOTIFY pgrst, 'reload schema';
