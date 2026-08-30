import dotenv from 'dotenv';
dotenv.config();

export interface NvidiaConfig {
  apiKey: string | undefined;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  imageModel: string;
  imageSize: string; // e.g. "1024x1024"
  visionCooldownSec: number;
  visionDailyLimit: number;
  imageCooldownSec: number;
  imageDailyLimit: number;
}

export function getConfig(): NvidiaConfig {
  return {
    apiKey: process.env.NVIDIA_API_KEY,
    baseUrl: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''),
    textModel: process.env.NVIDIA_TEXT_MODEL || 'openai/gpt-oss-20b',
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
