-- HITO 8: privacidad por usuario y racha/cumplimiento personal
-- Ejecutar en Supabase SQL Editor o como migracion.

drop policy if exists asistencias_select_global on public.asistencias;
drop policy if exists asistencias_select_by_role on public.asistencias;

create policy asistencias_select_by_role
on public.asistencias
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios_app u
    where u.auth_user_id = auth.uid()
      and coalesce(u.activo, true)
      and u.organizacion_id = asistencias.organizacion_id
      and (
        coalesce((public.app_role_permissions(u.rol)->>'view_all_records')::boolean, false)
        or (
          coalesce((public.app_role_permissions(u.rol)->>'view_site_records')::boolean, false)
          and u.sitio_id is not null
          and u.sitio_id in (asistencias.sitio_id, asistencias.sitio_entrada_id, asistencias.sitio_salida_id)
        )
        or (
          coalesce((public.app_role_permissions(u.rol)->>'view_own_records')::boolean, false)
          and (
            asistencias.usuario_id = u.id
            or lower(trim(asistencias.matricula)) = lower(trim(u.matricula))
          )
        )
      )
  )
);

create or replace function public.get_visible_asistencias()
returns setof public.asistencias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
begin
  if auth.uid() is null then
    return;
  end if;

  select *
  into v_user
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and coalesce(activo, true)
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_user.id is null then
    return;
  end if;

  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  if coalesce((v_permissions->>'view_all_records')::boolean, false) then
    return query
    select a.*
    from public.asistencias a
    where a.organizacion_id = v_user.organizacion_id
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if coalesce((v_permissions->>'view_site_records')::boolean, false) and v_user.sitio_id is not null then
    return query
    select a.*
    from public.asistencias a
    where a.organizacion_id = v_user.organizacion_id
      and v_user.sitio_id in (a.sitio_id, a.sitio_entrada_id, a.sitio_salida_id)
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if coalesce((v_permissions->>'view_own_records')::boolean, true) then
    return query
    select a.*
    from public.asistencias a
    where a.organizacion_id = v_user.organizacion_id
      and (
        a.usuario_id = v_user.id
        or lower(trim(a.matricula)) = lower(trim(v_user.matricula))
      )
    order by a.fecha desc, a.hora_entrada desc nulls last;
  end if;
end;
$$;

create or replace function public.get_attendance_streak()
returns table (
  usuario_id uuid,
  matricula text,
  sitio_id uuid,
  sitio_nombre text,
  zona_horaria text,
  horario_entrada text,
  horario_salida text,
  dias_con_registro integer,
  dias_cumplidos integer,
  dias_revision integer,
  racha_actual integer,
  cumplimiento_pct numeric,
  ultima_fecha date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
begin
  if auth.uid() is null then
    return;
  end if;

  select *
  into v_user
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and coalesce(activo, true)
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_user.id is null then
    return;
  end if;

  return query
  with user_records as (
    select
      a.*,
      coalesce(se.id, ss.id, s.id, v_user.sitio_id) as effective_site_id,
      coalesce(se.nombre, ss.nombre, s.nombre, 'Sitio no asignado') as effective_site_name,
      coalesce(se.zona_horaria, ss.zona_horaria, s.zona_horaria, 'America/Mexico_City') as effective_timezone,
      coalesce(se.hora_entrada_inicio, s.hora_entrada_inicio) as entry_start,
      coalesce(se.hora_entrada_fin, s.hora_entrada_fin) as entry_end,
      coalesce(ss.hora_salida_inicio, s.hora_salida_inicio) as exit_start,
      coalesce(ss.hora_salida_fin, s.hora_salida_fin) as exit_end
    from public.asistencias a
    left join public.sitios se on se.id = a.sitio_entrada_id
    left join public.sitios ss on ss.id = a.sitio_salida_id
    left join public.sitios s on s.id = coalesce(a.sitio_id, v_user.sitio_id)
    where a.organizacion_id = v_user.organizacion_id
      and (
        a.usuario_id = v_user.id
        or lower(trim(a.matricula)) = lower(trim(v_user.matricula))
      )
  ),
  day_status as (
    select
      ur.fecha,
      max(ur.effective_site_id) as effective_site_id,
      max(ur.effective_site_name) as effective_site_name,
      max(ur.effective_timezone) as effective_timezone,
      max(ur.entry_start) as entry_start,
      max(ur.entry_end) as entry_end,
      max(ur.exit_start) as exit_start,
      max(ur.exit_end) as exit_end,
      bool_or(
        ur.hora_entrada is not null
        and ur.hora_salida is not null
        and coalesce(ur.bloqueado, false) = false
        and coalesce(ur.estado, '') not in ('fallida', 'bloqueado')
        and (
          ur.entry_end is null
          or (ur.hora_entrada at time zone coalesce(ur.effective_timezone, 'America/Mexico_City'))::time <= ur.entry_end
        )
        and (
          ur.exit_start is null
          or (ur.hora_salida at time zone coalesce(ur.effective_timezone, 'America/Mexico_City'))::time >= ur.exit_start
        )
        and (
          ur.exit_end is null
          or (ur.hora_salida at time zone coalesce(ur.effective_timezone, 'America/Mexico_City'))::time <= ur.exit_end
        )
      ) as cumplido,
      bool_or(
        coalesce(ur.estado, '') in ('revision', 'pendiente_revision')
        or coalesce(ur.riesgo, '') in ('medio', 'alto')
        or ur.hora_salida is null
      ) as en_revision
    from user_records ur
    where ur.fecha is not null
    group by ur.fecha
  ),
  ordered_days as (
    select
      ds.*,
      row_number() over (order by ds.fecha desc) as rn,
      max(ds.fecha) over () as anchor_fecha
    from day_status ds
  ),
  streak_days as (
    select *
    from ordered_days
    where fecha = anchor_fecha - ((rn - 1)::integer)
  ),
  latest_site as (
    select *
    from ordered_days
    order by fecha desc
    limit 1
  )
  select
    v_user.id as usuario_id,
    v_user.matricula,
    coalesce(ls.effective_site_id, v_user.sitio_id) as sitio_id,
    coalesce(ls.effective_site_name, 'Sitio no asignado') as sitio_nombre,
    coalesce(ls.effective_timezone, 'America/Mexico_City') as zona_horaria,
    concat(coalesce(to_char(ls.entry_start, 'HH24:MI'), '--:--'), ' - ', coalesce(to_char(ls.entry_end, 'HH24:MI'), '--:--')) as horario_entrada,
    concat(coalesce(to_char(ls.exit_start, 'HH24:MI'), '--:--'), ' - ', coalesce(to_char(ls.exit_end, 'HH24:MI'), '--:--')) as horario_salida,
    count(ds.fecha)::integer as dias_con_registro,
    count(ds.fecha) filter (where ds.cumplido)::integer as dias_cumplidos,
    count(ds.fecha) filter (where ds.en_revision and not ds.cumplido)::integer as dias_revision,
    count(sd.fecha)::integer as racha_actual,
    case
      when count(ds.fecha) = 0 then 0
      else round((count(ds.fecha) filter (where ds.cumplido)::numeric / count(ds.fecha)::numeric) * 100, 1)
    end as cumplimiento_pct,
    max(ds.fecha) as ultima_fecha
  from day_status ds
  left join streak_days sd on sd.fecha = ds.fecha
  left join latest_site ls on true
  group by ls.effective_site_id, ls.effective_site_name, ls.effective_timezone, ls.entry_start, ls.entry_end, ls.exit_start, ls.exit_end;
end;
$$;

revoke execute on function public.get_visible_asistencias() from anon;
revoke execute on function public.get_attendance_streak() from anon;
revoke execute on function public.get_visible_asistencias() from public;
revoke execute on function public.get_attendance_streak() from public;
grant execute on function public.get_visible_asistencias() to authenticated;
grant execute on function public.get_attendance_streak() to authenticated;

notify pgrst, 'reload schema';
