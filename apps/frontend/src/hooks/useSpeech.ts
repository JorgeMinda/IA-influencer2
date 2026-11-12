import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserTtsEngine, type ResolvedVoiceProfile } from '../lib/ttsEngine';
import { pickVoiceForGender } from '../lib/voiceGender';
import { synthesizeSpeech } from '../services/endpoints';
import type { CharacterGender } from '../types';

interface SpeechRecognitionResultLike {
  readonly transcript: string;
}

interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceProfileInput {
  voice_name?: string | null;
  preset?: string;
  rate?: number;
  pitch?: number;
  pause_ms?: number;
}

export function toResolvedProfile(
  profile: VoiceProfileInput | null | undefined,
  gender: CharacterGender,
): ResolvedVoiceProfile {
  const base: ResolvedVoiceProfile = {
    voiceName: profile?.voice_name ?? null,
    gender,
    rate: typeof profile?.rate === 'number' ? profile.rate : 1.0,
    pitch: typeof profile?.pitch === 'number' ? profile.pitch : 1.0,
    pauseMs: typeof profile?.pause_ms === 'number' ? profile.pause_ms : 200,
  };
  // Si no hay perfil, usar la heurística de género para elegir la voz.
  if (!profile?.voice_name) {
    // Dejar voiceName null; el motor elige por género si no hay nombre.
  }
  return base;
}

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: 'es-ES', label: 'Español' },
  { code: 'en-US', label: 'English' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'fr-FR', label: 'Français' },
];

export function useSpeech(initialEnabled = false, voiceGender: CharacterGender = 'unspecified', voiceProfile: VoiceProfileInput | null = null, voiceStudioVoiceId: string | null = null, language = 'es-ES') {
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const RecCtor = getRecognitionCtor();
  const sttSupported = RecCtor !== null;

  const [enabled, setEnabled] = useState(initialEnabled);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<BrowserTtsEngine | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    engineRef.current = new BrowserTtsEngine();
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!ttsSupported) return;
    const warm = () => window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener('voiceschanged', warm);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', warm);
  }, [ttsSupported]);

  const profile = toResolvedProfile(voiceProfile, voiceGender);

  const stopSpeaking = useCallback(() => {
    engineRef.current?.stop();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      // VoiceStudio (servidor local) tiene prioridad si hay voz seleccionada.
      if (voiceStudioVoiceId) {
        setSpeaking(true);
        synthesizeSpeech(text, voiceStudioVoiceId)
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
            audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); };
            audio.play().catch(() => setSpeaking(false));
          })
          .catch(() => {
            // Fallback a navegador si VoiceStudio falla.
            if (!ttsSupported) { setSpeaking(false); return; }
            const engine = engineRef.current;
            if (!engine) { setSpeaking(false); return; }
            const voices = window.speechSynthesis.getVoices();
            const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(language.split('-')[0].toLowerCase()));
            const pool = langVoices.length > 0 ? langVoices : voices;
            let voiceName = profile.voiceName;
            if (!voiceName) {
              const chosen = pickVoiceForGender(pool, voiceGender);
              voiceName = chosen?.name ?? null;
            }
            const resolved: ResolvedVoiceProfile = { ...profile, voiceName };
            engine.speak(text, resolved, () => setSpeaking(false));
            setSpeaking(true);
          });
        return;
      }
      if (!ttsSupported) return;
      const engine = engineRef.current;
      if (!engine) return;
      const voices = window.speechSynthesis.getVoices();
      const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(language.split('-')[0].toLowerCase()));
      const pool = langVoices.length > 0 ? langVoices : voices;
      let voiceName = profile.voiceName;
      if (!voiceName) {
        const chosen = pickVoiceForGender(pool, voiceGender);
        voiceName = chosen?.name ?? null;
      }
      const resolved: ResolvedVoiceProfile = { ...profile, voiceName };
      engine.speak(text, resolved, () => setSpeaking(false));
      setSpeaking(true);
    },
    [ttsSupported, enabled, profile, voiceGender, voiceStudioVoiceId, language],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(
    (onResult: (transcript: string) => void) => {
      if (!RecCtor) {
        setError('Tu navegador no permite dictado por voz. Usa Chrome o Edge.');
        return;
      }
      if (listening) return;
      setError(null);
      stopSpeaking();

      const rec = new RecCtor();
      rec.lang = language;
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0]?.transcript ?? '')
          .join(' ')
          .trim();
        if (transcript) onResult(transcript);
      };
      rec.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        setError('No se pudo escuchar. Revisa el permiso del micrófono.');
      };
      rec.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = rec;
      setListening(true);
      try {
        rec.start();
      } catch {
        setListening(false);
        recognitionRef.current = null;
        setError('No se pudo iniciar el micrófono.');
      }
    },
    [RecCtor, listening, stopSpeaking],
  );

  useEffect(
    () => () => {
      if (ttsSupported) window.speechSynthesis.cancel();
      recognitionRef.current?.abort();
    },
    [ttsSupported],
  );

  return {
    ttsSupported,
    sttSupported,
    enabled,
    setEnabled,
    speaking,
    listening,
    error,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
  };
}