begin;

create or replace function public.get_public_affiliation_options()
returns table (
  organization_id uuid,
  organization_slug text,
  organization_name text,
  organization_type text,
  site_id uuid,
  site_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.slug,
    o.nombre,
    o.tipo,
    s.id,
    s.nombre
  from public.organizaciones as o
  left join public.sitios as s
    on s.organizacion_id = o.id
   and coalesce(s.activo, true)
  where coalesce(o.activo, true)
  order by o.nombre, s.nombre;
$$;

revoke all on function public.get_public_affiliation_options() from public;
grant execute on function public.get_public_affiliation_options() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
