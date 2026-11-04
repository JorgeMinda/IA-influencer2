import { describe, it, expect } from 'vitest';
import { validateCharacterForm, addTrait, validateNote, LIMITS } from './characterForm';

describe('validateCharacterForm', () => {
  it('valida nombre obligatorio y límites', () => {
    expect(validateCharacterForm({ name: '', visualDescription: '', traits: [], notes: '' }).name).toBe('Escribe un nombre.');
    expect(validateCharacterForm({ name: 'a'.repeat(LIMITS.name + 1), visualDescription: '', traits: [], notes: '' }).name).toBe(`Máximo ${LIMITS.name} caracteres.`);
    expect(validateCharacterForm({ name: 'Luna', visualDescription: '', traits: [], notes: '' }).name).toBeUndefined();
  });

  it('valida límites de descripción y notas', () => {
    expect(validateCharacterForm({ name: 'Luna', visualDescription: 'x'.repeat(LIMITS.description + 1), traits: [], notes: '' }).visualDescription).toBe(`Máximo ${LIMITS.description} caracteres.`);
    expect(validateCharacterForm({ name: 'Luna', visualDescription: '', traits: [], notes: 'y'.repeat(LIMITS.notes + 1) }).notes).toBe(`Máximo ${LIMITS.notes} caracteres.`);
  });

  it('valida rasgos dentro de límites', () => {
    const tooManyTraits = Array.from({ length: LIMITS.traits + 1 }, (_, i) => `rasgo ${i}`);
    expect(validateCharacterForm({ name: 'Luna', visualDescription: '', traits: tooManyTraits, notes: '' }).traits).toBe(`Máximo ${LIMITS.traits} rasgos.`);
  });
});

describe('addTrait', () => {
  it('añade rasgos válidos sin duplicar ni espacios sobrantes', () => {
    const res1 = addTrait([], '  ojos verdes  ');
    expect(res1.traits).toEqual(['ojos verdes']);
    expect(res1.error).toBeUndefined();

    const res2 = addTrait(res1.traits, 'OJOS VERDES');
    expect(res2.traits).toHaveLength(1);
    expect(res2.error).toBe('Ese rasgo ya está en la lista.');
  });

  it('ignora rasgo vacío', () => {
    expect(addTrait(['pelo castaño'], '   ').traits).toEqual(['pelo castaño']);
  });
});

describe('validateNote', () => {
  it('valida longitud mínima y máxima', () => {
    expect(validateNote('ab', 3, 50)).toBe('Escribe al menos 3 caracteres.');
    expect(validateNote('abc', 3, 50)).toBeUndefined();
    expect(validateNote('a'.repeat(51), 3, 50)).toBe('Máximo 50 caracteres.');
  });
});
