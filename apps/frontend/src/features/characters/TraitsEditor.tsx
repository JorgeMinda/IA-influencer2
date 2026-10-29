import { useId, useState } from 'react';
import { addTrait, LIMITS } from './characterForm';

/** Rasgos invariantes como chips: Enter o «Añadir» los incorpora; cada chip se quita con su botón. */
export function TraitsEditor({ traits, onChange, error }: { traits: string[]; onChange: (t: string[]) => void; error?: string }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | undefined>();

  function add() {
    const r = addTrait(traits, draft);
    setLocalError(r.error);
    if (!r.error) {
      onChange(r.traits);
      setDraft('');
    }
  }
  const shown = localError ?? error;
  return (
    <div className="field">
      <label htmlFor={id}>Rasgos invariantes</label>
      <p className="hint" id={`${id}-hint`}>
        Lo que no debe cambiar nunca entre imágenes (hasta {LIMITS.traits}). {traits.length}/{LIMITS.traits}
      </p>
      {traits.length > 0 ? (
        <ul className="chips" aria-label="Rasgos añadidos">
          {traits.map((t) => (
            <li key={t} className="chip">
              <span>{t}</span>
              <button type="button" className="chip-x" aria-label={`Quitar rasgo: ${t}`} onClick={() => onChange(traits.filter((x) => x !== t))}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="field-row">
        <input
          id={id}
          className={`input${shown ? ' is-invalid' : ''}`}
          value={draft}
          placeholder="Por ejemplo: ojos verdes"
          aria-describedby={`${id}-hint${shown ? ` ${id}-err` : ''}`}
          aria-invalid={shown ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocalError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add}>
          Añadir
        </button>
      </div>
      {shown ? (
        <p className="error-text" id={`${id}-err`}>
          {shown}
        </p>
      ) : null}
    </div>
  );
}
