create table if not exists public.maxxen_account_connections (
  email text primary key,
  github_token_encrypted text,
  updated_at timestamptz not null default now()
);
alter table public.maxxen_account_connections enable row level security;
