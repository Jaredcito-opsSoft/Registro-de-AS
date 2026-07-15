-- Admins and superadmins may complete more than one attendance cycle per day.
-- Every role remains limited to one active entry at a time.

alter table public.asistencias
  drop constraint if exists asistencias_matricula_fecha_unique;

create unique index if not exists asistencias_usuario_fecha_activa_unique
  on public.asistencias (usuario_id, fecha)
  where usuario_id is not null and hora_salida is null;

create or replace function public.enforce_attendance_cycle_policy()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
begin
  if new.usuario_id is null then
    return new;
  end if;

  select public.normalize_app_role(u.rol)
  into v_role
  from public.usuarios_app u
  where u.id = new.usuario_id
    and coalesce(u.activo, true)
  limit 1;

  if v_role is null then
    raise exception 'usuario_app_no_encontrado';
  end if;

  if exists (
    select 1
    from public.asistencias a
    where a.usuario_id = new.usuario_id
      and a.fecha = new.fecha
      and a.hora_salida is null
  ) then
    raise exception 'entrada_activa_existente';
  end if;

  if v_role not in ('admin', 'superadmin') and exists (
    select 1
    from public.asistencias a
    where a.usuario_id = new.usuario_id
      and a.fecha = new.fecha
  ) then
    raise exception 'entrada_diaria_existente';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_attendance_cycle_policy_trigger
  on public.asistencias;

create trigger enforce_attendance_cycle_policy_trigger
before insert on public.asistencias
for each row
execute function public.enforce_attendance_cycle_policy();

revoke all on function public.enforce_attendance_cycle_policy() from public, anon, authenticated;

notify pgrst, 'reload schema';
