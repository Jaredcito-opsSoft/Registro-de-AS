-- HITO 1: Panel administrativo del sitio
-- Aplicado en Supabase al proyecto zhgimpveuywoayszicfa.
-- Objetivo: reemplazar la configuracion dispersa de coordenadas por una tabla formal
-- public.sitios y RPCs seguras para que el administrador configure la ubicacion oficial.

create extension if not exists pgcrypto;

create table if not exists public.sitios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  latitud numeric not null check (latitud between -90 and 90),
  longitud numeric not null check (longitud between -180 and 180),
  radio_metros integer not null default 150 check (radio_metros between 20 and 1000),
  hora_entrada_inicio time not null default time '07:30',
  hora_entrada_fin time not null default time '08:15',
  hora_salida_inicio time not null default time '16:30',
  hora_salida_fin time not null default time '17:10',
  zona_horaria text not null default 'America/Mexico_City',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sitios_one_active_idx on public.sitios (activo) where activo;
create index if not exists sitios_activo_idx on public.sitios (activo);

alter table public.asistencias add column if not exists sitio_id uuid references public.sitios(id);
alter table public.asistencias add column if not exists sitio_nombre text;
alter table public.asistencias add column if not exists radio_metros integer;

alter table public.sitios enable row level security;
revoke all on public.sitios from anon, authenticated;
grant select on public.sitios to anon, authenticated;

drop policy if exists sitios_select_active on public.sitios;
create policy sitios_select_active
on public.sitios
for select
using (activo = true);

create or replace function public.touch_sitios_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sitios_touch_updated_at on public.sitios;
create trigger sitios_touch_updated_at
before update on public.sitios
for each row execute function public.touch_sitios_updated_at();

insert into public.sitios (
  nombre,
  direccion,
  latitud,
  longitud,
  radio_metros,
  activo
)
select
  'Sitio principal',
  'Migrado desde app_config',
  company_lat,
  company_lng,
  coalesce(max_distance_meters, 150),
  true
from public.app_config
where id = true
  and company_lat is not null
  and company_lng is not null
  and not exists (select 1 from public.sitios where activo = true);

create or replace function public.get_active_site()
returns table (
  id uuid,
  nombre text,
  direccion text,
  latitud numeric,
  longitud numeric,
  radio_metros integer,
  hora_entrada_inicio text,
  hora_entrada_fin text,
  hora_salida_inicio text,
  hora_salida_fin text,
  zona_horaria text,
  activo boolean,
  configured boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.nombre,
    s.direccion,
    s.latitud,
    s.longitud,
    s.radio_metros,
    to_char(s.hora_entrada_inicio, 'HH24:MI'),
    to_char(s.hora_entrada_fin, 'HH24:MI'),
    to_char(s.hora_salida_inicio, 'HH24:MI'),
    to_char(s.hora_salida_fin, 'HH24:MI'),
    s.zona_horaria,
    s.activo,
    true
  from public.sitios s
  where s.activo = true
  order by s.updated_at desc
  limit 1;
$$;

create or replace function public.validate_location_for_site(
  p_latitud numeric,
  p_longitud numeric,
  p_precision numeric default null
)
returns table (
  configured boolean,
  sitio_id uuid,
  sitio_nombre text,
  radio_metros integer,
  distancia_metros double precision,
  precision_metros double precision,
  validado boolean,
  observacion text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sitios%rowtype;
  v_distance double precision;
begin
  select * into v_site from public.sitios where activo = true order by updated_at desc limit 1;
  if not found then
    return query select false, null::uuid, null::text, null::integer, null::double precision, p_precision::double precision, false, 'sitio_no_configurado';
    return;
  end if;

  v_distance := 6371000 * acos(least(1, greatest(-1,
    cos(radians(v_site.latitud::double precision)) * cos(radians(p_latitud)) *
    cos(radians(p_longitud) - radians(v_site.longitud::double precision)) +
    sin(radians(v_site.latitud::double precision)) * sin(radians(p_latitud))
  )));

  return query select
    true,
    v_site.id,
    v_site.nombre,
    v_site.radio_metros,
    v_distance,
    p_precision::double precision,
    (v_distance <= v_site.radio_metros and coalesce(p_precision, 999999)::double precision <= v_site.radio_metros),
    case
      when v_distance <= v_site.radio_metros and coalesce(p_precision, 999999)::double precision <= v_site.radio_metros then 'ubicacion_validada'
      when coalesce(p_precision, 999999)::double precision > v_site.radio_metros then 'precision_insuficiente'
      else 'fuera_de_radio'
    end;
end;
$$;

create or replace function public.upsert_site_config(
  p_admin_key text,
  p_nombre text,
  p_direccion text,
  p_latitud numeric,
  p_longitud numeric,
  p_radio_metros integer default 150,
  p_hora_entrada_inicio text default '07:30',
  p_hora_entrada_fin text default '08:15',
  p_hora_salida_inicio text default '16:30',
  p_hora_salida_fin text default '17:10',
  p_zona_horaria text default 'America/Mexico_City',
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_entry_start time := p_hora_entrada_inicio::time;
  v_entry_end time := p_hora_entrada_fin::time;
  v_exit_start time := p_hora_salida_inicio::time;
  v_exit_end time := p_hora_salida_fin::time;
begin
  if p_admin_key is distinct from 'ADMIN123' then
    raise exception 'clave_administrativa_invalida';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'nombre_requerido';
  end if;
  if p_latitud is null or p_latitud < -90 or p_latitud > 90 then
    raise exception 'latitud_invalida';
  end if;
  if p_longitud is null or p_longitud < -180 or p_longitud > 180 then
    raise exception 'longitud_invalida';
  end if;
  if p_radio_metros is null or p_radio_metros < 20 or p_radio_metros > 1000 then
    raise exception 'radio_invalido';
  end if;
  if v_entry_start >= v_entry_end or v_exit_start >= v_exit_end then
    raise exception 'horario_invalido';
  end if;

  if p_activo then
    update public.sitios set activo = false where activo = true;
  end if;

  insert into public.sitios (
    nombre,
    direccion,
    latitud,
    longitud,
    radio_metros,
    hora_entrada_inicio,
    hora_entrada_fin,
    hora_salida_inicio,
    hora_salida_fin,
    zona_horaria,
    activo
  ) values (
    trim(p_nombre),
    nullif(trim(coalesce(p_direccion, '')), ''),
    p_latitud,
    p_longitud,
    p_radio_metros,
    v_entry_start,
    v_entry_end,
    v_exit_start,
    v_exit_end,
    coalesce(nullif(trim(p_zona_horaria), ''), 'America/Mexico_City'),
    p_activo
  )
  returning id into v_site_id;

  update public.app_config
  set company_lat = p_latitud,
      company_lng = p_longitud,
      max_distance_meters = p_radio_metros,
      updated_at = now()
  where id = true;

  return v_site_id;
end;
$$;

grant execute on function public.get_active_site() to anon, authenticated;
grant execute on function public.validate_location_for_site(numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.upsert_site_config(text, text, text, numeric, numeric, integer, text, text, text, text, text, boolean) to anon, authenticated;
