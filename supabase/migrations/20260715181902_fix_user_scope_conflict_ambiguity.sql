begin;

do $hotfix$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_update_user_scope(uuid,uuid[],uuid,text)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    'on conflict (usuario_id, sitio_id) do update',
    'on conflict on constraint usuario_sitios_alcance_pkey do update'
  );

  execute v_definition;
end;
$hotfix$;

revoke all on function public.admin_update_user_scope(uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.admin_update_user_scope(uuid, uuid[], uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
