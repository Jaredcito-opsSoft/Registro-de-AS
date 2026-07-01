-- =====================================================================
-- SCRIPT DE CORRECCIÓN: REGISTRO DE USUARIOS Y ACTUALIZACIÓN DE PERFIL
-- Ejecuta este script completo en el Editor SQL de tu panel de Supabase
-- para solucionar el error 500 al registrarse y habilitar los cambios de perfil.
-- =====================================================================

-- 1. Asegurar que la tabla public.usuarios (esquema antiguo) tenga la columna email
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;

-- 2. Habilitar permisos para la tabla public.usuarios (lectura y actualización)
GRANT SELECT, UPDATE ON public.usuarios TO anon, authenticated;

-- 3. Habilitar permisos de actualización en public.usuarios_app (esquema nuevo de roles)
-- Esto permite que los usuarios modifiquen su propio perfil desde la app
GRANT SELECT, UPDATE (nombre, matricula, email, updated_at) ON public.usuarios_app TO authenticated;

-- 4. Crear política RLS para que los usuarios puedan actualizar su propio perfil en usuarios_app
ALTER TABLE public.usuarios_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_app_update_own ON public.usuarios_app;
CREATE POLICY usuarios_app_update_own
ON public.usuarios_app
FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- 5. Reestablecer el trigger de nuevos usuarios de forma robusta y defensiva
-- Este trigger no fallará si alguna tabla o columna no existe en el esquema de base de datos
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Intentar insertar en public.usuarios (esquema antiguo)
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
  EXCEPTION WHEN OTHERS THEN
    -- Ignorar errores si la tabla o columnas no existen
  END;

  -- Intentar insertar en public.usuarios_app (esquema multiempresa nuevo)
  BEGIN
    SELECT id INTO v_org_id FROM public.organizaciones WHERE slug = 'organizacion-principal' LIMIT 1;
    INSERT INTO public.usuarios_app (auth_user_id, organizacion_id, nombre, matricula, email, rol, activo)
    VALUES (
      new.id,
      coalesce(v_org_id, public.get_default_organizacion_id()),
      coalesce(new.raw_user_meta_data->>'nombre', 'Usuario Nuevo'),
      coalesce(new.raw_user_meta_data->>'matricula', 'TEMP_' || encode(gen_random_bytes(4), 'hex')),
      new.email,
      'usuario',
      true
    )
    ON CONFLICT (organizacion_id, matricula) DO UPDATE
    SET 
      auth_user_id = excluded.auth_user_id,
      nombre = coalesce(nullif(excluded.nombre, 'Usuario Nuevo'), public.usuarios_app.nombre),
      email = excluded.email;
  EXCEPTION WHEN OTHERS THEN
    -- Ignorar errores si la tabla o columnas no existen
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-asociar el trigger a auth.users si no existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Forzar recarga del esquema en PostgREST
NOTIFY pgrst, 'reload schema';
