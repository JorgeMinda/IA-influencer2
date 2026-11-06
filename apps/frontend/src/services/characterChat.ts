import { getAccessToken } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

export interface ChatStreamHandlers {
  onToken: (text: string) => void;
  onDone: (fullText: string) => void;
}

/**
 * Envía un mensaje al personaje y consume el stream SSE de `/api/chat/{id}`.
 * Llama a `onToken` con cada fragmento y a `onDone` con el texto completo.
 * Lanza Error si el servidor responde con error o el stream trae un error.
 */
export async function streamCharacterChat(
  characterId: string,
  message: string,
  handlers: ChatStreamHandlers,
  signal: AbortSignal,
  voice = false,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/${characterId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken() ?? ''}`,
    },
    body: JSON.stringify({ message, voice }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => 'Error de conexión');
    throw new Error(`${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') {
        handlers.onDone(fullText);
        return;
      }

      let chunk: { text?: string; error?: string };
      try {
        chunk = JSON.parse(payload) as { text?: string; error?: string };
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.text) {
        fullText += chunk.text;
        handlers.onToken(chunk.text);
      }
    }
  }

  handlers.onDone(fullText);
}
