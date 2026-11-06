import { useEffect, useState, type FormEvent } from 'react';
import { SelectField, TextField } from '../../components/Fields';
import { ErrorNotice } from '../../components/Feedback';
import { useToast } from '../../components/Toast';
import { updateCharacter } from '../../services/endpoints';
import type { Character, CharacterGender, VoiceProfile, VoicePreset } from '../../types';
import { BrowserTtsEngine } from '../../lib/ttsEngine';
import { LIMITS, validateCharacterForm, type CharacterFormErrors } from './characterForm';
import { TraitsEditor } from './TraitsEditor';

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const PRESET_VALUES: Record<VoicePreset, { rate: number; pitch: number }> = {
  calida: { rate: 0.95, pitch: 1.10 },
  energica: { rate: 1.10, pitch: 1.20 },
  serena: { rate: 0.88, pitch: 0.95 },
  seria: { rate: 0.95, pitch: 0.85 },
  custom: { rate: 1.0, pitch: 1.0 },
};

const DEFAULT_PROFILE: VoiceProfile = {
  engine: 'browser',
  voice_name: null,
  preset: 'custom',
  rate: 1.0,
  pitch: 1.0,
  pause_ms: 200,
};

export function CharacterEditor({ character, onSaved }: { character: Character; onSaved: (c: Character) => void }) {
  const { notify } = useToast();
  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.visual_description);
  const [traits, setTraits] = useState(character.invariant_traits);
  const [notes, setNotes] = useState(character.notes);
  const [gender, setGender] = useState<CharacterGender>(character.gender ?? 'unspecified');
  const [voice, setVoice] = useState<VoiceProfile>(character.voice_profile ?? DEFAULT_PROFILE);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testing, setTesting] = useState(false);
  const [errors, setErrors] = useState<CharacterFormErrors>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const dirty = name !== character.name || description !== character.visual_description || notes !== character.notes || gender !== (character.gender ?? 'unspecified') || JSON.stringify(voice) !== JSON.stringify(character.voice_profile ?? DEFAULT_PROFILE) || !sameList(traits, character.invariant_traits);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(all.filter((v) => v.lang.toLowerCase().startsWith('es')));
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateCharacterForm({ name, visualDescription: description, traits, notes });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setApiError(null);
    try {
      const saved = await updateCharacter(character.id, { name: name.trim(), visual_description: description, invariant_traits: traits, notes, gender, voice_profile: voice });
      onSaved(saved);
      notify('Cambios guardados.');
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-label="Ficha del personaje">
      <TextField label="Nombre" value={name} onChange={setName} error={errors.name} max={LIMITS.name} required />
      <TextField label="Descripción visual" multiline rows={4} value={description} onChange={setDescription} error={errors.visualDescription} max={LIMITS.description} hint="Cómo se ve: pelo, ojos, piel, ropa habitual. Se añade a cada prompt." />
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
        hint="Determina la voz del personaje en el chat y en el modo llamada."
      />
      <TraitsEditor traits={traits} onChange={setTraits} error={errors.traits} />
      <TextField label="Notas" multiline rows={3} value={notes} onChange={setNotes} error={errors.notes} max={LIMITS.notes} hint="Solo para ti: historia, tono, ideas." />
      {apiError ? <ErrorNotice error={apiError} title="No se pudieron guardar los cambios." /> : null}

      {typeof window !== 'undefined' && 'speechSynthesis' in window ? (
        <section className="card stack" aria-label="Voz del personaje">
          <h3>Voz</h3>
          <SelectField
            label="Voz del sistema"
            value={voice.voice_name ?? ''}
            onChange={(v) => setVoice((p) => ({ ...p, voice_name: v || null }))}
            options={[
              { value: '', label: 'Automática (por género)' },
              ...voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` })),
            ]}
            hint="Voces instaladas en tu navegador para español."
          />
          <SelectField
            label="Preset"
            value={voice.preset}
            onChange={(v) => {
              const preset = v as VoicePreset;
              if (preset !== 'custom' && preset in PRESET_VALUES) {
                const pv = PRESET_VALUES[preset];
                setVoice((p) => ({ ...p, preset, rate: pv.rate, pitch: pv.pitch }));
              } else {
                setVoice((p) => ({ ...p, preset: 'custom' }));
              }
            }}
            options={[
              { value: 'calida', label: 'Cálida' },
              { value: 'energica', label: 'Enérgica' },
              { value: 'serena', label: 'Serena' },
              { value: 'seria', label: 'Seria' },
              { value: 'custom', label: 'Personalizado' },
            ]}
            hint="Al elegir un preset se rellenan velocidad y tono."
          />
          <div className="field">
            <label htmlFor="voice-rate">Velocidad ({voice.rate.toFixed(2)})</label>
            <input
              id="voice-rate"
              type="range"
              min={0.7}
              max={1.3}
              step={0.01}
              value={voice.rate}
              onChange={(e) => setVoice((p) => ({ ...p, rate: Number(e.target.value), preset: 'custom' }))}
            />
          </div>
          <div className="field">
            <label htmlFor="voice-pitch">Tono ({voice.pitch.toFixed(2)})</label>
            <input
              id="voice-pitch"
              type="range"
              min={0.7}
              max={1.5}
              step={0.01}
              value={voice.pitch}
              onChange={(e) => setVoice((p) => ({ ...p, pitch: Number(e.target.value), preset: 'custom' }))}
            />
          </div>
          <div className="field">
            <label htmlFor="voice-pause">Pausa entre frases ({voice.pause_ms} ms)</label>
            <input
              id="voice-pause"
              type="range"
              min={0}
              max={600}
              step={25}
              value={voice.pause_ms}
              onChange={(e) => setVoice((p) => ({ ...p, pause_ms: Number(e.target.value) }))}
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={testing}
              onClick={() => {
                setTesting(true);
                const engine = new BrowserTtsEngine();
                const chosenVoice = voice.voice_name
                  ? voices.find((v) => v.name === voice.voice_name)?.name ?? null
                  : null;
                engine.speak(
                  'Hola, soy tu personaje. Esta es una prueba de voz para que ajustes cómo sueno.',
                  { voiceName: chosenVoice, gender, rate: voice.rate, pitch: voice.pitch, pauseMs: voice.pause_ms },
                  () => setTesting(false),
                );
              }}
            >
              {testing ? 'Reproduciendo…' : 'Probar voz'}
            </button>
          </div>
        </section>
      ) : null}

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {dirty ? <span className="hint">Hay cambios sin guardar.</span> : null}
      </div>
    </form>
  );
}
