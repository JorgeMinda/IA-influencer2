export const LIMITS = { name: 80, description: 2000, trait: 120, traits: 20, notes: 4000 } as const;

export interface CharacterFormValues {
  name: string;
  visualDescription: string;
  traits: string[];
  notes: string;
}
export type CharacterFormErrors = Partial<Record<'name' | 'visualDescription' | 'traits' | 'notes', string>>;

export function validateCharacterForm(v: CharacterFormValues): CharacterFormErrors {
  const e: CharacterFormErrors = {};
  const name = v.name.trim();
  if (name.length < 1) e.name = 'Escribe un nombre.';
  else if (name.length > LIMITS.name) e.name = `Máximo ${LIMITS.name} caracteres.`;
  if (v.visualDescription.length > LIMITS.description) e.visualDescription = `Máximo ${LIMITS.description} caracteres.`;
  if (v.notes.length > LIMITS.notes) e.notes = `Máximo ${LIMITS.notes} caracteres.`;
  if (v.traits.length > LIMITS.traits) e.traits = `Máximo ${LIMITS.traits} rasgos.`;
  else if (v.traits.some((t) => t.trim().length < 1 || t.length > LIMITS.trait)) e.traits = `Cada rasgo debe tener entre 1 y ${LIMITS.trait} caracteres.`;
  return e;
}

/** Añade un rasgo (recortado, sin duplicados). Devuelve el error si no se puede añadir. */
export function addTrait(traits: string[], raw: string): { traits: string[]; error?: string } {
  const t = raw.trim();
  if (!t) return { traits };
  if (t.length > LIMITS.trait) return { traits, error: `Cada rasgo admite hasta ${LIMITS.trait} caracteres.` };
  if (traits.length >= LIMITS.traits) return { traits, error: `Máximo ${LIMITS.traits} rasgos.` };
  if (traits.some((x) => x.toLowerCase() === t.toLowerCase())) return { traits, error: 'Ese rasgo ya está en la lista.' };
  return { traits: [...traits, t] };
}

export function validateNote(note: string, min: number, max: number): string | undefined {
  const n = note.trim();
  if (n.length < min) return `Escribe al menos ${min} caracteres.`;
  if (n.length > max) return `Máximo ${max} caracteres.`;
  return undefined;
}
