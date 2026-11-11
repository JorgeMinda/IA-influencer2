-- AI Creator Studio — esquema de Supabase (Postgres + Storage). Contrato v1.1.
-- ESTADO: escrito, SIN ejecutar contra un proyecto real. Ejecútalo en
-- Supabase → SQL Editor y revisa los errores antes de usar la app.

create extension if not exists pgcrypto;

-- ---------- Tablas ----------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  visual_description text not null default '' check (char_length(visual_description) <= 2000),
  invariant_traits jsonb not null default '[]'::jsonb,
  notes text not null default '' check (char_length(notes) <= 4000),
  gender text not null default 'unspecified' check (gender in ('female', 'male', 'neutral', 'unspecified')),
  voice_profile jsonb,
  brand_profile jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text not null,
  width int not null,
  height int not null,
  source_note text not null check (char_length(source_note) between 3 and 500),
  rights_confirmed boolean not null check (rights_confirmed),
  origin_artifact_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  negative_prompt text not null default '' check (char_length(negative_prompt) <= 1000),
  seed bigint not null check (seed >= 0),
  width int not null check (width between 256 and 1536 and width % 64 = 0),
  height int not null check (height between 256 and 1536 and height % 64 = 0),
  priority text not null default 'balanced' check (priority in ('speed','balanced','quality')),
  destination_requested text not null default 'auto' check (destination_requested in ('auto','local','cloud','mock')),
  destination_used text check (destination_used in ('local','cloud','mock')),
  engine text,
  model text,
  workflow_version text not null default '1',
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  error_code text,
  error_message text,
  attempts int not null default 0,
  retry_of uuid references public.generation_jobs(id) on delete set null,
  provider_job_id text,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.generation_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text not null,
  width int not null,
  height int not null,
  selected boolean not null default false,
  note text not null default '' check (char_length(note) <= 1000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Conteo diario de generaciones en la nube (cuota por usuario, día UTC)
create table if not exists public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  cloud_generations int not null default 0,
  primary key (user_id, day)
);

-- ---------- Índices ----------
create index if not exists idx_characters_user on public.characters(user_id, archived, created_at desc);
create index if not exists idx_refs_character on public.reference_images(character_id);
create index if not exists idx_jobs_user_created on public.generation_jobs(user_id, created_at desc);
create index if not exists idx_jobs_character on public.generation_jobs(character_id);
create index if not exists idx_jobs_status on public.generation_jobs(status);
create index if not exists idx_artifacts_user_created on public.generation_artifacts(user_id, created_at desc);
create index if not exists idx_artifacts_job on public.generation_artifacts(job_id);

-- ---------- updated_at ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_characters_updated on public.characters;
create trigger trg_characters_updated before update on public.characters
for each row execute function public.set_updated_at();

-- ---------- Cuota: incremento atómico ----------
create or replace function public.increment_cloud_usage(p_user uuid, p_limit int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.usage_daily(user_id, day, cloud_generations)
  values (p_user, (now() at time zone 'utc')::date, 0)
  on conflict (user_id, day) do nothing;

  update public.usage_daily
     set cloud_generations = cloud_generations + 1
   where user_id = p_user
     and day = (now() at time zone 'utc')::date
     and cloud_generations < p_limit
  returning cloud_generations into v_count;

  return v_count is not null;   -- false = cuota agotada
end $$;
-- Solo el servidor (service_role) puede llamarla.
revoke all on function public.increment_cloud_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.increment_cloud_usage(uuid, int) to service_role;

-- ---------- RLS ----------
alter table public.characters enable row level security;
alter table public.reference_images enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_artifacts enable row level security;
alter table public.usage_daily enable row level security;

do $$
declare t text;
begin
  foreach t in array array['characters','reference_images','generation_jobs','generation_artifacts'] loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_modify" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    -- "own_modify" eliminada a propósito: las escrituras solo las hace el backend con service_role,
    -- que ignora RLS. Así un cliente con anon key no puede insertar/actualizar/borrar directamente.
  end loop;
end $$;

drop policy if exists "own_select" on public.usage_daily;
create policy "own_select" on public.usage_daily for select to authenticated using (user_id = auth.uid());
-- usage_daily no tiene política de escritura: solo la modifica el servidor.

-- ---------- Storage: buckets privados ----------
insert into storage.buckets (id, name, public)
values ('references','references',false), ('outputs','outputs',false), ('thumbnails','thumbnails',false)
on conflict (id) do update set public = false;

-- Cada usuario solo lee objetos de su carpeta <user_id>/...
-- (las escrituras las hace el servidor con service_role, que ignora RLS)
drop policy if exists "storage_own_read" on storage.objects;
create policy "storage_own_read" on storage.objects for select to authenticated
using (bucket_id in ('references','outputs','thumbnails')
       and (storage.foldername(name))[1] = auth.uid()::text);
