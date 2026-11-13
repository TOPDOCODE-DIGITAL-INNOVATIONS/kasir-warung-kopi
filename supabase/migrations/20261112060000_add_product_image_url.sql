-- Reserve an optional photo URL for future product-image support.
-- Existing rows stay unchanged apart from the new NULL column.
begin;

alter table public.products add column if not exists image_url text;
comment on column public.products.image_url is
  'Optional product photo URL reserved for future use; not yet used by the application.';

notify pgrst, 'reload schema';
commit;
