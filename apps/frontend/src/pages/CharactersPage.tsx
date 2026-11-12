import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { SelectField, TextField } from '../components/Fields';
import { EmptyState, ErrorNotice, Skeleton } from '../components/Feedback';
import { Monogram } from '../components/ImageFrame';
import { useToast } from '../components/Toast';
import { LIMITS, validateCharacterForm } from '../features/characters/characterForm';
import { useDebounced } from '../hooks/useAsync';
import { usePagedList } from '../hooks/usePagedList';
import { errorMessage } from '../lib/format';
import { createCharacter, deleteCharacter, duplicateCharacter, listCharacters, updateCharacter } from '../services/endpoints';
import type { Character, CharacterGender, VoicePreset } from '../types';

const PRESET_VALUES: Record<VoicePreset, { rate: number; pitch: number }> = {
  calida: { rate: 0.95, pitch: 1.10 },
  energica: { rate: 1.10, pitch: 1.20 },
  serena: { rate: 0.88, pitch: 0.95 },
  seria: { rate: 0.95, pitch: 0.85 },
  custom: { rate: 1.0, pitch: 1.0 },
};

function NewCharacterDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState<CharacterGender>('unspecified');
  const [preset, setPreset] = useState<VoicePreset>('custom');
  const [errors, setErrors] = useState<{ name?: string; visualDescription?: string }>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateCharacterForm({ name, visualDescription: description, traits: [], notes: '' });
    setErrors(errs);
    if (errs.name || errs.visualDescription) return;
    setBusy(true);
    setApiError(null);
    try {
      const pv = PRESET_VALUES[preset];
      const c = await createCharacter({
        name: name.trim(),
        visual_description: description,
        gender,
        voice_profile: {
          engine: 'browser',
          voice_name: null,
          preset,
          rate: pv.rate,
          pitch: pv.pitch,
          pause_ms: 200,
          voicestudio_voice_id: null,
        },
      });
      navigate(`/personajes/${c.id}`);
    } catch (err) {
      setApiError(err);
      setBusy(false);
    }
  }
  return (
    <Dialog title="Nuevo personaje" onClose={() => !busy && onClose()}>
      <form className="stack" onSubmit={submit} noValidate>
        <TextField label="Nombre" value={name} onChange={setName} error={errors.name} max={LIMITS.name} required autoComplete="off" />
        <TextField label="Descripción visual (opcional)" multiline rows={3} value={description} onChange={setDescription} error={errors.visualDescription} max={LIMITS.description} hint="Podrás completar la ficha después." />
        <SelectField
          label="Voz / género"
          value={gender}
          onChange={(v) => setGender(v as CharacterGender)}
          options={[
            { value: 'unspecified', label: 'Sin especificar (detectar de la descripción)' },
            { value: 'female', label: 'Femenina' },
            { value: 'male', label: 'Masculina' },
            { value: 'neutral', label: 'Neutra' },
          ]}
          hint="Se usa para elegir la voz del personaje."
        />
        <SelectField
          label="Preset de voz"
          value={preset}
          onChange={(v) => setPreset(v as VoicePreset)}
          options={[
            { value: 'calida', label: 'Cálida' },
            { value: 'energica', label: 'Enérgica' },
            { value: 'serena', label: 'Serena' },
            { value: 'seria', label: 'Seria' },
            { value: 'custom', label: 'Personalizado' },
          ]}
          hint="Ajusta velocidad y tono en la ficha del personaje."
        />
        {apiError ? <ErrorNotice error={apiError} title="No se pudo crear el personaje." /> : null}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear personaje'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CharactersPage() {
  const { notify } = useToast();
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const dq = useDebounced(q.trim(), 300);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Character | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = usePagedList<Character>((p) => listCharacters({ q: dq, include_archived: archived, limit: p.limit, offset: p.offset }, { signal: p.signal }), [dq, archived], 24);

  async function toggleArchive(c: Character) {
    setBusyId(c.id);
    try {
      const updated = await updateCharacter(c.id, { archived: !c.archived });
      if (updated.archived && !archived) {
        list.setItems((prev) => prev.filter((x) => x.id !== c.id));
        list.setTotal((t) => Math.max(0, t - 1));
      } else {
        list.setItems((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      }
      notify(updated.archived ? `«${c.name}» archivado.` : `«${c.name}» ya no está archivado.`);
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  }
  async function duplicate(c: Character) {
    setBusyId(c.id);
    try {
      const copy = await duplicateCharacter(c.id);
      notify(`Creada «${copy.name}».`);
      list.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Personajes</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Nuevo personaje
        </button>
      </div>

      <div className="toolbar">
        <TextField label="Buscar por nombre" type="search" value={q} onChange={setQ} autoComplete="off" />
        <label className="check toolbar-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          <span>Ver archivados</span>
        </label>
      </div>

      {list.loading ? (
        <div className="card-grid" aria-busy="true" aria-label="Cargando personajes">
          {[0, 1, 2].map((i) => (
            <div className="card" key={i}>
              <Skeleton h={64} w={64} r={12} />
              <Skeleton h={20} w="60%" />
              <Skeleton h={14} />
            </div>
          ))}
        </div>
      ) : list.error ? (
        <ErrorNotice error={list.error} title="No se pudieron cargar los personajes." onRetry={list.reload} />
      ) : list.items.length === 0 ? (
        dq ? (
          <EmptyState title="Ningún personaje coincide">No hay resultados para «{dq}». Prueba con otro nombre{archived ? '' : ' o activa «Ver archivados»'}.</EmptyState>
        ) : (
          <EmptyState
            title={archived ? 'No hay personajes todavía' : 'Aún no tienes personajes'}
            action={
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                Crear el primero
              </button>
            }
          >
            Un personaje reúne su descripción, sus rasgos fijos y sus imágenes de referencia. Con eso el estudio genera imágenes consistentes.
          </EmptyState>
        )
      ) : (
        <>
          <ul className="card-grid">
            {list.items.map((c) => (
              <li key={c.id} className={`card char-card${c.archived ? ' is-archived' : ''}`}>
                <div className="char-top">
                  <Monogram name={c.name} id={c.id} />
                  <div className="char-title">
                    <h2>
                      <Link to={`/personajes/${c.id}`}>{c.name}</Link>
                    </h2>
                    <p className="hint">
                      {c.reference_count === 1 ? '1 referencia' : `${c.reference_count} referencias`}
                      {c.archived ? ' · Archivado' : ''}
                    </p>
                  </div>
                </div>
                <p className="clamp">{c.visual_description || 'Sin descripción visual todavía.'}</p>
                {c.invariant_traits.length > 0 ? (
                  <ul className="chips chips-compact" aria-label="Rasgos">
                    {c.invariant_traits.slice(0, 3).map((t) => (
                      <li key={t} className="chip">
                        <span>{t}</span>
                      </li>
                    ))}
                    {c.invariant_traits.length > 3 ? <li className="chip chip-more">+{c.invariant_traits.length - 3}</li> : null}
                  </ul>
                ) : null}
                <div className="actions char-actions">
                  <button type="button" className="btn btn-small" onClick={() => duplicate(c)} disabled={busyId === c.id} aria-label={`Duplicar ${c.name}`}>
                    Duplicar
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => toggleArchive(c)} disabled={busyId === c.id} aria-label={`${c.archived ? 'Desarchivar' : 'Archivar'} ${c.name}`}>
                    {c.archived ? 'Desarchivar' : 'Archivar'}
                  </button>
                  <button type="button" className="btn btn-small btn-danger-quiet" onClick={() => setToDelete(c)} disabled={busyId === c.id} aria-label={`Borrar ${c.name}`}>
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="more">
            <p className="hint">
              Mostrando {list.items.length} de {list.total}
            </p>
            {list.moreError ? <ErrorNotice error={list.moreError} /> : null}
            {list.hasMore ? (
              <button type="button" className="btn" onClick={list.loadMore} disabled={list.moreLoading}>
                {list.moreLoading ? 'Cargando…' : 'Cargar más'}
              </button>
            ) : null}
          </div>
        </>
      )}

      {creating ? <NewCharacterDialog onClose={() => setCreating(false)} /> : null}
      {toDelete ? (
        <ConfirmDialog
          title={`Borrar a ${toDelete.name}`}
          confirmLabel="Borrar para siempre"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteCharacter(toDelete.id);
            list.setItems((prev) => prev.filter((x) => x.id !== toDelete.id));
            list.setTotal((t) => Math.max(0, t - 1));
            notify(`«${toDelete.name}» borrado.`);
            setToDelete(null);
          }}
        >
          <p>
            Se borrarán de forma permanente <strong>«{toDelete.name}»</strong>, todas sus imágenes de referencia, todos sus trabajos de generación y los archivos de imagen asociados.
          </p>
          <p>Esta acción no se puede deshacer. Si solo quieres quitarlo de la lista, archívalo.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
