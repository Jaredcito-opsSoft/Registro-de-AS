-- Antifraud hardening applied to Supabase.
-- Adds server-side QR, server timestamps, GPS evidence, liveness challenge metadata,
-- risk scoring, optional user catalog, and audit table.

create extension if not exists pgcrypto;

alter table public.asistencias add column if not exists server_time_entrada timestamptz;
alter table public.asistencias add column if not exists server_time_salida timestamptz;
alter table public.asistencias add column if not exists horario_validado boolean not null default false;
alter table public.asistencias add column if not exists horario_observacion text not null default '';
alter table public.asistencias add column if not exists qr_token_id uuid;
alter table public.asistencias add column if not exists qr_validado boolean not null default false;
alter table public.asistencias add column if not exists qr_observacion text not null default '';
alter table public.asistencias add column if not exists latitud_salida numeric;
alter table public.asistencias add column if not exists longitud_salida numeric;
alter table public.asistencias add column if not exists precision_ubicacion numeric;
alter table public.asistencias add column if not exists ubicacion_validada boolean not null default false;
alter table public.asistencias add column if not exists distancia_empresa_metros numeric;
alter table public.asistencias add column if not exists ubicacion_observacion text not null default '';
alter table public.asistencias add column if not exists reto_vida text;
alter table public.asistencias add column if not exists reto_vida_cumplido boolean not null default false;
alter table public.asistencias add column if not exists reto_vida_observacion text not null default '';
alter table public.asistencias add column if not exists riesgo text not null default 'normal';
alter table public.asistencias add column if not exists alertas jsonb not null default '[]'::jsonb;

alter table public.asistencias drop constraint if exists asistencias_riesgo_check;
alter table public.asistencias add constraint asistencias_riesgo_check
check (riesgo in ('normal', 'revision_ubicacion', 'revision_identidad', 'revision_qr', 'revision_horario', 'revision_multiple', 'sospechoso'));

create table if not exists public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  fecha date not null default ((now() at time zone 'America/Mexico_City')::date),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  usado boolean not null default false,
  usado_por_matricula text,
  usado_en timestamptz,
  ip_uso text,
  user_agent text,
  estado text not null default 'vigente' check (estado in ('vigente', 'expirado', 'usado', 'anulado'))
);

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  matricula text unique not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  company_lat numeric,
  company_lng numeric,
  max_distance_meters numeric not null default 150,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id, max_distance_meters)
values (true, 150)
on conflict (id) do nothing;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  accion text not null,
  detalle text,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text,
  resultado text
);

-- Important: normal clients only read asistencia rows. Writes are done through RPC.
revoke all on public.asistencias from anon, authenticated;
grant select on public.asistencias to anon, authenticated;

-- RPCs applied in Supabase:
-- public.get_current_qr_token()
-- public.registrar_entrada_segura(text, text, text, jsonb, boolean)
-- public.registrar_salida_segura(text, text, jsonb, text, numeric, numeric, numeric, text, text)
-- public.admin_log_event(text, text, text, text)

-- Configure real company coordinates before using GPS as pass/fail signal:
-- update public.app_config
-- set company_lat = 19.000000,
--     company_lng = -99.000000,
--     max_distance_meters = 150,
--     updated_at = now()
-- where id = true;
