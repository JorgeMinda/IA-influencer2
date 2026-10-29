import { useRef, useState, type FormEvent } from 'react';
import { CheckField, TextField } from '../../components/Fields';
import { ErrorNotice } from '../../components/Feedback';
import { uploadReference } from '../../services/endpoints';
import type { ReferenceImage } from '../../types';
import { hasErrors, SOURCE_NOTE_MAX, validateReferenceForm, type ReferenceFormErrors } from './referenceValidation';

/** Subida de una referencia. Sin la casilla de derechos marcada (o con errores) no se envía nada. */
export function ReferenceUploadForm({ characterId, maxUploadMb, onUploaded }: { characterId: string; maxUploadMb?: number; onUploaded: (r: ReferenceImage) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceNote, setSourceNote] = useState('');
  const [rights, setRights] = useState(false);
  const [errors, setErrors] = useState<ReferenceFormErrors>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateReferenceForm({ file, sourceNote, rightsConfirmed: rights }, maxUploadMb);
    setErrors(errs);
    if (hasErrors(errs) || !file) return;
    setBusy(true);
    setApiError(null);
    try {
      const ref = await uploadReference(characterId, file, sourceNote, rights);
      setFile(null);
      setSourceNote('');
      setRights(false);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded(ref);
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-label="Subir imagen de referencia">
      <h3>Añadir una referencia</h3>
      <div className="field">
        <label htmlFor="ref-file">Imagen (PNG, JPEG o WebP{maxUploadMb ? `, hasta ${maxUploadMb} MB` : ''})</label>
        <input
          id="ref-file"
          ref={fileRef}
          className={`input${errors.file ? ' is-invalid' : ''}`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={errors.file ? 'ref-file-err' : undefined}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {errors.file ? (
          <p className="error-text" id="ref-file-err">
            {errors.file}
          </p>
        ) : null}
      </div>
      <TextField label="Procedencia y permiso de uso" multiline rows={3} value={sourceNote} onChange={setSourceNote} error={errors.sourceNote} max={SOURCE_NOTE_MAX} hint="De dónde viene la imagen y quién autoriza usarla." />
      <CheckField label="Confirmo que tengo los derechos o el consentimiento de las personas que aparecen para usar esta imagen." checked={rights} onChange={setRights} error={errors.rightsConfirmed} />
      <p className="hint">El servidor vuelve a comprobar el archivo, le quita los metadatos y lo guarda con un nombre nuevo.</p>
      {apiError ? <ErrorNotice error={apiError} title="No se pudo subir la imagen." /> : null}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Subiendo…' : 'Subir referencia'}
        </button>
      </div>
    </form>
  );
}
