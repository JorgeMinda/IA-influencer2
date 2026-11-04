import { describe, it, expect } from 'vitest';
import { validateReferenceForm, hasErrors, SOURCE_NOTE_MIN, SOURCE_NOTE_MAX } from './referenceValidation';

describe('validateReferenceForm', () => {
  it('exige archivo de imagen', () => {
    const res = validateReferenceForm({ file: null, sourceNote: 'Foto propia', rightsConfirmed: true });
    expect(res.file).toBe('Elige una imagen PNG, JPEG o WebP.');
    expect(hasErrors(res)).toBe(true);
  });

  it('rechaza formato no permitido', () => {
    const file = new File(['content'], 'test.gif', { type: 'image/gif' });
    const res = validateReferenceForm({ file, sourceNote: 'Foto propia', rightsConfirmed: true });
    expect(res.file).toBe('Formato no admitido. Usa PNG, JPEG o WebP.');
  });

  it('valida límite de tamaño de archivo', () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024)], 'test.png', { type: 'image/png' });
    const res = validateReferenceForm({ file, sourceNote: 'Foto propia', rightsConfirmed: true }, 4);
    expect(res.file).toBe('La imagen supera el máximo de 4 MB.');
  });

  it('valida nota de procedencia', () => {
    const file = new File(['abc'], 'test.png', { type: 'image/png' });
    const resShort = validateReferenceForm({ file, sourceNote: 'ab', rightsConfirmed: true });
    expect(resShort.sourceNote).toContain(`mínimo ${SOURCE_NOTE_MIN}`);

    const resLong = validateReferenceForm({ file, sourceNote: 'x'.repeat(SOURCE_NOTE_MAX + 1), rightsConfirmed: true });
    expect(resLong.sourceNote).toBe(`Máximo ${SOURCE_NOTE_MAX} caracteres.`);
  });

  it('exige confirmación de derechos', () => {
    const file = new File(['abc'], 'test.png', { type: 'image/png' });
    const res = validateReferenceForm({ file, sourceNote: 'Foto propia autorizada', rightsConfirmed: false });
    expect(res.rightsConfirmed).toBe('Debes confirmar que tienes los derechos o el consentimiento.');
  });

  it('pasa con todos los campos válidos', () => {
    const file = new File(['abc'], 'test.png', { type: 'image/png' });
    const res = validateReferenceForm({ file, sourceNote: 'Foto propia autorizada', rightsConfirmed: true });
    expect(hasErrors(res)).toBe(false);
  });
});
