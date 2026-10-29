export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const SOURCE_NOTE_MIN = 3;
export const SOURCE_NOTE_MAX = 500;

export interface ReferenceFormValues {
  file: File | null;
  sourceNote: string;
  rightsConfirmed: boolean;
}
export interface ReferenceFormErrors {
  file?: string;
  sourceNote?: string;
  rightsConfirmed?: string;
}

export function validateReferenceForm(v: ReferenceFormValues, maxUploadMb?: number): ReferenceFormErrors {
  const errors: ReferenceFormErrors = {};
  if (!v.file) errors.file = 'Elige una imagen PNG, JPEG o WebP.';
  else if (!ALLOWED_IMAGE_TYPES.includes(v.file.type)) errors.file = 'Formato no admitido. Usa PNG, JPEG o WebP.';
  else if (maxUploadMb && v.file.size > maxUploadMb * 1024 * 1024) errors.file = `La imagen supera el máximo de ${maxUploadMb} MB.`;

  const note = v.sourceNote.trim();
  if (note.length < SOURCE_NOTE_MIN) errors.sourceNote = `Indica la procedencia y el permiso de uso (mínimo ${SOURCE_NOTE_MIN} caracteres).`;
  else if (note.length > SOURCE_NOTE_MAX) errors.sourceNote = `Máximo ${SOURCE_NOTE_MAX} caracteres.`;

  if (!v.rightsConfirmed) errors.rightsConfirmed = 'Debes confirmar que tienes los derechos o el consentimiento.';
  return errors;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;
