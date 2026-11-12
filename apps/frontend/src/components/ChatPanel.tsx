import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { getAccessToken } from '../services/auth';
import { useSpeech } from '../hooks/useSpeech';
import { CallMode } from './CallMode';
import type { CharacterGender, VoiceProfile } from '../types';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}

interface ChatPanelProps {
  characterId: string;
  characterName: string;
  voiceGender?: CharacterGender;
  voiceProfile?: VoiceProfile | null;
  voiceStudioVoiceId?: string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export function ChatPanel({ characterId, characterName, voiceGender, voiceProfile, voiceStudioVoiceId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speech = useSpeech(false, voiceGender ?? 'unspecified', voiceProfile ?? null, voiceStudioVoiceId ?? null);
  const [callOpen, setCallOpen] = useState(false);

  // Scroll al último mensaje automáticamente
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cancelar fetch al desmontar
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;

    speech.stopListening();
    setInput('');
    setError(null);
    setBusy(true);

    // Añadir mensaje del usuario
    setMessages((prev) => [...prev, { role: 'user', text }]);
    // Placeholder de la respuesta
    setMessages((prev) => [...prev, { role: 'assistant', text: '', streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/api/chat/${characterId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken() ?? ''}`,
        },
        body: JSON.stringify({ message: text, voice: speech.enabled }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => 'Error de conexión');
        throw new Error(`${res.status}: ${errText}`);
      }

      // Leer SSE stream byte a byte
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';   // lo que queda incompleto

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            // Finalizar streaming
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, streaming: false };
              return copy;
            });
            setBusy(false);
            speech.speak(fullText);
            return;
          }
          try {
            const chunk = JSON.parse(payload) as { text?: string; error?: string };
            if (chunk.error) {
              setError(chunk.error);
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant' && !last.text) copy.pop();
                return copy;
              });
              setBusy(false);
              return;
            }
            if (chunk.text) {
              fullText += chunk.text;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, text: last.text + chunk.text };
                }
                return copy;
              });
            }
          } catch {
            // línea malformada, ignorar
          }
        }
      }

      // El stream terminó sin [DONE]: finalizar y hablar igualmente.
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, streaming: false };
        return copy;
      });
      speech.speak(fullText);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? 'Error de conexión');
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && !last.text) copy.pop();
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage().catch(() => {});
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage().catch(() => {});
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>�Y'� Chatea con <strong>{characterName}</strong></span>
        <div className="chat-header__actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              speech.stopSpeaking();
              speech.stopListening();
              setCallOpen(true);
            }}
            title="Iniciar videollamada simulada con el personaje"
          >
            Llamar
          </button>
          {speech.ttsSupported ? (
            <button
              type="button"
              className={`btn btn-ghost btn-sm${speech.enabled ? ' is-active' : ''}`}
              onClick={() => {
                if (speech.enabled) speech.stopSpeaking();
                speech.setEnabled(!speech.enabled);
              }}
              title={speech.enabled ? 'Silenciar la voz del personaje' : 'Escuchar las respuestas en voz alta'}
              aria-pressed={speech.enabled}
            >
              Voz: {speech.enabled ? 'ON' : 'OFF'}
            </button>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={clearChat} disabled={busy}>
            Limpiar
          </button>
        </div>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="chat-empty">
            Escribe un mensaje para empezar a hablar con {characterName}.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
              <span className="chat-bubble__label">
                {m.role === 'user' ? 'Tú' : characterName}
              </span>
              <p className="chat-bubble__text">
                {m.text}
                {m.streaming && <span className="chat-cursor" aria-hidden>▌</span>}
              </p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="chat-error" role="alert">�s� {error}</p>
      ) : null}
      {speech.error ? (
        <p className="chat-error" role="alert">{speech.error}</p>
      ) : null}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        {speech.sttSupported ? (
          <button
            type="button"
            className={`btn btn-ghost chat-mic${speech.listening ? ' is-listening' : ''}`}
            onClick={() => {
              if (speech.listening) {
                speech.stopListening();
              } else {
                speech.startListening((transcript) => {
                  setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
                });
              }
            }}
            disabled={busy}
            aria-pressed={speech.listening}
            title={speech.listening ? 'Detener dictado' : 'Dictar por voz'}
          >
            {speech.listening ? 'Escuchando…' : 'Micrófono'}
          </button>
        ) : null}
        <textarea
          className="input chat-input"
          rows={2}
          placeholder={`Escribe a ${characterName}… (Enter para enviar)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          aria-label="Mensaje"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !input.trim()}
        >
          {busy ? '…' : 'Enviar'}
        </button>
      </form>

      {callOpen ? (
        <CallMode
          characterId={characterId}
          characterName={characterName}
          voiceGender={voiceGender}
          voiceProfile={voiceProfile}
          voiceStudioVoiceId={voiceStudioVoiceId}
          onClose={() => setCallOpen(false)}
        />
      ) : null}
    </div>
  );
}
