import { describe, it, expect } from 'vitest';
import { characterVoiceGender, inferVoiceGender } from './voiceGender';

describe('inferVoiceGender', () => {
  it('detecta femenino por artículo y adjetivo', () => {
    expect(inferVoiceGender('Fotografía editorial de una supermodelo influencer adulta')).toBe('female');
  });

  it('detecta masculino por artículo y adjetivo', () => {
    expect(inferVoiceGender('un supermodelo influencer adulto')).toBe('male');
  });

  it('devuelve null si no hay señal suficiente', () => {
    expect(inferVoiceGender('Jade')).toBeNull();
    expect(inferVoiceGender('')).toBeNull();
  });
});

describe('characterVoiceGender', () => {
  const base = { name: 'Jade', invariant_traits: [], notes: '' };

  it('respeta el campo explícito aunque la descripción diga otra cosa', () => {
    expect(
      characterVoiceGender({ ...base, visual_description: 'una mujer adulta', gender: 'male' }),
    ).toBe('male');
  });

  it('infiere el género cuando está sin especificar', () => {
    expect(
      characterVoiceGender({ ...base, visual_description: 'una supermodelo influencer adulta', gender: 'unspecified' }),
    ).toBe('female');
  });

  it('devuelve unspecified si no hay campo ni señal', () => {
    expect(characterVoiceGender({ ...base, visual_description: '' })).toBe('unspecified');
    expect(characterVoiceGender(null)).toBe('unspecified');
  });
});
