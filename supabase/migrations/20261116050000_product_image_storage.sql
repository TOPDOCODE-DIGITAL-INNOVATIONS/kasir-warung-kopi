-- Optional, public menu photos; uploading/listing remains scoped to the branch owner.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "owner upload product photos" on storage.objects for insert to authenticated with check (
  bucket_id='product-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.foldername(name))[2] in (select id::text from public.businesses where owner_id=(select auth.uid()))
  and array_length(storage.foldername(name),1)=3
);
create policy "owner read product photos" on storage.objects for select to authenticated using (
  bucket_id='product-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (storage.foldername(name))[2] in (select id::text from public.businesses where owner_id=(select auth.uid()))
);
comment on column public.products.image_url is 'Optional public product photo URL, managed by the branch owner through the admin dashboard.';
notify pgrst,'reload schema';
commit;
