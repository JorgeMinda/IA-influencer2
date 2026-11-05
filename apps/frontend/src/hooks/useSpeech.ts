import { useCallback, useEffect, useRef, useState } from 'react';

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

/**
 * Voz del personaje (TTS) y dictado por micrófono (STT) usando las APIs nativas
 * del navegador. Sin backend ni costo. TTS: Chrome/Edge/Safari. STT: Chrome/Edge.
 */
export function useSpeech(initialEnabled = false) {
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const RecCtor = getRecognitionCtor();
  const sttSupported = RecCtor !== null;

  const [enabled, setEnabled] = useState(initialEnabled);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang.toLowerCase().startsWith('es')) ??
        voices.find((v) => v.default) ??
        null;
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [ttsSupported]);

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported || !enabled) return;
      const clean = text
        .replace(/[*_`#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'es-ES';
      if (voiceRef.current) utter.voice = voiceRef.current;
      utter.rate = 1;
      utter.pitch = 1;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
    },
    [ttsSupported, enabled],
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
