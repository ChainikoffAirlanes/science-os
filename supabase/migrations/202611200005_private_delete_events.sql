-- Keep deleted scientific values out of WAL payloads. Private signals carry no row data.
create policy project_delete_broadcast_read on realtime.messages for select to authenticated
using(extension='broadcast' and public.can_read(public.storage_project(replace(realtime.topic(),'project:','')||'/')));
create function public.broadcast_project_delete() returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid; begin
 pid:=case when TG_TABLE_NAME='projects' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(old)->>'project_id')::uuid end;
 perform realtime.send(jsonb_build_object('table',TG_TABLE_NAME),'deleted','project:'||pid::text,true);
 return old;
end $$;
do $$ declare t text; begin
 foreach t in array array['projects','project_members','experiments','experiment_parameters','experiment_rows','experiment_cells','tasks','task_comments','project_files','project_folders'] loop
 execute format('create trigger project_deleted after delete on public.%I for each row execute function public.broadcast_project_delete()',t);
 end loop;
end $$;
revoke all on function public.broadcast_project_delete() from public;
