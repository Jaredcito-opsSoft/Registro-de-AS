-- F0 schema foundation draft.
-- No ejecutar en produccion sin introspeccion, respaldo y revision.
-- Considerar cambio Supabase 2026: tablas nuevas pueden requerir GRANT explicito para Data API.

begin;

create extension if not exists pgcrypto;

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'empresa',
  slug text not null unique,
  estado text not null default 'activa',
  plan text not null default 'mvp',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.sitios (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  nombre text not null,
  direccion text,
  latitud double precision,
  longitud double precision,
  radio_metros integer not null default 100,
  zona_horaria text not null default 'America/Mexico_City',
  gps_policy text not null default 'revision',
  evidence_policy text not null default 'rostro',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint sitios_org_nombre_unique unique (organizacion_id, nombre),
  constraint sitios_gps_policy_check check (gps_policy in ('obligatorio', 'opcional', 'informativo', 'revision', 'bloqueo')),
  constraint sitios_evidence_policy_check check (evidence_policy in ('rostro', 'documento', 'rostro_documento', 'foto_simple'))
);

create table if not exists public.site_identifier_config (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  label text not null default 'Identificador',
  tipo text not null default 'texto',
  requerido boolean not null default true,
  unico_por_sitio boolean not null default true,
  mascara_visual text,
  validacion_regex text,
  created_at timestamptz not null default now(),
  constraint site_identifier_config_tipo_check check (tipo in ('texto', 'numero', 'email', 'custom'))
);

create table if not exists public.usuarios_app (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid references public.sitios(id) on delete set null,
  nombre text not null,
  email text not null,
  identificador text not null,
  rol text not null default 'usuario',
  scope_type text not null default 'propio',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint usuarios_app_rol_check check (rol in ('usuario', 'operador', 'admin', 'superadmin')),
  constraint usuarios_app_scope_check check (scope_type in ('propio', 'sitio', 'organizacion', 'global'))
);

create unique index if not exists usuarios_app_identificador_active_unique
on public.usuarios_app (organizacion_id, sitio_id, identificador)
where activo = true;

create index if not exists usuarios_app_auth_user_idx on public.usuarios_app (auth_user_id);
create index if not exists usuarios_app_org_idx on public.usuarios_app (organizacion_id);
create index if not exists usuarios_app_site_idx on public.usuarios_app (sitio_id);

create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete restrict,
  usuario_id uuid not null references public.usuarios_app(id) on delete restrict,
  identificador_snapshot text not null,
  fecha date not null,
  entrada_at timestamptz,
  salida_at timestamptz,
  estado text not null default 'pendiente_salida',
  riesgo text not null default 'normal',
  folio_interno text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint asistencias_unique_user_day unique (organizacion_id, sitio_id, usuario_id, fecha),
  constraint asistencias_estado_check check (estado in ('pendiente_salida', 'completa', 'revision', 'cancelada')),
  constraint asistencias_riesgo_check check (riesgo in ('normal', 'revision', 'alto'))
);

create index if not exists asistencias_org_site_fecha_idx on public.asistencias (organizacion_id, sitio_id, fecha desc);
create index if not exists asistencias_usuario_fecha_idx on public.asistencias (usuario_id, fecha desc);

create table if not exists public.evidencias (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete restrict,
  asistencia_id uuid not null references public.asistencias(id) on delete cascade,
  tipo text not null,
  bucket text not null,
  path text not null,
  hash_sha256 text,
  mime text,
  size_bytes bigint,
  width integer,
  height integer,
  captured_at timestamptz,
  created_by uuid references public.usuarios_app(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint evidencias_bucket_path_unique unique (bucket, path),
  constraint evidencias_tipo_check check (tipo in ('entrada_rostro', 'salida_rostro', 'documento', 'foto_simple'))
);

create index if not exists evidencias_asistencia_idx on public.evidencias (asistencia_id);

create table if not exists public.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete restrict,
  asistencia_id uuid not null references public.asistencias(id) on delete cascade,
  tipo text not null,
  latitud double precision,
  longitud double precision,
  precision_metros double precision,
  distancia_metros double precision,
  validado boolean,
  observacion text,
  created_at timestamptz not null default now(),
  constraint ubicaciones_tipo_check check (tipo in ('entrada', 'salida'))
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id) on delete set null,
  sitio_id uuid references public.sitios(id) on delete set null,
  actor_user_id uuid references public.usuarios_app(id) on delete set null,
  accion text not null,
  entidad text not null,
  entity_id uuid,
  detalle_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_scope_idx on public.audit_logs (organizacion_id, sitio_id, created_at desc);

create table if not exists public.privacy_notices (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  sitio_id uuid references public.sitios(id) on delete cascade,
  version text not null,
  titulo text not null,
  url_o_texto text not null,
  vigente_desde timestamptz not null,
  vigente_hasta timestamptz,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios_app(id) on delete cascade,
  notice_id uuid not null references public.privacy_notices(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metodo text not null default 'web',
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios_app(id) on delete set null,
  organizacion_id uuid references public.organizaciones(id) on delete set null,
  tipo text not null,
  estado text not null default 'recibida',
  fecha_solicitud timestamptz not null default now(),
  fecha_respuesta timestamptz,
  respuesta text,
  created_at timestamptz not null default now()
);

create table if not exists public.retention_policies (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  sitio_id uuid references public.sitios(id) on delete cascade,
  tipo_dato text not null,
  dias_retencion integer not null,
  accion text not null default 'archivar',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid references public.sitios(id) on delete set null,
  actor_user_id uuid not null references public.usuarios_app(id) on delete restrict,
  filtros_json jsonb not null default '{}'::jsonb,
  columnas text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  asistencia_id uuid not null references public.asistencias(id) on delete cascade,
  admin_id uuid not null references public.usuarios_app(id) on delete restrict,
  motivo text not null,
  antes_json jsonb not null,
  despues_json jsonb not null,
  notificado_usuario boolean not null default false,
  fecha_notificacion timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios_app(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organizaciones enable row level security;
alter table public.sitios enable row level security;
alter table public.site_identifier_config enable row level security;
alter table public.usuarios_app enable row level security;
alter table public.asistencias enable row level security;
alter table public.evidencias enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.audit_logs enable row level security;
alter table public.privacy_notices enable row level security;
alter table public.privacy_consents enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.retention_policies enable row level security;
alter table public.exports enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.user_notifications enable row level security;

-- Data API explicit grants: minimum table access, rows still controlled by RLS.
grant select on public.organizaciones to authenticated;
grant select on public.sitios to authenticated;
grant select on public.site_identifier_config to authenticated;
grant select, update on public.usuarios_app to authenticated;
grant select on public.asistencias to authenticated;
grant select on public.evidencias to authenticated;
grant select on public.ubicaciones to authenticated;
grant select on public.privacy_notices to authenticated;
grant select, insert, update on public.privacy_consents to authenticated;
grant select, insert on public.privacy_requests to authenticated;
grant select on public.user_notifications to authenticated;

commit;
