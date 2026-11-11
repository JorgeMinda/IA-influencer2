import { useEffect, useState, type FormEvent } from 'react';
import { SelectField } from '../../components/Fields';
import { ErrorNotice } from '../../components/Feedback';
import { useToast } from '../../components/Toast';
import { updateCharacter } from '../../services/endpoints';
import type { Character, VoiceProfile, VoicePreset } from '../../types';
import { BrowserTtsEngine } from '../../lib/ttsEngine';

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

interface VoiceProfileEditorProps {
  character: Character;
  onSaved: (c: Character) => void;
}

export function VoiceProfileEditor({ character, onSaved }: VoiceProfileEditorProps) {
  const { notify } = useToast();
  const [voice, setVoice] = useState<VoiceProfile>(character.voice_profile ?? DEFAULT_PROFILE);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testing, setTesting] = useState(false);
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(voice) !== JSON.stringify(character.voice_profile ?? DEFAULT_PROFILE);

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
    setBusy(true);
    setApiError(null);
    try {
      const saved = await updateCharacter(character.id, { voice_profile: voice });
      onSaved(saved);
      notify('Perfil de voz guardado.');
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return (
      <div className="card stack">
        <p className="hint">Tu navegador no soporta sÃ­ntesis de voz. Usa Chrome o Edge.</p>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-label="Perfil de voz del personaje">
      <SelectField
        label="Voz del sistema"
        value={voice.voice_name ?? ''}
        onChange={(v) => setVoice((p) => ({ ...p, voice_name: v || null }))}
        options={[
          { value: '', label: 'AutomÃ¡tica (por gÃ©nero)' },
          ...voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` })),
        ]}
        hint="Voces instaladas en tu navegador para espaÃ±ol."
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
          { value: 'calida', label: 'CÃ¡lida' },
          { value: 'energica', label: 'EnÃ©rgica' },
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
      {apiError ? <ErrorNotice error={apiError} title="No se pudo guardar el perfil de voz." /> : null}
      <div className="actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={testing}
          onClick={() => {
            setTesting(true);
            const engine = new BrowserTtsEngine();
            engine.speak(
              'Hola, soy tu personaje. Esta es una prueba de voz para que ajustes cÃ³mo sueno.',
              { voiceName: voice.voice_name, gender: character.gender ?? 'unspecified', rate: voice.rate, pitch: voice.pitch, pauseMs: voice.pause_ms },
              () => setTesting(false),
            );
          }}
        >
          {testing ? 'Reproduciendoâ€¦' : 'Probar voz'}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          {busy ? 'Guardandoâ€¦' : 'Guardar voz'}
        </button>
      </div>
    </form>
  );
}
