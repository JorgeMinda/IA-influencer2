import { useState, type ChangeEvent, type FormEvent } from 'react';
import { SelectField, TextField } from '../../components/Fields';
import { ErrorNotice } from '../../components/Feedback';
import { useToast } from '../../components/Toast';
import { updateCharacter } from '../../services/endpoints';
import type { BrandProfile, BrandTypography, Character, WatermarkPosition, WatermarkSize } from '../../types';

const DEFAULT_BRAND: BrandProfile = {
  watermark_url: null,
  watermark_position: 'bottom-right',
  watermark_opacity: 40,
  watermark_size: 'md',
  palette: { primary: '#6366f1', secondary: '#1e293b', accent: '#f59e0b', background: '#ffffff', text: '#1e293b' },
  typography: 'sans',
  style_guide: '',
};

const MAX_WATERMARK_BYTES = 200 * 1024;

interface BrandProfileEditorProps {
  character: Character;
  onSaved: (c: Character) => void;
}

export function BrandProfileEditor({ character, onSaved }: BrandProfileEditorProps) {
  const { notify } = useToast();
  const [brand, setBrand] = useState<BrandProfile>(character.brand_profile ?? DEFAULT_BRAND);
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(brand) !== JSON.stringify(character.brand_profile ?? DEFAULT_BRAND);

  function handleWatermarkFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_WATERMARK_BYTES) {
      notify('El logo supera 200 KB. Usa una imagen más ligera.', 'error');
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify('Solo se aceptan imágenes (PNG, SVG, WebP).', 'error');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBrand((p) => ({ ...p, watermark_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setApiError(null);
    try {
      const saved = await updateCharacter(character.id, { brand_profile: brand });
      onSaved(saved);
      notify('Identidad visual guardada.');
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  function removeWatermark() {
    setBrand((p) => ({ ...p, watermark_url: null }));
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-label="Identidad visual del personaje">
      <h2>Identidad visual (Hallmark)</h2>

      {/* Watermark */}
      <section className="stack" aria-label="Watermark">
        <h3>Watermark / logo</h3>
        {brand.watermark_url ? (
          <div className="stack">
            <img src={brand.watermark_url} alt="Watermark" style={{ maxWidth: 120, maxHeight: 60, objectFit: 'contain' }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={removeWatermark}>
              Quitar watermark
            </button>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="watermark-file">Subir logo (PNG/SVG/WebP, máx. 200 KB)</label>
            <input id="watermark-file" type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={handleWatermarkFile} />
          </div>
        )}
        <div className="field-row">
          <SelectField
            label="Posición"
            value={brand.watermark_position}
            onChange={(v) => setBrand((p) => ({ ...p, watermark_position: v as WatermarkPosition }))}
            options={[
              { value: 'top-left', label: 'Arriba izquierda' },
              { value: 'top-right', label: 'Arriba derecha' },
              { value: 'bottom-left', label: 'Abajo izquierda' },
              { value: 'bottom-right', label: 'Abajo derecha' },
              { value: 'center', label: 'Centro' },
            ]}
          />
          <SelectField
            label="Tamaño"
            value={brand.watermark_size}
            onChange={(v) => setBrand((p) => ({ ...p, watermark_size: v as WatermarkSize }))}
            options={[
              { value: 'sm', label: 'Pequeño' },
              { value: 'md', label: 'Mediano' },
              { value: 'lg', label: 'Grande' },
            ]}
          />
        </div>
        <div className="field">
          <label htmlFor="watermark-opacity">Opacidad ({brand.watermark_opacity}%)</label>
          <input
            id="watermark-opacity"
            type="range"
            min={0}
            max={100}
            step={5}
            value={brand.watermark_opacity}
            onChange={(e) => setBrand((p) => ({ ...p, watermark_opacity: Number(e.target.value) }))}
          />
        </div>
      </section>

      {/* Paleta */}
      <section className="stack" aria-label="Paleta de colores">
        <h3>Paleta</h3>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pal-primary">Primario</label>
            <input id="pal-primary" type="color" value={brand.palette.primary} onChange={(e) => setBrand((p) => ({ ...p, palette: { ...p.palette, primary: e.target.value } }))} />
          </div>
          <div className="field">
            <label htmlFor="pal-secondary">Secundario</label>
            <input id="pal-secondary" type="color" value={brand.palette.secondary} onChange={(e) => setBrand((p) => ({ ...p, palette: { ...p.palette, secondary: e.target.value } }))} />
          </div>
          <div className="field">
            <label htmlFor="pal-accent">Acento</label>
            <input id="pal-accent" type="color" value={brand.palette.accent} onChange={(e) => setBrand((p) => ({ ...p, palette: { ...p.palette, accent: e.target.value } }))} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pal-bg">Fondo</label>
            <input id="pal-bg" type="color" value={brand.palette.background ?? '#ffffff'} onChange={(e) => setBrand((p) => ({ ...p, palette: { ...p.palette, background: e.target.value } }))} />
          </div>
          <div className="field">
            <label htmlFor="pal-text">Texto</label>
            <input id="pal-text" type="color" value={brand.palette.text ?? '#1e293b'} onChange={(e) => setBrand((p) => ({ ...p, palette: { ...p.palette, text: e.target.value } }))} />
          </div>
        </div>
      </section>

      {/* Tipografía */}
      <section className="stack" aria-label="Tipografía">
        <h3>Tipografía</h3>
        <SelectField
          label="Fuente para overlays"
          value={brand.typography}
          onChange={(v) => setBrand((p) => ({ ...p, typography: v as BrandTypography }))}
          options={[
            { value: 'sans', label: 'Sans-serif' },
            { value: 'serif', label: 'Serif' },
            { value: 'mono', label: 'Monoespaciada' },
            { value: 'display', label: 'Display' },
          ]}
          hint="Se usa para watermark de texto y overlays en exportación."
        />
      </section>

      {/* Guía de estilo */}
      <section className="stack" aria-label="Guía de estilo">
        <h3>Guía de estilo (anti-slop)</h3>
        <TextField
          label="Guía de estilo"
          multiline
          rows={4}
          value={brand.style_guide}
          onChange={(v) => setBrand((p) => ({ ...p, style_guide: v }))}
          max={2000}
          hint="Tono, mood, do's y don'ts. Se inyecta en los prompts de generación y en el chat."
        />
      </section>

      {/* Preview */}
      <section className="stack" aria-label="Preview">
        <h3>Vista previa</h3>
        <div
          className="card"
          style={{
            background: brand.palette.background ?? '#ffffff',
            color: brand.palette.text ?? '#1e293b',
            padding: 16,
            borderRadius: 8,
            position: 'relative',
            minHeight: 80,
          }}
        >
          <p style={{ margin: 0, fontFamily: brand.typography === 'serif' ? 'serif' : brand.typography === 'mono' ? 'monospace' : 'sans-serif', color: brand.palette.primary }}>
            {character.name}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: brand.palette.secondary }}>
            {brand.style_guide || 'Sin guía de estilo aún.'}
          </p>
          {brand.watermark_url ? (
            <img
              src={brand.watermark_url}
              alt="Watermark preview"
              style={{
                position: 'absolute',
                ...(brand.watermark_position === 'top-left' ? { top: 4, left: 4 } : {}),
                ...(brand.watermark_position === 'top-right' ? { top: 4, right: 4 } : {}),
                ...(brand.watermark_position === 'bottom-left' ? { bottom: 4, left: 4 } : {}),
                ...(brand.watermark_position === 'bottom-right' ? { bottom: 4, right: 4 } : {}),
                ...(brand.watermark_position === 'center' ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : {}),
                opacity: brand.watermark_opacity / 100,
                width: brand.watermark_size === 'sm' ? 24 : brand.watermark_size === 'md' ? 40 : 64,
                height: 'auto',
              }}
            />
          ) : (
            <span
              style={{
                position: 'absolute',
                ...(brand.watermark_position === 'top-left' ? { top: 4, left: 4 } : {}),
                ...(brand.watermark_position === 'top-right' ? { top: 4, right: 4 } : {}),
                ...(brand.watermark_position === 'bottom-left' ? { bottom: 4, left: 4 } : {}),
                ...(brand.watermark_position === 'bottom-right' ? { bottom: 4, right: 4 } : {}),
                ...(brand.watermark_position === 'center' ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : {}),
                opacity: brand.watermark_opacity / 100,
                fontSize: brand.watermark_size === 'sm' ? 10 : brand.watermark_size === 'md' ? 14 : 20,
                fontWeight: 700,
                color: brand.palette.primary,
                fontFamily: brand.typography === 'serif' ? 'serif' : brand.typography === 'mono' ? 'monospace' : 'sans-serif',
              }}
            >
              {character.name}
            </span>
          )}
        </div>
      </section>

      {apiError ? <ErrorNotice error={apiError} title="No se pudo guardar la identidad visual." /> : null}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          {busy ? 'Guardando…' : 'Guardar identidad'}
        </button>
      </div>
    </form>
  );
}