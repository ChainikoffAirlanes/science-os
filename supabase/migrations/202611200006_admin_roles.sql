-- Roles are granted through a serialized, auditable operation only.
revoke update(role,granted_by) on public.user_roles from authenticated;
drop policy roles_admin on public.user_roles;

create function public.admin_search_users(search text)
returns table(user_id uuid,display_name text,email text,role text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or public.system_role() is distinct from 'administrator' then raise exception 'Access denied'; end if;
 if length(trim(search)) < 2 then return; end if;
 return query select p.id,p.display_name,u.email::text,r.role
 from public.profiles p join auth.users u on u.id=p.id join public.user_roles r on r.user_id=p.id
 where position(lower(trim(search)) in lower(p.display_name))>0 or position(lower(trim(search)) in lower(u.email::text))>0
 order by p.display_name,p.id limit 50;
end $$;

create function public.grant_user_role(target_id uuid,new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare previous_role text;
begin
 perform pg_catalog.pg_advisory_xact_lock(73492061);
 if auth.uid() is null or public.system_role() is distinct from 'administrator' then raise exception 'Access denied'; end if;
 if new_role is null or new_role not in ('student','teacher','administrator') then raise exception 'Invalid role'; end if;
 select role into previous_role from public.user_roles where user_id=target_id for update;
 if previous_role is null then raise exception 'User not found'; end if;
 if previous_role='administrator' and new_role<>'administrator' and (select count(*) from public.user_roles where role='administrator')<=1 then raise exception 'Cannot remove last administrator'; end if;
 update public.user_roles set role=new_role,granted_by=auth.uid() where user_id=target_id;
end $$;
revoke all on function public.admin_search_users(text),public.grant_user_role(uuid,text) from public;
grant execute on function public.admin_search_users(text),public.grant_user_role(uuid,text) to authenticated;
