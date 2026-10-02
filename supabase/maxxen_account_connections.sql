create table if not exists public.maxxen_account_connections (
  email text primary key,
  github_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

alter table public.maxxen_account_connections enable row level security;

-- The service role used by MAXXEN bypasses RLS. No client policy is created,
-- so browser clients cannot read encrypted credentials directly.
