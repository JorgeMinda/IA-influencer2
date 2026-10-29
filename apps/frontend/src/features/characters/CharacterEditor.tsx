import { useState, type FormEvent } from 'react';
import { TextField } from '../../components/Fields';
import { ErrorNotice } from '../../components/Feedback';
import { useToast } from '../../components/Toast';
import { updateCharacter } from '../../services/endpoints';
import type { Character } from '../../types';
import { LIMITS, validateCharacterForm, type CharacterFormErrors } from './characterForm';
import { TraitsEditor } from './TraitsEditor';

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function CharacterEditor({ character, onSaved }: { character: Character; onSaved: (c: Character) => void }) {
  const { notify } = useToast();
  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.visual_description);
  const [traits, setTraits] = useState(character.invariant_traits);
  const [notes, setNotes] = useState(character.notes);
  const [errors, setErrors] = useState<CharacterFormErrors>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const dirty = name !== character.name || description !== character.visual_description || notes !== character.notes || !sameList(traits, character.invariant_traits);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateCharacterForm({ name, visualDescription: description, traits, notes });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setApiError(null);
    try {
      const saved = await updateCharacter(character.id, { name: name.trim(), visual_description: description, invariant_traits: traits, notes });
      onSaved(saved);
      notify('Cambios guardados.');
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-label="Ficha del personaje">
      <TextField label="Nombre" value={name} onChange={setName} error={errors.name} max={LIMITS.name} required />
      <TextField label="Descripción visual" multiline rows={4} value={description} onChange={setDescription} error={errors.visualDescription} max={LIMITS.description} hint="Cómo se ve: pelo, ojos, piel, ropa habitual. Se añade a cada prompt." />
      <TraitsEditor traits={traits} onChange={setTraits} error={errors.traits} />
      <TextField label="Notas" multiline rows={3} value={notes} onChange={setNotes} error={errors.notes} max={LIMITS.notes} hint="Solo para ti: historia, tono, ideas." />
      {apiError ? <ErrorNotice error={apiError} title="No se pudieron guardar los cambios." /> : null}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {dirty ? <span className="hint">Hay cambios sin guardar.</span> : null}
      </div>
    </form>
  );
}
