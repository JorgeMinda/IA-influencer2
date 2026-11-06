import { splitIntoSentences, varyRate } from './ttsText';

export interface TtsEngine {
  speak(text: string, profile: ResolvedVoiceProfile, onEnd?: () => void): void;
  stop(): void;
  isSpeaking(): boolean;
}

export interface ResolvedVoiceProfile {
  voiceName: string | null;
  gender: 'female' | 'male' | 'neutral' | 'unspecified';
  rate: number;
  pitch: number;
  pauseMs: number;
}

const DEFAULT_PROFILE: ResolvedVoiceProfile = {
  voiceName: null,
  gender: 'unspecified',
  rate: 1.0,
  pitch: 1.0,
  pauseMs: 200,
};

function resolveVoice(voices: SpeechSynthesisVoice[], profile: ResolvedVoiceProfile): SpeechSynthesisVoice | null {
  if (profile.voiceName) {
    const exact = voices.find((v) => v.name === profile.voiceName);
    if (exact) return exact;
  }
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  const pool = spanish.length > 0 ? spanish : voices;
  // Preferir voces "Online/Natural/Google" del español.
  const natural = pool.find((v) => /natural|online|google/i.test(v.name));
  if (natural) return natural;
  // Heurística por género (importada dinámicamente para evitar ciclo).
  return pool[0] ?? null;
}

export class BrowserTtsEngine implements TtsEngine {
  private speakingFlag = false;
  private cancelled = false;

  speak(text: string, profile: ResolvedVoiceProfile = DEFAULT_PROFILE, onEnd?: () => void): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.stop();
    this.cancelled = false;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const voice = resolveVoice(voices, profile);
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) {
      onEnd?.();
      return;
    }

    let index = 0;
    const speakNext = () => {
      if (this.cancelled) return;
      if (index >= sentences.length) {
        this.speakingFlag = false;
        onEnd?.();
        return;
      }
      const sentence = sentences[index];
      const utter = new SpeechSynthesisUtterance(sentence);
      const rate = varyRate(profile.rate, index);
      utter.rate = rate;
      utter.pitch = profile.pitch;
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
      } else {
        utter.lang = 'es-ES';
      }
      utter.onstart = () => {
        this.speakingFlag = true;
      };
      utter.onend = () => {
        if (this.cancelled) return;
        index += 1;
        if (index < sentences.length && profile.pauseMs > 0) {
          window.setTimeout(speakNext, profile.pauseMs);
        } else {
          speakNext();
        }
      };
      utter.onerror = () => {
        this.speakingFlag = false;
        onEnd?.();
      };
      synth.speak(utter);
    };

    speakNext();
  }

  stop(): void {
    this.cancelled = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.speakingFlag = false;
  }

  isSpeaking(): boolean {
    return this.speakingFlag;
  }
}