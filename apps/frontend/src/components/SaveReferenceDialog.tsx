import { useState, type FormEvent } from 'react';
import { SOURCE_NOTE_MAX, SOURCE_NOTE_MIN } from '../features/characters/referenceValidation';
import { validateNote } from '../features/characters/characterForm';
import { errorMessage } from '../lib/format';
import { referenceFromArtifact } from '../services/endpoints';
import type { ReferenceImage } from '../types';
import { Dialog } from './Dialog';
import { TextField } from './Fields';

/** Guarda un resultado como imagen de referencia; la nota de procedencia es obligatoria. */
export function SaveReferenceDialog({ characterId, artifactId, onClose, onSaved }: { characterId: string; artifactId: string; onClose: () => void; onSaved: (r: ReferenceImage) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validateNote(note, SOURCE_NOTE_MIN, SOURCE_NOTE_MAX);
    setError(err);
    if (err) return;
    setBusy(true);
    setApiError(null);
    try {
      const ref = await referenceFromArtifact(characterId, artifactId, note);
      onSaved(ref);
    } catch (e2) {
      setApiError(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Guardar como referencia" onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <p>La imagen pasará a las referencias del personaje. Anota su procedencia para saber de dónde sale y con qué permiso se usa.</p>
        <TextField label="Procedencia y permiso de uso" multiline rows={3} value={note} onChange={setNote} error={error} max={SOURCE_NOTE_MAX} hint="Por ejemplo: «Generada en el estudio, de mi propia creación»." />
        {apiError ? (
          <p className="notice notice-error" role="alert">
            {apiError}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar como referencia'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
