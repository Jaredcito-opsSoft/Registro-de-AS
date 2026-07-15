-- Administrators have organization scope and intentionally do not require a fixed site.
-- The attendance RPC validates the explicitly selected site after resolving the actor.

create or replace function public.get_attendance_actor(p_matricula text)
returns public.usuarios_app
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_matricula text := upper(trim(coalesce(p_matricula, '')));
  v_role text;
begin
  perform public.assert_active_app_session();

  if v_matricula = '' then
    raise exception 'identificador_requerido';
  end if;

  select u.* into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  if v_user.id is null then
    raise exception 'usuario_app_no_encontrado';
  end if;
  if upper(trim(v_user.matricula)) <> v_matricula then
    raise exception 'identificador_fuera_de_sesion';
  end if;

  v_role := public.normalize_app_role(v_user.rol);

  if v_role = 'superadmin' then
    return v_user;
  end if;
  if v_user.organizacion_id is null then
    raise exception 'usuario_sin_organizacion_asignada';
  end if;
  if v_role in ('usuario', 'supervisor') and v_user.sitio_id is null then
    raise exception 'usuario_sin_sitio_asignado';
  end if;

  return v_user;
end;
$$;

revoke all on function public.get_attendance_actor(text) from public, anon;
grant execute on function public.get_attendance_actor(text) to authenticated;

notify pgrst, 'reload schema';
