create table if not exists public.sb_anon_usage (
  id bigserial primary key, ip text not null, created_at timestamptz not null default now());
create index if not exists sb_anon_usage_ip_day on public.sb_anon_usage(ip, created_at);
alter table public.sb_anon_usage enable row level security;
create table if not exists public.sb_published_pages (
  slug text primary key, html text not null, created_at timestamptz not null default now());
alter table public.sb_published_pages enable row level security;
create policy "sb_published_pages_read" on public.sb_published_pages for select to anon, authenticated using (true);
