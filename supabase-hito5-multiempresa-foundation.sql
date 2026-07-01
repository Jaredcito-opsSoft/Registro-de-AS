-- Hito 5: base multiempresa compatible con el MVP actual.
-- Mantiene el flujo por matricula y asigna datos existentes a una organizacion default.

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text default 'empresa',
  slug text unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizaciones_tipo_check check (tipo in ('empresa', 'escuela', 'centro_trabajo', 'negocio_local', 'otro'))
);

create table if not exists public.usuarios_app (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id),
  sitio_id uuid references public.sitios(id),
  nombre text not null,
  matricula text not null,
  email text,
  rol text not null default 'usuario',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuarios_app_rol_check check (rol in ('usuario', 'admin', 'supervisor')),
  constraint usuarios_app_org_matricula_unique unique (organizacion_id, matricula)
);

alter table public.sitios add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.asistencias add column if not exists organizacion_id uuid references public.organizaciones(id);
alter table public.asistencias add column if not exists usuario_id uuid references public.usuarios_app(id);

insert into public.organizaciones (nombre, tipo, slug, activo)
values ('Organización principal', 'empresa', 'organizacion-principal', true)
on conflict (slug) do update
set nombre = excluded.nombre,
    activo = true,
    updated_at = now();

update public.sitios
set organizacion_id = (select id from public.organizaciones where slug = 'organizacion-principal')
where organizacion_id is null;

update public.asistencias
set organizacion_id = (select id from public.organizaciones where slug = 'organizacion-principal')
where organizacion_id is null;

insert into public.usuarios_app (organizacion_id, sitio_id, nombre, matricula, rol, activo)
select
  a.organizacion_id,
  (min(a.sitio_id::text) filter (where a.sitio_id is not null))::uuid,
  coalesce(nullif(max(a.nombre), ''), 'Usuario ' || a.matricula),
  upper(trim(a.matricula)),
  'usuario',
  true
from public.asistencias a
where a.organizacion_id is not null
  and nullif(trim(a.matricula), '') is not null
group by a.organizacion_id, upper(trim(a.matricula)), a.matricula
on conflict (organizacion_id, matricula) do update
set nombre = coalesce(nullif(excluded.nombre, ''), public.usuarios_app.nombre),
    sitio_id = coalesce(excluded.sitio_id, public.usuarios_app.sitio_id),
    updated_at = now();

update public.asistencias a
set usuario_id = u.id
from public.usuarios_app u
where a.usuario_id is null
  and a.organizacion_id = u.organizacion_id
  and upper(trim(a.matricula)) = u.matricula;

create or replace function public.get_default_organizacion_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.organizaciones where slug = 'organizacion-principal' limit 1;
$$;

create or replace function public.ensure_usuario_app_for_asistencia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org_id uuid;
  v_usuario_id uuid;
begin
  v_org_id := coalesce(new.organizacion_id, public.get_default_organizacion_id());
  new.organizacion_id := v_org_id;

  if nullif(trim(coalesce(new.matricula, '')), '') is not null then
    insert into public.usuarios_app (organizacion_id, sitio_id, nombre, matricula, rol, activo)
    values (
      v_org_id,
      new.sitio_id,
      coalesce(nullif(new.nombre, ''), 'Usuario ' || upper(trim(new.matricula))),
      upper(trim(new.matricula)),
      'usuario',
      true
    )
    on conflict (organizacion_id, matricula) do update
    set nombre = coalesce(nullif(excluded.nombre, ''), public.usuarios_app.nombre),
        sitio_id = coalesce(excluded.sitio_id, public.usuarios_app.sitio_id),
        updated_at = now()
    returning id into v_usuario_id;

    new.usuario_id := coalesce(new.usuario_id, v_usuario_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asistencias_multiempresa on public.asistencias;
create trigger trg_asistencias_multiempresa
before insert or update of organizacion_id, usuario_id, matricula, nombre, sitio_id on public.asistencias
for each row execute function public.ensure_usuario_app_for_asistencia();

create or replace function public.ensure_default_org_for_sitio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.organizacion_id := coalesce(new.organizacion_id, public.get_default_organizacion_id());
  return new;
end;
$$;

drop trigger if exists trg_sitios_default_org on public.sitios;
create trigger trg_sitios_default_org
before insert or update of organizacion_id on public.sitios
for each row execute function public.ensure_default_org_for_sitio();

create or replace function public.get_organization_context()
returns table (
  organizacion_id uuid,
  organizacion_nombre text,
  organizacion_tipo text,
  organizacion_slug text,
  sitios_total integer,
  usuarios_total integer,
  asistencias_total integer
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.nombre,
    o.tipo,
    o.slug,
    (select count(*)::integer from public.sitios s where s.organizacion_id = o.id),
    (select count(*)::integer from public.usuarios_app u where u.organizacion_id = o.id),
    (select count(*)::integer from public.asistencias a where a.organizacion_id = o.id)
  from public.organizaciones o
  where o.slug = 'organizacion-principal'
  limit 1;
$$;

comment on table public.organizaciones is 'Base multiempresa: empresas, escuelas, centros de trabajo o negocios que agrupan sitios, usuarios y asistencias.';
comment on table public.usuarios_app is 'Usuarios operativos por organizacion. Auth/RLS se conectara en una fase posterior sin romper matricula temporal.';
comment on column public.asistencias.organizacion_id is 'Compatibilidad multiempresa. Datos existentes migrados a Organizacion principal.';
comment on column public.asistencias.usuario_id is 'Referencia opcional al usuario_app creado desde matricula/nombre.';

grant select on public.organizaciones to anon, authenticated;
grant select on public.usuarios_app to anon, authenticated;
grant execute on function public.get_organization_context() to anon, authenticated;
notify pgrst, 'reload schema';