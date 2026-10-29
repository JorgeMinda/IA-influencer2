import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { SelectField, TextField } from '../components/Fields';
import { useToast } from '../components/Toast';
import { useAsync } from '../hooks/useAsync';
import { useProviders } from '../hooks/useProviders';
import { destinationLabel, PRIORITY_LABEL } from '../lib/format';
import { createGeneration, listCharacters } from '../services/endpoints';
import type { Character, Destination, GenerationJob, Priority } from '../types';
import { getDestinationOptions, resolveDestination, requiresCloudConfirmation } from '../features/image-studio/destinationRules';
import { GenerationFormValues, validateGenerationForm, toGenerationInput } from '../features/image-studio/generationForm';
import { routeSummary } from '../features/image-studio/routeSummary';
import { CloudConfirmDialog } from '../components/ConfirmDialog';
import { JobCard } from '../features/image-studio/JobCard';
import { SIZE_OPTIONS } from '../features/image-studio/generationForm';

const DEFAULT_FORM: GenerationFormValues = {
  characterId: '',
  prompt: '',
  negativePrompt: '',
  width: 768,
  height: 768,
  seed: '',
  priority: 'balanced',
  destination: 'auto',
};

export function StudioPage() {
  const [searchParams] = useSearchParams();
  const { notify } = useToast();
  const { status: providerStatus } = useProviders();
  const characters = useAsync((signal) => listCharacters({ limit: 200 }, { signal }), []);
  const [form, setForm] = useState<GenerationFormValues>(DEFAULT_FORM);
  const [errors, setErrors] = useState<ReturnType<typeof validateGenerationForm>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);
  const [confirmCloud, setConfirmCloud] = useState(false);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);

  useEffect(() => {
    const pid = searchParams.get('personaje');
    if (pid) setForm((f) => ({ ...f, characterId: pid }));
  }, [searchParams]);

  const options = getDestinationOptions(providerStatus);
  const effectiveDestination = resolveDestination(form.destination, options);

  async function submit(cloudConfirmed: boolean) {
    const errs = validateGenerationForm({ ...form, destination: effectiveDestination });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setApiError(null);
    try {
      const input = toGenerationInput({ ...form, destination: effectiveDestination });
      const job = await createGeneration(input, cloudConfirmed);
      setJobs((prev) => [job, ...prev]);
      setForm((f) => ({ ...f, prompt: '', negativePrompt: '', seed: '' }));
      notify('Tarea creada. Se procesa en segundo plano.');
    } catch (e) {
      setApiError(e);
    } finally {
      setBusy(false);
      setConfirmCloud(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (requiresCloudConfirmation(effectiveDestination)) {
      setConfirmCloud(true);
      return;
    }
    submit(false).catch(() => {});
  }

  const charList = characters.data?.items ?? [];
  const selectedChar = charList.find((c) => c.id === form.characterId);

  return (
    <>
      <div className="page-head">
        <h1>Estudio de imágenes</h1>
      </div>

      <div className="studio-layout">
        <form className="card stack" onSubmit={handleSubmit} noValidate aria-label="Nueva generación">
          <h2>Nueva generación</h2>

          <div className="field">
            <label htmlFor="char-select">Personaje</label>
            {characters.loading ? (
              <Skeleton h={40} />
            ) : (
              <select
                id="char-select"
                className={`input${errors.characterId ? ' is-invalid' : ''}`}
                value={form.characterId}
                onChange={(e) => setForm((f) => ({ ...f, characterId: e.target.value }))}
              >
                <option value="">Elige un personaje…</option>
                {charList.map((c: Character) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {errors.characterId ? <p className="error-text">{errors.characterId}</p> : null}
          </div>

          <TextField
            label="Prompt"
            multiline
            rows={4}
            value={form.prompt}
            onChange={(v) => setForm((f) => ({ ...f, prompt: v }))}
            error={errors.prompt}
            max={2000}
            hint="Describe la escena. Los rasgos del personaje se añaden automáticamente."
          />
          <TextField
            label="Prompt negativo (opcional)"
            multiline
            rows={2}
            value={form.negativePrompt}
            onChange={(v) => setForm((f) => ({ ...f, negativePrompt: v }))}
            error={errors.negativePrompt}
            max={1000}
          />

          <div className="field-row">
            <div className="field">
              <label htmlFor="width">Ancho</label>
              <select
                id="width"
                className="input"
                value={form.width}
                onChange={(e) => setForm((f) => ({ ...f, width: Number(e.target.value) }))}
              >
                {SIZE_OPTIONS.map((n: number) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="height">Alto</label>
              <select
                id="height"
                className="input"
                value={form.height}
                onChange={(e) => setForm((f) => ({ ...f, height: Number(e.target.value) }))}
              >
                {SIZE_OPTIONS.map((n: number) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {errors.size ? <p className="error-text">{errors.size}</p> : null}

          <TextField
            label="Semilla (opcional)"
            type="number"
            inputMode="numeric"
            value={form.seed}
            onChange={(v) => setForm((f) => ({ ...f, seed: v }))}
            error={errors.seed}
            hint="Deja vacío para que el servidor genere una. Misma semilla = resultados más parecidos."
          />

          <SelectField
            label="Prioridad"
            value={form.priority}
            onChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}
            options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          />

          <fieldset className="radios">
            <legend>Destino</legend>
            {options.map((o) => (
              <label key={o.value} className={`radio${o.enabled ? '' : ' is-disabled'}`}>
                <input
                  type="radio"
                  name="dest"
                  value={o.value}
                  checked={form.destination === o.value}
                  disabled={!o.enabled}
                  onChange={() => setForm((f) => ({ ...f, destination: o.value as Destination }))}
                />
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.enabled ? o.description : `No disponible: ${o.reason}`}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <p className="route-line">
            Se procesará en: <strong>{destinationLabel(effectiveDestination)}</strong>
            <br />
            <small>{routeSummary(effectiveDestination, providerStatus)}</small>
          </p>

          {apiError ? <ErrorNotice error={apiError} title="No se pudo crear la tarea." /> : null}

          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Creando…' : 'Generar imagen'}
            </button>
          </div>
        </form>

        <div className="jobs-column">
          <h2>Tareas recientes</h2>
          {jobs.length === 0 ? (
            <EmptyState title="Sin tareas todavía">Crea tu primera generación con el formulario.</EmptyState>
          ) : (
            <ul className="job-list">
              {jobs.map((j) => (
                <li key={j.id}>
                  <JobCard initial={j} characterName={selectedChar?.name} onNewJob={(nj: GenerationJob) => setJobs((prev) => [nj, ...prev])} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmCloud ? (
        <CloudConfirmDialog
          provider={providerStatus?.cloud.provider}
          onCancel={() => setConfirmCloud(false)}
          onConfirm={() => submit(true)}
        />
      ) : null}
    </>
  );
}
