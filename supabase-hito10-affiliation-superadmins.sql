-- HITO 10: selector de afiliacion, instalacion PWA visible y superadmins iniciales

create or replace function public.resolve_organization_by_key(p_key text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.organizaciones o
  where o.activo = true
    and (
      o.clave_acceso_hash = public.hash_org_key(p_key)
      or lower(o.slug) = lower(trim(coalesce(p_key, '')))
    )
  limit 1;
$$;

create or replace function public.get_public_organization_options()
returns table (slug text, nombre text, tipo text)
language sql
stable
security definer
set search_path = public
as $$
  select o.slug, o.nombre, o.tipo
  from public.organizaciones o
  where o.activo = true
  order by o.nombre asc;
$$;

revoke execute on function public.resolve_organization_by_key(text) from public, anon;
revoke execute on function public.get_public_organization_options() from public;
grant execute on function public.get_public_organization_options() to anon, authenticated;

do $$
declare
  v_org uuid := public.get_default_organizacion_id();
  v_email text;
  v_password text;
  v_name text;
  v_auth_id uuid;
begin
  for v_email, v_password, v_name in
    select * from (values
      ('alexisdavid1177@gmail.com', 'David12345', 'Alexis David'),
      ('jaredcontacto.mx@gmail.com', 'Jared12345', 'Jared Contacto')
    ) as seed(email, password, name)
  loop
    select id into v_auth_id from auth.users where lower(email) = lower(v_email) limit 1;

    if v_auth_id is null then
      v_auth_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token,
        email_change_token_new, email_change,
        is_super_admin, is_sso_user, is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000', v_auth_id, 'authenticated', 'authenticated', lower(v_email),
        extensions.crypt(v_password, extensions.gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('nombre', v_name, 'matricula', upper(split_part(v_email, '@', 1)), 'organization_key', 'DEMO-AS-2026'),
        now(), now(),
        '', '', '', '',
        false, false, false
      );
    else
      update auth.users
      set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('provider', 'email', 'providers', array['email']),
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nombre', v_name, 'matricula', upper(split_part(v_email, '@', 1)), 'organization_key', 'DEMO-AS-2026'),
          updated_at = now()
      where id = v_auth_id;
    end if;

    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_auth_id::text, v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', lower(v_email), 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do update
    set identity_data = excluded.identity_data,
        updated_at = now();

    insert into public.usuarios_app (organizacion_id, nombre, matricula, email, rol, activo, auth_user_id, ultimo_acceso_at)
    values (v_org, v_name, upper(split_part(v_email, '@', 1)), lower(v_email), 'superadmin', true, v_auth_id, now())
    on conflict (organizacion_id, matricula) do update
    set nombre = excluded.nombre,
        email = excluded.email,
        rol = 'superadmin',
        activo = true,
        auth_user_id = excluded.auth_user_id,
        ultimo_acceso_at = now(),
        updated_at = now();
  end loop;
end $$;

notify pgrst, 'reload schema';
