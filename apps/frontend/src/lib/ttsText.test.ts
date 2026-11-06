import { describe, it, expect } from 'vitest';
import { cleanForSpeech, splitIntoSentences, varyRate } from './ttsText';

describe('cleanForSpeech', () => {
  it('quita emojis', () => {
    expect(cleanForSpeech('Hola 👋 cómo estás 😊')).toBe('Hola cómo estás');
  });

  it('quita markdown y asteriscos', () => {
    expect(cleanForSpeech('**Hola** _mundo_ # titulo')).toBe('Hola mundo titulo');
  });

  it('quita URLs', () => {
    expect(cleanForSpeech('Mira https://example.com/path y sigue')).toBe('Mira y sigue');
  });

  it('quita viñetas de lista', () => {
    expect(cleanForSpeech('- primer\n* segundo')).toBe('primer\nsegundo');
  });

  it('colapsa espacios repetidos', () => {
    expect(cleanForSpeech('hola   mundo    \n\n  aquí')).toBe('hola mundo aquí');
  });

  it('devuelve cadena vacía para entrada vacía', () => {
    expect(cleanForSpeech('')).toBe('');
  });
});

describe('splitIntoSentences', () => {
  it('divide por punto', () => {
    expect(splitIntoSentences('Hola mundo. Adiós.')).toEqual(['Hola mundo.', 'Adiós.']);
  });

  it('divide por exclamación e interrogación', () => {
    expect(splitIntoSentences('Hola! ¿Cómo estás? Bien.')).toEqual(['Hola!', '¿Cómo estás?', 'Bien.']);
  });

  it('divide por saltos de línea', () => {
    expect(splitIntoSentences('Primera línea\nSegunda línea.')).toEqual(['Primera línea.', 'Segunda línea.']);
  });

  it('devuelve el texto completo si no hay puntuación', () => {
    expect(splitIntoSentences('sin puntuacion')).toEqual(['sin puntuacion']);
  });

  it('devuelve vacío para texto vacío', () => {
    expect(splitIntoSentences('')).toEqual([]);
  });
});

describe('varyRate', () => {
  it('mantiene el valor dentro del rango', () => {
    for (let i = 0; i < 20; i++) {
      const v = varyRate(1.0, i);
      expect(v).toBeGreaterThanOrEqual(0.7);
      expect(v).toBeLessThanOrEqual(1.3);
    }
  });

  it('aplica variación distinta por índice', () => {
    const a = varyRate(1.0, 0);
    const b = varyRate(1.0, 1);
    expect(a).not.toBe(b);
  });

  it('acota valores extremos', () => {
    expect(varyRate(1.3, 0)).toBeLessThanOrEqual(1.3);
    expect(varyRate(0.7, 1)).toBeGreaterThanOrEqual(0.7);
  });
});