import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from '../types';

export interface PageRequest {
  offset: number;
  limit: number;
  signal: AbortSignal;
}

/** Lista paginada con "Cargar más" (limit/offset). Se reinicia al cambiar `deps`. */
export function usePagedList<T>(fetchPage: (req: PageRequest) => Promise<Paginated<T>>, deps: unknown[], pageSize = 24) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<Error | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const ctrlRef = useRef<AbortController | null>(null);
  const lenRef = useRef(0);
  lenRef.current = items.length;

  useEffect(() => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setError(undefined);
    setMoreError(undefined);
    setMoreLoading(false);
    fetchRef
      .current({ offset: 0, limit: pageSize, signal: ctrl.signal })
      .then((p) => {
        if (ctrl.signal.aborted) return;
        setItems(p.items);
        setTotal(p.total);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setItems([]);
        setTotal(0);
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, pageSize]);

  const loadMore = useCallback(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl || ctrl.signal.aborted) return;
    setMoreLoading(true);
    setMoreError(undefined);
    fetchRef
      .current({ offset: lenRef.current, limit: pageSize, signal: ctrl.signal })
      .then((p) => {
        if (ctrl.signal.aborted) return;
        setItems((prev) => [...prev, ...p.items]);
        setTotal(p.total);
        setMoreLoading(false);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setMoreError(e instanceof Error ? e : new Error(String(e)));
        setMoreLoading(false);
      });
  }, [pageSize]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { items, total, loading, error, moreLoading, moreError, loadMore, reload, setItems, setTotal, hasMore: items.length < total };
}
