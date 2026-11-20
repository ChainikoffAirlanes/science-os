-- Private profile images; reading a profile controls reading its avatar.
alter table public.profiles add constraint avatar_owned_path check(avatar_path is null or split_part(avatar_path,'/',1)=id::text);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('science-profile-avatars','science-profile-avatars',false,1048576,array['image/png','image/jpeg']);
create policy avatar_read on storage.objects for select to authenticated using(bucket_id='science-profile-avatars' and exists(select 1 from public.profiles p where p.id=public.storage_project(name)));
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='science-profile-avatars' and public.storage_project(name)=auth.uid());
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='science-profile-avatars' and public.storage_project(name)=auth.uid());
