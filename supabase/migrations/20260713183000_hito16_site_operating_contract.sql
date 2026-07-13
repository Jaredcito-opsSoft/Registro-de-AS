-- Hito 16: contrato de lectura para la configuracion operativa por sitio.
-- Mantiene el contrato previo y agrega las politicas que consume el cliente.

begin;

drop function if exists public.get_active_site();

create function public.get_active_site()
returns table (
  id uuid,
  organizacion_id uuid,
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
  gps_policy text,
  evidence_policy text,
  identificador_label text,
  activo boolean,
  configured boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_org_id uuid;
begin
  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  v_org_id := coalesce(v_user.organizacion_id, public.get_default_organizacion_id());

  return query
  select
    s.id,
    s.organizacion_id,
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
    coalesce(s.gps_policy, 'revision'),
    coalesce(s.evidence_policy, 'rostro'),
    coalesce(ic.label, 'Identificador'),
    s.activo,
    true
  from public.sitios s
  left join public.site_identifier_config ic on ic.sitio_id = s.id
  where s.activo = true
    and s.organizacion_id = v_org_id
    and (
      v_user.sitio_id is null
      or s.id = v_user.sitio_id
      or public.current_user_can('manage_organization')
    )
  order by s.updated_at desc nulls last
  limit 1;
end;
$$;

revoke all on function public.get_active_site() from public;
grant execute on function public.get_active_site() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
