-- Migración: campo de género/voz en personajes.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase ANTES de usar la selección de voz
-- con personajes ya creados. No borra datos: los existentes quedan en 'unspecified'.

alter table public.characters
  add column if not exists gender text not null default 'unspecified';

alter table public.characters
  drop constraint if exists characters_gender_check;

alter table public.characters
  add constraint characters_gender_check
  check (gender in ('female', 'male', 'neutral', 'unspecified'));

-- Opcional: fija el género de un personaje concreto por nombre.
-- update public.characters set gender = 'female' where lower(name) = 'jade';
