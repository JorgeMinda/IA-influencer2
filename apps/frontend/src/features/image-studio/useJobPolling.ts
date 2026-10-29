import { useEffect, useState } from 'react';
import { ApiError } from '../../services/api';
import { getGeneration } from '../../services/endpoints';
import type { GenerationJob, JobStatus } from '../../types';

export const POLL_MS = 1500;
export const MAX_BACKOFF_MS = 15000;

export const isActiveStatus = (s: JobStatus) => s === 'pending' || s === 'processing';

/** Espera hasta el siguiente sondeo: 1,5 s normal; con fallos de red se duplica hasta 15 s. */
export function nextPollDelay(failures: number): number {
  if (failures <= 0) return POLL_MS;
  return Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
}

/** Sondea la tarea mientras esté pending/processing; se detiene al terminar o al desmontar. */
export function useJobPolling(initial: GenerationJob | null = null) {
  const [job, setJob] = useState<GenerationJob | null>(initial);
  const [issue, setIssue] = useState<Error | null>(null);
  const jobId = job?.id;
  const active = job ? isActiveStatus(job.status) : false;

  useEffect(() => {
    if (!jobId || !active) return;
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();

    const tick = async () => {
      try {
        const next = await getGeneration(jobId, { signal: ctrl.signal });
        if (cancelled) return;
        failures = 0;
        setIssue(null);
        setJob(next);
        if (!isActiveStatus(next.status)) return;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          setIssue(e);
          return;
        }
        failures += 1;
        setIssue(e instanceof Error ? e : new Error(String(e)));
      }
      timer = setTimeout(tick, nextPollDelay(failures));
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ctrl.abort();
    };
  }, [jobId, active]);

  return { job, setJob, issue, clearIssue: () => setIssue(null) };
}
