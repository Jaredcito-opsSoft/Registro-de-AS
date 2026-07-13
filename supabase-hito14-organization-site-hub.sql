-- HITO 14: centro unificado de organizaciones y sitios.
-- CRUD seguro por auth.uid(); no confia en rol, organizacion ni sitio enviados por el cliente.

begin;

alter table public.organizaciones
  add column if not exists plan text not null default 'mvp';

alter table public.sitios
  add column if not exists gps_policy text not null default 'revision',
  add column if not exists evidence_policy text not null default 'rostro';

drop index if exists public.sitios_one_active_idx;
create index if not exists sitios_org_activo_idx
  on public.sitios (organizacion_id, activo);

create table if not exists public.site_identifier_config (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  label text not null default 'Identificador',
  tipo text not null default 'texto',
  requerido boolean not null default true,
  unico_por_sitio boolean not null default true,
  mascara_visual text,
  validacion_regex text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_identifier_config_site_unique unique (sitio_id),
  constraint site_identifier_config_tipo_check check (tipo in ('texto', 'numero', 'email', 'alfanumerico'))
);

alter table public.site_identifier_config enable row level security;
revoke all on public.site_identifier_config from public, anon, authenticated;

create or replace function public.require_organization_manager(
  p_organization_id uuid default null,
  p_site_id uuid default null,
  p_superadmin_only boolean default false
)
returns public.usuarios_app
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;

  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  if v_user.id is null then
    raise exception 'usuario_app_no_encontrado';
  end if;

  v_role := public.normalize_app_role(v_user.rol);
  if v_role not in ('admin', 'superadmin') then
    raise exception 'permiso_administracion_requerido';
  end if;
  if p_superadmin_only and v_role <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;
  if v_role <> 'superadmin' then
    if p_organization_id is not null and p_organization_id <> v_user.organizacion_id then
      raise exception 'organizacion_fuera_de_alcance';
    end if;
    if p_site_id is not null and v_user.sitio_id is not null and p_site_id <> v_user.sitio_id then
      raise exception 'sitio_fuera_de_alcance';
    end if;
  end if;

  return v_user;
end;
$$;

revoke all on function public.require_organization_manager(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.admin_list_organization_hubs()
returns table (
  id uuid,
  nombre text,
  tipo text,
  slug text,
  plan text,
  activo boolean,
  sitios_total integer,
  usuarios_total integer,
  asistencias_total integer,
  sitios jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
begin
  v_user := public.require_organization_manager(null, null, false);
  v_role := public.normalize_app_role(v_user.rol);

  return query
  select
    o.id,
    o.nombre,
    o.tipo,
    o.slug,
    o.plan,
    o.activo,
    (select count(*)::integer from public.sitios s where s.organizacion_id = o.id),
    (select count(*)::integer from public.usuarios_app u where u.organizacion_id = o.id and coalesce(u.activo, true)),
    (select count(*)::integer from public.asistencias a where a.organizacion_id = o.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'organizacion_id', s.organizacion_id,
        'nombre', s.nombre,
        'direccion', s.direccion,
        'latitud', s.latitud,
        'longitud', s.longitud,
        'radio_metros', s.radio_metros,
        'hora_entrada_inicio', to_char(s.hora_entrada_inicio, 'HH24:MI'),
        'hora_entrada_fin', to_char(s.hora_entrada_fin, 'HH24:MI'),
        'hora_salida_inicio', to_char(s.hora_salida_inicio, 'HH24:MI'),
        'hora_salida_fin', to_char(s.hora_salida_fin, 'HH24:MI'),
        'zona_horaria', s.zona_horaria,
        'gps_policy', s.gps_policy,
        'evidence_policy', s.evidence_policy,
        'identificador_label', coalesce(ic.label, 'Identificador'),
        'activo', s.activo,
        'usuarios_total', (select count(*) from public.usuarios_app su where su.sitio_id = s.id and coalesce(su.activo, true)),
        'asistencias_total', (select count(*) from public.asistencias sa where sa.sitio_id = s.id or sa.sitio_entrada_id = s.id or sa.sitio_salida_id = s.id),
        'updated_at', s.updated_at
      ) order by s.activo desc, s.nombre asc)
      from public.sitios s
      left join public.site_identifier_config ic on ic.sitio_id = s.id
      where s.organizacion_id = o.id
    ), '[]'::jsonb),
    o.updated_at
  from public.organizaciones o
  where v_role = 'superadmin' or o.id = v_user.organizacion_id
  order by o.activo desc, o.nombre asc;
end;
$$;

create or replace function public.admin_upsert_organization(
  p_id uuid default null,
  p_nombre text default null,
  p_tipo text default 'empresa',
  p_slug text default null,
  p_clave text default null,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_id uuid;
  v_slug text;
begin
  v_user := public.require_organization_manager(p_id, null, true);
  if nullif(trim(coalesce(p_nombre, '')), '') is null then raise exception 'nombre_requerido'; end if;
  if p_tipo not in ('empresa', 'escuela', 'centro_trabajo', 'negocio_local', 'otro') then raise exception 'tipo_invalido'; end if;
  if p_id is null and length(trim(coalesce(p_clave, ''))) < 8 then raise exception 'clave_minimo_8_caracteres'; end if;
  if p_clave is not null and p_clave <> '' and length(trim(p_clave)) < 8 then raise exception 'clave_minimo_8_caracteres'; end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), trim(p_nombre)), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then raise exception 'slug_invalido'; end if;

  if p_id is null then
    insert into public.organizaciones (nombre, tipo, slug, activo, clave_acceso_hash)
    values (trim(p_nombre), p_tipo, v_slug, coalesce(p_activo, true), public.hash_org_key(p_clave))
    returning id into v_id;
  else
    update public.organizaciones o
    set nombre = trim(p_nombre),
        tipo = p_tipo,
        slug = v_slug,
        activo = coalesce(p_activo, true),
        clave_acceso_hash = case when nullif(trim(coalesce(p_clave, '')), '') is null then o.clave_acceso_hash else public.hash_org_key(p_clave) end,
        updated_at = now()
    where o.id = p_id
    returning o.id into v_id;
    if v_id is null then raise exception 'organizacion_no_encontrada'; end if;
  end if;

  insert into public.audit_logs (accion, detalle, resultado)
  values (case when p_id is null then 'organizacion_creada' else 'organizacion_actualizada' end, v_id::text, 'ok');
  return v_id;
exception
  when unique_violation then raise exception 'slug_organizacion_duplicado';
end;
$$;

create or replace function public.admin_delete_organization(p_id uuid)
returns table (deleted boolean, deactivated boolean, message text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_users integer;
  v_attendances integer;
begin
  v_user := public.require_organization_manager(p_id, null, true);
  if not exists (select 1 from public.organizaciones where id = p_id) then raise exception 'organizacion_no_encontrada'; end if;

  select count(*)::integer into v_users from public.usuarios_app where organizacion_id = p_id;
  select count(*)::integer into v_attendances from public.asistencias where organizacion_id = p_id;

  if v_users > 0 or v_attendances > 0 then
    update public.organizaciones set activo = false, updated_at = now() where id = p_id;
    update public.sitios set activo = false, updated_at = now() where organizacion_id = p_id;
    insert into public.audit_logs (accion, detalle, resultado) values ('organizacion_desactivada', p_id::text, 'ok');
    return query select false, true, 'Tiene historial: se desactivo sin borrar asistencias.'::text;
  end if;

  delete from public.sitios where organizacion_id = p_id;
  delete from public.organizaciones where id = p_id;
  insert into public.audit_logs (accion, detalle, resultado) values ('organizacion_eliminada', p_id::text, 'ok');
  return query select true, false, 'Organizacion eliminada.'::text;
end;
$$;

create or replace function public.admin_upsert_site(
  p_id uuid default null,
  p_organization_id uuid default null,
  p_nombre text default null,
  p_direccion text default null,
  p_latitud numeric default null,
  p_longitud numeric default null,
  p_radio_metros integer default 150,
  p_hora_entrada_inicio text default '07:30',
  p_hora_entrada_fin text default '08:15',
  p_hora_salida_inicio text default '16:30',
  p_hora_salida_fin text default '17:10',
  p_zona_horaria text default 'America/Mexico_City',
  p_gps_policy text default 'revision',
  p_evidence_policy text default 'rostro',
  p_identificador_label text default 'Identificador',
  p_clave text default null,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_id uuid;
  v_org_id uuid;
  v_entry_start time := p_hora_entrada_inicio::time;
  v_entry_end time := p_hora_entrada_fin::time;
  v_exit_start time := p_hora_salida_inicio::time;
  v_exit_end time := p_hora_salida_fin::time;
begin
  if p_id is not null then select organizacion_id into v_org_id from public.sitios where id = p_id; end if;
  v_org_id := coalesce(p_organization_id, v_org_id);
  if v_org_id is null then raise exception 'organizacion_requerida'; end if;
  v_user := public.require_organization_manager(v_org_id, p_id, false);

  if nullif(trim(coalesce(p_nombre, '')), '') is null then raise exception 'nombre_requerido'; end if;
  if not exists (select 1 from public.organizaciones where id = v_org_id and activo) then raise exception 'organizacion_inactiva_o_no_encontrada'; end if;
  if p_latitud is null or p_latitud not between -90 and 90 then raise exception 'latitud_invalida'; end if;
  if p_longitud is null or p_longitud not between -180 and 180 then raise exception 'longitud_invalida'; end if;
  if p_radio_metros not between 20 and 1000 then raise exception 'radio_invalido'; end if;
  if v_entry_start >= v_entry_end or v_exit_start >= v_exit_end then raise exception 'horario_invalido'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_zona_horaria) then raise exception 'zona_horaria_invalida'; end if;
  if p_gps_policy not in ('obligatorio', 'opcional', 'informativo', 'revision', 'bloqueo') then raise exception 'gps_policy_invalida'; end if;
  if p_evidence_policy not in ('rostro', 'documento', 'rostro_documento', 'foto_simple') then raise exception 'evidence_policy_invalida'; end if;

  if p_id is null then
    insert into public.sitios (organizacion_id, nombre, direccion, latitud, longitud, radio_metros,
      hora_entrada_inicio, hora_entrada_fin, hora_salida_inicio, hora_salida_fin, zona_horaria,
      gps_policy, evidence_policy, activo, clave_acceso_hash)
    values (v_org_id, trim(p_nombre), nullif(trim(coalesce(p_direccion, '')), ''), p_latitud, p_longitud, p_radio_metros,
      v_entry_start, v_entry_end, v_exit_start, v_exit_end, p_zona_horaria,
      p_gps_policy, p_evidence_policy, coalesce(p_activo, true), public.hash_org_key(p_clave))
    returning id into v_id;
  else
    update public.sitios s
    set nombre = trim(p_nombre), direccion = nullif(trim(coalesce(p_direccion, '')), ''),
        latitud = p_latitud, longitud = p_longitud, radio_metros = p_radio_metros,
        hora_entrada_inicio = v_entry_start, hora_entrada_fin = v_entry_end,
        hora_salida_inicio = v_exit_start, hora_salida_fin = v_exit_end,
        zona_horaria = p_zona_horaria, gps_policy = p_gps_policy,
        evidence_policy = p_evidence_policy, activo = coalesce(p_activo, true),
        clave_acceso_hash = case when nullif(trim(coalesce(p_clave, '')), '') is null then s.clave_acceso_hash else public.hash_org_key(p_clave) end,
        updated_at = now()
    where s.id = p_id and s.organizacion_id = v_org_id
    returning s.id into v_id;
    if v_id is null then raise exception 'sitio_no_encontrado_o_fuera_de_alcance'; end if;
  end if;

  insert into public.site_identifier_config (organizacion_id, sitio_id, label, updated_at)
  values (v_org_id, v_id, coalesce(nullif(trim(p_identificador_label), ''), 'Identificador'), now())
  on conflict (sitio_id) do update set label = excluded.label, organizacion_id = excluded.organizacion_id, updated_at = now();

  insert into public.audit_logs (accion, detalle, resultado)
  values (case when p_id is null then 'sitio_creado' else 'sitio_actualizado' end, v_id::text, 'ok');
  return v_id;
end;
$$;

create or replace function public.admin_delete_site(p_site_id uuid)
returns table (deleted boolean, deactivated boolean, message text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_users integer;
  v_attendances integer;
begin
  select * into v_site from public.sitios where id = p_site_id;
  if v_site.id is null then raise exception 'sitio_no_encontrado'; end if;
  v_user := public.require_organization_manager(v_site.organizacion_id, p_site_id, false);
  select count(*)::integer into v_users from public.usuarios_app where sitio_id = p_site_id;
  select count(*)::integer into v_attendances from public.asistencias where sitio_id = p_site_id or sitio_entrada_id = p_site_id or sitio_salida_id = p_site_id;

  if v_users > 0 or v_attendances > 0 then
    update public.sitios set activo = false, updated_at = now() where id = p_site_id;
    insert into public.audit_logs (accion, detalle, resultado) values ('sitio_desactivado', p_site_id::text, 'ok');
    return query select false, true, 'Tiene historial: se desactivo.'::text;
  end if;
  delete from public.sitios where id = p_site_id;
  insert into public.audit_logs (accion, detalle, resultado) values ('sitio_eliminado', p_site_id::text, 'ok');
  return query select true, false, 'Sitio eliminado.'::text;
end;
$$;

revoke all on function public.admin_list_organization_hubs() from public, anon;
revoke all on function public.admin_upsert_organization(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.admin_delete_organization(uuid) from public, anon;
revoke all on function public.admin_upsert_site(uuid, uuid, text, text, numeric, numeric, integer, text, text, text, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.admin_delete_site(uuid) from public, anon;

grant execute on function public.admin_list_organization_hubs() to authenticated;
grant execute on function public.admin_upsert_organization(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_organization(uuid) to authenticated;
grant execute on function public.admin_upsert_site(uuid, uuid, text, text, numeric, numeric, integer, text, text, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_site(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
