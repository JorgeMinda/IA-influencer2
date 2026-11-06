import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserTtsEngine, type ResolvedVoiceProfile } from '../lib/ttsEngine';
import { pickVoiceForGender } from '../lib/voiceGender';
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

export function useSpeech(initialEnabled = false, voiceGender: CharacterGender = 'unspecified', voiceProfile: VoiceProfileInput | null = null) {
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
      if (!ttsSupported || !enabled) return;
      const engine = engineRef.current;
      if (!engine) return;
      // Resolver la voz por nombre si está en el perfil, si no, por género.
      const voices = window.speechSynthesis.getVoices();
      let voiceName = profile.voiceName;
      if (!voiceName) {
        const chosen = pickVoiceForGender(voices, voiceGender);
        voiceName = chosen?.name ?? null;
      }
      const resolved: ResolvedVoiceProfile = { ...profile, voiceName };
      engine.speak(text, resolved, () => setSpeaking(false));
      setSpeaking(true);
    },
    [ttsSupported, enabled, profile, voiceGender],
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
      rec.lang = 'es-ES';
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