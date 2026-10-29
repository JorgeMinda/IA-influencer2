import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { ImageFrame } from '../components/ImageFrame';
import { useToast } from '../components/Toast';
import { usePagedList } from '../hooks/usePagedList';
import { formatDate } from '../lib/format';
import { fileUrl } from '../services/api';
import { deleteArtifact, listGallery, updateArtifact } from '../services/endpoints';
import type { GalleryItem } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function GalleryPage() {
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [toDelete, setToDelete] = useState<GalleryItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const charFilter = searchParams.get('personaje') ?? undefined;

  const gallery = usePagedList<GalleryItem>(
    (p) =>
      listGallery(
        {
          character_id: charFilter,
          selected: selectedOnly ? true : undefined,
          limit: p.limit,
          offset: p.offset,
        },
        { signal: p.signal },
      ),
    [charFilter, selectedOnly],
    24,
  );

  async function toggleSelected(item: GalleryItem) {
    setBusyId(item.id);
    try {
      const updated = await updateArtifact(item.id, { selected: !item.selected });
      gallery.setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, selected: updated.selected } : x)));
      notify(updated.selected ? 'Marcada como seleccionada.' : 'Desmarcada.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo actualizar.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Galería</h1>
      </div>

      <div className="toolbar">
        <label className="check toolbar-check">
          <input type="checkbox" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />
          <span>Solo seleccionadas</span>
        </label>
      </div>

      {gallery.loading ? (
        <div className="thumb-grid" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={200} r={10} />
          ))}
        </div>
      ) : gallery.error ? (
        <ErrorNotice error={gallery.error} title="No se pudo cargar la galería." onRetry={gallery.reload} />
      ) : gallery.items.length === 0 ? (
        <EmptyState title="Sin resultados todavía">Genera imágenes en el estudio para verlas aquí.</EmptyState>
      ) : (
        <>
          <ul className="thumb-grid">
            {gallery.items.map((item) => (
              <li key={item.id} className={`thumb${item.selected ? ' is-selected' : ''}`}>
                <ImageFrame src={item.thumbnail_url || item.image_url} alt={`Resultado: ${item.metadata.prompt.slice(0, 80)}`} width={item.width} height={item.height} />
                <div className="thumb-meta">
                  <p className="hint">{item.character_name}</p>
                  <p className="hint">{formatDate(item.job_created_at)}</p>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-pressed={item.selected}
                    onClick={() => toggleSelected(item)}
                    disabled={busyId === item.id}
                  >
                    {item.selected ? 'Quitar selección' : 'Seleccionar'}
                  </button>
                  <a className="btn btn-small" href={fileUrl(item.image_url)} download={`creator-studio-${item.id.slice(0, 8)}.png`} target="_blank" rel="noopener noreferrer">
                    Descargar
                  </a>
                  <button type="button" className="btn btn-small btn-danger-quiet" onClick={() => setToDelete(item)}>
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="more">
            <p className="hint">
              Mostrando {gallery.items.length} de {gallery.total}
            </p>
            {gallery.moreError ? <ErrorNotice error={gallery.moreError} /> : null}
            {gallery.hasMore ? (
              <button type="button" className="btn" onClick={gallery.loadMore} disabled={gallery.moreLoading}>
                {gallery.moreLoading ? 'Cargando…' : 'Cargar más'}
              </button>
            ) : null}
          </div>
        </>
      )}

      {toDelete ? (
        <ConfirmDialog
          title="Borrar resultado"
          confirmLabel="Borrar para siempre"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteArtifact(toDelete.id);
            gallery.setItems((prev) => prev.filter((x) => x.id !== toDelete.id));
            gallery.setTotal((t) => Math.max(0, t - 1));
            notify('Resultado borrado.');
            setToDelete(null);
          }}
        >
          <p>Se borrará esta imagen y su miniatura. Esta acción no se puede deshacer.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
