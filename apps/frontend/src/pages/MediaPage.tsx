import { useState } from 'react';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { TextField } from '../components/Fields';
import { useToast } from '../components/Toast';
import { useAsync } from '../hooks/useAsync';
import { listCharacters } from '../services/endpoints';
import type { Character } from '../types';
import { createVideo, createDance, createFaceswap } from '../services/endpoints';
import { ApiError } from '../services/api';

export function MediaPage() {
  const { notify } = useToast();
  const characters = useAsync((signal) => listCharacters({ limit: 200 }, { signal }), []);
  const [characterId, setCharacterId] = useState('');
  const [prompt, setPrompt] = useState('Un video corto del personaje caminando.');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run(kind: 'video' | 'dance' | 'faceswap') {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      if (kind === 'video') {
        await createVideo({ character_id: characterId, prompt });
      } else if (kind === 'dance') {
        await createDance({ character_id: characterId, reference_image_id: '00000000-0000-0000-0000-000000000000' });
      } else {
        await createFaceswap({ source_image_id: '00000000-0000-0000-0000-000000000000', target_image_id: '00000000-0000-0000-0000-000000000000' });
      }
      setResult('Trabajo creado.');
      notify('Trabajo creado.');
    } catch (e) {
      setError(e);
      if (e instanceof ApiError) {
        setResult(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Video, baile y faceswap</h1>
        <span className="hint">Próximamente — requiere ComfyUI con GPU.</span>
      </div>

      <div className="card stack" aria-label="Generación de video">
        <h2>Generar</h2>
        <div className="field">
          <label htmlFor="media-char">Personaje</label>
          {characters.loading ? (
            <Skeleton h={40} />
          ) : (
            <select
              id="media-char"
              className="input"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
            >
              <option value="">Elige un personaje…</option>
              {(characters.data?.items ?? []).map((c: Character) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <TextField label="Prompt (video)" multiline rows={3} value={prompt} onChange={setPrompt} max={2000} />
        {error ? <ErrorNotice error={error} title="No se pudo crear el trabajo." /> : null}
        {result ? <p className="hint">{result}</p> : null}
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy || !characterId} onClick={() => run('video')}>
            {busy ? 'Creando…' : 'Crear video'}
          </button>
          <button type="button" className="btn" disabled={busy || !characterId} onClick={() => run('dance')}>
            Baile
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run('faceswap')}>
            Faceswap
          </button>
        </div>
      </div>

      <EmptyState title="Sin motor de video disponible">
        Estos botones llaman al backend, que devuelve <code>503 provider_unavailable</code> hasta que conectes ComfyUI con GPU.
        La validación de los formularios (422) sí se ejecuta.
      </EmptyState>
    </>
  );
}