-- Owner es una capacidad raiz independiente de usuarios_app. Solo los owners
-- pueden actuar contra una cuenta superadmin o revocar su rol global.

begin;

create table if not exists public.system_owners (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_owners_email_normalized check (email = lower(trim(email)))
);

alter table public.system_owners enable row level security;
revoke all on table public.system_owners from public, anon, authenticated;

-- Owners iniciales aprobados para este MVP. El identificador Auth se resuelve
-- en la base para que el cliente nunca pueda autoproclamarse owner.
insert into public.system_owners (auth_user_id, email, activo)
select au.id, lower(au.email), true
from auth.users as au
where lower(au.email) in (
  'alexisdavid1177@gmail.com',
  'jaredcontacto.mx@gmail.com'
)
on conflict (auth_user_id) do update
set email = excluded.email, activo = true, updated_at = now();

create or replace function public.is_system_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.system_owners as owner
    where owner.auth_user_id = auth.uid()
      and owner.activo
  );
$$;

create or replace function public.superadmin_deactivate_user(p_usuario_id uuid)
returns table (usuario_id uuid, desactivado boolean)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_actor_role text;
  v_target_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;
  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('admin', 'superadmin') then raise exception 'permiso_admin_requerido'; end if;

  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if v_target.id = v_actor.id then raise exception 'usuario_no_puede_eliminarse'; end if;
  v_target_role := public.normalize_app_role(v_target.rol);
  if exists (select 1 from public.system_owners as owner where owner.auth_user_id = v_target.auth_user_id and owner.activo) then
    raise exception 'owner_no_modificable_desde_aplicacion';
  end if;
  if v_target_role = 'superadmin' and not public.is_system_owner() then
    raise exception 'owner_requerido_para_gestionar_superadmin';
  end if;
  if v_actor_role = 'admin' and (
    v_target.organizacion_id is distinct from v_actor.organizacion_id
    or v_target_role not in ('usuario', 'supervisor')
  ) then raise exception 'usuario_fuera_de_alcance'; end if;

  update public.usuarios_app as ua
  set activo = false, active_session_id = null, active_session_started_at = null,
      active_session_device_label = null, updated_at = now()
  where ua.id = v_target.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.deactivated', jsonb_build_object('usuario_id', v_target.id, 'rol', v_target_role, 'actor_rol', v_actor_role)::text, 'exitoso', v_actor.id, v_target.organizacion_id, v_target.sitio_id);
  return query select v_target.id, true;
end;
$$;

create or replace function public.superadmin_purge_user(
  p_usuario_id uuid,
  p_confirmacion text
)
returns table (usuario_id uuid, asistencias_eliminadas integer, evidencias_eliminadas integer)
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_target_role text;
  v_auth_user_id uuid;
  v_attendance_count integer := 0;
  v_evidence_count integer := 0;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last limit 1;
  if not found or public.normalize_app_role(v_actor.rol) <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;
  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if v_target.id = v_actor.id then raise exception 'usuario_no_puede_eliminarse'; end if;
  v_target_role := public.normalize_app_role(v_target.rol);
  if exists (select 1 from public.system_owners as owner where owner.auth_user_id = v_target.auth_user_id and owner.activo) then
    raise exception 'owner_no_modificable_desde_aplicacion';
  end if;
  if v_target_role = 'superadmin' and not public.is_system_owner() then
    raise exception 'owner_requerido_para_gestionar_superadmin';
  end if;
  if upper(trim(coalesce(p_confirmacion, ''))) <> 'ELIMINAR' then
    raise exception 'confirmacion_de_purga_invalida';
  end if;

  v_auth_user_id := v_target.auth_user_id;
  select count(*)::integer into v_attendance_count from public.asistencias where usuario_id = v_target.id;
  delete from storage.objects
  where bucket_id in ('attendance-photos', 'evidencias-asistencia')
    and name in (
      select a.foto_entrada_storage_path from public.asistencias as a
      where a.usuario_id = v_target.id and nullif(trim(coalesce(a.foto_entrada_storage_path, '')), '') is not null
      union
      select a.foto_salida_storage_path from public.asistencias as a
      where a.usuario_id = v_target.id and nullif(trim(coalesce(a.foto_salida_storage_path, '')), '') is not null
    );
  get diagnostics v_evidence_count = row_count;
  delete from public.site_admin_invitations where created_by = v_target.id or accepted_by = v_target.id;
  delete from public.site_admin_invites
  where created_by_usuario_id = v_target.id or accepted_by_auth_user_id is not distinct from v_auth_user_id;
  delete from public.audit_logs where actor_user_id = v_target.id;
  delete from public.asistencias where usuario_id = v_target.id;
  delete from public.usuarios_app where id = v_target.id;
  if v_auth_user_id is not null then delete from auth.users where id = v_auth_user_id; end if;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.purged', jsonb_build_object('usuario_id', p_usuario_id, 'asistencias_eliminadas', v_attendance_count, 'evidencias_eliminadas', v_evidence_count, 'rol_eliminado', v_target_role)::text, 'exitoso', v_actor.id, v_target.organizacion_id, v_target.sitio_id);
  return query select p_usuario_id, v_attendance_count, v_evidence_count;
end;
$$;

create or replace function public.owner_demote_superadmin_to_org_admin(
  p_usuario_id uuid,
  p_organizacion_id uuid
)
returns table (usuario_id uuid, organizacion_id uuid, rol text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
begin
  perform public.assert_active_app_session();
  if not public.is_system_owner() then raise exception 'permiso_owner_requerido'; end if;
  select ua.* into v_actor from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;
  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found or public.normalize_app_role(v_target.rol) <> 'superadmin' then
    raise exception 'superadmin_objetivo_requerido';
  end if;
  if v_target.id = v_actor.id then raise exception 'owner_no_puede_degradarse_a_si_mismo'; end if;
  if exists (select 1 from public.system_owners as owner where owner.auth_user_id = v_target.auth_user_id and owner.activo) then
    raise exception 'owner_no_modificable_desde_aplicacion';
  end if;
  if not exists (select 1 from public.organizaciones as o where o.id = p_organizacion_id and coalesce(o.activo, true)) then
    raise exception 'organizacion_activa_no_encontrada';
  end if;
  update public.usuarios_app
  set rol = 'admin', organizacion_id = p_organizacion_id, sitio_id = null,
      scope_type = 'organizacion', updated_at = now()
  where id = v_target.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id)
  values ('superadmin.demoted_by_owner', jsonb_build_object('usuario_id', v_target.id, 'rol_anterior', 'superadmin', 'rol_nuevo', 'admin')::text, 'exitoso', v_actor.id, p_organizacion_id);
  return query select v_target.id, p_organizacion_id, 'admin'::text;
end;
$$;

revoke all on function public.is_system_owner() from public, anon, authenticated;
revoke all on function public.owner_demote_superadmin_to_org_admin(uuid, uuid) from public, anon;
grant execute on function public.owner_demote_superadmin_to_org_admin(uuid, uuid) to authenticated;
revoke all on function public.superadmin_deactivate_user(uuid) from public, anon;
grant execute on function public.superadmin_deactivate_user(uuid) to authenticated;
revoke all on function public.superadmin_purge_user(uuid, text) from public, anon;
grant execute on function public.superadmin_purge_user(uuid, text) to authenticated;
notify pgrst, 'reload schema';

commit;
