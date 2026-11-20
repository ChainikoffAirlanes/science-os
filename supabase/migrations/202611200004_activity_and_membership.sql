-- Keep project timestamps current and clear assignments before revoking membership.
create or replace function public.change_member(mid uuid, new_role text default null) returns void language plpgsql security definer set search_path = '' as $$
declare m public.project_members; begin
 select * into m from public.project_members where id=mid for update;
 if auth.uid() is null or public.project_role(m.project_id) is distinct from 'owner' then raise exception 'Access denied'; end if;
 if new_role is null then
 update public.tasks set assigned_to=null,version=version+1,updated_at=now() where project_id=m.project_id and assigned_to=m.user_id;
 update public.experiments set responsible_user_id=null,version=version+1,updated_at=now() where project_id=m.project_id and responsible_user_id=m.user_id;
 delete from public.project_members where id=mid;
 else update public.project_members set role=new_role where id=mid; end if;
end $$;

create or replace function public.audit_project_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare rowdata jsonb; pid uuid; target uuid; recipient uuid; titletext text; begin
 rowdata:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 pid:=case when TG_TABLE_NAME='projects' then (rowdata->>'id')::uuid else (rowdata->>'project_id')::uuid end;
 target:=(rowdata->>'id')::uuid;
 if exists(select 1 from public.projects where id=pid) then
 if not (TG_TABLE_NAME='projects' and pg_trigger_depth()>1) then
 insert into public.activity_log(project_id,actor_id,action,entity_type,entity_id) values(pid,auth.uid(),TG_OP,TG_TABLE_NAME,target);
 end if;
 if TG_TABLE_NAME<>'projects' then update public.projects set updated_at=now() where id=pid; end if;
 end if;
 if TG_TABLE_NAME='tasks' and TG_OP<>'DELETE' then
 recipient:=(rowdata->>'assigned_to')::uuid; titletext:='Задача: '||(rowdata->>'title');
 if recipient is not null and exists(select 1 from public.profiles where id=recipient and notifications_enabled) then
 insert into public.notifications(recipient_id,type,title,target_url) values(recipient,'task',titletext,'/projects/'||pid::text||'/tasks');
 end if; end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;

create function public.membership_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; begin
 if TG_OP='DELETE' then return old; end if;
 if exists(select 1 from public.profiles where id=new.user_id and notifications_enabled) then
 insert into public.notifications(recipient_id,type,title,target_url) values(new.user_id,'membership',case when TG_OP='INSERT' then 'Приглашение в исследование принято' else 'Ваша роль в исследовании изменена' end,'/projects/'||new.project_id::text||'/team');
 end if;
 if TG_OP='INSERT' then
 select owner_id into recipient from public.projects where id=new.project_id;
 if exists(select 1 from public.profiles where id=recipient and notifications_enabled) then
 insert into public.notifications(recipient_id,type,title,target_url) values(recipient,'membership','К исследованию присоединился участник','/projects/'||new.project_id::text||'/team');
 end if; end if;
 return new;
end $$;
create trigger membership_notice after insert or update on public.project_members for each row execute function public.membership_notification();
revoke all on function public.membership_notification() from public;
