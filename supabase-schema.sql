-- Supabase schema for Registro-de-AS MVP with lightweight facial validation.
-- Project table: global attendance records.

create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  matricula text not null,
  fecha date not null default current_date,
  hora_entrada timestamptz not null default now(),
  foto_entrada_url text not null,
  hora_salida timestamptz,
  foto_salida_url text,
  qr_salida text,
  descriptor_entrada jsonb,
  descriptor_salida jsonb,
  rostro_entrada_detectado boolean not null default false,
  rostro_salida_detectado boolean not null default false,
  similitud_facial numeric,
  validacion_identidad text not null default 'pendiente' check (validacion_identidad in ('identidad_validada', 'revision_administrativa', 'fallida', 'pendiente')),
  metodo_salida text,
  token_qr_usado text,
  estado text not null default 'entrada_registrada' check (estado in ('entrada_registrada', 'asistencia_completa', 'revision_requerida', 'fallida', 'Entrada registrada', 'Asistencia completa', 'Salida fuera de horario', 'Pendiente de salida')),
  bloqueado boolean not null default true,
  observacion text not null default '',
  observaciones text not null default '',
  observacion_admin text not null default '',
  modificado_por_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asistencias_matricula_fecha_unique unique (matricula, fecha)
);

alter table public.asistencias add column if not exists descriptor_entrada jsonb;
alter table public.asistencias add column if not exists descriptor_salida jsonb;
alter table public.asistencias add column if not exists rostro_entrada_detectado boolean not null default false;
alter table public.asistencias add column if not exists rostro_salida_detectado boolean not null default false;
alter table public.asistencias add column if not exists similitud_facial numeric;
alter table public.asistencias add column if not exists validacion_identidad text not null default 'pendiente';
alter table public.asistencias add column if not exists metodo_salida text;
alter table public.asistencias add column if not exists token_qr_usado text;
alter table public.asistencias add column if not exists observacion text not null default '';

alter table public.asistencias drop constraint if exists asistencias_estado_check;
alter table public.asistencias add constraint asistencias_estado_check
check (estado in ('entrada_registrada', 'asistencia_completa', 'revision_requerida', 'fallida', 'Entrada registrada', 'Asistencia completa', 'Salida fuera de horario', 'Pendiente de salida'));

alter table public.asistencias drop constraint if exists asistencias_validacion_identidad_check;
alter table public.asistencias add constraint asistencias_validacion_identidad_check
check (validacion_identidad in ('identidad_validada', 'revision_administrativa', 'fallida', 'pendiente'));

create index if not exists asistencias_fecha_idx on public.asistencias (fecha desc);
create index if not exists asistencias_matricula_fecha_idx on public.asistencias (matricula, fecha desc);

alter table public.asistencias enable row level security;

revoke all on public.asistencias from anon, authenticated;
grant select on public.asistencias to anon, authenticated;
grant insert (nombre, matricula, fecha, foto_entrada_url, descriptor_entrada, rostro_entrada_detectado, estado, validacion_identidad) on public.asistencias to anon, authenticated;
grant update (hora_salida, foto_salida_url, qr_salida, descriptor_salida, rostro_salida_detectado, similitud_facial, validacion_identidad, metodo_salida, token_qr_usado, estado, observacion, observaciones, updated_at) on public.asistencias to anon, authenticated;

drop policy if exists "asistencias_select_global" on public.asistencias;
create policy "asistencias_select_global"
on public.asistencias
for select
to anon, authenticated
using (true);

drop policy if exists "asistencias_insert_entry" on public.asistencias;
create policy "asistencias_insert_entry"
on public.asistencias
for insert
to anon, authenticated
with check (
  nombre <> ''
  and matricula <> ''
  and foto_entrada_url <> ''
  and estado = 'entrada_registrada'
  and validacion_identidad = 'pendiente'
  and rostro_entrada_detectado = true
  and descriptor_entrada is not null
  and hora_salida is null
);

drop policy if exists "asistencias_update_exit" on public.asistencias;
create policy "asistencias_update_exit"
on public.asistencias
for update
to anon, authenticated
using (estado in ('entrada_registrada', 'Entrada registrada') and hora_salida is null)
with check (
  estado in ('asistencia_completa', 'revision_requerida', 'fallida')
  and hora_salida is not null
  and foto_salida_url is not null
  and rostro_salida_detectado = true
  and descriptor_salida is not null
  and metodo_salida = 'qr_horario'
  and token_qr_usado is not null
);

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
  updated_row public.asistencias;
begin
  if p_admin_key <> 'ADMIN123' then
    raise exception 'Clave administrativa incorrecta';
  end if;

  update public.asistencias
  set observacion_admin = coalesce(p_observacion, ''),
      modificado_por_admin = true,
      updated_at = now()
  where id = p_id
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'Registro no encontrado';
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
begin
  if p_admin_key <> 'ADMIN123' then
    raise exception 'Clave administrativa incorrecta';
  end if;

  delete from public.asistencias where id = p_id;
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
  if p_admin_key <> 'ADMIN123' then
    raise exception 'Clave administrativa incorrecta';
  end if;

  delete from public.asistencias;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.admin_update_observacion_asistencia(uuid, text, text) to anon, authenticated;
grant execute on function public.admin_delete_asistencia(uuid, text) to anon, authenticated;
grant execute on function public.admin_clear_asistencias(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-photos', 'attendance-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "attendance_photos_insert" on storage.objects;
create policy "attendance_photos_insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'attendance-photos');

drop policy if exists "attendance_photos_update" on storage.objects;
create policy "attendance_photos_update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'attendance-photos')
with check (bucket_id = 'attendance-photos');

drop policy if exists "attendance_photos_select_for_upsert" on storage.objects;
create policy "attendance_photos_select_for_upsert"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'attendance-photos');