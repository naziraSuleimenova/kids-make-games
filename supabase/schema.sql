-- Kids Bricks Games — Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Enable vector similarity search
create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Games table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists games (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  description   text,
  status        text not null default 'generating'
                  check (status in ('generating', 'draft', 'published', 'failed', 'hidden')),
  version       integer not null default 1,
  asset_url     text,          -- R2 public URL for game HTML
  thumbnail_url text,          -- R2 public URL for screenshot PNG
  report_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for gallery queries
create index if not exists games_status_created_at on games (status, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Prompts table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists prompts (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references games(id) on delete cascade,
  content    text not null,
  version    integer not null,
  created_at timestamptz not null default now()
);

create index if not exists prompts_game_id_version on prompts (game_id, version asc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- Service role key bypasses RLS automatically.
-- Public anon access: read published games + their prompts.
-- ─────────────────────────────────────────────────────────────────────────────
alter table games enable row level security;
alter table prompts enable row level security;

-- Anyone can read published games
create policy "public read published games"
  on games for select
  using (status = 'published');

-- Anyone can read prompts for published games
create policy "public read prompts for published games"
  on prompts for select
  using (
    exists (
      select 1 from games g
      where g.id = prompts.game_id and g.status = 'published'
    )
  );

-- Service role (backend) can do everything — no additional policy needed
-- because service role key bypasses RLS.

-- ─────────────────────────────────────────────────────────────────────────────
-- Phaser 3 docs — RAG knowledge base
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists phaser_docs (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  content    text not null,
  source_url text,
  embedding  vector(1536),
  created_at timestamptz not null default now()
);

-- Only the service role key (backend) reads/writes this table.
-- RLS enabled with no public policies = anon access blocked.
alter table phaser_docs enable row level security;

-- IVFFlat index for fast approximate nearest-neighbour search
create index if not exists phaser_docs_embedding_idx
  on phaser_docs using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- Similarity search function — returns top-k docs for a given embedding
create or replace function match_phaser_docs(
  query_embedding vector(1536),
  match_count     int default 5
)
returns table (
  id         uuid,
  topic      text,
  content    text,
  source_url text,
  similarity float
)
language sql stable
as $$
  select
    id,
    topic,
    content,
    source_url,
    1 - (embedding <=> query_embedding) as similarity
  from phaser_docs
  order by embedding <=> query_embedding
  limit match_count;
$$;
