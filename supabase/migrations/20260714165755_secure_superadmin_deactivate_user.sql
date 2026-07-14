begin;

create or replace function public.superadmin_deactivate_user(p_usuario_id uuid)
returns table (
  usuario_id uuid,
  desactivado boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;

  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid()
    and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;

  if not found or public.normalize_app_role(v_actor.rol) <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;

  select ua.* into v_target
  from public.usuarios_app as ua
  where ua.id = p_usuario_id
  limit 1;

  if not found then
    raise exception 'usuario_no_encontrado';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'superadmin_no_puede_eliminarse';
  end if;
  if public.normalize_app_role(v_target.rol) = 'superadmin' then
    raise exception 'superadmin_no_eliminable';
  end if;

  update public.usuarios_app as ua
  set activo = false,
      sitio_id = null,
      updated_at = now()
  where ua.id = v_target.id;

  insert into public.audit_logs (
    accion,
    detalle,
    resultado,
    actor_user_id,
    organizacion_id,
    sitio_id
  ) values (
    'user.deactivated',
    jsonb_build_object(
      'usuario_id', v_target.id,
      'rol', public.normalize_app_role(v_target.rol),
      'sitio_anterior', v_target.sitio_id
    )::text,
    'exitoso',
    v_actor.id,
    v_target.organizacion_id,
    v_target.sitio_id
  );

  return query select v_target.id, true;
end;
$$;

revoke all on function public.superadmin_deactivate_user(uuid) from public, anon;
grant execute on function public.superadmin_deactivate_user(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
