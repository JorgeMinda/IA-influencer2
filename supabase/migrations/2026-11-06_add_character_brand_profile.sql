-- Migración: perfil de marca/identidad visual por personaje.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
alter table public.characters
  add column if not exists brand_profile jsonb;