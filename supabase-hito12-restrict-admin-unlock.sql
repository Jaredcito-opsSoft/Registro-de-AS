-- HITO 12: restringir desbloqueo admin a roles autenticados
-- ADMIN123 queda solo como clave local/demo del frontend; en Supabase no concede permisos reales.

create or replace function public.require_admin_app_user(
  p_required_permission text default null,
  p_min_rank integer default 30
)
returns public.usuarios_app
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
begin
  select *
  into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  if v_user.id is null or public.app_role_rank(v_user.rol) < p_min_rank then
    raise exception 'admin_auth_required';
  end if;

  if p_required_permission is not null then
    v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);
    if not coalesce((v_permissions ->> p_required_permission)::boolean, false) then
      raise exception 'permission_%_required', p_required_permission;
    end if;
  end if;

  return v_user;
end;
$$;

revoke all on function public.require_admin_app_user(text, integer) from public, anon, authenticated;

create or replace function public.log_security_event(
  p_accion text,
  p_detalle text default null,
  p_resultado text default 'denied'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (accion, detalle, resultado)
  values (
    coalesce(nullif(trim(p_accion), ''), 'security_event'),
    left(coalesce(p_detalle, ''), 500),
    coalesce(nullif(trim(p_resultado), ''), 'denied')
  );
end;
$$;

revoke all on function public.log_security_event(text, text, text) from public;
grant execute on function public.log_security_event(text, text, text) to anon, authenticated;

create or replace function public.admin_log_event(
  p_admin_key text,
  p_accion text,
  p_detalle text default null,
  p_resultado text default 'ok'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_app_user(null, 30);

  insert into public.audit_logs (accion, detalle, resultado)
  values (
    coalesce(nullif(trim(p_accion), ''), 'accion_admin'),
    left(coalesce(p_detalle, ''), 500),
    coalesce(nullif(trim(p_resultado), ''), 'ok')
  );
end;
$$;

create or replace function public.admin_update_observacion_asistencia(
  p_id uuid,
  p_admin_key text,
  p_observacion text
)
returns public.asistencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
  updated_row public.asistencias;
begin
  v_user := public.require_admin_app_user('manage_records', 30);
  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  update public.asistencias a
  set observacion_admin = coalesce(p_observacion, ''),
      modificado_por_admin = true,
      updated_at = now()
  where a.id = p_id
    and (
      coalesce((v_permissions ->> 'view_all_records')::boolean, false)
      or (
        a.organizacion_id = v_user.organizacion_id
        and (
          v_user.sitio_id is null
          or a.sitio_id = v_user.sitio_id
          or a.sitio_entrada_id = v_user.sitio_id
          or a.sitio_salida_id = v_user.sitio_id
        )
      )
    )
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'registro_no_encontrado_o_fuera_de_alcance';
  end if;

  return updated_row;
end;
$$;

create or replace function public.admin_delete_asistencia(
  p_id uuid,
  p_admin_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
  deleted_count integer;
begin
  v_user := public.require_admin_app_user('manage_records', 30);
  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  delete from public.asistencias a
  where a.id = p_id
    and (
      coalesce((v_permissions ->> 'view_all_records')::boolean, false)
      or (
        a.organizacion_id = v_user.organizacion_id
        and (
          v_user.sitio_id is null
          or a.sitio_id = v_user.sitio_id
          or a.sitio_entrada_id = v_user.sitio_id
          or a.sitio_salida_id = v_user.sitio_id
        )
      )
    );

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'registro_no_encontrado_o_fuera_de_alcance';
  end if;
end;
$$;

create or replace function public.admin_clear_asistencias(p_admin_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  perform public.require_admin_app_user('manage_organization', 40);

  delete from public.asistencias;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.upsert_site_config(
  p_admin_key text,
  p_nombre text,
  p_direccion text,
  p_latitud numeric,
  p_longitud numeric,
  p_radio_metros integer default 150,
  p_hora_entrada_inicio text default '07:30',
  p_hora_entrada_fin text default '08:15',
  p_hora_salida_inicio text default '16:30',
  p_hora_salida_fin text default '17:10',
  p_zona_horaria text default 'America/Mexico_City',
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
  v_org_id uuid;
  v_site_id uuid;
  v_entry_start time := p_hora_entrada_inicio::time;
  v_entry_end time := p_hora_entrada_fin::time;
  v_exit_start time := p_hora_salida_inicio::time;
  v_exit_end time := p_hora_salida_fin::time;
begin
  v_user := public.require_admin_app_user('manage_site', 30);
  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);
  v_org_id := v_user.organizacion_id;

  if v_org_id is null then
    raise exception 'organizacion_admin_requerida';
  end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'nombre_requerido'; end if;
  if p_latitud is null or p_latitud < -90 or p_latitud > 90 then raise exception 'latitud_invalida'; end if;
  if p_longitud is null or p_longitud < -180 or p_longitud > 180 then raise exception 'longitud_invalida'; end if;
  if p_radio_metros is null or p_radio_metros < 20 or p_radio_metros > 1000 then raise exception 'radio_invalido'; end if;
  if v_entry_start >= v_entry_end or v_exit_start >= v_exit_end then raise exception 'horario_invalido'; end if;

  if p_activo then
    update public.sitios
    set activo = false, updated_at = now()
    where organizacion_id = v_org_id
      and activo = true
      and (v_user.sitio_id is null or id = v_user.sitio_id);
  end if;

  if v_user.sitio_id is not null and not coalesce((v_permissions ->> 'manage_organization')::boolean, false) then
    v_site_id := v_user.sitio_id;
    update public.sitios
    set nombre = trim(p_nombre),
        direccion = nullif(trim(coalesce(p_direccion, '')), ''),
        latitud = p_latitud,
        longitud = p_longitud,
        radio_metros = p_radio_metros,
        hora_entrada_inicio = v_entry_start,
        hora_entrada_fin = v_entry_end,
        hora_salida_inicio = v_exit_start,
        hora_salida_fin = v_exit_end,
        zona_horaria = coalesce(nullif(trim(p_zona_horaria), ''), 'America/Mexico_City'),
        activo = p_activo,
        updated_at = now()
    where id = v_site_id
      and organizacion_id = v_org_id;

    if not found then
      raise exception 'sitio_no_encontrado_o_fuera_de_alcance';
    end if;
  else
    insert into public.sitios (
      organizacion_id, nombre, direccion, latitud, longitud, radio_metros,
      hora_entrada_inicio, hora_entrada_fin, hora_salida_inicio, hora_salida_fin,
      zona_horaria, activo
    ) values (
      v_org_id, trim(p_nombre), nullif(trim(coalesce(p_direccion, '')), ''), p_latitud, p_longitud, p_radio_metros,
      v_entry_start, v_entry_end, v_exit_start, v_exit_end,
      coalesce(nullif(trim(p_zona_horaria), ''), 'America/Mexico_City'), p_activo
    ) returning id into v_site_id;
  end if;

  return v_site_id;
end;
$$;

revoke execute on function public.admin_log_event(text, text, text, text) from public, anon;
revoke execute on function public.admin_update_observacion_asistencia(uuid, text, text) from public, anon;
revoke execute on function public.admin_delete_asistencia(uuid, text) from public, anon;
revoke execute on function public.admin_clear_asistencias(text) from public, anon;
revoke execute on function public.upsert_site_config(text, text, text, numeric, numeric, integer, text, text, text, text, text, boolean) from public, anon;

grant execute on function public.admin_log_event(text, text, text, text) to authenticated;
grant execute on function public.admin_update_observacion_asistencia(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_asistencia(uuid, text) to authenticated;
grant execute on function public.admin_clear_asistencias(text) to authenticated;
grant execute on function public.upsert_site_config(text, text, text, numeric, numeric, integer, text, text, text, text, text, boolean) to authenticated;

do $$
declare
  v_org uuid := public.get_default_organizacion_id();
  v_email text := lower('Jaredcontacto.mx@gmail.com');
  v_password text := 'Len52092';
  v_name text := 'Jared Contacto';
  v_auth_id uuid;
begin
  select id into v_auth_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_auth_id is null then
    v_auth_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change_token_new, email_change,
      is_super_admin, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('nombre', v_name, 'matricula', 'JAREDCONTACTO.MX', 'organization_key', 'DEMO-AS-2026'),
      now(), now(),
      '', '', '', '',
      false, false, false
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('provider', 'email', 'providers', array['email']),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nombre', v_name, 'matricula', 'JAREDCONTACTO.MX', 'organization_key', 'DEMO-AS-2026'),
        updated_at = now()
    where id = v_auth_id;
  end if;

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_auth_id::text, v_auth_id,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  )
  on conflict (provider, provider_id) do update
  set identity_data = excluded.identity_data,
      updated_at = now();

  insert into public.usuarios_app (organizacion_id, nombre, matricula, email, rol, activo, auth_user_id, ultimo_acceso_at)
  values (v_org, v_name, 'JAREDCONTACTO.MX', v_email, 'superadmin', true, v_auth_id, now())
  on conflict (organizacion_id, matricula) do update
  set nombre = excluded.nombre,
      email = excluded.email,
      rol = 'superadmin',
      activo = true,
      auth_user_id = excluded.auth_user_id,
      ultimo_acceso_at = now(),
      updated_at = now();
end $$;

notify pgrst, 'reload schema';
