import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { ImageFrame } from '../components/ImageFrame';
import { useToast } from '../components/Toast';
import { CharacterEditor } from '../features/characters/CharacterEditor';
import { ConsistencyTest } from '../features/characters/ConsistencyTest';
import { ReferenceUploadForm } from '../features/characters/ReferenceUploadForm';
import { useAsync } from '../hooks/useAsync';
import { useProviders } from '../hooks/useProviders';
import { ApiError } from '../services/api';
import { formatDate } from '../lib/format';
import { deleteCharacter, deleteReference, getCharacter, listReferences, updateCharacter } from '../services/endpoints';
import type { ReferenceImage } from '../types';

export function CharacterDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { status } = useProviders();
  const character = useAsync((signal) => getCharacter(id, { signal }), [id]);
  const refs = useAsync((signal) => listReferences(id, { signal }), [id]);
  const [toDeleteRef, setToDeleteRef] = useState<ReferenceImage | null>(null);
  const [deletingCharacter, setDeletingCharacter] = useState(false);

  if (character.loading && !character.data) {
    return (
      <div aria-busy="true" aria-label="Cargando personaje">
        <Skeleton h={36} w="50%" />
        <div style={{ height: 16 }} />
        <Skeleton h={260} r={14} />
      </div>
    );
  }
  if (character.error || !character.data) {
    const notFound = character.error instanceof ApiError && character.error.status === 404;
    return (
      <>
        <p>
          <Link to="/personajes">Volver a personajes</Link>
        </p>
        {notFound ? <EmptyState title="Este personaje no existe">Puede que lo hayas borrado. Vuelve a la lista para elegir otro.</EmptyState> : <ErrorNotice error={character.error} title="No se pudo cargar el personaje." onRetry={character.reload} />}
      </>
    );
  }
  const c = character.data;

  async function toggleArchive() {
    try {
      const updated = await updateCharacter(c.id, { archived: !c.archived });
      character.setData(updated);
      notify(updated.archived ? 'Personaje archivado.' : 'Personaje desarchivado.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo cambiar el estado.', 'error');
    }
  }

  return (
    <>
      <p className="crumb">
        <Link to="/personajes">Personajes</Link>
      </p>
      <div className="page-head">
        <h1>
          {c.name}
          {c.archived ? <span className="badge badge-cancelled badge-inline">Archivado</span> : null}
        </h1>
        <div className="actions">
          <Link className="btn btn-primary" to={`/estudio?personaje=${c.id}`}>
            Generar imagen
          </Link>
          <button type="button" className="btn" onClick={toggleArchive}>
            {c.archived ? 'Desarchivar' : 'Archivar'}
          </button>
          <button type="button" className="btn btn-danger-quiet" onClick={() => setDeletingCharacter(true)}>
            Borrar
          </button>
        </div>
      </div>

      <CharacterEditor key={c.id} character={c} onSaved={(saved) => character.setData(saved)} />

      <section className="section" aria-labelledby="refs-h">
        <div className="section-head">
          <h2 id="refs-h">Referencias</h2>
          <span className="hint">{refs.data ? refs.data.total : c.reference_count} en total</span>
        </div>
        {refs.loading && !refs.data ? (
          <div className="thumb-grid" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={140} r={10} />
            ))}
          </div>
        ) : refs.error ? (
          <ErrorNotice error={refs.error} title="No se pudieron cargar las referencias." onRetry={refs.reload} />
        ) : refs.data && refs.data.items.length > 0 ? (
          <ul className="thumb-grid">
            {refs.data.items.map((r) => (
              <li key={r.id} className="thumb">
                <ImageFrame src={r.thumbnail_url} alt={`Referencia: ${r.source_note}`} width={r.width} height={r.height} />
                <p className="thumb-note clamp-2">{r.source_note}</p>
                <p className="hint">{formatDate(r.created_at)}</p>
                <button type="button" className="btn btn-small btn-danger-quiet" onClick={() => setToDeleteRef(r)} aria-label={`Borrar referencia: ${r.source_note}`}>
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin referencias todavía">Sube una imagen con permiso de uso. Cuantas más referencias, más reconocible será el personaje.</EmptyState>
        )}
        <ReferenceUploadForm
          characterId={c.id}
          maxUploadMb={status?.limits.max_upload_mb}
          onUploaded={() => {
            notify('Referencia añadida.');
            refs.reload();
            character.reload();
          }}
        />
      </section>

      <ConsistencyTest characterId={c.id} characterName={c.name} />

      {toDeleteRef ? (
        <ConfirmDialog
          title="Borrar referencia"
          confirmLabel="Borrar referencia"
          danger
          onCancel={() => setToDeleteRef(null)}
          onConfirm={async () => {
            await deleteReference(toDeleteRef.id);
            setToDeleteRef(null);
            notify('Referencia borrada.');
            refs.reload();
            character.reload();
          }}
        >
          <p>Se borrará esta imagen de referencia y su archivo. Los resultados ya generados no cambian.</p>
        </ConfirmDialog>
      ) : null}
      {deletingCharacter ? (
        <ConfirmDialog
          title={`Borrar a ${c.name}`}
          confirmLabel="Borrar para siempre"
          danger
          onCancel={() => setDeletingCharacter(false)}
          onConfirm={async () => {
            await deleteCharacter(c.id);
            notify(`«${c.name}» borrado.`);
            navigate('/personajes');
          }}
        >
          <p>
            Se borrarán de forma permanente <strong>«{c.name}»</strong>, todas sus imágenes de referencia, todos sus trabajos de generación y los archivos de imagen asociados.
          </p>
          <p>Esta acción no se puede deshacer. Si solo quieres quitarlo de la lista, archívalo.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
