/**
 * Where the assistant sends an evidence packet.
 *
 * Deliberately an OpenAI-compatible chat-completions call, because that shape
 * is spoken by hosted APIs and by every local runner worth using — Ollama, LM
 * Studio, llama.cpp's server, vLLM. A user who wants Kingfisher to stay
 * entirely on their machine points it at localhost and nothing changes.
 *
 * No key ships with the application and none is ever defaulted. An
 * unconfigured assistant is a disabled assistant, and every other part of the
 * product behaves exactly as it did before.
 */

import { withTimeout } from '@/database/retry';

export type AssistantMode =
  'explain' | 'plan' | 'calculate' | 'compare' | 'opening-prep' | 'review';

export interface AssistantConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export interface AssistantRequest {
  readonly system: string;
  readonly user: string;
  readonly signal?: AbortSignal;
}

export interface ChessAssistantProvider {
  readonly id: string;
  readonly name: string;
  ask(request: AssistantRequest): Promise<string>;
}

/** Generous: a cold local model can take a while to answer the first time. */
const REQUEST_TIMEOUT_MS = 60_000;

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly remedy?: string,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export class OpenAiCompatibleProvider implements ChessAssistantProvider {
  readonly id = 'openai-compatible';

  constructor(private readonly config: AssistantConfig) {}

  get name(): string {
    return `${this.config.model} at ${hostOf(this.config.baseUrl)}`;
  }

  async ask({ system, user, signal }: AssistantRequest): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          // Low but not zero: the answer should be steady across runs, since
          // the same evidence ought to produce the same reading.
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        // A deadline as well as the caller's signal. A local runner that is
        // loading a model, or a hosted endpoint that accepts and stalls, would
        // otherwise leave the panel waiting with no error path to reach.
        signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new AssistantError(
          'The assistant did not answer in time.',
          'A local runner loading a model for the first time can exceed this; retry once it is warm.',
        );
      }
      throw new AssistantError(
        'The assistant endpoint could not be reached.',
        `Check the base URL in Settings → Assistant. A local runner must be started separately.`,
      );
    }

    if (response.status === 429) {
      throw new AssistantError(
        'The assistant endpoint is rate limiting this session.',
        'Wait before asking again.',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AssistantError(
        'The assistant endpoint rejected the credentials.',
        'Check the API key in Settings → Assistant.',
      );
    }

    let payload: ChatResponse;
    try {
      payload = (await response.json()) as ChatResponse;
    } catch {
      throw new AssistantError(
        'The assistant endpoint returned something that was not JSON.',
        'This usually means the base URL points at a web page rather than an API.',
      );
    }

    if (!response.ok) {
      throw new AssistantError(
        payload.error?.message ?? `The assistant endpoint answered ${response.status}.`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      // A malformed or empty response is reported, never smoothed over: an
      // assistant that silently produces nothing looks like one that has no
      // opinion, which is a different and misleading thing.
      throw new AssistantError('The assistant returned an empty answer.');
    }
    return content.trim();
  }
}

export const createAssistantProvider = (config: AssistantConfig): ChessAssistantProvider | null =>
  config.baseUrl && config.model ? new OpenAiCompatibleProvider(config) : null;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
