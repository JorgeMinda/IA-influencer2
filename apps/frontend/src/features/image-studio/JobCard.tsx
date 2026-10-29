import { useState } from 'react';
import { CloudConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorNotice, Skeleton, StatusBadge } from '../../components/Feedback';
import { ImageFrame } from '../../components/ImageFrame';
import { SaveReferenceDialog } from '../../components/SaveReferenceDialog';
import { useToast } from '../../components/Toast';
import { destinationLabel, engineLabel, formatDate, PRIORITY_LABEL } from '../../lib/format';
import { fileUrl } from '../../services/api';
import { cancelGeneration, retryGeneration, updateArtifact } from '../../services/endpoints';
import type { GenerationArtifact, GenerationJob } from '../../types';
import { isActiveStatus, useJobPolling } from './useJobPolling';

export function DownloadLink({ artifact, label = 'Descargar' }: { artifact: GenerationArtifact; label?: string }) {
  return (
    <a className="btn btn-small" href={fileUrl(artifact.image_url)} download={`creator-studio-${artifact.id.slice(0, 8)}.png`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

function usedLine(job: GenerationJob): string {
  if (!job.destination_used) return 'Destino: se está asignando…';
  return isActiveStatus(job.status) ? `Se procesa en: ${destinationLabel(job.destination_used)}` : `Procesada en: ${destinationLabel(job.destination_used)}`;
}

/** Tarjeta de un trabajo: se actualiza sola con sondeo, con cancelar, reintentar y acciones sobre el resultado. */
export function JobCard({ initial, characterName, onNewJob }: { initial: GenerationJob; characterName?: string; onNewJob: (j: GenerationJob) => void }) {
  const { job: polled, setJob, issue } = useJobPolling(initial);
  const job = polled ?? initial;
  const { notify } = useToast();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [saveFor, setSaveFor] = useState<GenerationArtifact | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      setJob(await cancelGeneration(job.id));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function retry(cloudConfirmed: boolean) {
    const next = await retryGeneration(job.id, cloudConfirmed);
    onNewJob(next);
  }
  async function startRetry() {
    if (job.destination_used === 'cloud' || job.destination_requested === 'cloud') {
      setConfirmRetry(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await retry(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSelected(a: GenerationArtifact) {
    setError(null);
    try {
      const updated = await updateArtifact(a.id, { selected: !a.selected });
      setJob((j) => (j ? { ...j, artifacts: j.artifacts.map((x) => (x.id === a.id ? { ...x, selected: updated.selected } : x)) } : j));
    } catch (e) {
      setError(e);
    }
  }

  return (
    <article className="card job" aria-label={`Trabajo de ${characterName ?? 'personaje'}`}>
      <div className="job-head">
        <div role="status" aria-live="polite" className="job-status">
          <StatusBadge status={job.status} />
        </div>
        <p className="job-where">{usedLine(job)}</p>
      </div>

      {isActiveStatus(job.status) ? (
        <div className="job-progress">
          <Skeleton h={160} r={10} />
          <p className="hint">{job.status === 'pending' ? 'En cola. Empezará cuando haya un hueco libre.' : 'Generando la imagen…'}</p>
        </div>
      ) : null}

      {issue ? <p className="hint warn-text">No se pudo actualizar el estado ahora mismo. Seguimos intentándolo.</p> : null}

      {job.status === 'failed' ? (
        <p className="notice notice-error" role="alert">
          {job.error_message ?? 'La tarea falló. Puedes reintentarla.'}
        </p>
      ) : null}
      {job.status === 'cancelled' ? <p className="hint">Cancelaste esta tarea antes de empezar.</p> : null}

      {job.artifacts.length > 0 ? (
        <ul className="artifact-list">
          {job.artifacts.map((a) => (
            <li key={a.id}>
              <ImageFrame src={a.image_url} alt={`Resultado: ${job.prompt.slice(0, 80)}`} width={a.width} height={a.height} />
              <div className="actions">
                <button type="button" className="btn btn-small" aria-pressed={a.selected} onClick={() => toggleSelected(a)}>
                  {a.selected ? 'Quitar de seleccionadas' : 'Marcar como seleccionada'}
                </button>
                <button type="button" className="btn btn-small" onClick={() => setSaveFor(a)}>
                  Guardar como referencia
                </button>
                <DownloadLink artifact={a} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="meta">
        <div>
          <dt>Motor</dt>
          <dd>{engineLabel(job.engine)}</dd>
        </div>
        <div>
          <dt>Modelo</dt>
          <dd>{job.model || '—'}</dd>
        </div>
        <div>
          <dt>Semilla</dt>
          <dd>{job.seed}</dd>
        </div>
        <div>
          <dt>Tamaño</dt>
          <dd>
            {job.width}×{job.height}
          </dd>
        </div>
        <div>
          <dt>Prioridad</dt>
          <dd>{PRIORITY_LABEL[job.priority] ?? job.priority}</dd>
        </div>
        <div>
          <dt>Creada</dt>
          <dd>{formatDate(job.created_at)}</dd>
        </div>
      </dl>
      <p className="prompt-excerpt">{job.prompt}</p>

      {error ? <ErrorNotice error={error} /> : null}

      <div className="actions">
        {job.status === 'pending' ? (
          <button type="button" className="btn" onClick={cancel} disabled={busy}>
            Cancelar tarea
          </button>
        ) : null}
        {job.status === 'failed' ? (
          <button type="button" className="btn btn-primary" onClick={startRetry} disabled={busy}>
            Reintentar
          </button>
        ) : null}
      </div>

      {confirmRetry ? (
        <CloudConfirmDialog
          onCancel={() => setConfirmRetry(false)}
          onConfirm={async () => {
            await retry(true);
            setConfirmRetry(false);
          }}
        />
      ) : null}
      {saveFor ? (
        <SaveReferenceDialog
          characterId={job.character_id}
          artifactId={saveFor.id}
          onClose={() => setSaveFor(null)}
          onSaved={() => {
            setSaveFor(null);
            notify('Guardada como referencia del personaje.');
          }}
        />
      ) : null}
    </article>
  );
}
