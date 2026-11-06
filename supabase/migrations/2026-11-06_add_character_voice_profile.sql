-- Migración: perfil de voz por personaje.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase ANTES de usar el editor de voz
-- con personajes ya creados. No borra datos: los existentes quedan con NULL.

alter table public.characters
  add column if not exists voice_profile jsonb;

-- Opcional: asignar un perfil por defecto a un personaje concreto por nombre.
-- update public.characters
--   set voice_profile = '{"engine":"browser","voice_name":null,"preset":"calida","rate":0.95,"pitch":1.10,"pause_ms":200}'::jsonb
--   where lower(name) = 'jade';