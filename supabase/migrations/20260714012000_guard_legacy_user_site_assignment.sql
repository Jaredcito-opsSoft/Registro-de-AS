-- Keep the legacy endpoint aligned with the active-session protection used by
-- the current scope-assignment flow.
create or replace function public.admin_assign_user_site(
  p_usuario_id uuid,
  p_sitio_id uuid
)
returns table(usuario_id uuid, sitio_id uuid, organizacion_id uuid)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor usuarios_app%rowtype;
  v_user usuarios_app%rowtype;
  v_site sitios%rowtype;
  v_role text;
begin
  perform public.assert_active_app_session();

  select * into v_actor
  from public.usuarios_app
  where auth_user_id = auth.uid() and coalesce(activo, true)
  limit 1;

  if not found then raise exception 'usuario_app_no_encontrado'; end if;
  v_role := public.normalize_app_role(v_actor.rol);
  if v_role not in ('admin', 'superadmin') then raise exception 'permiso_manage_users_requerido'; end if;

  select * into v_user from public.usuarios_app where id = p_usuario_id;
  select * into v_site from public.sitios where id = p_sitio_id and activo;
  if not found or v_user.organizacion_id is distinct from v_site.organizacion_id then
    raise exception 'usuario_o_sitio_invalido';
  end if;
  if v_role <> 'superadmin' and v_site.organizacion_id <> v_actor.organizacion_id then
    raise exception 'sitio_fuera_de_alcance';
  end if;
  if v_user.rol in ('admin', 'superadmin') and v_role <> 'superadmin' then
    raise exception 'no_puedes_reasignar_admin';
  end if;

  update public.usuarios_app
  set sitio_id = p_sitio_id,
      scope_type = case when rol in ('admin', 'operador', 'supervisor') then 'sitio' else scope_type end,
      updated_at = now()
  where id = p_usuario_id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.site_assigned', 'Usuario asignado a sitio', 'exitoso', v_actor.id, v_site.organizacion_id, v_site.id);

  return query select p_usuario_id, p_sitio_id, v_site.organizacion_id;
end;
$$;

revoke all on function public.admin_assign_user_site(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_user_site(uuid, uuid) to authenticated;
