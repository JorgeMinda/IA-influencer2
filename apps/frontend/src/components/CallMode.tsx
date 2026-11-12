import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import { fileUrl } from '../services/api';
import { listReferences } from '../services/endpoints';
import { streamCharacterChat } from '../services/characterChat';
import { Monogram } from './ImageFrame';
import type { CharacterGender, VoiceProfile } from '../types';

interface CallModeProps {
  characterId: string;
  characterName: string;
  voiceGender?: CharacterGender;
  voiceProfile?: VoiceProfile | null;
  voiceStudioVoiceId?: string | null;
  language?: string;
  onClose: () => void;
}

type CallStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Videollamada simulada: avatar del personaje + voz (TTS) + micrófono (STT).
 * No usa WebRTC ni lipsync (eso requiere GPU). Funciona con las APIs del navegador.
 */
export function CallMode({ characterId, characterName, voiceGender, voiceProfile, voiceStudioVoiceId, language, onClose }: CallModeProps) {
  const speech = useSpeech(true, voiceGender ?? 'unspecified', voiceProfile ?? null, voiceStudioVoiceId ?? null, language ?? 'es-ES');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLine, setUserLine] = useState('');
  const [assistantLine, setAssistantLine] = useState('');
  const [status, setStatus] = useState<CallStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);

  // Cargar la primera imagen de referencia como avatar.
  useEffect(() => {
    let alive = true;
    listReferences(characterId)
      .then((page) => {
        if (!alive) return;
        const ref = page.items.find((r) => r.thumbnail_url) ?? page.items[0];
        setAvatarUrl(ref?.url ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [characterId]);

  // Colgar al desmontar: cancelar stream, voz y micrófono.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setError(null);
      setUserLine(text);
      setAssistantLine('');
      setBusy(true);
      setStatus('thinking');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamCharacterChat(
          characterId,
          text,
          {
            onToken: (chunk) => {
              setStatus('speaking');
              setAssistantLine((prev) => prev + chunk);
            },
            onDone: (fullText) => {
              speech.speak(fullText);
            },
          },
          controller.signal,
          true,
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message ?? 'No se pudo conectar.');
      } finally {
        setBusy(false);
        setStatus('idle');
      }
    },
    [busy, characterId, speech],
  );

  function toggleMic() {
    if (speech.listening) {
      speech.stopListening();
      setStatus('idle');
      return;
    }
    speech.stopSpeaking();
    setStatus('listening');
    speech.startListening((transcript) => {
      ask(transcript).catch(() => {});
    });
  }

  function hangUp() {
    abortRef.current?.abort();
    speech.stopSpeaking();
    speech.stopListening();
    onClose();
  }

  const statusLabel = speech.listening
    ? 'Escuchando…'
    : status === 'thinking'
      ? 'Pensando…'
      : speech.speaking
        ? 'Hablando…'
        : 'En llamada';

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label={`Llamada con ${characterName}`}>
      <div className="call-stage">
        <div
          className={`call-avatar${speech.speaking ? ' is-speaking' : ''}${speech.listening ? ' is-listening' : ''}`}
        >
          {avatarUrl ? (
            <img src={fileUrl(avatarUrl)} alt={characterName} />
          ) : (
            <Monogram name={characterName} id={characterId} />
          )}
        </div>

        <h2 className="call-name">{characterName}</h2>
        <p className="call-status">
          <span className={`call-dot call-dot--${status}${speech.listening ? ' is-listening' : ''}`} aria-hidden />
          {statusLabel}
        </p>

        <div className="call-captions" aria-live="polite">
          {userLine ? <p className="call-caption call-caption--user">Tú: {userLine}</p> : null}
          {assistantLine ? (
            <p className="call-caption call-caption--ai">
              {characterName}: {assistantLine}
            </p>
          ) : null}
          {!userLine && !assistantLine ? (
            <p className="call-caption call-caption--hint">Toca el micrófono y habla para comenzar.</p>
          ) : null}
        </div>

        {error ? <p className="call-error" role="alert">{error}</p> : null}
        {speech.error ? <p className="call-error" role="alert">{speech.error}</p> : null}
        {!speech.sttSupported ? (
          <p className="call-error" role="alert">
            Tu navegador no permite dictado por voz. Usa Chrome o Edge.
          </p>
        ) : null}
      </div>

      <div className="call-controls">
        <button
          type="button"
          className={`call-btn${speech.listening ? ' is-active' : ''}`}
          onClick={toggleMic}
          aria-pressed={speech.listening}
          title={speech.listening ? 'Dejar de escuchar' : 'Hablar'}
        >
          {speech.listening ? 'Escuchando' : 'Micrófono'}
        </button>
        <button
          type="button"
          className={`call-btn${speech.enabled ? ' is-active' : ''}`}
          onClick={() => {
            if (speech.enabled) speech.stopSpeaking();
            speech.setEnabled(!speech.enabled);
          }}
          aria-pressed={speech.enabled}
          title="Alternar la voz del personaje"
        >
          Voz {speech.enabled ? 'ON' : 'OFF'}
        </button>
        <button type="button" className="call-btn call-btn--danger" onClick={hangUp} title="Colgar">
          Colgar
        </button>
      </div>
    </div>
  );
}
