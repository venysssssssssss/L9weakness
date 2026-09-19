import dotenv from 'dotenv';
dotenv.config();

export interface NvidiaConfig {
  apiKey: string | undefined;
  baseUrl: string;
  textModel: string;
  chatModels: string[]; // quality -> fallback chain for conversation
  fastModels: string[]; // cheap chain for learning/summaries
  visionModel: string;
  imageModel: string;
  imageSize: string; // e.g. "1024x1024"
  visionCooldownSec: number;
  visionDailyLimit: number;
  imageCooldownSec: number;
  imageDailyLimit: number;
}

// Chains measured 2026-09-19 with scripts/probe-models.sh (JSON PT-BR, p50): ultra-550b 1.6s, super-120b 3.0s,
// mistral-nemotron 1.2s, glm-5.3 21s, gpt-oss-20b 18s. kimi-k3/deepseek-v4-flash timed out; several ids 404 for this account.
const DEFAULT_CHAT = 'nvidia/nemotron-3-ultra-550b-a55b,nvidia/nemotron-3-super-120b-a12b,z-ai/glm-5.3,openai/gpt-oss-20b';
const DEFAULT_FAST = 'mistralai/mistral-nemotron,nvidia/nemotron-3-super-120b-a12b,nvidia/nemotron-3.5-lightning-30b-a3b,openai/gpt-oss-20b';
const csv = (v: string | undefined, fallback: string): string[] =>
  (v || fallback).split(',').map(m => m.trim()).filter(Boolean);

export function getConfig(): NvidiaConfig {
  const textModel = process.env.NVIDIA_TEXT_MODEL || 'openai/gpt-oss-20b';
  return {
    apiKey: process.env.NVIDIA_API_KEY,
    baseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''),
    textModel,
    chatModels: csv(process.env.NVIDIA_CHAT_MODELS, DEFAULT_CHAT),
    fastModels: csv(process.env.NVIDIA_FAST_MODELS, DEFAULT_FAST),
    visionModel: process.env.NVIDIA_VISION_MODEL || 'meta/llama-3.2-90b-vision-instruct',
    imageModel: process.env.NVIDIA_IMAGE_MODEL || 'stabilityai/sdxl-turbo',
    imageSize: process.env.NVIDIA_IMAGE_SIZE || '1024x1024',
    visionCooldownSec: parseInt(process.env.VISION_COOLDOWN_SEC || '45', 10),
    visionDailyLimit: parseInt(process.env.VISION_DAILY_LIMIT || '20', 10),
    imageCooldownSec: parseInt(process.env.IMAGE_COOLDOWN_SEC || '15', 10),
    imageDailyLimit: parseInt(process.env.IMAGE_DAILY_LIMIT || '15', 10),
  };
}

export function assertApiKey(): string {
  const { apiKey } = getConfig();
  if (!apiKey) throw new Error('NVIDIA_API_KEY não configurada no .env (build.nvidia.com)');
  return apiKey;
}

export function getImageDimensions(): { width: number; height: number } {
  const { imageSize } = getConfig();
  const [w, h] = imageSize.split('x').map(n => parseInt(n, 10));
  if (!w || !h || isNaN(w) || isNaN(h)) return { width: 1024, height: 1024 };
  return { width: w, height: h };
}
