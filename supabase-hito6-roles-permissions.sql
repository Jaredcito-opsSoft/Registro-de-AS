-- Hito 6: roles y permisos reutilizables para Auth, dashboard y RLS futura.
-- Roles definidos:
-- usuario: registra entrada/salida y consulta sus propios registros.
-- supervisor: consulta registros/evidencia de su sitio u organizacion operativa.
-- admin: administra registros, sitio, exportaciones y auditoria.
-- superadmin: administra organizaciones, roles y todo el alcance empresarial.

alter table public.usuarios_app
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists ultimo_acceso_at timestamptz,
  add column if not exists permisos_extra jsonb not null default '{}'::jsonb;

alter table public.usuarios_app drop constraint if exists usuarios_app_rol_check;
alter table public.usuarios_app
  add constraint usuarios_app_rol_check
  check (rol in ('usuario', 'supervisor', 'admin', 'superadmin'));

create unique index if not exists usuarios_app_auth_user_id_unique
  on public.usuarios_app (auth_user_id)
  where auth_user_id is not null;

create index if not exists usuarios_app_org_rol_idx
  on public.usuarios_app (organizacion_id, rol, activo);

create index if not exists usuarios_app_email_idx
  on public.usuarios_app (lower(email))
  where email is not null;

update public.usuarios_app
set email = lower(trim(email))
where email is not null and email <> lower(trim(email));

create or replace function public.normalize_app_role(p_rol text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_rol, 'usuario'))
    when 'superadmin' then 'superadmin'
    when 'admin' then 'admin'
    when 'supervisor' then 'supervisor'
    else 'usuario'
  end;
$$;

create or replace function public.app_role_rank(p_rol text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case public.normalize_app_role(p_rol)
    when 'superadmin' then 40
    when 'admin' then 30
    when 'supervisor' then 20
    else 10
  end;
$$;

create or replace function public.app_role_permissions(p_rol text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case public.normalize_app_role(p_rol)
    when 'superadmin' then jsonb_build_object(
      'register_attendance', true,
      'view_own_records', true,
      'view_site_records', true,
      'view_all_records', true,
      'view_evidence', true,
      'export_records', true,
      'manage_records', true,
      'manage_site', true,
      'manage_organization', true,
      'manage_roles', true,
      'view_audit', true
    )
    when 'admin' then jsonb_build_object(
      'register_attendance', true,
      'view_own_records', true,
      'view_site_records', true,
      'view_all_records', true,
      'view_evidence', true,
      'export_records', true,
      'manage_records', true,
      'manage_site', true,
      'manage_organization', false,
      'manage_roles', false,
      'view_audit', true
    )
    when 'supervisor' then jsonb_build_object(
      'register_attendance', true,
      'view_own_records', true,
      'view_site_records', true,
      'view_all_records', false,
      'view_evidence', true,
      'export_records', false,
      'manage_records', false,
      'manage_site', false,
      'manage_organization', false,
      'manage_roles', false,
      'view_audit', false
    )
    else jsonb_build_object(
      'register_attendance', true,
      'view_own_records', true,
      'view_site_records', false,
      'view_all_records', false,
      'view_evidence', false,
      'export_records', false,
      'manage_records', false,
      'manage_site', false,
      'manage_organization', false,
      'manage_roles', false,
      'view_audit', false
    )
  end;
$$;

create or replace function public.current_user_can(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.app_role_permissions(u.rol) ->> p_permission, 'false')::boolean
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and u.activo = true
  limit 1;
$$;

create or replace function public.current_app_role_rank()
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(max(public.app_role_rank(u.rol)), 0)
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and u.activo = true;
$$;

create or replace function public.get_current_app_user(
  p_nombre text default null,
  p_matricula text default null
)
returns table (
  id uuid,
  auth_user_id uuid,
  organizacion_id uuid,
  organizacion_nombre text,
  sitio_id uuid,
  sitio_nombre text,
  nombre text,
  matricula text,
  email text,
  rol text,
  rol_rank integer,
  permisos jsonb,
  activo boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_matricula text := upper(nullif(trim(coalesce(p_matricula, '')), ''));
  v_user public.usuarios_app%rowtype;
begin
  if v_auth_uid is null then
    raise exception 'Sesion requerida';
  end if;

  select lower(email) into v_email
  from auth.users
  where auth.users.id = v_auth_uid;

  v_org_id := public.get_default_organizacion_id();
  v_nombre := coalesce(v_nombre, nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Usuario');
  v_matricula := coalesce(v_matricula, 'AUTH-' || left(replace(v_auth_uid::text, '-', ''), 8));

  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = v_auth_uid
    and u.activo = true
  limit 1;

  if not found and v_email is not null then
    select * into v_user
    from public.usuarios_app u
    where lower(u.email) = v_email
      and u.activo = true
    order by public.app_role_rank(u.rol) desc, u.created_at asc
    limit 1;

    if found then
      update public.usuarios_app
      set auth_user_id = v_auth_uid,
          nombre = coalesce(nullif(v_nombre, ''), nombre),
          email = v_email,
          ultimo_acceso_at = now(),
          updated_at = now()
      where public.usuarios_app.id = v_user.id
      returning * into v_user;
    end if;
  end if;

  if not found then
    select * into v_user
    from public.usuarios_app u
    where u.organizacion_id = v_org_id
      and u.matricula = v_matricula
      and u.activo = true
    limit 1;

    if found then
      if public.normalize_app_role(v_user.rol) <> 'usuario'
         and (v_user.email is null or lower(v_user.email) <> coalesce(v_email, '')) then
        raise exception 'Esta matricula requiere vinculacion administrativa antes de iniciar sesion.';
      end if;

      update public.usuarios_app
      set auth_user_id = v_auth_uid,
          nombre = coalesce(nullif(v_nombre, ''), nombre),
          email = coalesce(v_email, email),
          ultimo_acceso_at = now(),
          updated_at = now()
      where public.usuarios_app.id = v_user.id
      returning * into v_user;
    else
      insert into public.usuarios_app (organizacion_id, nombre, matricula, email, rol, activo, auth_user_id, ultimo_acceso_at)
      values (v_org_id, v_nombre, v_matricula, v_email, 'usuario', true, v_auth_uid, now())
      returning * into v_user;
    end if;
  else
    update public.usuarios_app
    set nombre = coalesce(nullif(v_nombre, ''), nombre),
        email = coalesce(v_email, email),
        ultimo_acceso_at = now(),
        updated_at = now()
    where public.usuarios_app.id = v_user.id
    returning * into v_user;
  end if;

  return query
  select
    v_user.id,
    v_user.auth_user_id,
    v_user.organizacion_id,
    o.nombre,
    v_user.sitio_id,
    s.nombre,
    v_user.nombre,
    v_user.matricula,
    v_user.email,
    public.normalize_app_role(v_user.rol),
    public.app_role_rank(v_user.rol),
    public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb),
    v_user.activo
  from public.organizaciones o
  left join public.sitios s on s.id = v_user.sitio_id
  where o.id = v_user.organizacion_id;
end;
$$;

alter table public.organizaciones enable row level security;
alter table public.usuarios_app enable row level security;

drop policy if exists organizaciones_select_active on public.organizaciones;
create policy organizaciones_select_active
on public.organizaciones
for select
to anon, authenticated
using (activo = true);

drop policy if exists usuarios_app_select_own on public.usuarios_app;
create policy usuarios_app_select_own
on public.usuarios_app
for select
to authenticated
using (auth_user_id = auth.uid());

revoke all on public.usuarios_app from anon;
grant select on public.organizaciones to anon, authenticated;
grant select on public.usuarios_app to authenticated;

grant execute on function public.normalize_app_role(text) to anon, authenticated;
grant execute on function public.app_role_rank(text) to anon, authenticated;
grant execute on function public.app_role_permissions(text) to anon, authenticated;
revoke all on function public.current_user_can(text) from public, anon;
revoke all on function public.current_app_role_rank() from public, anon;
revoke all on function public.get_current_app_user(text, text) from public, anon;
grant execute on function public.current_user_can(text) to authenticated;
grant execute on function public.current_app_role_rank() to authenticated;
grant execute on function public.get_current_app_user(text, text) to authenticated;

comment on column public.usuarios_app.auth_user_id is 'Vinculo seguro con auth.users.id. Usar para autorizacion y RLS, no user_metadata.';
comment on column public.usuarios_app.rol is 'Roles Hito 6: usuario, supervisor, admin, superadmin.';
comment on function public.app_role_permissions(text) is 'Mapa central de permisos por rol para frontend, RPC y futuras politicas RLS.';
comment on function public.get_current_app_user(text, text) is 'Sincroniza usuario autenticado con usuarios_app sin elevar permisos desde user_metadata.';

notify pgrst, 'reload schema';