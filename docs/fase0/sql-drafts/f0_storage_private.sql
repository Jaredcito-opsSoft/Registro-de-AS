-- F0 private Storage draft.
-- No ejecutar en produccion sin revisar bucket existente, permisos y app frontend.
-- Referencia Supabase: Storage usa RLS en storage.objects; buckets privados no tienen URL publica.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence-private',
  'evidence-private',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Politicas storage.objects. Las operaciones de lectura deben pasar por signed URL/RPC.
-- Upload directo autenticado permitido solo bajo path del tenant/sitio cuando exista contexto suficiente.
-- Para MVP, se recomienda subir evidencia mediante backend/RPC/Edge Function para validar asistencia.

drop policy if exists evidence_private_no_public_select on storage.objects;
create policy evidence_private_no_public_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'evidence-private'
  and exists (
    select 1
    from public.evidencias e
    where e.bucket = storage.objects.bucket_id
      and e.path = storage.objects.name
      and exists (
        select 1
        from public.asistencias a
        where a.id = e.asistencia_id
          and (a.usuario_id = public.current_app_user_id() or public.can_access_site(a.sitio_id))
      )
  )
);

drop policy if exists evidence_private_insert_authenticated on storage.objects;
create policy evidence_private_insert_authenticated
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidence-private'
  and (select auth.uid()) is not null
);

drop policy if exists evidence_private_update_admin_only on storage.objects;
create policy evidence_private_update_admin_only
on storage.objects
for update
to authenticated
using (
  bucket_id = 'evidence-private'
  and public.current_app_user_role() in ('admin', 'superadmin')
)
with check (
  bucket_id = 'evidence-private'
  and public.current_app_user_role() in ('admin', 'superadmin')
);

drop policy if exists evidence_private_delete_superadmin_only on storage.objects;
create policy evidence_private_delete_superadmin_only
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'evidence-private'
  and public.is_superadmin()
);

commit;
