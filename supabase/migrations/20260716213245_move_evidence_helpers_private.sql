-- Keep policy helpers outside the PostgREST-exposed public schema.

create or replace function app_private.can_upload_attendance_evidence(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuarios_app actor
    where actor.auth_user_id = auth.uid()
      and coalesce(actor.activo, true)
      and (storage.foldername(p_object_name))[2]
        = regexp_replace(upper(coalesce(actor.matricula, '')), '[^A-Z0-9_-]', '', 'g')
  );
$$;

create or replace function app_private.can_read_attendance_evidence(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuarios_app actor
    join public.asistencias attendance
      on p_object_name in (
        attendance.foto_entrada_storage_path,
        attendance.foto_salida_storage_path
      )
    where actor.auth_user_id = auth.uid()
      and coalesce(actor.activo, true)
      and (
        attendance.usuario_id = actor.id
        or public.normalize_app_role(actor.rol) = 'superadmin'
        or (
          public.normalize_app_role(actor.rol) = 'admin'
          and attendance.organizacion_id = actor.organizacion_id
        )
        or (
          public.normalize_app_role(actor.rol) = 'supervisor'
          and attendance.organizacion_id = actor.organizacion_id
          and (
            attendance.sitio_id = actor.sitio_id
            or attendance.sitio_entrada_id = actor.sitio_id
            or attendance.sitio_salida_id = actor.sitio_id
            or exists (
              select 1
              from public.usuario_sitios_alcance scope
              where scope.usuario_id = actor.id
                and scope.organizacion_id = actor.organizacion_id
                and scope.sitio_id in (
                  attendance.sitio_id,
                  attendance.sitio_entrada_id,
                  attendance.sitio_salida_id
                )
            )
          )
        )
      )
  );
$$;

grant usage on schema app_private to authenticated;
revoke all on function app_private.can_upload_attendance_evidence(text) from public, anon;
revoke all on function app_private.can_read_attendance_evidence(text) from public, anon;
grant execute on function app_private.can_upload_attendance_evidence(text) to authenticated;
grant execute on function app_private.can_read_attendance_evidence(text) to authenticated;

drop policy if exists attendance_evidence_authenticated_insert on storage.objects;
drop policy if exists attendance_evidence_scoped_select on storage.objects;

create policy attendance_evidence_authenticated_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('attendance-photos', 'evidencias-asistencia')
  and app_private.can_upload_attendance_evidence(name)
);

create policy attendance_evidence_scoped_select
on storage.objects
for select
to authenticated
using (
  bucket_id in ('attendance-photos', 'evidencias-asistencia')
  and app_private.can_read_attendance_evidence(name)
);

drop function public.can_upload_attendance_evidence(text);
drop function public.can_read_attendance_evidence(text);
