const { getConfig, assertApiKey, getImageDimensions } = require('./config');

async function fetchWithAuth(path, body, timeoutMs = 30000) {
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
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
      const err = new Error(`${res.status} ${res.statusText}: ${msg}`);
      err.status = res.status;
      err.details = json;
      const remaining = res.headers.get('x-ratelimit-remaining') || res.headers.get('ratelimit-remaining');
      if (remaining) err.rateLimitRemaining = remaining;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function chat(options) {
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
      const json = await fetchWithAuth('/chat/completions', body, 30000);
      const msg = json.choices?.[0]?.message;
      const content = msg?.content || msg?.reasoning_content || msg?.reasoning;
      if (!content || !String(content).trim()) throw new Error('Resposta vazia da IA (NVIDIA)');
      return String(content).trim();
    } catch (e) {
      attempt++;
      if (e.status === 429 && attempt === 1) {
        console.warn(`[NVIDIA] 429 rate limit, aguardando 2s antes de retry (model=${model})`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
}

async function vision(prompt, imageBase64, mimeType, modelOverride) {
  const cfg = getConfig();
  const model = modelOverride || cfg.visionModel;
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const messages = [
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
      const json = await fetchWithAuth('/chat/completions', body, 45000);
      const msg = json.choices?.[0]?.message;
      const content = msg?.content || msg?.reasoning_content || msg?.reasoning;
      if (!content || !String(content).trim()) throw new Error('Resposta vazia da IA Vision (NVIDIA)');
      return String(content).trim();
    } catch (e) {
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

async function generateImage(prompt, opts) {
  const cfg = getConfig();
  const dims = opts?.width && opts?.height ? { width: opts.width, height: opts.height } : getImageDimensions();
  const model = cfg.imageModel;
  const negative_prompt = opts?.negative_prompt;

  const body = {
    model,
    prompt,
    n: 1,
    size: `${dims.width}x${dims.height}`,
    response_format: 'b64_json',
  };
  if (negative_prompt) body.negative_prompt = negative_prompt;
  if (opts?.seed !== undefined) body.seed = opts.seed;
  if (opts?.steps) body.steps = opts.steps;

  let attempt = 0;
  while (true) {
    try {
      const json = await fetchWithAuth('/images/generations', body, 60000);
      const b64 = json.data?.[0]?.b64_json;
      if (b64) return Buffer.from(b64, 'base64');
      const url = json.data?.[0]?.url;
      if (url) {
        if (url.startsWith('data:')) {
          const base64 = url.split(',')[1];
          return Buffer.from(base64, 'base64');
        }
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        return buf;
      }
      throw new Error('Resposta de imagem vazia (NVIDIA)');
    } catch (e) {
      attempt++;
      if (e.status === 429 && attempt === 1) {
        console.warn(`[NVIDIA Image] 429, retry em 3s (model=${model})`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw e;
    }
  }
}

async function ping() {
  const start = Date.now();
  try {
    await chat({ messages: [{ role: 'user', content: 'Ping' }], max_tokens: 30, temperature: 0 });
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw e;
    console.warn('[NVIDIA ping] erro mas latencia medida:', e.message);
  }
  return Date.now() - start;
}

function isAuthError(e) {
  return e?.status === 401 || e?.status === 403;
}

module.exports = { fetchWithAuth, chat, vision, generateImage, ping, isAuthError };
