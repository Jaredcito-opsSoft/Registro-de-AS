-- Avatar privado sincronizado entre dispositivos.
-- La identidad se deriva siempre de auth.uid(); el cliente no puede elegir otro prefijo.

begin;

alter table public.usuarios_app
  add column if not exists avatar_path text,
  add column if not exists avatar_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_avatars_select_own" on storage.objects;
create policy "profile_avatars_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create or replace function public.set_my_avatar_path(p_avatar_path text default null)
returns table (avatar_path text, avatar_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_id uuid := auth.uid();
  v_path text := nullif(trim(coalesce(p_avatar_path, '')), '');
begin
  if v_auth_id is null then
    raise exception 'sesion_requerida';
  end if;

  if v_path is not null and v_path <> (v_auth_id::text || '/avatar.jpg') then
    raise exception 'ruta_avatar_invalida';
  end if;

  return query
  update public.usuarios_app as ua
  set avatar_path = v_path,
      avatar_updated_at = case when v_path is null then null else now() end,
      updated_at = now()
  where ua.auth_user_id = v_auth_id
    and coalesce(ua.activo, true)
  returning ua.avatar_path, ua.avatar_updated_at;

  if not found then
    raise exception 'usuario_app_no_encontrado';
  end if;
end;
$$;

create or replace function public.get_my_avatar()
returns table (avatar_path text, avatar_updated_at timestamptz)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select ua.avatar_path, ua.avatar_updated_at
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid()
    and coalesce(ua.activo, true)
  order by ua.updated_at desc nulls last
  limit 1;
$$;

revoke all on function public.set_my_avatar_path(text) from public, anon;
revoke all on function public.get_my_avatar() from public, anon;
grant execute on function public.set_my_avatar_path(text) to authenticated;
grant execute on function public.get_my_avatar() to authenticated;

notify pgrst, 'reload schema';

commit;
