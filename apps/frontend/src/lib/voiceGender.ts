import type { Character, CharacterGender } from '../types';

const FEMALE_WORDS = new Set([
  'una', 'mujer', 'mujeres', 'femenina', 'chica', 'chicas', 'niña', 'niñas', 'senora', 'señora',
  'dama', 'madre', 'hermana', 'hija', 'abuela', 'actriz', 'adulta', 'adultas', 'ella', 'ellas',
  'female', 'woman', 'women', 'girl', 'she', 'her',
]);

const MALE_WORDS = new Set([
  'un', 'hombre', 'hombres', 'masculino', 'chico', 'chicos', 'niño', 'niños', 'senor', 'señor',
  'caballero', 'padre', 'hermano', 'hijo', 'abuelo', 'actor', 'adulto', 'adultos', 'él', 'ellos',
  'male', 'man', 'men', 'boy', 'he', 'him',
]);

/** Puntúa las palabras del texto y devuelve el género inferido (o `null` si no hay señal). */
export function inferVoiceGender(text: string | null | undefined): CharacterGender | null {
  if (!text) return null;
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  let female = 0;
  let male = 0;
  for (const w of words) {
    if (FEMALE_WORDS.has(w)) female += 1;
    if (MALE_WORDS.has(w)) male += 1;
  }
  if (female === male) return null;
  return female > male ? 'female' : 'male';
}

/**
 * Género efectivo para la voz: usa el campo explícito y, si no está,
 * lo infiere de nombre, descripción, rasgos y notas.
 */
export function characterVoiceGender(
  character: Pick<Character, 'gender' | 'name' | 'visual_description' | 'invariant_traits' | 'notes'> | null | undefined,
): CharacterGender {
  if (!character) return 'unspecified';
  if (character.gender && character.gender !== 'unspecified') return character.gender;
  const text = [character.name, character.visual_description, ...(character.invariant_traits ?? []), character.notes]
    .filter(Boolean)
    .join(' ');
  return inferVoiceGender(text) ?? 'unspecified';
}

const FEMALE_VOICES = [
  'female', 'mujer', 'femenina', 'helena', 'laura', 'sabina', 'monica', 'mónica', 'paulina',
  'lucia', 'lucía', 'marisol', 'esperanza', 'francisca', 'camila', 'valentina', 'elvira', 'dalia',
  'vera', 'renata', 'carla', 'sofia', 'sofía', 'lorena', 'penelope', 'penélope', 'triana', 'ximena',
  'andrea', 'isabela', 'lupe', 'catalina', 'salome', 'salomé', 'juana', 'carmen', 'gloria', 'esther',
  'irene', 'nuria', 'lidia', 'silvia', 'beatriz', 'alba', 'claudia', 'diana', 'elena', 'emma',
  'gabriela', 'ines', 'inés', 'julia', 'lara', 'marta', 'nerea', 'olga', 'pilar', 'rocio', 'rocío',
  'rosa', 'sara', 'teresa', 'ana', 'eva', 'maria', 'maría', 'google español',
];

const MALE_VOICES = [
  'male', 'hombre', 'masculino', 'pablo', 'raul', 'raúl', 'jorge', 'diego', 'enrique', 'carlos',
  'juan', 'pedro', 'miguel', 'alejandro', 'ivan', 'iván', 'alvaro', 'álvaro', 'dario', 'darío',
  'javier', 'sergio', 'andres', 'andrés', 'fernando', 'ricardo', 'arturo', 'emilio', 'hector',
  'héctor', 'mario', 'oscar', 'óscar', 'ruben', 'rubén', 'tomas', 'tomás', 'victor', 'víctor',
  'antonio', 'jose', 'josé', 'luis', 'manuel', 'francisco', 'jesus', 'jesús', 'alberto', 'ramon',
  'ramón', 'gerardo', 'rodrigo', 'gonzalo', 'julian', 'julián', 'matias', 'matías', 'nestor', 'néstor',
];

function nameHas(voice: SpeechSynthesisVoice, hints: string[]): boolean {
  const name = voice.name.toLowerCase();
  return hints.some((h) => name.includes(h));
}

/** Elige entre las voces disponibles una que coincida con el género; prioriza español. */
export function pickVoiceForGender(
  voices: SpeechSynthesisVoice[],
  gender: CharacterGender,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  const pool = spanish.length > 0 ? spanish : voices;

  if (gender === 'female') {
    return (
      pool.find((v) => nameHas(v, FEMALE_VOICES)) ??
      pool.find((v) => !nameHas(v, MALE_VOICES)) ??
      pool[0]
    );
  }
  if (gender === 'male') {
    return (
      pool.find((v) => nameHas(v, MALE_VOICES)) ??
      pool.find((v) => !nameHas(v, FEMALE_VOICES)) ??
      pool[0]
    );
  }
  return pool.find((v) => v.default) ?? pool[0];
}
