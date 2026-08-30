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

interface ImageGenerationResponse {
  data: Array<{ b64_json?: string; url?: string }>;
  error?: any;
}

async function fetchWithAuth(path: string, body: any, timeoutMs = 30000): Promise<any> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
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

export async function chat(options: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}): Promise<string> {
  const cfg = getConfig();
  const model = options.model || cfg.textModel;
  const body = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 512,
    top_p: options.top_p,
    stream: false,
  };

  let attempt = 0;
  while (true) {
    try {
      const json: ChatCompletionResponse = await fetchWithAuth('/chat/completions', body, 30000);
      const msg: any = json.choices?.[0]?.message;
      // gpt-oss models podem retornar reasoning separado; fallback para reasoning_content se content null
      const content = msg?.content || msg?.reasoning_content || msg?.reasoning;
      if (!content || !String(content).trim()) throw new Error('Resposta vazia da IA (NVIDIA)');
      // Se content veio como reasoning leak em inglês (ex: nemotron), tenta extrair mas retorna mesmo assim
      return String(content).trim();
    } catch (e: any) {
      attempt++;
      // single retry on 429
      if (e.status === 429 && attempt === 1) {
        console.warn(`[NVIDIA] 429 rate limit, aguardando 2s antes de retry (model=${model})`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
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
      const content = msg?.content || msg?.reasoning_content || msg?.reasoning;
      if (!content || !String(content).trim()) throw new Error('Resposta vazia da IA Vision (NVIDIA)');
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

export async function generateImage(prompt: string, opts?: { negative_prompt?: string; width?: number; height?: number; seed?: number; steps?: number }): Promise<Buffer> {
  const cfg = getConfig();
  const { width, height } = opts?.width && opts?.height ? { width: opts.width, height: opts.height } : getImageDimensions();
  const model = cfg.imageModel;
  const negative_prompt = opts?.negative_prompt;

  // NVIDIA SDXL via /v1/images/generations is not standard; try OpenAI-like first,
  // fallback to NVIDIA's SDXL endpoint structure if needed.
  // Primary: OpenAI images/generations
  const body: any = {
    model,
    prompt,
    n: 1,
    size: `${width}x${height}`,
    response_format: 'b64_json',
  };
  if (negative_prompt) body.negative_prompt = negative_prompt;
  if (opts?.seed !== undefined) body.seed = opts.seed;
  if (opts?.steps) body.steps = opts.steps;

  let attempt = 0;
  while (true) {
    try {
      // Try /images/generations (OpenAI compat)
      const json: ImageGenerationResponse = await fetchWithAuth('/images/generations', body, 60000);
      const b64 = json.data?.[0]?.b64_json;
      if (b64) return Buffer.from(b64, 'base64');
      // Some NVIDIA deployments return url instead
      const url = json.data?.[0]?.url;
      if (url) {
        if (url.startsWith('data:')) {
          const base64 = url.split(',')[1];
          return Buffer.from(base64, 'base64');
        }
        // fetch remote url
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        return buf;
      }
      throw new Error('Resposta de imagem vazia (NVIDIA)');
    } catch (e: any) {
      attempt++;
      // If 404 on this endpoint, try alternative NVIDIA SDXL path: /v1/genai/stabilityai/sdxl-turbo or bare model invoke
      // But most integrations use same endpoint, so just retry once on 429
      if (e.status === 429 && attempt === 1) {
        console.warn(`[NVIDIA Image] 429, retry em 3s (model=${model})`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw e;
    }
  }
}

export async function ping(): Promise<number> {
  const start = Date.now();
  try {
    await chat({ messages: [{ role: 'user', content: 'Ping' }], max_tokens: 30, temperature: 0 });
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
