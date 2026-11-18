-- Existing files are retained; only new uploads must be WebP and strictly under 200 KiB.
begin;
update storage.buckets set file_size_limit=204799,allowed_mime_types=array['image/webp'] where id='product-images';
notify pgrst,'reload schema';
commit;
