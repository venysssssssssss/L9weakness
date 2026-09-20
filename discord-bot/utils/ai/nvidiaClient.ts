import { getConfig, assertApiKey, getImageDimensions } from './config';

// Types for OpenAI-compatible API
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string | null; reasoning?: string; reasoning_content?: string }; finish_reason: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: any;
}

async function fetchWithAuth(path: string, body: any, timeoutMs = 30000): Promise<any> {
  const cfg = getConfig();
  const url = path.startsWith('http') ? path : `${cfg.baseUrl}${path}`;
  const key = assertApiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
      const err: any = new Error(`${res.status} ${res.statusText}: ${msg}`);
      err.status = res.status;
      err.details = json;
      // expose rate limit headers if present
      const remaining = res.headers.get('x-ratelimit-remaining') || res.headers.get('ratelimit-remaining');
      if (remaining) err.rateLimitRemaining = remaining;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// Strips <think> blocks / ```json fences and returns the first {...} object, or null.
export function extractJson(raw: string): any {
  if (typeof raw !== 'string') return null;
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// Auth failures are global; anything else (429, 5xx, timeout, 404 model, empty/truncated) tries the next model.
const retryable = (e: any) => !isAuthError(e);

export async function chat(options: {
  model?: string;
  models?: string[]; // fallback chain; overrides model
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  timeoutMs?: number;
}): Promise<string> {
  const cfg = getConfig();
  const chain = options.models?.length ? options.models : [options.model || cfg.textModel];
  let lastError: any;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const body = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 512,
      top_p: options.top_p,
      stream: false,
    };
    try {
      const json: ChatCompletionResponse = await fetchWithAuth('/chat/completions', body, options.timeoutMs ?? 30000);
      const choice = json.choices?.[0];
      if (choice?.finish_reason === 'length') throw new Error('Resposta truncada (length)');
      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('Resposta vazia da IA (NVIDIA)');
      return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    } catch (e: any) {
      lastError = e;
      const next = chain[i + 1];
      if (!next || !retryable(e)) throw e;
      console.warn(`[NVIDIA] fallback ${model} -> ${next}: ${String(e.message).slice(0, 80)}`);
    }
  }
  throw lastError;
}

export async function vision(prompt: string, imageBase64: string, mimeType: string, modelOverride?: string): Promise<string> {
  const cfg = getConfig();
  const model = modelOverride || cfg.visionModel;

  // NVIDIA expects OpenAI vision format: content array with text + image_url
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];

  const body = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 1024,
    stream: false,
  };

  let attempt = 0;
  while (true) {
    try {
      const json: ChatCompletionResponse = await fetchWithAuth('/chat/completions', body, 45000);
      const msg: any = json.choices?.[0]?.message;
      const content = json.choices?.[0]?.finish_reason === 'length' ? null : msg?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('Resposta vazia da IA Vision (NVIDIA)');
      return String(content).trim();
    } catch (e: any) {
      attempt++;
      if (e.status === 429 && attempt === 1) {
        console.warn(`[NVIDIA Vision] 429, retry em 2s (model=${model})`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
}

// NVIDIA genai image endpoint (ai.api.nvidia.com/v1/genai/<model>). Probed 2026-09-19 on this account:
// flux.2-klein-4b 2.5-3s, best prompt adherence (renders text), steps<=4, rejects mode/cfg_scale;
// flux.1-dev 5-7s, needs mode+cfg_scale; schnell/cosmos3 answer 202 (async, unsupported here); sdxl*/sd3*/bria 404.
function imageBody(model: string, prompt: string, width: number, height: number, seed: number) {
  const base = { prompt, width, height, seed };
  return /flux\.1/.test(model) ? { ...base, mode: 'base', cfg_scale: 3.5, steps: 28 } : { ...base, steps: 4 };
}

export async function generateImage(prompt: string, opts?: { width?: number; height?: number; seed?: number }): Promise<Buffer> {
  const cfg = getConfig();
  const { width, height } = opts?.width && opts?.height ? { width: opts.width, height: opts.height } : getImageDimensions();
  const seed = opts?.seed ?? Math.floor(Math.random() * 1_000_000);
  let lastError: any;
  for (let i = 0; i < cfg.imageModels.length; i++) {
    const model = cfg.imageModels[i];
    try {
      const json: any = await fetchWithAuth(`${cfg.imageBaseUrl}/${model}`, imageBody(model, prompt, width, height, seed), 120000);
      const b64 = json?.artifacts?.[0]?.base64 || json?.image || json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('Resposta de imagem vazia (NVIDIA)');
      return Buffer.from(b64, 'base64');
    } catch (e: any) {
      lastError = e;
      const next = cfg.imageModels[i + 1];
      if (!next || isAuthError(e)) throw e;
      console.warn(`[NVIDIA Image] fallback ${model} -> ${next}: ${String(e.message).slice(0, 80)}`);
    }
  }
  throw lastError;
}

export async function ping(): Promise<number> {
  const start = Date.now();
  try {
    await chat({ models: getConfig().chatModels, messages: [{ role: 'user', content: 'Ping' }], max_tokens: 30, temperature: 0 });
  } catch (e: any) {
    // Even if error, we measured latency, but rethrow to signal unhealthy
    // If 401/403, propagate
    if (e.status === 401 || e.status === 403) throw e;
    // For other errors, still return latency but log
    console.warn('[NVIDIA ping] erro mas latencia medida:', e.message);
  }
  return Date.now() - start;
}

export function isAuthError(e: any): boolean {
  return e?.status === 401 || e?.status === 403;
}
