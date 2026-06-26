-- HOTFIX: QR de salida no disponible por search_path de pgcrypto
-- pgcrypto esta instalado en schema extensions; la RPC usa search_path public.

create or replace function public.get_current_qr_token()
returns table (
  token text,
  token_id uuid,
  server_time timestamptz,
  expires_at timestamptz,
  is_open boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_site public.sitios%rowtype;
  v_tz text := 'America/Mexico_City';
  v_local timestamp;
  v_fecha date;
  v_start time := time '16:30';
  v_end time := time '17:10';
  v_is_open boolean;
  v_token public.qr_tokens%rowtype;
begin
  select * into v_site from public.sitios where activo = true order by updated_at desc limit 1;

  if v_site.id is not null then
    v_tz := coalesce(nullif(v_site.zona_horaria, ''), 'America/Mexico_City');
    v_start := coalesce(v_site.hora_salida_inicio, time '16:30');
    v_end := coalesce(v_site.hora_salida_fin, time '17:10');
  end if;

  v_local := v_now at time zone v_tz;
  v_fecha := v_local::date;
  v_is_open := (v_local::time >= v_start and v_local::time <= v_end);

  update public.qr_tokens q
  set estado = 'expirado'
  where q.expires_at <= v_now and q.estado = 'vigente';

  if not v_is_open then
    return query select null::text, null::uuid, v_now, null::timestamptz, false,
      format('La salida esta disponible de %s a %s. Zona horaria: %s.', to_char(v_start, 'HH24:MI'), to_char(v_end, 'HH24:MI'), v_tz)::text;
    return;
  end if;

  select q.* into v_token
  from public.qr_tokens q
  where q.fecha = v_fecha
    and q.expires_at > v_now
    and q.estado = 'vigente'
  order by q.created_at desc
  limit 1;

  if v_token.id is null then
    insert into public.qr_tokens (token, fecha, created_at, expires_at, estado)
    values (
      encode(extensions.gen_random_bytes(18), 'hex'),
      v_fecha,
      v_now,
      v_now + interval '5 minutes',
      'vigente'
    )
    returning * into v_token;
  end if;

  return query select v_token.token, v_token.id, v_now, v_token.expires_at, true,
    format('QR valido. Hora local %s (%s).', to_char(v_local, 'HH24:MI:SS'), v_tz)::text;
end;
$$;

grant execute on function public.get_current_qr_token() to anon, authenticated;
notify pgrst, 'reload schema';
