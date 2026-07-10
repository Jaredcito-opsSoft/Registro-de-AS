-- F0 RLS policies draft.
-- No ejecutar en produccion sin introspeccion, respaldo y revision.
-- Basado en guias actuales de Supabase: RLS habilitado en public, GRANT explicitos y policies con TO authenticated.

begin;

-- Helpers. SECURITY DEFINER se usa solo para leer el perfil operativo del usuario actual.
-- Mantener search_path fijo y revocar EXECUTE publico.

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.usuarios_app u
  where u.auth_user_id = (select auth.uid())
    and u.activo = true
  limit 1
$$;

create or replace function public.current_app_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.organizacion_id
  from public.usuarios_app u
  where u.auth_user_id = (select auth.uid())
    and u.activo = true
  limit 1
$$;

create or replace function public.current_app_user_site_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.sitio_id
  from public.usuarios_app u
  where u.auth_user_id = (select auth.uid())
    and u.activo = true
  limit 1
$$;

create or replace function public.current_app_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(u.rol, 'usuario')
  from public.usuarios_app u
  where u.auth_user_id = (select auth.uid())
    and u.activo = true
  limit 1
$$;

create or replace function public.current_app_user_scope()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(u.scope_type, 'propio')
  from public.usuarios_app u
  where u.auth_user_id = (select auth.uid())
    and u.activo = true
  limit 1
$$;

create or replace function public.app_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_role, 'usuario'))
    when 'superadmin' then 40
    when 'admin' then 30
    when 'operador' then 20
    else 10
  end
$$;

create or replace function public.current_app_role_rank()
returns integer
language sql
stable
as $$
  select public.app_role_rank(public.current_app_user_role())
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select public.current_app_user_role() = 'superadmin'
$$;

create or replace function public.can_access_org(p_organizacion_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_superadmin()
    or (
      p_organizacion_id is not null
      and p_organizacion_id = public.current_app_user_org_id()
    )
$$;

create or replace function public.can_access_site(p_sitio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sitios s
    where s.id = p_sitio_id
      and (
        public.is_superadmin()
        or (
          public.current_app_user_role() = 'admin'
          and public.current_app_user_scope() = 'organizacion'
          and s.organizacion_id = public.current_app_user_org_id()
        )
        or (
          public.current_app_user_role() in ('admin', 'operador', 'usuario')
          and public.current_app_user_scope() in ('sitio', 'propio')
          and s.id = public.current_app_user_site_id()
        )
      )
  )
$$;

create or replace function public.can_access_user(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuarios_app target
    where target.id = p_usuario_id
      and (
        public.is_superadmin()
        or target.id = public.current_app_user_id()
        or (
          public.current_app_user_role() = 'admin'
          and public.current_app_user_scope() = 'organizacion'
          and target.organizacion_id = public.current_app_user_org_id()
        )
        or (
          public.current_app_user_role() in ('admin', 'operador')
          and public.current_app_user_scope() = 'sitio'
          and target.sitio_id = public.current_app_user_site_id()
        )
      )
  )
$$;

revoke all on function public.current_app_user_id() from public, anon;
revoke all on function public.current_app_user_org_id() from public, anon;
revoke all on function public.current_app_user_site_id() from public, anon;
revoke all on function public.current_app_user_role() from public, anon;
revoke all on function public.current_app_user_scope() from public, anon;
revoke all on function public.current_app_role_rank() from public, anon;
revoke all on function public.is_superadmin() from public, anon;
revoke all on function public.can_access_org(uuid) from public, anon;
revoke all on function public.can_access_site(uuid) from public, anon;
revoke all on function public.can_access_user(uuid) from public, anon;

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_app_user_org_id() to authenticated;
grant execute on function public.current_app_user_site_id() to authenticated;
grant execute on function public.current_app_user_role() to authenticated;
grant execute on function public.current_app_user_scope() to authenticated;
grant execute on function public.current_app_role_rank() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.can_access_org(uuid) to authenticated;
grant execute on function public.can_access_site(uuid) to authenticated;
grant execute on function public.can_access_user(uuid) to authenticated;

-- RLS base.

alter table public.organizaciones enable row level security;
alter table public.sitios enable row level security;
alter table public.site_identifier_config enable row level security;
alter table public.usuarios_app enable row level security;
alter table public.asistencias enable row level security;
alter table public.evidencias enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.audit_logs enable row level security;
alter table public.privacy_notices enable row level security;
alter table public.privacy_consents enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.retention_policies enable row level security;
alter table public.exports enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists organizaciones_select_scope on public.organizaciones;
create policy organizaciones_select_scope
on public.organizaciones
for select
to authenticated
using (public.can_access_org(id));

drop policy if exists sitios_select_scope on public.sitios;
create policy sitios_select_scope
on public.sitios
for select
to authenticated
using (public.can_access_site(id));

drop policy if exists site_identifier_config_select_scope on public.site_identifier_config;
create policy site_identifier_config_select_scope
on public.site_identifier_config
for select
to authenticated
using (public.can_access_site(sitio_id));

drop policy if exists usuarios_app_select_scope on public.usuarios_app;
create policy usuarios_app_select_scope
on public.usuarios_app
for select
to authenticated
using (public.can_access_user(id));

drop policy if exists usuarios_app_update_own_basic on public.usuarios_app;
create policy usuarios_app_update_own_basic
on public.usuarios_app
for update
to authenticated
using (id = public.current_app_user_id())
with check (
  id = public.current_app_user_id()
  and rol = public.current_app_user_role()
  and organizacion_id = public.current_app_user_org_id()
  and coalesce(sitio_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(public.current_app_user_site_id(), '00000000-0000-0000-0000-000000000000'::uuid)
);

drop policy if exists asistencias_select_scope on public.asistencias;
create policy asistencias_select_scope
on public.asistencias
for select
to authenticated
using (
  usuario_id = public.current_app_user_id()
  or public.can_access_site(sitio_id)
);

-- Escritura de asistencias solo por RPC.
drop policy if exists asistencias_no_direct_insert on public.asistencias;
create policy asistencias_no_direct_insert
on public.asistencias
for insert
to authenticated
with check (false);

drop policy if exists asistencias_no_direct_update on public.asistencias;
create policy asistencias_no_direct_update
on public.asistencias
for update
to authenticated
using (false)
with check (false);

drop policy if exists evidencias_select_metadata_scope on public.evidencias;
create policy evidencias_select_metadata_scope
on public.evidencias
for select
to authenticated
using (
  exists (
    select 1
    from public.asistencias a
    where a.id = evidencias.asistencia_id
      and (a.usuario_id = public.current_app_user_id() or public.can_access_site(a.sitio_id))
  )
);

drop policy if exists ubicaciones_select_scope on public.ubicaciones;
create policy ubicaciones_select_scope
on public.ubicaciones
for select
to authenticated
using (
  exists (
    select 1
    from public.asistencias a
    where a.id = ubicaciones.asistencia_id
      and (a.usuario_id = public.current_app_user_id() or public.can_access_site(a.sitio_id))
  )
);

drop policy if exists audit_logs_select_admin_scope on public.audit_logs;
create policy audit_logs_select_admin_scope
on public.audit_logs
for select
to authenticated
using (
  public.is_superadmin()
  or (
    public.current_app_user_role() = 'admin'
    and public.can_access_org(organizacion_id)
    and (sitio_id is null or public.can_access_site(sitio_id))
  )
);

drop policy if exists privacy_notices_select_scope on public.privacy_notices;
create policy privacy_notices_select_scope
on public.privacy_notices
for select
to authenticated
using (
  organizacion_id is null
  or public.can_access_org(organizacion_id)
);

drop policy if exists privacy_consents_select_scope on public.privacy_consents;
create policy privacy_consents_select_scope
on public.privacy_consents
for select
to authenticated
using (public.can_access_user(usuario_id));

drop policy if exists privacy_consents_insert_own on public.privacy_consents;
create policy privacy_consents_insert_own
on public.privacy_consents
for insert
to authenticated
with check (usuario_id = public.current_app_user_id());

drop policy if exists privacy_requests_select_scope on public.privacy_requests;
create policy privacy_requests_select_scope
on public.privacy_requests
for select
to authenticated
using (
  usuario_id = public.current_app_user_id()
  or (
    public.current_app_user_role() = 'admin'
    and public.can_access_org(organizacion_id)
  )
  or public.is_superadmin()
);

drop policy if exists privacy_requests_insert_own on public.privacy_requests;
create policy privacy_requests_insert_own
on public.privacy_requests
for insert
to authenticated
with check (usuario_id = public.current_app_user_id());

drop policy if exists retention_policies_select_admin_scope on public.retention_policies;
create policy retention_policies_select_admin_scope
on public.retention_policies
for select
to authenticated
using (
  public.is_superadmin()
  or (
    public.current_app_user_role() = 'admin'
    and public.can_access_org(organizacion_id)
    and (sitio_id is null or public.can_access_site(sitio_id))
  )
);

drop policy if exists exports_select_admin_scope on public.exports;
create policy exports_select_admin_scope
on public.exports
for select
to authenticated
using (
  public.is_superadmin()
  or (
    public.current_app_user_role() = 'admin'
    and public.can_access_org(organizacion_id)
    and (sitio_id is null or public.can_access_site(sitio_id))
  )
);

drop policy if exists attendance_corrections_select_scope on public.attendance_corrections;
create policy attendance_corrections_select_scope
on public.attendance_corrections
for select
to authenticated
using (
  exists (
    select 1
    from public.asistencias a
    where a.id = attendance_corrections.asistencia_id
      and (a.usuario_id = public.current_app_user_id() or public.can_access_site(a.sitio_id))
  )
);

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
on public.user_notifications
for select
to authenticated
using (usuario_id = public.current_app_user_id());

commit;
