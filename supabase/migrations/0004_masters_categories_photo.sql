-- Migration 0004: Master profile enhancements, master_categories binding, and soft-delete

-- 1. Add new fields to masters table
alter table masters add column if not exists first_name text;
alter table masters add column if not exists last_name text;
alter table masters add column if not exists photo_url text;
alter table masters add column if not exists is_deleted boolean not null default false;

-- Populate first_name / last_name from existing name if empty
update masters
set first_name = split_part(name, ' ', 1),
    last_name = nullif(substr(name, length(split_part(name, ' ', 1)) + 2), '')
where first_name is null and name is not null;

-- 2. Create master_categories table for service category specialization
create table if not exists master_categories (
  master_id uuid references masters(id) on delete cascade,
  category_id uuid references service_categories(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (master_id, category_id)
);

create index if not exists idx_master_categories_master on master_categories(master_id);
create index if not exists idx_master_categories_category on master_categories(category_id);

-- RLS for master_categories
alter table master_categories enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'master_categories' and policyname = 'public read') then
    create policy "public read" on master_categories for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'master_categories' and policyname = 'admin write') then
    create policy "admin write" on master_categories for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 3. Storage bucket for master photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('masters', 'masters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true;

-- Storage RLS policies
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Public Access Masters') then
    create policy "Public Access Masters" on storage.objects for select using (bucket_id = 'masters');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Admin Upload Masters') then
    create policy "Admin Upload Masters" on storage.objects for insert to authenticated with check (bucket_id = 'masters');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Admin Update Masters') then
    create policy "Admin Update Masters" on storage.objects for update to authenticated with check (bucket_id = 'masters');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Admin Delete Masters') then
    create policy "Admin Delete Masters" on storage.objects for delete to authenticated using (bucket_id = 'masters');
  end if;
end $$;
