-- Science OS. Apply once to a NEW Supabase project. No production seed.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null default '' check(length(first_name)<=100), last_name text not null default '' check(length(last_name)<=100),
 display_name text not null default '' check(length(display_name)<=200), avatar_path text, bio text not null default '' check(length(bio)<=2000),
 notifications_enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (user_id uuid primary key references auth.users on delete cascade, role text not null default 'student' check(role in ('student','teacher','administrator')), granted_by uuid references auth.users, created_at timestamptz not null default now());
create function public.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,first_name,last_name,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'first_name',''),100),left(coalesce(new.raw_user_meta_data->>'last_name',''),100),left(trim(coalesce(new.raw_user_meta_data->>'first_name','')||' '||coalesce(new.raw_user_meta_data->>'last_name','')),200));
 insert into public.user_roles(user_id) values(new.id);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_signup();
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users,
 title text not null check(length(trim(title)) between 1 and 200), description text not null default '' check(length(description)<=10000),
 hypothesis text not null default '' check(length(hypothesis)<=30000), objectives text not null default '' check(length(objectives)<=30000), methodology text not null default '' check(length(methodology)<=30000), expected_results text not null default '' check(length(expected_results)<=30000), conclusions text not null default '' check(length(conclusions)<=30000),
 science_category text not null default 'Другое', status text not null default 'active' check(status in ('planned','active','completed','archived')), start_date date default current_date, due_date date,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(due_date is null or start_date is null or due_date>=start_date)
);
-- Exactly one immutable owner is stored on projects; membership roles cannot replace ownership.
create table public.project_members (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, user_id uuid not null references public.profiles on delete cascade,
 role text not null check(role in ('editor','viewer')), joined_at timestamptz not null default now(), unique(project_id,user_id)
);
create function public.project_role(pid uuid) returns text language sql stable security definer set search_path = '' as $$
 select case when p.owner_id=auth.uid() then 'owner' else (select m.role from public.project_members m where m.project_id=p.id and m.user_id=auth.uid()) end from public.projects p where p.id=pid
$$;
create function public.can_read(pid uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(public.project_role(pid) in ('owner','editor','viewer'),false) $$;
create function public.can_edit(pid uuid) returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(public.project_role(pid) in ('owner','editor'),false) $$;
create function public.system_role() returns text language sql stable security definer set search_path = '' as $$ select role from public.user_roles where user_id=auth.uid() $$;
create table public.project_invites (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, token_hash text not null unique, assigned_role text not null check(assigned_role in ('editor','viewer')),
 created_by uuid not null default auth.uid() references auth.users, expires_at timestamptz not null, max_uses integer not null default 1 check(max_uses between 1 and 100), use_count integer not null default 0, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.experiments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200), description text not null default '' check(length(description)<=10000), methodology text not null default '' check(length(methodology)<=30000),
 experiment_date date default current_date, responsible_user_id uuid references public.profiles, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,project_id)
);
create table public.experiment_parameters (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, experiment_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 100), value_type text not null check(value_type in ('number','text','datetime','boolean')), unit text not null default '' check(length(unit)<=50), sort_order integer not null default 0, required boolean not null default false,
 created_at timestamptz not null default now(), foreign key(experiment_id,project_id) references public.experiments(id,project_id) on delete cascade, unique(id,experiment_id,project_id)
);
create table public.experiment_rows (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, experiment_id uuid not null, row_number bigint generated always as identity, created_by uuid not null default auth.uid() references auth.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(experiment_id,project_id) references public.experiments(id,project_id) on delete cascade, unique(id,experiment_id,project_id)
);
create table public.experiment_cells (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, experiment_id uuid not null, experiment_row_id uuid not null, experiment_parameter_id uuid not null,
 value jsonb not null default 'null', version integer not null default 1 check(version>0), updated_by uuid not null default auth.uid() references auth.users, updated_at timestamptz not null default now(),
 foreign key(experiment_row_id,experiment_id,project_id) references public.experiment_rows(id,experiment_id,project_id) on delete cascade,
 foreign key(experiment_parameter_id,experiment_id,project_id) references public.experiment_parameters(id,experiment_id,project_id) on delete cascade,
 unique(experiment_row_id,experiment_parameter_id)
);
create table public.project_folders (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, parent_folder_id uuid, name text not null check(length(trim(name)) between 1 and 200), created_by uuid not null default auth.uid() references auth.users, created_at timestamptz not null default now(), unique(id,project_id), foreign key(parent_folder_id,project_id) references public.project_folders(id,project_id), check(parent_folder_id is null or parent_folder_id<>id)
);
create table public.project_files (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, folder_id uuid,
 storage_path text not null unique, original_name text not null check(length(original_name) between 1 and 255), mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760),
 uploaded_by uuid not null default auth.uid() references auth.users, created_at timestamptz not null default now(), foreign key(folder_id,project_id) references public.project_folders(id,project_id), check(split_part(storage_path,'/',1)=project_id::text)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, title text not null check(length(trim(title)) between 1 and 200), description text not null default '' check(length(description)<=10000),
 status text not null default 'todo' check(status in ('todo','in_progress','done')), priority text not null default 'medium' check(priority in ('low','medium','high')), assigned_to uuid references public.profiles, due_date date, created_by uuid not null default auth.uid() references auth.users, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,project_id)
);
create table public.task_comments (id uuid primary key default gen_random_uuid(), project_id uuid not null, task_id uuid not null, author_id uuid not null default auth.uid() references public.profiles, body text not null check(length(trim(body)) between 1 and 5000), created_at timestamptz not null default now(), foreign key(task_id,project_id) references public.tasks(id,project_id) on delete cascade);
create table public.saved_charts (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, created_by uuid not null default auth.uid() references auth.users, title text not null check(length(title) between 1 and 200), chart_type text not null check(chart_type in ('line','bar','area','comparison')), configuration jsonb not null check(pg_column_size(configuration)<100000), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.publications (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, published_by uuid not null default auth.uid() references auth.users,
 title text not null check(length(title) between 1 and 200), abstract text not null default '' check(length(abstract)<=10000), public_content jsonb not null check(pg_column_size(public_content)<1000000), visibility text not null check(visibility in ('private','authenticated','public')), published_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.opportunities (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null default auth.uid() references public.profiles, title text not null check(length(trim(title)) between 1 and 200), description text not null check(length(description)<=10000), subject text not null, requirements text not null default '' check(length(requirements)<=10000), deadline date not null, capacity integer check(capacity>0), status text not null default 'open' check(status in ('open','closed')), version integer not null default 1, created_at timestamptz not null default now()
);
create table public.opportunity_applications (
 id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.opportunities on delete cascade, student_id uuid not null default auth.uid() references public.profiles, message text not null check(length(trim(message)) between 1 and 5000), status text not null default 'submitted' check(status in ('submitted','accepted','rejected')), created_at timestamptz not null default now(), unique(opportunity_id,student_id)
);
create table public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid not null references auth.users on delete cascade, type text not null, title text not null, body text not null default '', target_url text not null, read_at timestamptz, created_at timestamptz not null default now());
create table public.activity_log (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade, actor_id uuid references public.profiles on delete set null, action text not null, entity_type text not null, entity_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now());

-- All private data is protected at the database layer.
do $$ declare t text; begin
 foreach t in array array['profiles','user_roles','projects','project_members','project_invites','experiments','experiment_parameters','experiment_rows','experiment_cells','project_folders','project_files','tasks','task_comments','saved_charts','publications','opportunities','opportunity_applications','notifications','activity_log'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.project_members m where m.user_id=profiles.id and public.can_read(m.project_id)) or exists(select 1 from public.projects p where p.owner_id=profiles.id and public.can_read(p.id)) or exists(select 1 from public.opportunities o where o.teacher_id=profiles.id) or exists(select 1 from public.opportunity_applications a join public.opportunities o on o.id=a.opportunity_id where a.student_id=profiles.id and o.teacher_id=auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy roles_read on public.user_roles for select to authenticated using(user_id=auth.uid() or public.system_role()='administrator');
create policy roles_admin on public.user_roles for update to authenticated using(public.system_role()='administrator') with check(public.system_role()='administrator');
create policy projects_read on public.projects for select to authenticated using(owner_id=auth.uid() or public.can_read(id));
create policy projects_insert on public.projects for insert to authenticated with check(owner_id=auth.uid());
create policy projects_delete on public.projects for delete to authenticated using(owner_id=auth.uid() and not exists(select 1 from public.project_files f where f.project_id=projects.id));
create policy members_read on public.project_members for select to authenticated using(public.can_read(project_id));
create policy invites_read on public.project_invites for select to authenticated using(public.project_role(project_id)='owner');
do $$ declare t text; begin
 foreach t in array array['experiments','experiment_parameters','experiment_rows','project_folders','project_files','tasks','saved_charts'] loop
 execute format('create policy read_member on public.%I for select to authenticated using(public.can_read(project_id))',t);
 execute format('create policy insert_editor on public.%I for insert to authenticated with check(public.can_edit(project_id))',t);
 execute format('create policy delete_editor on public.%I for delete to authenticated using(public.can_edit(project_id))',t);
 execute format('create index on public.%I(project_id)',t);
 end loop;
end $$;
-- Versions and immutable identities may only be changed by narrow RPCs.
create policy cells_read on public.experiment_cells for select to authenticated using(public.can_read(project_id));
create index on public.experiment_cells(experiment_id);
create index on public.experiment_rows(experiment_id);
create index on public.experiment_parameters(experiment_id);
create index on public.project_members(user_id);
create index on public.project_invites(project_id);
create policy comments_read on public.task_comments for select to authenticated using(public.can_read(project_id));
create policy comments_insert on public.task_comments for insert to authenticated with check(public.can_edit(project_id) and author_id=auth.uid());
create policy activity_read on public.activity_log for select to authenticated using(public.can_read(project_id));
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=auth.uid());
create policy notifications_update on public.notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create policy publications_read on public.publications for select to anon,authenticated using(visibility='public' or (auth.uid() is not null and visibility='authenticated') or public.project_role(project_id)='owner');
create policy publications_insert on public.publications for insert to authenticated with check(public.project_role(project_id)='owner' and published_by=auth.uid());
create policy publications_delete on public.publications for delete to authenticated using(public.project_role(project_id)='owner');
create policy opportunities_read on public.opportunities for select to authenticated using(true);
create policy opportunities_insert on public.opportunities for insert to authenticated with check(teacher_id=auth.uid() and public.system_role() in ('teacher','administrator'));
create policy opportunities_delete on public.opportunities for delete to authenticated using(teacher_id=auth.uid() and public.system_role() in ('teacher','administrator'));
create policy applications_read on public.opportunity_applications for select to authenticated using(student_id=auth.uid() or exists(select 1 from public.opportunities o where o.id=opportunity_id and o.teacher_id=auth.uid()));
create policy applications_insert on public.opportunity_applications for insert to authenticated with check(student_id=auth.uid() and status='submitted' and exists(select 1 from public.opportunities o where o.id=opportunity_id and o.status='open' and o.deadline>=current_date));
create index on public.notifications(recipient_id,created_at desc);
create index on public.activity_log(project_id,created_at desc);
create index on public.opportunity_applications(opportunity_id);

create function public.create_invite(pid uuid, assigned_role text, max_uses integer default 1) returns jsonb language plpgsql security definer set search_path = '' as $$
declare token text; iid uuid; begin
 if auth.uid() is null or public.project_role(pid) is distinct from 'owner' then raise exception 'Access denied'; end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.project_invites(project_id,token_hash,assigned_role,expires_at,max_uses) values(pid,encode(sha256(convert_to(token,'UTF8')),'hex'),assigned_role,now()+interval '7 days',max_uses) returning id into iid;
 return jsonb_build_object('id',iid,'token',token);
end $$;
create function public.accept_invite(token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.project_invites; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into inv from public.project_invites where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
 if inv.id is null or inv.revoked_at is not null or inv.expires_at<now() or inv.use_count>=inv.max_uses then raise exception 'Invitation expired or invalid'; end if;
 if public.can_read(inv.project_id) then return inv.project_id; end if;
 insert into public.project_members(project_id,user_id,role) values(inv.project_id,auth.uid(),inv.assigned_role);
 update public.project_invites set use_count=use_count+1 where id=inv.id;
 return inv.project_id;
end $$;
create function public.revoke_invite(iid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin update public.project_invites set revoked_at=now() where id=iid and public.project_role(project_id)='owner'; if not found then raise exception 'Access denied'; end if; end $$;
create function public.change_member(mid uuid, new_role text default null) returns void language plpgsql security definer set search_path = '' as $$
declare m public.project_members; begin
 select * into m from public.project_members where id=mid for update;
 if auth.uid() is null or public.project_role(m.project_id) is distinct from 'owner' then raise exception 'Access denied'; end if;
 if new_role is null then delete from public.project_members where id=mid; else update public.project_members set role=new_role where id=mid; end if;
end $$;

create function public.save_cell(rid uuid, paramid uuid, new_value jsonb, expected_version integer) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.experiment_rows; p public.experiment_parameters; c public.experiment_cells; begin
 if auth.uid() is null then raise exception 'Access denied'; end if;
 select * into r from public.experiment_rows where id=rid;
 select * into p from public.experiment_parameters where id=paramid;
 if r.id is null or p.id is null or r.experiment_id<>p.experiment_id or not public.can_edit(r.project_id) then raise exception 'Access denied'; end if;
 if new_value='null'::jsonb then if p.required then raise exception 'Value required'; end if;
 elsif (p.value_type='number' and jsonb_typeof(new_value)<>'number') or (p.value_type='boolean' and jsonb_typeof(new_value)<>'boolean') or (p.value_type in ('text','datetime') and jsonb_typeof(new_value)<>'string') then raise exception 'Invalid value type'; end if;
 if pg_column_size(new_value)>20000 then raise exception 'Value too large'; end if;
 if p.value_type='datetime' and new_value<>'null'::jsonb then perform (new_value#>>'{}')::timestamptz; end if;
 -- The unique-key advisory lock also serializes two concurrent inserts into an empty cell.
 perform pg_advisory_xact_lock(hashtextextended(rid::text||paramid::text,0));
 select * into c from public.experiment_cells where experiment_row_id=rid and experiment_parameter_id=paramid for update;
 if coalesce(c.version,0)<>expected_version then return jsonb_build_object('conflict',true,'current',to_jsonb(c)); end if;
 insert into public.experiment_cells(project_id,experiment_id,experiment_row_id,experiment_parameter_id,value,version,updated_by)
 values(r.project_id,r.experiment_id,rid,paramid,new_value,1,auth.uid()) on conflict(experiment_row_id,experiment_parameter_id) do update set value=excluded.value,version=experiment_cells.version+1,updated_by=auth.uid(),updated_at=now() returning * into c;
 return jsonb_build_object('conflict',false,'current',to_jsonb(c));
end $$;

-- Atomic compare-and-swap for project narrative, tasks, parameter metadata and opportunities.
create function public.update_record(entity text, eid uuid, patch jsonb, expected_version integer default 1) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_row jsonb; pid uuid; allowed text[]; key text; assignments text:=''; result jsonb; begin
 if auth.uid() is null then raise exception 'Access denied'; end if;
 if entity not in ('projects','tasks','experiments','experiment_parameters','project_files','opportunities') then raise exception 'Invalid entity'; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',entity) into current_row using eid;
 if current_row is null then raise exception 'Not found'; end if;
 if entity='projects' then pid:=eid; else pid:=(current_row->>'project_id')::uuid; end if;
 if entity='opportunities' then
 if current_row->>'teacher_id'<>auth.uid()::text or public.system_role() not in ('teacher','administrator') then raise exception 'Access denied'; end if;
 elsif not public.can_edit(pid) then raise exception 'Access denied'; end if;
 if current_row ? 'version' and (current_row->>'version')::integer<>expected_version then return jsonb_build_object('conflict',true,'current',current_row); end if;
 allowed:=case entity
 when 'projects' then array['title','description','hypothesis','objectives','methodology','expected_results','conclusions','science_category','status','start_date','due_date']
 when 'tasks' then array['title','description','status','priority','assigned_to','due_date']
 when 'experiments' then array['title','description','methodology','responsible_user_id','experiment_date']
 when 'experiment_parameters' then array['name','unit','required','sort_order']
 when 'project_files' then array['original_name','folder_id']
 when 'opportunities' then array['title','description','subject','requirements','deadline','capacity','status'] end;
 for key in select jsonb_object_keys(patch) loop
 if not key=any(allowed) then raise exception 'Field not editable'; end if;
 assignments:=assignments||case when assignments='' then '' else ',' end||format('%I=(jsonb_populate_record(null::public.%I,$2)).%I',key,entity,key);
 end loop;
 if assignments='' then raise exception 'Empty update'; end if;
 if current_row ? 'version' then assignments:=assignments||',version=version+1'; end if;
 if current_row ? 'updated_at' then assignments:=assignments||',updated_at=now()'; end if;
 execute format('update public.%I set %s where id=$1 returning to_jsonb(%I.*)',entity,assignments,entity) into result using eid,patch;
 return jsonb_build_object('conflict',false,'current',result);
end $$;

create function public.review_application(aid uuid, decision text) returns void language plpgsql security definer set search_path = '' as $$
declare a public.opportunity_applications; o public.opportunities; begin
 select * into a from public.opportunity_applications where id=aid for update;
 select * into o from public.opportunities where id=a.opportunity_id for update;
 if auth.uid() is null or o.teacher_id<>auth.uid() or public.system_role() not in ('teacher','administrator') or decision not in ('accepted','rejected') then raise exception 'Access denied'; end if;
 if decision='accepted' and a.status<>'accepted' and o.capacity is not null and (select count(*) from public.opportunity_applications where opportunity_id=o.id and status='accepted')>=o.capacity then raise exception 'No places available'; end if;
 update public.opportunity_applications set status=decision where id=aid;
end $$;

create function public.audit_project_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare rowdata jsonb; pid uuid; target uuid; recipient uuid; titletext text; begin
 rowdata:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 pid:=case when TG_TABLE_NAME='projects' then (rowdata->>'id')::uuid else (rowdata->>'project_id')::uuid end;
 target:=(rowdata->>'id')::uuid;
 if exists(select 1 from public.projects where id=pid) then
 insert into public.activity_log(project_id,actor_id,action,entity_type,entity_id) values(pid,auth.uid(),TG_OP,TG_TABLE_NAME,target);
 end if;
 if TG_TABLE_NAME='tasks' and TG_OP<>'DELETE' then
 recipient:=(rowdata->>'assigned_to')::uuid; titletext:='Задача: '||(rowdata->>'title');
 if recipient is not null and exists(select 1 from public.profiles where id=recipient and notifications_enabled) then
 insert into public.notifications(recipient_id,type,title,target_url) values(recipient,'task',titletext,'/projects/'||pid::text||'/tasks');
 end if; end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin foreach t in array array['projects','experiments','experiment_parameters','experiment_rows','experiment_cells','tasks','task_comments','project_files','project_members'] loop
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function public.audit_project_change()',t);
 end loop; end $$;
create function public.application_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid; begin
 if TG_OP='INSERT' then select teacher_id into uid from public.opportunities where id=new.opportunity_id; else uid:=new.student_id; end if;
 if exists(select 1 from public.profiles where id=uid and notifications_enabled) then
 insert into public.notifications(recipient_id,type,title,target_url) values(uid,'application',case when TG_OP='INSERT' then 'Новая заявка на исследование' else 'Статус заявки: '||new.status end,'/opportunities/'||new.opportunity_id::text);
 end if; return new;
end $$;
create trigger application_notice after insert or update on public.opportunity_applications for each row execute function public.application_notification();

-- Validate assignment identities server-side, including references from editors.
create function public.check_assignee() returns trigger language plpgsql set search_path = '' as $$
declare uid uuid; begin
 uid:=case when TG_TABLE_NAME='tasks' then (to_jsonb(new)->>'assigned_to')::uuid else (to_jsonb(new)->>'responsible_user_id')::uuid end;
 if uid is not null and not exists(select 1 from public.projects where id=new.project_id and owner_id=uid) and not exists(select 1 from public.project_members where project_id=new.project_id and user_id=uid) then raise exception 'Assignee is not a member'; end if;
 return new; end $$;
create trigger task_assignee before insert or update on public.tasks for each row execute function public.check_assignee();
create trigger experiment_assignee before insert or update on public.experiments for each row execute function public.check_assignee();

-- Private bucket; short-lived signed URLs are created only after authenticated RLS checks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('science-project-files','science-project-files',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg','text/csv','text/plain']);
create function public.storage_project(path text) returns uuid language plpgsql immutable set search_path = '' as $$ begin return split_part(path,'/',1)::uuid; exception when invalid_text_representation then return null; end $$;
create policy file_read on storage.objects for select to authenticated using(bucket_id='science-project-files' and public.can_read(public.storage_project(name)));
create policy file_write on storage.objects for insert to authenticated with check(bucket_id='science-project-files' and public.can_edit(public.storage_project(name)));
create policy file_delete on storage.objects for delete to authenticated using(bucket_id='science-project-files' and public.can_edit(public.storage_project(name)));

-- Private authorized presence. The topic itself does not grant access.
create policy presence_read on realtime.messages for select to authenticated using(extension='presence' and public.can_read(public.storage_project(replace(realtime.topic(),'project:','')||'/')));
create policy presence_write on realtime.messages for insert to authenticated with check(extension='presence' and public.can_read(public.storage_project(replace(realtime.topic(),'project:','')||'/')));
do $$ declare t text; begin foreach t in array array['projects','project_members','experiments','experiment_parameters','experiment_rows','experiment_cells','tasks','task_comments','project_files','project_folders','activity_log','notifications'] loop
 execute format('alter publication supabase_realtime add table public.%I',t);
 end loop; end $$;

-- Limit client privileges even when a policy exists.
revoke all on all functions in schema public from public;
grant execute on function public.project_role(uuid),public.can_read(uuid),public.can_edit(uuid),public.system_role(),public.storage_project(text) to authenticated;
grant execute on function public.project_role(uuid) to anon;
grant execute on function public.create_invite(uuid,text,integer),public.accept_invite(text),public.revoke_invite(uuid),public.change_member(uuid,text),public.save_cell(uuid,uuid,jsonb,integer),public.update_record(text,uuid,jsonb,integer),public.review_application(uuid,text) to authenticated;
revoke update on public.profiles from authenticated;
grant update(first_name,last_name,display_name,avatar_path,bio,notifications_enabled,updated_at) on public.profiles to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;
-- Explicit grants: the project can be created with automatic API grants disabled.
grant usage on schema public to anon,authenticated;
grant select on public.publications to anon;
grant select on all tables in schema public to authenticated;
grant insert,delete on public.projects,public.experiments,public.experiment_parameters,public.experiment_rows,public.project_folders,public.project_files,public.tasks,public.saved_charts,public.publications,public.opportunities to authenticated;
grant insert on public.task_comments,public.opportunity_applications to authenticated;
grant update(first_name,last_name,display_name,avatar_path,bio,notifications_enabled,updated_at) on public.profiles to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant update(role,granted_by) on public.user_roles to authenticated;
grant usage,select on all sequences in schema public to authenticated;

create function public.import_observations(eid uuid, parameter_ids uuid[], values_matrix jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare e public.experiments; row_value jsonb; rid uuid; i integer; count_rows integer:=0; begin
 select * into e from public.experiments where id=eid;
 if e.id is null or auth.uid() is null or not public.can_edit(e.project_id) then raise exception 'Access denied'; end if;
 if jsonb_typeof(values_matrix)<>'array' or jsonb_array_length(values_matrix)>2000 or cardinality(parameter_ids)>100 then raise exception 'Import too large'; end if;
 if (select count(*) from public.experiment_parameters where experiment_id=eid)<>cardinality(parameter_ids) or (select count(distinct x) from unnest(parameter_ids) x)<>cardinality(parameter_ids) or exists(select 1 from unnest(parameter_ids) x where not exists(select 1 from public.experiment_parameters p where p.id=x and p.experiment_id=eid)) then raise exception 'Parameters changed. Reopen import'; end if;
 for row_value in select * from jsonb_array_elements(values_matrix) loop
 if jsonb_array_length(row_value)<>cardinality(parameter_ids) then raise exception 'Invalid row width'; end if;
 insert into public.experiment_rows(project_id,experiment_id) values(e.project_id,eid) returning id into rid;
 for i in 1..cardinality(parameter_ids) loop perform public.save_cell(rid,parameter_ids[i],row_value->(i-1),0); end loop;
 count_rows:=count_rows+1;
 end loop; return count_rows;
end $$;
revoke all on function public.import_observations(uuid,uuid[],jsonb) from public;
grant execute on function public.import_observations(uuid,uuid[],jsonb) to authenticated;
