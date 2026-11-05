import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { getToken } from '../services/auth';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
}

interface ChatPanelProps {
  characterId: string;
  characterName: string;
}

const WS_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000')
  .replace(/^http/, 'ws');

export function ChatPanel({ characterId, characterName }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Scroll al último mensaje automáticamente
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Limpiar WebSocket al desmontar
  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;

    setInput('');
    setError(null);
    setBusy(true);

    // Añadir mensaje del usuario al historial visual
    setMessages((prev) => [...prev, { role: 'user', text }]);

    // Preparar placeholder de respuesta con streaming
    setMessages((prev) => [...prev, { role: 'assistant', text: '', streaming: true }]);

    const token = getToken();
    const ws = new WebSocket(`${WS_BASE}/api/chat/${characterId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ token: token ?? '', message: text }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === 'token') {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, text: last.text + msg.text };
            }
            return copy;
          });
        } else if (msg.type === 'done') {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, streaming: false };
            }
            return copy;
          });
          setBusy(false);
          ws.close();
        } else if (msg.type === 'error') {
          setError(msg.message ?? 'Error desconocido.');
          // Quitar placeholder vacío si no llegó nada
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant' && !last.text) copy.pop();
            return copy;
          });
          setBusy(false);
          ws.close();
        }
      } catch {
        // ignorar líneas malformadas
      }
    };

    ws.onerror = () => {
      setError('Error de conexión con el servidor.');
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && !last.text) copy.pop();
        return copy;
      });
      setBusy(false);
    };

    ws.onclose = () => {
      if (busy) setBusy(false);
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>💬 Chatea con <strong>{characterName}</strong></span>
        <button className="btn btn-ghost btn-sm" onClick={clearChat} disabled={busy}>
          Limpiar
        </button>
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
        <p className="chat-error" role="alert">⚠ {error}</p>
      ) : null}

      <form className="chat-input-row" onSubmit={handleSubmit}>
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
    </div>
  );
}
