-- Corrige eliminaciones bloqueadas por dependencias auxiliares y FKs.
-- Las organizaciones con historial se archivan; solo owners pueden ejecutar
-- esta accion global. Los sitios sin asistencias se eliminan de forma segura.

create or replace function public.admin_delete_site(p_site_id uuid)
returns table(deleted boolean, deactivated boolean, message text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_users integer := 0;
  v_attendances integer := 0;
  v_is_owner boolean := false;
begin
  select * into v_site from public.sitios where id = p_site_id for update;
  if v_site.id is null then raise exception 'sitio_no_encontrado'; end if;

  v_actor := public.require_organization_manager(v_site.organizacion_id, p_site_id, false);
  v_is_owner := public.is_system_owner();

  select count(*)::integer into v_users
  from public.usuarios_app where sitio_id = p_site_id;

  select count(*)::integer into v_attendances
  from public.asistencias
  where sitio_id = p_site_id
     or sitio_entrada_id = p_site_id
     or sitio_salida_id = p_site_id;

  if v_attendances > 0 or (v_users > 0 and not v_is_owner) then
    update public.sitios
    set activo = false, updated_at = now()
    where id = p_site_id;

    insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
    values ('sitio_archivado', p_site_id::text, 'ok', v_actor.id, v_site.organizacion_id, p_site_id);

    return query select false, true,
      case when v_attendances > 0
        then 'El sitio tiene historial y fue archivado correctamente.'::text
        else 'El sitio tiene usuarios asignados y fue archivado correctamente.'::text
      end;
    return;
  end if;

  -- Un owner puede retirar un sitio sin asistencias. Los usuarios se conservan
  -- en la organizacion y quedan pendientes de una nueva asignacion.
  update public.usuarios_app
  set sitio_id = null, updated_at = now()
  where sitio_id = p_site_id;

  delete from public.usuario_sitios_alcance where sitio_id = p_site_id;
  delete from public.site_admin_invitations where sitio_id = p_site_id;
  delete from public.site_admin_invites where sitio_id = p_site_id;
  delete from public.site_identifier_config where sitio_id = p_site_id;
  update public.audit_logs set sitio_id = null where sitio_id = p_site_id;
  delete from public.sitios where id = p_site_id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id)
  values ('sitio_eliminado', p_site_id::text, 'ok', v_actor.id, v_site.organizacion_id);

  return query select true, false,
    case when v_users > 0
      then format('Sitio eliminado. %s usuario(s) quedaron sin sitio asignado.', v_users)::text
      else 'Sitio eliminado correctamente.'::text
    end;
end;
$$;

create or replace function public.admin_delete_organization(p_id uuid)
returns table(deleted boolean, deactivated boolean, message text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_org public.organizaciones%rowtype;
  v_users integer := 0;
  v_attendances integer := 0;
begin
  v_actor := public.require_organization_manager(p_id, null, true);
  if not public.is_system_owner() then raise exception 'permiso_owner_requerido'; end if;

  select * into v_org from public.organizaciones where id = p_id for update;
  if v_org.id is null then raise exception 'organizacion_no_encontrada'; end if;

  select count(*)::integer into v_users
  from public.usuarios_app where organizacion_id = p_id;

  select count(*)::integer into v_attendances
  from public.asistencias where organizacion_id = p_id;

  if v_users > 0 or v_attendances > 0 then
    update public.organizaciones set activo = false, updated_at = now() where id = p_id;
    update public.sitios set activo = false, updated_at = now() where organizacion_id = p_id;

    insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id)
    values ('organizacion_archivada', p_id::text, 'ok', v_actor.id, p_id);

    return query select false, true,
      'La organizacion tiene usuarios o historial y fue archivada correctamente.'::text;
    return;
  end if;

  delete from public.site_admin_invitations where organizacion_id = p_id;
  delete from public.site_admin_invites where organizacion_id = p_id;
  delete from public.site_identifier_config where organizacion_id = p_id;
  delete from public.usuario_sitios_alcance where organizacion_id = p_id;

  update public.audit_logs
  set sitio_id = null
  where sitio_id in (select id from public.sitios where organizacion_id = p_id);

  delete from public.sitios where organizacion_id = p_id;
  update public.audit_logs set organizacion_id = null where organizacion_id = p_id;
  delete from public.organizaciones where id = p_id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id)
  values ('organizacion_eliminada', p_id::text, 'ok', v_actor.id);

  return query select true, false, 'Organizacion eliminada correctamente.'::text;
end;
$$;

revoke all on function public.admin_delete_site(uuid) from public, anon;
revoke all on function public.admin_delete_organization(uuid) from public, anon;
grant execute on function public.admin_delete_site(uuid) to authenticated;
grant execute on function public.admin_delete_organization(uuid) to authenticated;

comment on function public.admin_delete_site(uuid)
is 'Elimina sitios sin asistencias, desasigna usuarios solo para owner y archiva cuando existe historial.';
comment on function public.admin_delete_organization(uuid)
is 'Owner elimina organizaciones vacias o archiva organizaciones con usuarios/historial.';
