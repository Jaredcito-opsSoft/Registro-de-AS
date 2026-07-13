-- Hotfix: corrige la referencia ambigua a slug en admin_create_organization.
-- No confia en identidad ni rol enviados por el cliente y no sobrescribe organizaciones existentes.

begin;

create or replace function public.admin_create_organization(
  p_nombre text,
  p_tipo text default 'empresa',
  p_slug text default null,
  p_clave text default null,
  p_activo boolean default true
)
returns table (
  id uuid,
  nombre text,
  tipo text,
  slug text,
  activo boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_slug text;
  v_key text;
  v_org public.organizaciones%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;

  select u.* into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  if v_user.id is null or public.normalize_app_role(v_user.rol) <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'nombre_requerido';
  end if;
  if coalesce(p_tipo, 'empresa') not in ('empresa', 'escuela', 'centro_trabajo', 'negocio_local', 'otro') then
    raise exception 'tipo_invalido';
  end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), trim(p_nombre)), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then raise exception 'slug_invalido'; end if;

  v_key := nullif(trim(coalesce(p_clave, '')), '');
  if v_key is null or length(v_key) < 8 then
    raise exception 'clave_minimo_8_caracteres';
  end if;

  insert into public.organizaciones as organization_row
    (nombre, tipo, slug, activo, clave_acceso_hash)
  values
    (trim(p_nombre), coalesce(p_tipo, 'empresa'), v_slug, coalesce(p_activo, true), public.hash_org_key(v_key))
  returning organization_row.* into v_org;

  insert into public.audit_logs (accion, detalle, resultado)
  values ('organizacion_creada', v_org.id::text, 'ok');

  return query
  select v_org.id, v_org.nombre, v_org.tipo, v_org.slug, v_org.activo;
exception
  when unique_violation then
    raise exception 'organizacion_slug_duplicado';
end;
$$;

revoke all on function public.admin_create_organization(text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_create_organization(text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
