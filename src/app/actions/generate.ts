"use server";

import OpenAI from "openai";
import { uploadBufferToR2 } from "@/lib/r2";
import { GEMINI_IMAGE_MODELS, type GeminiImageModel, type ImageGenerationConfig } from "@/types/image-gen";
import { prisma } from "@/lib/prisma";

// OpenAI Client for Prompt Rewriting
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

// 从环境变量加载所有 API Keys
const GEMINI_API_KEYS: string[] = [];
const keyEnvNames = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_2',
  'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4',
  'GEMINI_API_KEY_5',
];
for (const envName of keyEnvNames) {
  const key = process.env[envName];
  if (key) GEMINI_API_KEYS.push(key);
}
console.log(`[GeminiKeys] Loaded ${GEMINI_API_KEYS.length} API key(s)`);

const RECOVERY_TIME = 24 * 60 * 60 * 1000; // 24 小时后重试失败的 Key

// 获取或初始化 API Key 状态（从数据库）
async function getKeyState() {
  let state = await prisma.apiKeyState.findUnique({
    where: { id: "gemini" },
  });

  if (!state) {
    // 首次运行，创建初始状态
    state = await prisma.apiKeyState.create({
      data: {
        id: "gemini",
        currentKeyIndex: 0,
        failedKeys: "[]",
        failedAt: "{}",
      },
    });
  }

  return state;
}

// 获取当前可用的 API Key（全局状态，从数据库读取）
async function getCurrentApiKey(): Promise<{ key: string; index: number } | null> {
  if (GEMINI_API_KEYS.length === 0) return null;

  const state = await getKeyState();
  const failedKeys: number[] = JSON.parse(state.failedKeys);
  const failedAt: Record<string, number> = JSON.parse(state.failedAt);
  const now = Date.now();

  // 清理过期的失败记录（24小时后恢复）
  let hasRecovered = false;
  const stillFailedKeys: number[] = [];
  const stillFailedAt: Record<string, number> = {};

  for (const keyIndex of failedKeys) {
    const failTime = failedAt[String(keyIndex)];
    if (failTime && now - failTime > RECOVERY_TIME) {
      console.log(`[GeminiKeys] Key ${keyIndex + 1} recovered after 24h cooldown`);
      hasRecovered = true;
    } else {
      stillFailedKeys.push(keyIndex);
      if (failTime) stillFailedAt[String(keyIndex)] = failTime;
    }
  }

  // 如果有恢复的 Key，更新数据库
  if (hasRecovered) {
    await prisma.apiKeyState.update({
      where: { id: "gemini" },
      data: {
        failedKeys: JSON.stringify(stillFailedKeys),
        failedAt: JSON.stringify(stillFailedAt),
      },
    });
  }

  // 从当前索引开始，找第一个可用的 Key
  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const index = (state.currentKeyIndex + i) % GEMINI_API_KEYS.length;
    if (!stillFailedKeys.includes(index)) {
      // 如果找到的不是当前索引，更新数据库
      if (index !== state.currentKeyIndex) {
        await prisma.apiKeyState.update({
          where: { id: "gemini" },
          data: { currentKeyIndex: index },
        });
      }
      return { key: GEMINI_API_KEYS[index], index };
    }
  }

  // 所有 Key 都失败了，返回第一个（让它报错）
  console.warn(`[GeminiKeys] All ${GEMINI_API_KEYS.length} keys exhausted!`);
  return { key: GEMINI_API_KEYS[0], index: 0 };
}

// 标记当前 Key 为 429 失败，立即切换到下一个（全局生效）
async function markKeyFailed(keyIndex: number): Promise<boolean> {
  const state = await getKeyState();
  const failedKeys: number[] = JSON.parse(state.failedKeys);
  const failedAt: Record<string, number> = JSON.parse(state.failedAt);

  // 添加到失败列表
  if (!failedKeys.includes(keyIndex)) {
    failedKeys.push(keyIndex);
    failedAt[String(keyIndex)] = Date.now();

    console.log(`[GeminiKeys] Key ${keyIndex + 1}/${GEMINI_API_KEYS.length} marked as FAILED (429)`);

    // 切换到下一个可用的 Key
    let nextIndex = -1;
    for (let i = 1; i < GEMINI_API_KEYS.length; i++) {
      const candidateIndex = (keyIndex + i) % GEMINI_API_KEYS.length;
      if (!failedKeys.includes(candidateIndex)) {
        nextIndex = candidateIndex;
        break;
      }
    }

    // 更新数据库
    await prisma.apiKeyState.update({
      where: { id: "gemini" },
      data: {
        currentKeyIndex: nextIndex >= 0 ? nextIndex : 0,
        failedKeys: JSON.stringify(failedKeys),
        failedAt: JSON.stringify(failedAt),
      },
    });

    if (nextIndex >= 0) {
      console.log(`[GeminiKeys] Switched to Key ${nextIndex + 1}/${GEMINI_API_KEYS.length}`);
      return true;
    } else {
      console.error(`[GeminiKeys] All keys exhausted! No backup available.`);
      return false;
    }
  }

  return failedKeys.length < GEMINI_API_KEYS.length;
}

// 获取 Key 状态信息
async function getKeyStatus(): Promise<{ total: number; available: number; current: number; failed: number[] }> {
  const state = await getKeyState();
  const failedKeys: number[] = JSON.parse(state.failedKeys);
  return {
    total: GEMINI_API_KEYS.length,
    available: GEMINI_API_KEYS.length - failedKeys.length,
    current: state.currentKeyIndex + 1,
    failed: failedKeys.map(i => i + 1),
  };
}

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
  // 获取当前可用的 Key（从数据库读取全局状态）
  const keyInfo = await getCurrentApiKey();
  if (!keyInfo) {
    throw new Error("Gemini API Key is missing");
  }

  const status = await getKeyStatus();
  console.log(`[Gemini] Using Key ${status.current}/${status.total} (${status.available} available, failed: [${status.failed.join(',')}])`);

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
      // 设置 10 分钟超时（Gemini 图片生成较慢，尤其是高清 + 参考图）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 600 秒 = 10 分钟

      // 每次请求前获取当前可用的 Key（可能在重试/并发过程中切换了）
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
        const errorMessage = `Gemini API error: ${response.status} - ${errorText}`;

        // 429 错误（配额用尽）或 503 错误（服务过载）- 立即切换 Key 并重试
        if (response.status === 429 || response.status === 503) {
          const isQuotaExhausted = errorText.includes('RESOURCE_EXHAUSTED') ||
            errorText.includes('quota') ||
            errorText.includes('exceeded');
          const isOverloaded = errorText.includes('overloaded') ||
            errorText.includes('unavailable') ||
            response.status === 503;

          if (isQuotaExhausted || isOverloaded) {
            const reason = response.status === 429 ? 'Quota exhausted' : 'Overloaded';
            console.warn(`⚠️  ${response.status} ${reason} on Key ${currentKeyIndex + 1}, switching...`);
            const hasMoreKeys = await markKeyFailed(currentKeyIndex);

            if (hasMoreKeys) {
              // 有备用 Key，立即重试（不增加 attempt 计数）
              console.log(`🔄 Retrying immediately with next available key...`);
              attempt--; // 不计入重试次数
              continue;
            } else {
              // 没有更多可用的 Key，尝试 Vertex AI fallback
              console.warn(`⚠️  All API keys exhausted! Trying Vertex AI fallback...`);
              try {
                const vertexResult = await generateImageWithVertexAI(prompt, model, configOptions, referenceImages);
                if (vertexResult.success) {
                  console.log(`✅ Vertex AI fallback succeeded!`);
                  return vertexResult;
                }
              } catch (vertexError) {
                console.error(`❌ Vertex AI fallback failed:`, vertexError);
              }
              throw new Error("All Gemini API keys exhausted and Vertex AI fallback failed. Please try again later.");
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

// ============================================================================
// Vertex AI Fallback - 当所有 API Keys 都用尽时使用
// ============================================================================

// Vertex AI 配置
const VERTEX_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "";
const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const VERTEX_MODEL_ID = "gemini-2.0-flash-preview-image-generation"; // Vertex AI 使用的模型

/**
 * 获取 Google Cloud Access Token
 * 支持两种方式：服务账号 JSON 或 ADC（本地开发）
 */
async function getVertexAccessToken(): Promise<string> {
  // 方式1: 使用服务账号 JSON（生产环境）
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const jwt = await createVertexJWT(serviceAccount);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
    }
    return tokenData.access_token;
  }

  // 方式2: 使用 ADC (Application Default Credentials) - 本地开发环境
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const adcPath = path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");

  if (fs.existsSync(adcPath)) {
    const adcContent = fs.readFileSync(adcPath, "utf-8");
    const adc = JSON.parse(adcContent);

    if (adc.type === "authorized_user") {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: adc.client_id,
          client_secret: adc.client_secret,
          refresh_token: adc.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        throw new Error(`Failed to refresh ADC token: ${error}`);
      }

      const tokenData = await tokenResponse.json();
      return tokenData.access_token;
    }
  }

  throw new Error("No Google Cloud credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON or run 'gcloud auth application-default login'");
}

/**
 * 创建 JWT for Google OAuth
 */
async function createVertexJWT(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${base64Header}.${base64Payload}`;

  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsignedToken);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  return `${unsignedToken}.${signature}`;
}

/**
 * 使用 Vertex AI 生成图片（Fallback）
 */
async function generateImageWithVertexAI(
  prompt: string,
  model: GeminiImageModel,
  configOptions: ImageGenerationConfig,
  referenceImages: string[]
): Promise<{ success: boolean; imageUrl?: string; error?: string; prompt?: string; model?: string }> {
  console.log(`[VertexAI Fallback] Starting image generation...`);
  console.log(`[VertexAI Fallback] Project: ${VERTEX_PROJECT_ID}, Location: ${VERTEX_LOCATION}`);

  if (!VERTEX_PROJECT_ID) {
    throw new Error("GOOGLE_CLOUD_PROJECT not configured for Vertex AI fallback");
  }

  try {
    // 获取 access token
    const accessToken = await getVertexAccessToken();
    console.log(`[VertexAI Fallback] Got access token`);

    // 构建 parts
    const parts: any[] = [{ text: prompt }];

    // 添加参考图片
    if (referenceImages.length > 0) {
      console.log(`[VertexAI Fallback] Fetching ${referenceImages.length} reference images...`);
      for (const imageUrl of referenceImages) {
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) continue;

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64Data = buffer.toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/jpeg';

          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        } catch (error) {
          console.error(`[VertexAI Fallback] Error fetching reference image:`, error);
        }
      }
    }

    // 构建请求体
    const requestBody: any = {
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    // 添加 imageConfig
    if (configOptions.aspectRatio || configOptions.imageSize) {
      requestBody.generationConfig.imageConfig = {
        ...(configOptions.aspectRatio && { aspectRatio: configOptions.aspectRatio }),
        ...(configOptions.imageSize && { imageSize: configOptions.imageSize }),
        personGeneration: "allow_all", // Vertex AI 需要显式设置
      };
    }

    // Vertex AI API URL
    const apiUrl = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL_ID}:generateContent`;

    console.log(`[VertexAI Fallback] API URL: ${apiUrl}`);

    // 设置超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 分钟

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
      console.error(`[VertexAI Fallback] API error: ${response.status} - ${errorText}`);
      throw new Error(`Vertex AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[VertexAI Fallback] Response received`);

    // 解析响应
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Vertex AI");
    }

    const responseParts = candidates[0]?.content?.parts;
    if (!responseParts || responseParts.length === 0) {
      throw new Error("No content parts returned from Vertex AI");
    }

    // 查找图片数据
    for (const part of responseParts) {
      if (part.inlineData && part.inlineData.data) {
        console.log(`[VertexAI Fallback] Image data found`);
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || "image/png";
        const buffer = Buffer.from(base64Data, "base64");

        console.log(`[VertexAI Fallback] Image size: ${buffer.length} bytes`);

        // 上传到 R2
        const imageUrl = await uploadBufferToR2(buffer, mimeType);
        console.log(`[VertexAI Fallback] Image uploaded: ${imageUrl}`);

        return {
          success: true,
          imageUrl,
          prompt,
          model: `vertex-ai/${VERTEX_MODEL_ID}`,
        };
      }
    }

    throw new Error("No image data found in Vertex AI response");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[VertexAI Fallback] Error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
