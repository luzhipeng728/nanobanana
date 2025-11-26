"use server";

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { uploadVideoFromBase64 } from "./storage";

const prisma = new PrismaClient();

export type VeoTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface VeoTaskResult {
  id: string;
  status: VeoTaskStatus;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number;
  inputImage?: string;
  videoUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateVeoTaskInput {
  userRequest: string; // 用户简单描述
  aspectRatio?: "16:9" | "9:16";
  resolution?: "720p";
  durationSeconds?: number;
  inputImage?: string; // 参考图片 URL
}

// Vertex AI 配置
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "";
const LOCATION_ID = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const MODEL_ID = "veo-3.1-fast-generate-preview";
const API_ENDPOINT = `${LOCATION_ID}-aiplatform.googleapis.com`;

/**
 * 使用 Claude 分析图片并生成视频提示词
 */
async function generateVideoPromptWithClaude(
  userRequest: string,
  imageUrl?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  // 构建消息内容
  const content: Anthropic.MessageParam["content"] = [];

  // 如果有图片，添加图片内容
  if (imageUrl) {
    if (imageUrl.startsWith("data:")) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: match[2],
          },
        });
      }
    } else {
      content.push({
        type: "image",
        source: {
          type: "url",
          url: imageUrl,
        },
      });
    }
  }

  // 添加文本提示 - 基于 Google Veo 官方最佳实践
  const systemPrompt = imageUrl
    ? `You are a professional video prompt engineer for Google Veo 3.1 (image-to-video mode).

I have provided a reference image. Your task is to generate a video prompt that animates this image.

User's request: ${userRequest}

## Veo 3.1 Image-to-Video Best Practices (from official docs):

**CRITICAL RULES:**
1. The source image already provides background and style - ONLY describe the motion/animation
2. Use generic terms like "the subject", "the woman", "the figure" - DO NOT re-describe physical features
3. Focus on THREE types of motion:
   - Camera movement (pan, tilt, zoom, tracking, crane, dolly)
   - Subject animation (walking, turning, gesturing, expressions)
   - Environment animation (wind, water, particles, lighting changes)

**Prompt Structure:**
[Camera Movement] + [Subject Action] + [Environment Animation] + [Mood/Atmosphere]

**AVOID:**
- Re-describing what's already in the image
- Using quotes for dialogue (use colons instead: "She says: Hello")
- Complex multi-event narratives
- Negative phrases like "no walls" (instead list what to exclude separately)

**Examples of good image-to-video prompts:**
- "Slow dolly in, the subject turns her head and smiles softly, hair gently swaying in the breeze, warm afternoon light"
- "Camera slowly pans right, the figure walks forward confidently, leaves rustling in the background"
- "Subtle zoom in on face, eyes blink naturally, ambient city sounds, cinematic depth of field"

Generate a concise prompt (30-60 words) focusing ONLY on the animation/motion.
Output ONLY the prompt text, nothing else.`
    : `You are a professional video prompt engineer for Google Veo 3.1 (text-to-video mode).

User's request: ${userRequest}

## Veo 3.1 Text-to-Video Best Practices (from official docs):

**Prompt Structure - Include these elements:**
1. **Subject**: Who/what is the focus (person, animal, object)
2. **Action**: What's happening (verbs, movements)
3. **Scene/Setting**: Where and when (location, time, weather)
4. **Camera**: Angle and movement (eye-level, bird's-eye, pan, dolly, tracking)
5. **Style**: Visual aesthetic (cinematic, anime, hyper-realistic, film grain)
6. **Lighting**: Light sources and mood (golden hour, dramatic shadows, neon)
7. **Atmosphere**: Environmental effects (fog, dust particles, rain)

**IMPORTANT RULES:**
- Be SPECIFIC, not vague ("dim lighting with melancholic atmosphere" NOT "kind of dark")
- Focus on a SINGLE scene for short videos
- Use colons for dialogue: "A man says: Welcome home"
- Describe what you WANT, not what you don't want

**Example prompts:**
- "Cinematic close-up of a wise elderly woman, weathered hands holding a glowing crystal, warm candlelight casting soft shadows on her face, slow push-in, mystical atmosphere"
- "Bird's-eye view of an intricate hedge maze at dawn, a solitary figure in red walks through the corridors, morning mist rolling across the grounds, epic orchestral mood"
- "Hyper-realistic golden retriever puppy running through autumn leaves, tracking shot following alongside, warm sunlight filtering through trees, joyful playful energy"

Generate a detailed prompt (50-80 words) with cinematic depth.
Output ONLY the prompt text, nothing else.`;

  content.push({
    type: "text",
    text: systemPrompt,
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  return textBlock?.text || userRequest;
}

/**
 * 获取 Google Cloud Access Token
 */
async function getAccessToken(): Promise<string> {
  // 方式1: 使用服务账号 JSON（生产环境）
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const jwt = await createJWT(serviceAccount);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }

  // 方式2: 使用 ADC (Application Default Credentials) - 本地开发环境
  // 读取 ~/.config/gcloud/application_default_credentials.json
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const adcPath = path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");

  if (fs.existsSync(adcPath)) {
    const adcContent = fs.readFileSync(adcPath, "utf-8");
    const adc = JSON.parse(adcContent);

    if (adc.type === "authorized_user") {
      // 使用 refresh_token 获取 access_token
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
async function createJWT(serviceAccount: any): Promise<string> {
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

  // 使用 Node.js crypto 签名
  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsignedToken);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  return `${unsignedToken}.${signature}`;
}

/**
 * 创建 Veo 视频生成任务
 */
export async function createVeoTask(input: CreateVeoTaskInput): Promise<{ taskId: string }> {
  const {
    userRequest,
    aspectRatio = "16:9",
    resolution = "720p",
    durationSeconds = 8,
    inputImage,
  } = input;

  // 先创建一个 pending 状态的任务
  const task = await prisma.veoTask.create({
    data: {
      status: "pending",
      prompt: userRequest, // 暂时用用户请求作为 prompt，后面会更新
      aspectRatio,
      resolution,
      durationSeconds,
      inputImage: inputImage || null,
    },
  });

  // 异步处理任务（不等待）
  processVeoTask(task.id, userRequest, inputImage).catch((error) => {
    console.error(`Error processing Veo task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询 Veo 任务状态
 */
export async function getVeoTaskStatus(taskId: string): Promise<VeoTaskResult | null> {
  const task = await prisma.veoTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as VeoTaskStatus,
    prompt: task.prompt,
    aspectRatio: task.aspectRatio,
    resolution: task.resolution,
    durationSeconds: task.durationSeconds,
    inputImage: task.inputImage || undefined,
    videoUrl: task.videoUrl || undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

/**
 * 处理 Veo 视频生成任务（后台执行）
 */
async function processVeoTask(
  taskId: string,
  userRequest: string,
  inputImage?: string
): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.veoTask.update({
      where: { id: taskId },
      data: { status: "processing", updatedAt: new Date() },
    });

    console.log(`[VeoTask ${taskId}] Starting video generation...`);
    console.log(`[VeoTask ${taskId}] User request: ${userRequest.substring(0, 50)}...`);

    // Step 1: 使用 Claude 分析并生成视频提示词
    console.log(`[VeoTask ${taskId}] Generating video prompt with Claude...`);
    const videoPrompt = await generateVideoPromptWithClaude(userRequest, inputImage);
    console.log(`[VeoTask ${taskId}] Generated prompt: ${videoPrompt.substring(0, 100)}...`);

    // 更新任务的 prompt
    const task = await prisma.veoTask.update({
      where: { id: taskId },
      data: { prompt: videoPrompt, updatedAt: new Date() },
    });

    // Step 2: 调用 Vertex AI Veo API
    console.log(`[VeoTask ${taskId}] Calling Vertex AI Veo API...`);

    const accessToken = await getAccessToken();

    // 构建请求体
    const requestBody: any = {
      instances: [
        {
          prompt: videoPrompt,
        },
      ],
      parameters: {
        aspectRatio: task.aspectRatio,
        sampleCount: 1,
        durationSeconds: String(task.durationSeconds),
        personGeneration: "allow_all",
        addWatermark: false,
        includeRaiReason: true,
        generateAudio: true,
        resolution: task.resolution,
      },
    };

    // 如果有输入图片，添加到请求中
    if (inputImage) {
      console.log(`[VeoTask ${taskId}] Image-to-video mode`);

      // 获取图片数据并转为 base64
      const imageResponse = await fetch(inputImage);
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString("base64");
      const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

      requestBody.instances[0].image = {
        bytesBase64Encoded: base64Image,
        mimeType: mimeType,
      };
    }

    // 验证必要的配置
    if (!PROJECT_ID) {
      throw new Error("GOOGLE_CLOUD_PROJECT not configured. Please add it to your .env file.");
    }

    // 发起 predictLongRunning 请求
    const apiUrl = `https://${API_ENDPOINT}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}:predictLongRunning`;

    console.log(`[VeoTask ${taskId}] API URL: ${apiUrl}`);
    console.log(`[VeoTask ${taskId}] Request body:`, JSON.stringify(requestBody, null, 2).substring(0, 500));

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[VeoTask ${taskId}] API error response:`, errorText);
      throw new Error(`Vertex AI API error: ${response.status} - ${errorText}`);
    }

    const operationResult = await response.json();
    const operationName = operationResult.name;

    if (!operationName) {
      throw new Error("No operation name returned from API");
    }

    console.log(`[VeoTask ${taskId}] Operation started: ${operationName}`);

    // 保存 operation name
    await prisma.veoTask.update({
      where: { id: taskId },
      data: { operationName, updatedAt: new Date() },
    });

    // Step 3: 轮询等待完成
    const maxWaitTime = 10 * 60 * 1000; // 最长等待 10 分钟
    const pollInterval = 15 * 1000; // 每 15 秒轮询一次
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error("Video generation timed out");
      }

      console.log(`[VeoTask ${taskId}] Polling... (elapsed: ${Math.round((Date.now() - startTime) / 1000)}s)`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      // 刷新 access token（可能已过期）
      const currentToken = await getAccessToken();

      // 轮询 operation 状态
      const pollUrl = `https://${API_ENDPOINT}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${MODEL_ID}:fetchPredictOperation`;

      const pollResponse = await fetch(pollUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ operationName }),
      });

      if (!pollResponse.ok) {
        console.error(`[VeoTask ${taskId}] Poll error: ${pollResponse.status}`);
        continue;
      }

      const pollResult = await pollResponse.json();

      // 检查是否完成
      if (pollResult.done) {
        console.log(`[VeoTask ${taskId}] Operation completed!`);

        // 检查是否有错误
        if (pollResult.error) {
          throw new Error(`Veo API error: ${pollResult.error.message}`);
        }

        // 获取视频结果
        const response = pollResult.response;
        if (!response?.videos || response.videos.length === 0) {
          // 检查是否被 RAI 过滤
          if (response?.raiMediaFilteredCount > 0) {
            const reason = response.raiMediaFilteredReasons?.[0] || "Content filtered";
            throw new Error(`Content filtered by Google's Responsible AI: ${reason}`);
          }
          throw new Error("No video generated");
        }

        const video = response.videos[0];

        // 视频可能是 base64 或 GCS URI
        let videoUrl: string;

        if (video.bytesBase64Encoded) {
          // Base64 编码的视频，上传到 R2
          console.log(`[VeoTask ${taskId}] Uploading video to R2...`);
          videoUrl = await uploadVideoFromBase64(video.bytesBase64Encoded, video.mimeType || "video/mp4");
          console.log(`[VeoTask ${taskId}] Video uploaded: ${videoUrl}`);
        } else if (video.gcsUri) {
          // GCS URI，需要下载后上传
          // TODO: 实现 GCS 下载逻辑
          videoUrl = video.gcsUri;
          console.log(`[VeoTask ${taskId}] Video GCS URI: ${videoUrl}`);
        } else {
          throw new Error("No video data in response");
        }

        // 更新任务状态为完成
        await prisma.veoTask.update({
          where: { id: taskId },
          data: {
            status: "completed",
            videoUrl,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        console.log(`[VeoTask ${taskId}] Completed successfully`);
        return;
      }
    }
  } catch (error) {
    // 异常：更新状态为 failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.veoTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[VeoTask ${taskId}] Exception: ${errorMessage}`);
  }
}
