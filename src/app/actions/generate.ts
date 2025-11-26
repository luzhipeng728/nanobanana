"use server";

import OpenAI from "openai";
import { uploadBufferToR2 } from "@/lib/r2";
import { GEMINI_IMAGE_MODELS, type GeminiImageModel, type ImageGenerationConfig } from "@/types/image-gen";

// OpenAI Client for Prompt Rewriting
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

// Gemini API Key 管理器 - 支持多 Key 轮换
class GeminiKeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private failedKeys: Set<string> = new Set(); // 已失败的 Key（429 配额用尽）
  private failedKeyTimestamps: Map<string, number> = new Map(); // 记录失败时间
  private readonly RECOVERY_TIME = 24 * 60 * 60 * 1000; // 24 小时后重试失败的 Key

  constructor() {
    // 从环境变量加载所有 API Keys（支持多个）
    const keyEnvNames = [
      'GEMINI_API_KEY',
      'GEMINI_API_KEY_2',
      'GEMINI_API_KEY_3',
      'GEMINI_API_KEY_4',
      'GEMINI_API_KEY_5',
    ];

    for (const envName of keyEnvNames) {
      const key = process.env[envName];
      if (key) this.keys.push(key);
    }

    console.log(`[GeminiKeyManager] Initialized with ${this.keys.length} API key(s)`);
  }

  // 获取当前可用的 API Key
  getCurrentKey(): string | null {
    if (this.keys.length === 0) return null;

    // 清理过期的失败记录（24小时后重试）
    const now = Date.now();
    for (const [key, timestamp] of this.failedKeyTimestamps.entries()) {
      if (now - timestamp > this.RECOVERY_TIME) {
        this.failedKeys.delete(key);
        this.failedKeyTimestamps.delete(key);
        console.log(`[GeminiKeyManager] Key recovered after 24h cooldown`);
      }
    }

    // 找到第一个未失败的 Key
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[index];
      if (!this.failedKeys.has(key)) {
        this.currentIndex = index;
        return key;
      }
    }

    // 所有 Key 都失败了，返回第一个（让它报错）
    console.warn(`[GeminiKeyManager] All keys exhausted, using first key anyway`);
    return this.keys[0];
  }

  // 标记当前 Key 为 429 失败，切换到下一个
  markCurrentKeyFailed(): boolean {
    const currentKey = this.keys[this.currentIndex];
    if (currentKey) {
      this.failedKeys.add(currentKey);
      this.failedKeyTimestamps.set(currentKey, Date.now());
      console.log(`[GeminiKeyManager] Key ${this.currentIndex + 1} marked as failed (429), trying next...`);
    }

    // 尝试切换到下一个可用的 Key
    const nextKey = this.getCurrentKey();
    const hasAvailableKey = nextKey !== null && !this.failedKeys.has(nextKey);

    if (hasAvailableKey) {
      console.log(`[GeminiKeyManager] Switched to key ${this.currentIndex + 1}`);
    } else {
      console.warn(`[GeminiKeyManager] No more available keys!`);
    }

    return hasAvailableKey;
  }

  // 获取状态信息
  getStatus(): { total: number; available: number; failed: number } {
    return {
      total: this.keys.length,
      available: this.keys.length - this.failedKeys.size,
      failed: this.failedKeys.size,
    };
  }
}

// 全局 Key 管理器实例
const geminiKeyManager = new GeminiKeyManager();

export async function rewritePrompt(prompt: string) {
  if (!process.env.OPENAI_API_KEY) {
    return prompt + " (OpenAI Key Missing)";
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "zai-glm-4.6",
      messages: [
        {
          role: "system",
          content: "You are an expert AI art prompt engineer. Rewrite the user's prompt to be more descriptive, artistic, and suitable for a high-quality image generation model. Keep it under 100 words. Return only the rewritten prompt."
        },
        { role: "user", content: prompt }
      ],
    });

    return response.choices[0]?.message?.content || prompt;
  } catch (error) {
    console.error("OpenAI Rewrite Error:", error);
    return prompt;
  }
}

// 睡眠函数（用于重试延迟）
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 判断是否应该重试的错误
const isRetryableError = (status: number, errorMessage: string): boolean => {
  // 503: 服务不可用
  // 429: 请求过多（限流）
  // 500: 内部服务器错误
  // 502: 网关错误
  // 504: 网关超时
  const retryableStatuses = [429, 500, 502, 503, 504];

  if (retryableStatuses.includes(status)) {
    return true;
  }

  // 检查错误消息
  const retryableMessages = [
    'overloaded',
    'unavailable',
    'timeout',
    'temporarily',
    'try again',
    'aborted',
    'fetch failed',
    'headers timeout',
  ];

  return retryableMessages.some(msg =>
    errorMessage.toLowerCase().includes(msg)
  );
};

export async function generateImageAction(
  prompt: string,
  model: GeminiImageModel = "nano-banana-pro",
  configOptions: ImageGenerationConfig = {},
  referenceImages: string[] = []
) {
  // 使用 Key 管理器获取当前可用的 Key
  const apiKey = geminiKeyManager.getCurrentKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is missing");
  }

  const keyStatus = geminiKeyManager.getStatus();
  console.log(`[Gemini] Using key ${keyStatus.total - keyStatus.failed}/${keyStatus.total}`);

  const modelName = GEMINI_IMAGE_MODELS[model];
  const MAX_RETRIES = 5; // 最多重试 5 次
  const INITIAL_DELAY = 2000; // 初始延迟 2 秒

  console.log(`Generating image with model: ${modelName}, prompt: ${prompt.substring(0, 50)}...`);
  console.log(`Config:`, configOptions);
  console.log(`Reference images:`, referenceImages.length);

  // Build parts array - start with text prompt
  const parts: any[] = [
    {
      text: prompt,
    },
  ];

  // Add reference images if provided
  if (referenceImages.length > 0) {
    console.log(`Fetching ${referenceImages.length} reference images...`);

    for (const imageUrl of referenceImages) {
      try {
        // Fetch the image
        const response = await fetch(imageUrl);
        if (!response.ok) {
          console.warn(`Failed to fetch reference image: ${imageUrl}`);
          continue;
        }

        // Get image data as buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString('base64');

        // Determine mime type from response or default to jpeg
        const mimeType = response.headers.get('content-type') || 'image/jpeg';

        // Add to parts array
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        });
      } catch (error) {
        console.error(`Error fetching reference image ${imageUrl}:`, error);
      }
    }

    console.log(`Successfully added ${parts.length - 1} reference images`);
  }

  // Build request body
  const requestBody: any = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],  // 官方示例要求同时返回 IMAGE 和 TEXT
    },
  };

  // Add imageConfig if options provided
  if (configOptions.aspectRatio || configOptions.imageSize) {
    requestBody.generationConfig.imageConfig = {};
    if (configOptions.aspectRatio) {
      requestBody.generationConfig.imageConfig.aspectRatio = configOptions.aspectRatio;
    }
    if (configOptions.imageSize) {
      // 注意：API 使用 image_size (下划线) 而不是 imageSize
      requestBody.generationConfig.imageConfig.image_size = configOptions.imageSize;
    }
  }

  // Pro 模型添加 Google Search 工具（官方示例要求）
  if (model === "nano-banana-pro") {
    requestBody.tools = [{ googleSearch: {} }];
  }

  // API URL - 非流式 generateContent
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  // 当前使用的 imageSize（可能会降级）
  let currentImageSize = configOptions.imageSize;

  // 重试循环
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // 指数退避：2s, 4s, 8s, 16s, 32s
        const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
        console.log(`⏳ Retry attempt ${attempt}/${MAX_RETRIES}, waiting ${delay}ms...`);
        await sleep(delay);

        // 4K 失败自动降级到 2K
        if (currentImageSize === '4K' && attempt >= 2) {
          console.log(`📉 Downgrading from 4K to 2K due to repeated failures`);
          currentImageSize = '2K';
          if (requestBody.generationConfig.imageConfig) {
            requestBody.generationConfig.imageConfig.image_size = '2K';
          }
        }
      }

      // Use native fetch with curl-like request
      // 设置 2 分钟超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 秒 = 2 分钟

      // 每次请求前获取当前可用的 Key（可能在重试过程中切换了）
      const currentApiKey = geminiKeyManager.getCurrentKey() || apiKey;

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
        const errorMessage = `Gemini API error: ${response.status} - ${errorText}`;

        // 429 错误（配额用尽）- 尝试切换 Key
        if (response.status === 429) {
          const isQuotaExhausted = errorText.includes('RESOURCE_EXHAUSTED') ||
            errorText.includes('quota') ||
            errorText.includes('exceeded');

          if (isQuotaExhausted) {
            console.warn(`⚠️  429 Quota exhausted, attempting to switch API key...`);
            const hasMoreKeys = geminiKeyManager.markCurrentKeyFailed();

            if (hasMoreKeys) {
              // 有备用 Key，立即重试（不算作常规重试）
              console.log(`🔄 Retrying with backup API key...`);
              continue;
            } else {
              // 没有更多可用的 Key
              console.error(`❌ All API keys exhausted!`);
              throw new Error("All Gemini API keys quota exhausted. Please try again later.");
            }
          }
        }

        // 检查是否应该重试（其他可重试错误）
        if (attempt < MAX_RETRIES && isRetryableError(response.status, errorText)) {
          console.warn(`⚠️  Retryable error (${response.status}): ${errorText.substring(0, 100)}...`);
          continue; // 继续重试
        }

        // 不可重试的错误或已达到最大重试次数
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("✅ Gemini API response received");

      // Parse response
      const candidates = data?.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error("No candidates returned from Gemini API");
      }

      const parts = candidates[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error("No content parts returned");
      }

      // Find the image part (inlineData) - iterate through parts
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log("Image data found, processing...");
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || "image/png";
          const buffer = Buffer.from(base64Data, "base64");

          console.log(`Image size: ${buffer.length} bytes, MIME type: ${mimeType}`);

          // Upload to R2
          const imageUrl = await uploadBufferToR2(buffer, mimeType);

          console.log(`Image uploaded to R2: ${imageUrl}`);

          return {
            success: true,
            imageUrl,
            prompt,
            model: modelName,
          };
        }
      }

      // If no image was found
      throw new Error("No image data found in response");

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';

      // 网络错误（fetch failed, abort, timeout）总是可重试
      const isNetworkError =
        errorName === 'AbortError' ||
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT');

      // 如果是最后一次尝试，返回错误
      if (attempt === MAX_RETRIES) {
        console.error(`❌ Gemini Generation Error (after ${MAX_RETRIES} retries):`, error);
        return {
          success: false,
          error: errorMessage,
        };
      }

      // 网络错误总是重试
      if (isNetworkError) {
        console.warn(`⚠️  Network error (${errorName || 'fetch failed'}), will retry... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }

      // 检查是否是可重试的 API 错误
      const statusMatch = errorMessage.match(/error: (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;

      if (!isRetryableError(status, errorMessage)) {
        // 不可重试的错误，直接返回
        console.error("❌ Non-retryable Gemini Generation Error:", error);
        return {
          success: false,
          error: errorMessage,
        };
      }

      // 可重试的错误，继续循环
      console.warn(`⚠️  Retryable error, will retry... (attempt ${attempt + 1}/${MAX_RETRIES})`);
    }
  }

  // 理论上不会到这里，但以防万一
  return {
    success: false,
    error: "Max retries exceeded",
  };
}
