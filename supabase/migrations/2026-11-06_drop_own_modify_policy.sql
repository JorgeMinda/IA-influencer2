-- Migración: elimina la política own_modify para que los clientes (anon key) no puedan
-- escribir directamente en las tablas. Las escrituras solo las hace el backend con service_role.
do $$
declare t text;
begin
  foreach t in array array['characters','reference_images','generation_jobs','generation_artifacts'] loop
    execute format('drop policy if exists "own_modify" on public.%I', t);
  end loop;
end $$;