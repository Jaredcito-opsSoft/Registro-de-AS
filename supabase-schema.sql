-- Supabase schema for Registro-de-AS MVP.
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
  estado text not null default 'Entrada registrada' check (estado in ('Entrada registrada', 'Asistencia completa', 'Salida fuera de horario', 'Pendiente de salida')),
  bloqueado boolean not null default true,
  observaciones text not null default '',
  observacion_admin text not null default '',
  modificado_por_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asistencias_matricula_fecha_unique unique (matricula, fecha)
);

create index if not exists asistencias_fecha_idx on public.asistencias (fecha desc);
create index if not exists asistencias_matricula_fecha_idx on public.asistencias (matricula, fecha desc);

alter table public.asistencias enable row level security;

revoke all on public.asistencias from anon, authenticated;
grant select, insert on public.asistencias to anon, authenticated;
grant update (hora_salida, foto_salida_url, qr_salida, estado, observaciones, updated_at) on public.asistencias to anon, authenticated;

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
  and estado = 'Entrada registrada'
  and hora_salida is null
);

drop policy if exists "asistencias_update_exit" on public.asistencias;
create policy "asistencias_update_exit"
on public.asistencias
for update
to anon, authenticated
using (estado = 'Entrada registrada' and hora_salida is null)
with check (estado = 'Asistencia completa' and hora_salida is not null and foto_salida_url is not null);

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
values ('evidencias-asistencia', 'evidencias-asistencia', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidencias_insert_global" on storage.objects;
create policy "evidencias_insert_global"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'evidencias-asistencia');
