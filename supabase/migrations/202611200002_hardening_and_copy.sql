-- Additive hardening and complete project-data duplication. No user data is deleted.
alter table public.experiment_parameters add column version integer not null default 1;
alter table public.project_files add column version integer not null default 1;

do $$ declare t text; begin
 foreach t in array array['project_folders','tasks','saved_charts'] loop
 execute format('alter policy insert_editor on public.%I with check(public.can_edit(project_id) and created_by=auth.uid())',t);
 end loop;
end $$;
alter policy insert_editor on public.experiment_rows with check(public.can_edit(project_id) and created_by=auth.uid());
alter policy insert_editor on public.project_files with check(public.can_edit(project_id) and uploaded_by=auth.uid());

create or replace function public.save_cell(rid uuid, paramid uuid, new_value jsonb, expected_version integer) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.experiment_rows; p public.experiment_parameters; c public.experiment_cells; begin
 if auth.uid() is null then raise exception 'Access denied'; end if;
 if expected_version is null or expected_version<0 then raise exception 'Expected version required'; end if;
 new_value:=coalesce(new_value,'null'::jsonb);
 select * into r from public.experiment_rows where id=rid;
 select * into p from public.experiment_parameters where id=paramid;
 if r.id is null or p.id is null or r.experiment_id<>p.experiment_id or not public.can_edit(r.project_id) then raise exception 'Access denied'; end if;
 if new_value='null'::jsonb then if p.required then raise exception 'Value required'; end if;
 elsif (p.value_type='number' and jsonb_typeof(new_value)<>'number') or (p.value_type='boolean' and jsonb_typeof(new_value)<>'boolean') or (p.value_type in ('text','datetime') and jsonb_typeof(new_value)<>'string') then raise exception 'Invalid value type'; end if;
 if pg_column_size(new_value)>20000 then raise exception 'Value too large'; end if;
 if p.value_type='datetime' and new_value<>'null'::jsonb then perform (new_value#>>'{}')::timestamptz; end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text||paramid::text,0));
 select * into c from public.experiment_cells where experiment_row_id=rid and experiment_parameter_id=paramid for update;
 if coalesce(c.version,0)<>expected_version then return jsonb_build_object('conflict',true,'current',to_jsonb(c)); end if;
 insert into public.experiment_cells(project_id,experiment_id,experiment_row_id,experiment_parameter_id,value,version,updated_by)
 values(r.project_id,r.experiment_id,rid,paramid,new_value,1,auth.uid()) on conflict(experiment_row_id,experiment_parameter_id) do update set value=excluded.value,version=experiment_cells.version+1,updated_by=auth.uid(),updated_at=now() returning * into c;
 return jsonb_build_object('conflict',false,'current',to_jsonb(c));
end $$;

create or replace function public.update_record(entity text, eid uuid, patch jsonb, expected_version integer default 1) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_row jsonb; pid uuid; allowed text[]; key text; assignments text:=''; result jsonb; begin
 if auth.uid() is null then raise exception 'Access denied'; end if;
 if expected_version is null or expected_version<1 then raise exception 'Expected version required'; end if;
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

create function public.duplicate_project(source_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.projects; e public.experiments; r public.experiment_rows; c public.experiment_cells; parameter_record public.experiment_parameters; newparam uuid; newpid uuid; neweid uuid; newrid uuid; params jsonb; begin
 if auth.uid() is null or not public.can_read(source_id) then raise exception 'Access denied'; end if;
 select * into p from public.projects where id=source_id;
 insert into public.projects(title,description,hypothesis,objectives,methodology,expected_results,conclusions,science_category,status,start_date,due_date)
 values(left(p.title,190)||' (копия)',p.description,p.hypothesis,p.objectives,p.methodology,p.expected_results,p.conclusions,p.science_category,'planned',p.start_date,p.due_date) returning id into newpid;
 for e in select * from public.experiments where project_id=source_id loop
 insert into public.experiments(project_id,title,description,methodology,experiment_date) values(newpid,e.title,e.description,e.methodology,e.experiment_date) returning id into neweid;
 params:='{}'::jsonb;
 for parameter_record in select * from public.experiment_parameters where experiment_id=e.id order by sort_order loop
 insert into public.experiment_parameters(project_id,experiment_id,name,value_type,unit,sort_order,required)
 values(newpid,neweid,parameter_record.name,parameter_record.value_type,parameter_record.unit,parameter_record.sort_order,parameter_record.required) returning id into newparam;
 params:=params||jsonb_build_object(parameter_record.id::text,newparam::text);
 end loop;
 for r in select * from public.experiment_rows where experiment_id=e.id order by row_number loop
 insert into public.experiment_rows(project_id,experiment_id) values(newpid,neweid) returning id into newrid;
 for c in select * from public.experiment_cells where experiment_row_id=r.id loop
 perform public.save_cell(newrid,(params->>c.experiment_parameter_id::text)::uuid,c.value,0);
 end loop;
 end loop;
 end loop;
 -- Files, memberships, invitations, publications and personal assignments are intentionally not copied.
 insert into public.tasks(project_id,title,description,status,priority,due_date) select newpid,title,description,'todo',priority,due_date from public.tasks where project_id=source_id;
 return newpid;
end $$;
revoke all on function public.duplicate_project(uuid) from public;
grant execute on function public.duplicate_project(uuid) to authenticated;
