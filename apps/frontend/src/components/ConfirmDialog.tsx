import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../lib/format';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/** Confirmación con estado de "trabajando" y error en línea. El que la abre la cierra tras confirmar. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancelar', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!busy) onCancel();
      }}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy} data-autofocus={danger ? '' : undefined}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={busy} data-autofocus={danger ? undefined : ''}>
            {busy ? 'Un momento…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">{children}</div>
      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/** Confirmación explícita antes de enviar datos a un tercero (nube). */
export function CloudConfirmDialog({ provider, onConfirm, onCancel }: { provider?: string; onConfirm: () => Promise<void> | void; onCancel: () => void }) {
  const named = provider && provider !== 'ninguno' ? ` (${provider})` : '';
  return (
    <ConfirmDialog title="Enviar a la nube" confirmLabel="Aceptar y enviar a la nube" onConfirm={onConfirm} onCancel={onCancel}>
      <p>
        Vas a procesar esta tarea en un proveedor externo{named}. <strong>Tu prompt y las imágenes de referencia del personaje saldrán de tu red</strong> y llegarán a un tercero.
      </p>
      <p>Puede tener coste según el plan de ese proveedor. Si prefieres que nada salga de tu equipo, cancela y elige «PC local» o «Simulado».</p>
    </ConfirmDialog>
  );
}
