create table if not exists public.maxxen_account_connections (
  email text primary key,
  github_token_encrypted text,
  github_id bigint,
  github_login text,
  github_access_token_encrypted text,
  github_refresh_token_encrypted text,
  github_access_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.maxxen_account_connections enable row level security;
-- Existing installations: run the following if the table already exists:
alter table public.maxxen_account_connections add column if not exists github_id bigint;
alter table public.maxxen_account_connections add column if not exists github_login text;
alter table public.maxxen_account_connections add column if not exists github_access_token_encrypted text;
alter table public.maxxen_account_connections add column if not exists github_refresh_token_encrypted text;
alter table public.maxxen_account_connections add column if not exists github_access_expires_at timestamptz;