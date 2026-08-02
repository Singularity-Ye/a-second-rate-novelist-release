create table if not exists accounts (
  id uuid primary key,
  account_token text not null unique,
  account_status text not null,
  primary_channel text not null,
  accepted_policy_version text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists story_intake_sessions (
  id uuid primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  entry_surface text not null,
  intake_mode text not null,
  brief_payload jsonb not null default '{}'::jsonb,
  status text not null,
  selected_proposal_id uuid,
  client_request_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists story_proposals (
  id uuid primary key,
  session_id uuid not null references story_intake_sessions(id) on delete cascade,
  proposal_no integer not null,
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (session_id, proposal_no)
);

create table if not exists story_workspaces (
  id uuid primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  keywords jsonb not null default '[]'::jsonb,
  workspace_status text not null,
  entry_surface text,
  intake_mode text,
  privacy_scope text,
  commission_brief jsonb,
  current_chapter_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by text not null
);
