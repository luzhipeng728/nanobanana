/**
 * Gemini 图片生成适配器
 *
 * 支持模型：
 * - nano-banana: Gemini 2.5 Flash (快速)
 * - nano-banana-pro: Gemini 3 Pro (高质量)
 *
 * 特性：
 * - 优先 API 支持（省钱方案）
 * - 多 API Key 轮转（从数据库获取 Key 池）
 * - 参考图片支持
 */

import { ImageGenerationAdapter, type AdapterCapabilitiesConfig } from '../base-adapter';
import type {
  ImageGenerationParams,
  ImageGenerationResult,
} from '../types';
import { uploadBufferToR2 } from '@/lib/r2';
import { fetchAndCompressImage } from '@/lib/image-utils';
import { prisma } from '@/lib/prisma';
import { getGeminiKeys } from '@/lib/api-keys';

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

// API Key 状态管理（简化版：失败就轮到下一个，不记录失败状态）
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
  const index = state.currentKeyIndex % keys.length;

  console.log(`[GeminiAdapter] 使用 Key ${index + 1}/${keys.length}`);
  return { key: keys[index], index };
}

async function rotateToNextKey(currentIndex: number): Promise<boolean> {
  const keys = await loadGeminiKeys();
  if (keys.length <= 1) return false;

  const nextIndex = (currentIndex + 1) % keys.length;

  await prisma.apiKeyState.update({
    where: { id: 'gemini' },
    data: { currentKeyIndex: nextIndex },
  });

  console.log(`[GeminiAdapter] 轮转到 Key ${nextIndex + 1}/${keys.length}`);
  return true;
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

    // 标准 Gemini API（使用数据库中的 Key 池轮训）
    return await this.generateWithGeminiApi(params);
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
      // 每次重试前获取当前 Key（可能已经轮转）
      const currentKeyInfo = await getCurrentApiKey();
      const currentApiKey = currentKeyInfo?.key || keyInfo.key;
      const currentKeyIndex = currentKeyInfo?.index ?? keyInfo.index;

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
          console.error(`[GeminiAdapter] Key ${currentKeyIndex + 1} 失败: ${response.status} - ${errorText.substring(0, 200)}`);

          // 任何错误都轮转到下一个 Key
          const rotated = await rotateToNextKey(currentKeyIndex);
          if (rotated && attempt < MAX_RETRIES) {
            continue; // 用下一个 Key 重试
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
        console.error(`[GeminiAdapter] Key ${currentKeyIndex + 1} 异常:`, errorMessage);

        if (attempt === MAX_RETRIES) {
          return { success: false, error: errorMessage };
        }

        // 任何错误都轮转到下一个 Key 并重试
        await rotateToNextKey(currentKeyIndex);
        continue;
      }
    }

    return { success: false, error: 'Max retries exceeded' };
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
