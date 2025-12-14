/**
 * Gemini 图片生成适配器
 *
 * 支持模型：
 * - nano-banana: Gemini 2.5 Flash (快速)
 * - nano-banana-pro: Gemini 3 Pro (高质量)
 *
 * 特性：
 * - 优先 API 支持（省钱方案）
 * - 多 API Key 轮转
 * - Vertex AI 回退
 * - 参考图片支持
 */

import { ImageGenerationAdapter, type AdapterCapabilitiesConfig } from '../base-adapter';
import type {
  ImageGenerationParams,
  ImageGenerationResult,
  ImageResolution,
} from '../types';
import { uploadBufferToR2 } from '@/lib/r2';
import { fetchAndCompressImage } from '@/lib/image-utils';
import { prisma } from '@/lib/prisma';
import { getGeminiKeys } from '@/lib/api-keys';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 模型配置
// ============================================================================

const GEMINI_MODEL_MAP: Record<string, string> = {
  'nano-banana': 'gemini-2.5-flash-image',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
};

// ============================================================================
// API Key 管理（从数据库获取）
// ============================================================================

// 运行时缓存 Key 列表
let cachedGeminiKeys: string[] = [];
let keysLoadedAt = 0;
const KEY_CACHE_TTL = 60 * 1000; // 1 分钟缓存

async function loadGeminiKeys(): Promise<string[]> {
  const now = Date.now();
  if (cachedGeminiKeys.length > 0 && now - keysLoadedAt < KEY_CACHE_TTL) {
    return cachedGeminiKeys;
  }

  const keys = await getGeminiKeys();
  if (keys.length > 0) {
    cachedGeminiKeys = keys;
    keysLoadedAt = now;
    console.log(`[GeminiAdapter] 从数据库加载了 ${keys.length} 个 API Key`);
  }

  return cachedGeminiKeys;
}

const RECOVERY_TIME = 24 * 60 * 60 * 1000; // 24 小时后重试失败的 Key

// ============================================================================
// 优先 API 配置
// ============================================================================

const PRIORITY_API = {
  enabled: !!process.env.PRIORITY_IMAGE_API_BASE_URL,
  baseUrl: process.env.PRIORITY_IMAGE_API_BASE_URL || '',
  apiKey: process.env.PRIORITY_IMAGE_API_KEY || '',
  model: process.env.PRIORITY_IMAGE_API_MODEL || 'gemini-3-pro-image',
  maxRetries: parseInt(process.env.PRIORITY_IMAGE_API_MAX_RETRIES || '10', 10),
};

// ============================================================================
// Vertex AI 配置
// ============================================================================

const VERTEX_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '';
const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const VERTEX_MODEL_ID = 'gemini-2.0-flash-preview-image-generation';

// ============================================================================
// 辅助函数
// ============================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (status: number, errorMessage: string): boolean => {
  const retryableStatuses = [429, 500, 502, 503, 504];
  if (retryableStatuses.includes(status)) return true;

  const retryableMessages = [
    'overloaded', 'unavailable', 'timeout', 'temporarily',
    'try again', 'aborted', 'fetch failed', 'headers timeout',
  ];
  return retryableMessages.some(msg => errorMessage.toLowerCase().includes(msg));
};

// API Key 状态管理
async function getKeyState() {
  let state = await prisma.apiKeyState.findUnique({
    where: { id: 'gemini' },
  });

  if (!state) {
    state = await prisma.apiKeyState.create({
      data: {
        id: 'gemini',
        currentKeyIndex: 0,
        failedKeys: '[]',
        failedAt: '{}',
      },
    });
  }

  return state;
}

async function getCurrentApiKey(): Promise<{ key: string; index: number } | null> {
  const keys = await loadGeminiKeys();
  if (keys.length === 0) return null;

  const state = await getKeyState();
  const failedKeys: number[] = JSON.parse(state.failedKeys);
  const failedAt: Record<string, number> = JSON.parse(state.failedAt);
  const now = Date.now();

  // 清理过期的失败记录
  let hasRecovered = false;
  const stillFailedKeys: number[] = [];
  const stillFailedAt: Record<string, number> = {};

  for (const keyIndex of failedKeys) {
    const failTime = failedAt[String(keyIndex)];
    if (failTime && now - failTime > RECOVERY_TIME) {
      console.log(`[GeminiAdapter] Key ${keyIndex + 1} recovered after 24h cooldown`);
      hasRecovered = true;
    } else {
      stillFailedKeys.push(keyIndex);
      if (failTime) stillFailedAt[String(keyIndex)] = failTime;
    }
  }

  if (hasRecovered) {
    await prisma.apiKeyState.update({
      where: { id: 'gemini' },
      data: {
        failedKeys: JSON.stringify(stillFailedKeys),
        failedAt: JSON.stringify(stillFailedAt),
      },
    });
  }

  // 找第一个可用的 Key
  for (let i = 0; i < keys.length; i++) {
    const index = (state.currentKeyIndex + i) % keys.length;
    if (!stillFailedKeys.includes(index)) {
      if (index !== state.currentKeyIndex) {
        await prisma.apiKeyState.update({
          where: { id: 'gemini' },
          data: { currentKeyIndex: index },
        });
      }
      return { key: keys[index], index };
    }
  }

  console.warn(`[GeminiAdapter] All ${keys.length} keys exhausted!`);
  return { key: keys[0], index: 0 };
}

async function markKeyFailed(keyIndex: number): Promise<boolean> {
  const keys = await loadGeminiKeys();
  const state = await getKeyState();
  const failedKeys: number[] = JSON.parse(state.failedKeys);
  const failedAt: Record<string, number> = JSON.parse(state.failedAt);

  if (!failedKeys.includes(keyIndex)) {
    failedKeys.push(keyIndex);
    failedAt[String(keyIndex)] = Date.now();

    console.log(`[GeminiAdapter] Key ${keyIndex + 1}/${keys.length} marked as FAILED`);

    let nextIndex = -1;
    for (let i = 1; i < keys.length; i++) {
      const candidateIndex = (keyIndex + i) % keys.length;
      if (!failedKeys.includes(candidateIndex)) {
        nextIndex = candidateIndex;
        break;
      }
    }

    await prisma.apiKeyState.update({
      where: { id: 'gemini' },
      data: {
        currentKeyIndex: nextIndex >= 0 ? nextIndex : 0,
        failedKeys: JSON.stringify(failedKeys),
        failedAt: JSON.stringify(failedAt),
      },
    });

    if (nextIndex >= 0) {
      console.log(`[GeminiAdapter] Switched to Key ${nextIndex + 1}/${keys.length}`);
      return true;
    } else {
      console.error(`[GeminiAdapter] All keys exhausted!`);
      return false;
    }
  }

  return failedKeys.length < keys.length;
}

// ============================================================================
// Gemini 适配器
// ============================================================================

export class GeminiAdapter extends ImageGenerationAdapter {
  readonly name = 'gemini';
  readonly models = ['nano-banana', 'nano-banana-pro'];

  readonly capabilities: AdapterCapabilitiesConfig = {
    supportedResolutions: ['1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', 'auto'],
    supportsReferenceImages: true,
    maxReferenceImages: 10,
    extraOptions: [
      {
        key: 'enableGoogleSearch',
        label: 'Google Search',
        type: 'boolean',
        default: true,
        description: '启用 Google Search 增强（仅 Pro 模型）',
      },
    ],
  };

  /**
   * 生成图片
   */
  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const modelName = GEMINI_MODEL_MAP[params.model];
    if (!modelName) {
      return { success: false, error: `不支持的模型: ${params.model}` };
    }

    console.log(`[GeminiAdapter] 开始生成，模型: ${modelName}`);
    console.log(`[GeminiAdapter] 提示词: ${params.prompt.substring(0, 100)}...`);

    // 优先尝试 Priority API
    if (PRIORITY_API.enabled) {
      const priorityResult = await this.generateWithPriorityApi(params);
      if (priorityResult) {
        return priorityResult;
      }
      console.log(`[GeminiAdapter] Priority API 失败，回退到标准 API`);
    }

    // 标准 Gemini API
    const result = await this.generateWithGeminiApi(params);

    // 如果失败且有 Vertex AI 配置，尝试回退
    if (!result.success && VERTEX_PROJECT_ID) {
      console.log(`[GeminiAdapter] 尝试 Vertex AI 回退...`);
      return await this.generateWithVertexAI(params);
    }

    return result;
  }

  /**
   * 使用优先 API 生成
   */
  private async generateWithPriorityApi(params: ImageGenerationParams): Promise<ImageGenerationResult | null> {
    const priorityModel = PRIORITY_API.model;
    const apiUrl = `${PRIORITY_API.baseUrl}/v1beta/models/${priorityModel}:generateContent`;

    console.log(`[GeminiAdapter/Priority] 使用 Priority API: ${apiUrl}`);

    const parts = await this.buildParts(params);
    const requestBody = this.buildRequestBody(params, parts);

    for (let attempt = 0; attempt <= PRIORITY_API.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[GeminiAdapter/Priority] 重试 ${attempt}/${PRIORITY_API.maxRetries}...`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': PRIORITY_API.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 429 || response.status >= 500) {
            continue;
          }
          console.error(`[GeminiAdapter/Priority] API 错误: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const imageResult = await this.parseGeminiResponse(data);

        if (imageResult) {
          return {
            success: true,
            imageUrl: imageResult.imageUrl,
            meta: {
              model: `priority/${priorityModel}`,
              actualResolution: imageResult.size,
            },
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (error instanceof Error && error.name === 'AbortError') {
          console.log(`[GeminiAdapter/Priority] 超时，继续重试...`);
          continue;
        }
        console.error(`[GeminiAdapter/Priority] 错误:`, errorMessage);
      }
    }

    console.error(`[GeminiAdapter/Priority] 所有重试失败`);
    return null;
  }

  /**
   * 使用标准 Gemini API 生成
   */
  private async generateWithGeminiApi(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const keyInfo = await getCurrentApiKey();
    if (!keyInfo) {
      return { success: false, error: 'Gemini API Key 未配置' };
    }

    const modelName = GEMINI_MODEL_MAP[params.model];
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
    const MAX_RETRIES = 5;
    const INITIAL_DELAY = 2000;

    const parts = await this.buildParts(params);
    const requestBody = this.buildRequestBody(params, parts);

    // Pro 模型添加 Google Search
    if (params.model === 'nano-banana-pro') {
      requestBody.tools = [{ googleSearch: {} }];
    }

    let currentImageSize = params.resolution;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
          console.log(`[GeminiAdapter] 重试 ${attempt}/${MAX_RETRIES}，等待 ${delay}ms...`);
          await sleep(delay);

          // 4K 失败自动降级到 2K
          if (currentImageSize === '4K' && attempt >= 2) {
            console.log(`[GeminiAdapter] 4K 降级到 2K`);
            currentImageSize = '2K';
            const genConfig = requestBody.generationConfig as { imageConfig?: { image_size?: string } } | undefined;
            if (genConfig?.imageConfig) {
              genConfig.imageConfig.image_size = '2K';
            }
          }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000);

        const currentKeyInfo = await getCurrentApiKey();
        const currentApiKey = currentKeyInfo?.key || keyInfo.key;
        const currentKeyIndex = currentKeyInfo?.index ?? keyInfo.index;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': currentApiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();

          // 429 或 503 - 切换 Key
          if (response.status === 429 || response.status === 503) {
            const hasMoreKeys = await markKeyFailed(currentKeyIndex);
            if (hasMoreKeys) {
              attempt--;
              continue;
            }
            return { success: false, error: 'All Gemini API keys exhausted' };
          }

          if (attempt < MAX_RETRIES && isRetryableError(response.status, errorText)) {
            continue;
          }

          return { success: false, error: `Gemini API error: ${response.status}` };
        }

        const data = await response.json();
        const imageResult = await this.parseGeminiResponse(data);

        if (imageResult) {
          return {
            success: true,
            imageUrl: imageResult.imageUrl,
            meta: {
              model: modelName,
              actualResolution: imageResult.size,
            },
          };
        }

        return { success: false, error: 'No image data in response' };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt === MAX_RETRIES) {
          return { success: false, error: errorMessage };
        }

        const isNetworkError =
          (error instanceof Error && error.name === 'AbortError') ||
          errorMessage.includes('fetch failed') ||
          errorMessage.includes('timeout');

        if (isNetworkError) {
          continue;
        }

        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  /**
   * 使用 Vertex AI 生成（回退方案）
   */
  private async generateWithVertexAI(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    console.log(`[GeminiAdapter/Vertex] 开始 Vertex AI 生成...`);

    if (!VERTEX_PROJECT_ID) {
      return { success: false, error: 'Vertex AI not configured' };
    }

    try {
      const accessToken = await this.getVertexAccessToken();
      const parts = await this.buildParts(params);

      const requestBody: Record<string, unknown> = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      };

      if (params.aspectRatio || params.resolution) {
        requestBody.generationConfig = {
          ...requestBody.generationConfig as object,
          imageConfig: {
            ...(params.aspectRatio && params.aspectRatio !== 'auto' && { aspectRatio: params.aspectRatio }),
            ...(params.resolution && { imageSize: params.resolution }),
            personGeneration: 'allow_all',
          },
        };
      }

      const apiUrl = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL_ID}:generateContent`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Vertex AI error: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      const imageResult = await this.parseGeminiResponse(data);

      if (imageResult) {
        return {
          success: true,
          imageUrl: imageResult.imageUrl,
          meta: {
            model: `vertex-ai/${VERTEX_MODEL_ID}`,
            actualResolution: imageResult.size,
          },
        };
      }

      return { success: false, error: 'No image data in Vertex AI response' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Vertex AI error: ${errorMessage}` };
    }
  }

  /**
   * 构建请求 parts（包含文本和参考图片）
   */
  private async buildParts(params: ImageGenerationParams): Promise<unknown[]> {
    const parts: unknown[] = [{ text: params.prompt }];

    // 处理参考图片
    if (params.referenceImages && params.referenceImages.length > 0) {
      console.log(`[GeminiAdapter] 处理 ${params.referenceImages.length} 张参考图片...`);

      for (const imageUrl of params.referenceImages) {
        try {
          const compressed = await fetchAndCompressImage(imageUrl, {
            maxWidth: 1600,
            maxHeight: 1600,
            maxSizeBytes: 800 * 1024,
            quality: 0.8,
            format: 'jpeg',
          });

          if (compressed) {
            parts.push({
              inline_data: {
                mime_type: compressed.mimeType,
                data: compressed.base64,
              },
            });
          }
        } catch (error) {
          console.error(`[GeminiAdapter] 处理参考图片失败:`, error);
        }
      }

      console.log(`[GeminiAdapter] 添加了 ${parts.length - 1} 张压缩后的参考图片`);
    }

    return parts;
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(params: ImageGenerationParams, parts: unknown[]): Record<string, unknown> {
    const requestBody: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    };

    // 添加 imageConfig
    if (params.aspectRatio || params.resolution) {
      const imageConfig: Record<string, unknown> = {};

      if (params.aspectRatio && params.aspectRatio !== 'auto') {
        imageConfig.aspectRatio = params.aspectRatio;
      }
      if (params.resolution) {
        imageConfig.image_size = params.resolution;
      }

      (requestBody.generationConfig as Record<string, unknown>).imageConfig = imageConfig;
    }

    return requestBody;
  }

  /**
   * 解析 Gemini 响应，提取图片数据并上传到 R2
   */
  private async parseGeminiResponse(data: unknown): Promise<{ imageUrl: string; size?: string } | null> {
    const response = data as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data: string; mimeType?: string };
          }>;
        };
        finishReason?: string;
      }>;
      promptFeedback?: { blockReason?: string };
    };

    const candidates = response?.candidates;
    if (!candidates || candidates.length === 0) {
      if (response?.promptFeedback?.blockReason) {
        console.error(`[GeminiAdapter] 内容被拦截: ${response.promptFeedback.blockReason}`);
      }
      return null;
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      const finishReason = candidates[0]?.finishReason;
      console.error(`[GeminiAdapter] 无内容，finishReason: ${finishReason}`);
      return null;
    }

    // 查找图片数据
    for (const part of parts) {
      if (part.inlineData?.data) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        const buffer = Buffer.from(base64Data, 'base64');

        console.log(`[GeminiAdapter] 图片大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

        const imageUrl = await uploadBufferToR2(buffer, mimeType);
        console.log(`[GeminiAdapter] 图片上传成功: ${imageUrl}`);

        return { imageUrl };
      }
    }

    return null;
  }

  /**
   * 获取 Vertex AI Access Token
   */
  private async getVertexAccessToken(): Promise<string> {
    // 方式1: 服务账号 JSON
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      const jwt = await this.createVertexJWT(serviceAccount);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });
      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        throw new Error('Failed to get Vertex AI access token');
      }
      return tokenData.access_token;
    }

    // 方式2: ADC (本地开发)
    const os = await import('os');
    const adcPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');

    if (fs.existsSync(adcPath)) {
      const adcContent = fs.readFileSync(adcPath, 'utf-8');
      const adc = JSON.parse(adcContent) as {
        type?: string;
        client_id?: string;
        client_secret?: string;
        refresh_token?: string;
      };

      if (adc.type === 'authorized_user') {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: adc.client_id || '',
            client_secret: adc.client_secret || '',
            refresh_token: adc.refresh_token || '',
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to refresh ADC token');
        }

        const tokenData = await tokenResponse.json() as { access_token?: string };
        return tokenData.access_token || '';
      }
    }

    throw new Error('No Google Cloud credentials found');
  }

  /**
   * 创建 Vertex AI JWT
   */
  private async createVertexJWT(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsignedToken = `${base64Header}.${base64Payload}`;

    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsignedToken);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');

    return `${unsignedToken}.${signature}`;
  }

  /**
   * 获取模型显示标签
   */
  override getModelLabel(modelId: string): string {
    const labels: Record<string, string> = {
      'nano-banana': 'Gemini 快速',
      'nano-banana-pro': 'Gemini 高级',
    };
    return labels[modelId] || modelId;
  }
}
