import { useState, type FormEvent } from 'react';
import { CloudConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { SelectField, TextField } from '../../components/Fields';
import { ErrorNotice, Skeleton, StatusBadge } from '../../components/Feedback';
import { ImageFrame } from '../../components/ImageFrame';
import { useProviders } from '../../hooks/useProviders';
import { destinationLabel, PRIORITY_LABEL } from '../../lib/format';
import { consistencyBatch } from '../../services/endpoints';
import type { Destination, GenerationJob, Priority } from '../../types';
import { getDestinationOptions, resolveDestination } from '../image-studio/destinationRules';
import { isActiveStatus, useJobPolling } from '../image-studio/useJobPolling';

/** Orden fijo del lote según el contrato. */
export const BATCH_LABELS = ['Retrato', 'Plano medio', 'Cuerpo completo', 'Escenario distinto'];

function ConsistencyTile({ initial, label }: { initial: GenerationJob; label: string }) {
  const { job: polled } = useJobPolling(initial);
  const job = polled ?? initial;
  const art = job.artifacts[0];
  return (
    <li className="tile">
      <div className="tile-media">
        {art ? (
          <ImageFrame src={art.thumbnail_url || art.image_url} alt={`${label}: resultado de la prueba de consistencia`} width={art.width} height={art.height} />
        ) : isActiveStatus(job.status) ? (
          <Skeleton h="100%" r={10} />
        ) : (
          <div className="frame frame-empty">
            <span className="frame-missing">{job.status === 'failed' ? job.error_message ?? 'Falló esta toma.' : 'Sin imagen.'}</span>
          </div>
        )}
      </div>
      <div className="tile-cap" role="status" aria-live="polite">
        <strong>{label}</strong>
        <StatusBadge status={job.status} />
      </div>
    </li>
  );
}

export function ConsistencyTest({ characterId, characterName }: { characterId: string; characterName: string }) {
  const { status } = useProviders();
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const [destination, setDestination] = useState<Destination>('auto');
  const [priority, setPriority] = useState<Priority>('balanced');
  const [confirmCloud, setConfirmCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [jobs, setJobs] = useState<GenerationJob[] | null>(null);
  const [batchKey, setBatchKey] = useState(0);

  const options = getDestinationOptions(status);
  const effective = resolveDestination(destination, options);

  async function run(cloudConfirmed: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await consistencyBatch(characterId, { base_prompt: base.trim() || undefined, destination: effective, priority }, cloudConfirmed);
      setJobs(r.jobs);
      setBatchKey((k) => k + 1);
      setOpen(false);
      setConfirmCloud(false);
    } catch (e) {
      setError(e);
      setConfirmCloud(false);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (effective === 'cloud') {
      setConfirmCloud(true);
      return;
    }
    run(false).catch(() => {});
  }

  return (
    <section className="section" aria-labelledby="consistency-h">
      <div className="section-head">
        <h2 id="consistency-h">Prueba de consistencia</h2>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Probar consistencia
        </button>
      </div>
      <p className="hint">Genera cuatro tomas de {characterName} con la misma semilla para ver si se mantiene reconocible.</p>

      {jobs ? (
        <ul className="grid-2x2" key={batchKey} aria-label="Resultados de la prueba de consistencia">
          {jobs.map((j, i) => (
            <ConsistencyTile key={j.id} initial={j} label={BATCH_LABELS[i] ?? `Toma ${i + 1}`} />
          ))}
        </ul>
      ) : null}

      {open ? (
        <Dialog title="Probar consistencia" onClose={() => !busy && setOpen(false)}>
          <form className="stack" onSubmit={submit} noValidate>
            <TextField label="Idea base (opcional)" multiline rows={3} value={base} onChange={setBase} hint="Un contexto común para las cuatro tomas. Déjalo vacío para usar solo la ficha." />
            <fieldset className="radios">
              <legend>Destino</legend>
              {options.map((o) => (
                <label key={o.value} className={`radio${o.enabled ? '' : ' is-disabled'}`}>
                  <input type="radio" name="batch-dest" value={o.value} checked={effective === o.value} disabled={!o.enabled} onChange={() => setDestination(o.value)} />
                  <span>
                    <strong>{o.label}</strong>
                    <small>{o.enabled ? o.description : `No disponible: ${o.reason}`}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <SelectField label="Prioridad" value={priority} onChange={(v) => setPriority(v as Priority)} options={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
            <p className="route-line">
              Se procesará en: <strong>{destinationLabel(effective)}</strong>
            </p>
            {error ? <ErrorNotice error={error} /> : null}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Creando…' : 'Crear las 4 tomas'}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
      {confirmCloud ? <CloudConfirmDialog provider={status?.cloud.provider} onCancel={() => setConfirmCloud(false)} onConfirm={() => run(true)} /> : null}
    </section>
  );
}
