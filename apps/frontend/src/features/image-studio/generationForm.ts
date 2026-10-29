import type { Destination, GenerationInput, Priority } from '../../types';

export const SIZE_OPTIONS: number[] = Array.from({ length: (1536 - 256) / 64 + 1 }, (_, i) => 256 + i * 64);

export interface GenerationFormValues {
  characterId: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  seed: string;
  priority: Priority;
  destination: Destination;
}
export type GenerationFormErrors = Partial<Record<'characterId' | 'prompt' | 'negativePrompt' | 'seed' | 'size', string>>;

export function validateGenerationForm(v: GenerationFormValues): GenerationFormErrors {
  const e: GenerationFormErrors = {};
  if (!v.characterId) e.characterId = 'Elige un personaje.';
  const p = v.prompt.trim();
  if (!p) e.prompt = 'Escribe qué quieres generar.';
  else if (p.length > 2000) e.prompt = 'Máximo 2000 caracteres.';
  if (v.negativePrompt.length > 1000) e.negativePrompt = 'Máximo 1000 caracteres.';
  const s = v.seed.trim();
  if (s && !/^\d+$/.test(s)) e.seed = 'La semilla es un número entero igual o mayor que 0.';
  for (const n of [v.width, v.height]) {
    if (n < 256 || n > 1536 || n % 64 !== 0) e.size = 'El tamaño debe estar entre 256 y 1536 en múltiplos de 64.';
  }
  return e;
}

export function toGenerationInput(v: GenerationFormValues): GenerationInput {
  const s = v.seed.trim();
  return {
    character_id: v.characterId,
    prompt: v.prompt.trim(),
    negative_prompt: v.negativePrompt.trim(),
    destination: v.destination,
    priority: v.priority,
    width: v.width,
    height: v.height,
    seed: s ? Number(s) : null,
  };
}
