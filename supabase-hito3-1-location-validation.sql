-- MINI HITO 3.1: validacion clara de ubicacion y precision GPS
-- Separa distancia al sitio, precision GPS y resultado visual de validate_location_for_site.

create or replace function public.location_validation_result(
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
  dentro_radio boolean,
  precision_aceptable boolean,
  validado boolean,
  estado text,
  observacion text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site public.sitios%rowtype;
  v_distance double precision;
  v_precision double precision := p_precision::double precision;
  v_precision_max double precision := 200;
  v_dentro_radio boolean := false;
  v_precision_aceptable boolean := false;
  v_estado text := 'gps_no_disponible';
  v_observacion text := 'No se pudo obtener la ubicacion. Revisa permisos del navegador.';
begin
  select * into v_site from public.sitios where activo = true order by updated_at desc limit 1;
  if not found then
    return query select
      false,
      null::uuid,
      null::text,
      null::integer,
      null::double precision,
      v_precision,
      false,
      false,
      false,
      'sitio_no_configurado'::text,
      'No hay sitio activo configurado.'::text;
    return;
  end if;

  if p_latitud is null or p_longitud is null then
    return query select
      true,
      v_site.id,
      v_site.nombre,
      v_site.radio_metros,
      null::double precision,
      v_precision,
      false,
      false,
      false,
      'gps_denegado'::text,
      'No se pudo obtener la ubicacion. Revisa permisos del navegador.'::text;
    return;
  end if;

  v_distance := public.geo_distance_meters(p_latitud, p_longitud, v_site.latitud, v_site.longitud)::double precision;
  v_dentro_radio := v_distance <= v_site.radio_metros;
  v_precision_aceptable := coalesce(v_precision, 999999) <= v_precision_max;

  if v_dentro_radio and v_precision_aceptable then
    v_estado := 'ubicacion_validada';
    v_observacion := 'Ubicacion validada: estas dentro del radio permitido.';
  elsif v_dentro_radio and not v_precision_aceptable then
    v_estado := 'dentro_radio_precision_baja';
    v_observacion := 'Estas dentro del radio, pero la precision GPS es baja.';
  else
    v_estado := 'fuera_de_radio';
    v_observacion := 'Ubicacion fuera del radio permitido.';
  end if;

  return query select
    true,
    v_site.id,
    v_site.nombre,
    v_site.radio_metros,
    v_distance,
    v_precision,
    v_dentro_radio,
    v_precision_aceptable,
    v_dentro_radio and v_precision_aceptable,
    v_estado,
    v_observacion;
end;
$$;

drop function if exists public.validate_location_for_site(numeric, numeric, numeric);
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
  dentro_radio boolean,
  precision_aceptable boolean,
  validado boolean,
  estado text,
  observacion text
)
language sql
security definer
set search_path = public
as $$
  select * from public.location_validation_result(p_latitud, p_longitud, p_precision);
$$;

grant execute on function public.location_validation_result(numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.validate_location_for_site(numeric, numeric, numeric) to anon, authenticated;

notify pgrst, 'reload schema';
