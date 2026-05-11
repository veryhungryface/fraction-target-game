create extension if not exists pgcrypto;

create table if not exists public.fraction_target_rooms (
  code text primary key,
  title text not null default '분수를 알라!',
  teacher_id text,
  teacher_last_seen_at timestamptz,
  show_ranking boolean not null default true,
  round_id uuid not null default gen_random_uuid(),
  round_index integer not null default 0,
  round_status text not null default 'lobby',
  round_started_at timestamptz,
  round_revealed_at timestamptz,
  round_duration_sec integer not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fraction_target_rooms_round_status_check check (round_status in ('lobby', 'active', 'revealed')),
  constraint fraction_target_rooms_round_index_check check (round_index >= 0),
  constraint fraction_target_rooms_code_check check (length(btrim(code)) between 1 and 12)
);

create table if not exists public.fraction_target_players (
  room_code text not null references public.fraction_target_rooms(code) on delete cascade,
  id text not null,
  name text not null,
  team text not null,
  total_score integer not null default 0,
  streak integer not null default 0,
  is_bot boolean not null default false,
  last_guess numeric,
  last_error_pct numeric,
  last_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_code, id),
  constraint fraction_target_players_team_check check (team in ('A', 'B', 'C', 'D'))
);

create table if not exists public.fraction_target_submissions (
  room_code text not null references public.fraction_target_rooms(code) on delete cascade,
  round_id uuid not null,
  player_id text not null,
  player_name text not null,
  team text not null,
  value numeric not null,
  error_pct numeric not null,
  score integer not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_code, round_id, player_id),
  foreign key (room_code, player_id) references public.fraction_target_players(room_code, id) on delete cascade,
  constraint fraction_target_submissions_team_check check (team in ('A', 'B', 'C', 'D'))
);

create index if not exists fraction_target_rooms_teacher_seen_idx
  on public.fraction_target_rooms(teacher_last_seen_at);

create index if not exists fraction_target_rooms_updated_at_idx
  on public.fraction_target_rooms(updated_at);

create index if not exists fraction_target_players_room_idx
  on public.fraction_target_players(room_code, created_at);

create index if not exists fraction_target_submissions_round_idx
  on public.fraction_target_submissions(room_code, round_id, submitted_at);

alter table public.fraction_target_rooms enable row level security;
alter table public.fraction_target_players enable row level security;
alter table public.fraction_target_submissions enable row level security;
