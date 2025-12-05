"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { uploadVideoFromUrl } from "./storage";
import sharp from "sharp";

const prisma = new PrismaClient();

// 获取当前用户 ID
async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("userId")?.value || null;
  } catch {
    return null;
  }
}

export type VideoTaskStatus = "pending" | "processing" | "completed" | "failed";

// OpenAI Sora 2 官方 API 状态映射
type SoraApiStatus = "queued" | "in_progress" | "completed" | "failed";

export interface VideoTaskResult {
  id: string;
  status: VideoTaskStatus;
  prompt: string;
  orientation: "portrait" | "landscape";
  inputImage?: string;
  videoUrl?: string;
  progress: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Sora API 响应类型
interface SoraVideoResponse {
  id: string;
  object: string;
  model: string;
  status: SoraApiStatus;
  progress?: number;
  created_at: number;
  seconds: string;
  size: string;
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

// Sora 2 API 支持的视频时长选项
export type SoraDuration = "4" | "8" | "12";

/**
 * 创建视频生成任务
 * @param prompt 视频描述
 * @param orientation 画面方向
 * @param inputImage 可选的输入图片 URL（图生视频）
 * @param durationSeconds 视频时长，支持 "4", "8", "12" 秒
 */
export async function createVideoTask(
  prompt: string,
  orientation: "portrait" | "landscape" = "portrait",
  inputImage?: string,
  durationSeconds: SoraDuration = "8"
): Promise<{ taskId: string }> {
  const userId = await getCurrentUserId();

  const task = await prisma.videoTask.create({
    data: {
      status: "pending",
      prompt,
      orientation,
      inputImage: inputImage || null,
      userId,  // 关联当前用户
    },
  });

  // 异步处理任务（不等待）
  processVideoTask(task.id, durationSeconds).catch((error) => {
    console.error(`Error processing video task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询任务状态
 */
export async function getVideoTaskStatus(taskId: string): Promise<VideoTaskResult | null> {
  const task = await prisma.videoTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as VideoTaskStatus,
    prompt: task.prompt,
    orientation: task.orientation as "portrait" | "landscape",
    inputImage: task.inputImage || undefined,
    videoUrl: task.videoUrl || undefined,
    progress: task.progress || 0,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

/**
 * 处理视频生成任务（后台执行）
 * 使用 OpenAI Sora 2 官方 API 格式
 */
async function processVideoTask(taskId: string, durationSeconds: SoraDuration = "8"): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: "processing", progress: 5, updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.videoTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    console.log(`[VideoTask ${taskId}] Starting video generation (Official Sora 2 API)...`);
    console.log(`[VideoTask ${taskId}] Prompt: ${task.prompt.substring(0, 50)}...`);
    console.log(`[VideoTask ${taskId}] Orientation: ${task.orientation}`);

    // 获取 API 配置
    const soraApiBaseUrl = process.env.SORA_API_BASE_URL || "https://api.openai.com";
    const soraApiToken = process.env.SORA_API_TOKEN;
    const soraApiType = process.env.SORA_API_TYPE || "openai"; // "azure" or "openai"

    if (!soraApiToken) {
      throw new Error("Sora API token not configured");
    }

    // 根据 API 类型选择认证头
    const authHeader = soraApiType === "azure"
      ? { "api-key": soraApiToken }
      : { Authorization: `Bearer ${soraApiToken}` };

    console.log(`[VideoTask ${taskId}] Using API type: ${soraApiType}, base URL: ${soraApiBaseUrl}`);

    // 根据方向选择分辨率
    const size = task.orientation === "portrait" ? "720x1280" : "1280x720";

    // Step 1: 创建视频生成任务
    let createResponse: Response;

    if (task.inputImage) {
      // 图生视频模式 - 手动构建 multipart/form-data（完全控制 MIME 类型）
      console.log(`[VideoTask ${taskId}] Image-to-video mode with input: ${task.inputImage}`);

      // 下载图片
      const imageResponse = await fetch(task.inputImage);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download input image: ${imageResponse.status}`);
      }
      const imageArrayBuffer = await imageResponse.arrayBuffer();
      let imageBuffer = Buffer.from(imageArrayBuffer);

      console.log(`[VideoTask ${taskId}] Downloaded image, size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

      // 解析目标尺寸
      const [targetWidth, targetHeight] = size.split("x").map(Number);

      // 使用 sharp 调整图片尺寸（Azure API 要求图片尺寸与 size 匹配）
      const sharpImage = sharp(imageBuffer);
      const metadata = await sharpImage.metadata();
      console.log(`[VideoTask ${taskId}] Original image: ${metadata.width}x${metadata.height}, target: ${targetWidth}x${targetHeight}`);

      if (metadata.width !== targetWidth || metadata.height !== targetHeight) {
        console.log(`[VideoTask ${taskId}] Resizing image to ${targetWidth}x${targetHeight}...`);
        imageBuffer = await sharpImage
          .resize(targetWidth, targetHeight, {
            fit: "cover", // 裁剪以填充目标尺寸
            position: "center",
          })
          .png() // 统一转为 PNG
          .toBuffer();
        console.log(`[VideoTask ${taskId}] Resized image size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
      }

      // 使用 PNG 格式（sharp 已转换）
      const mimeType = "image/png";
      const ext = "png";

      // 手动构建 multipart/form-data 边界（完全控制 Content-Type）
      const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;

      // 构建各个 part
      const parts: Buffer[] = [];

      // model 字段
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `sora-2\r\n`
      ));

      // prompt 字段
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        `${task.prompt}\r\n`
      ));

      // size 字段
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="size"\r\n\r\n` +
        `${size}\r\n`
      ));

      // seconds 字段
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="seconds"\r\n\r\n` +
        `${durationSeconds}\r\n`
      ));

      // input_reference 文件字段（关键：正确设置 Content-Type）
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="input_reference"; filename="input.${ext}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
      ));
      parts.push(imageBuffer);
      parts.push(Buffer.from(`\r\n`));

      // 结束边界
      parts.push(Buffer.from(`--${boundary}--\r\n`));

      // 合并所有 parts
      const body = Buffer.concat(parts);

      console.log(`[VideoTask ${taskId}] Sending manually built multipart/form-data request...`);
      console.log(`[VideoTask ${taskId}] Body size: ${(body.length / 1024).toFixed(1)} KB, boundary: ${boundary}`);

      createResponse = await fetch(`${soraApiBaseUrl}/v1/videos`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          ...authHeader,
        },
        body: body,
      });
    } else {
      // 文生视频模式 - 使用 JSON
      const requestBody = {
        model: "sora-2",
        prompt: task.prompt,
        size: size,
        seconds: durationSeconds, // 支持 "4", "8", "12" 秒
      };

      console.log(`[VideoTask ${taskId}] Request body:`, JSON.stringify(requestBody, null, 2));

      createResponse = await fetch(`${soraApiBaseUrl}/v1/videos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify(requestBody),
      });
    }

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`[VideoTask ${taskId}] Create video failed:`, errorText);
      throw new Error(`Sora API error: ${createResponse.status} - ${errorText}`);
    }

    const createResult: SoraVideoResponse = await createResponse.json();
    const soraVideoId = createResult.id;

    console.log(`[VideoTask ${taskId}] Video job created: ${soraVideoId}, status: ${createResult.status}`);

    // 更新进度
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { progress: 10, updatedAt: new Date() },
    });

    // Step 2: 轮询任务状态
    const maxPollAttempts = 180; // 最多轮询 30 分钟 (180 * 10秒)
    const pollInterval = 10000; // 10 秒
    let pollCount = 0;
    let videoCompleted = false;

    while (pollCount < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollCount++;

      const statusResponse = await fetch(`${soraApiBaseUrl}/v1/videos/${soraVideoId}`, {
        method: "GET",
        headers: authHeader,
      });

      if (!statusResponse.ok) {
        console.error(`[VideoTask ${taskId}] Status check failed: ${statusResponse.status}`);
        continue; // 继续轮询
      }

      const statusResult: SoraVideoResponse = await statusResponse.json();
      console.log(`[VideoTask ${taskId}] Poll #${pollCount}: status=${statusResult.status}, progress=${statusResult.progress || 0}`);

      // 更新进度 (10-90 之间)
      const progress = Math.min(90, 10 + (statusResult.progress || 0) * 0.8);
      await prisma.videoTask.update({
        where: { id: taskId },
        data: { progress: Math.round(progress), updatedAt: new Date() },
      });

      if (statusResult.status === "completed") {
        videoCompleted = true;
        console.log(`[VideoTask ${taskId}] ✅ Video generation completed!`);
        break;
      }

      if (statusResult.status === "failed") {
        const errorMsg = statusResult.error?.message || "Video generation failed";
        throw new Error(errorMsg);
      }
    }

    if (!videoCompleted) {
      throw new Error("Video generation timed out (30 minutes)");
    }

    // Step 3: 下载视频内容
    console.log(`[VideoTask ${taskId}] Downloading video content...`);

    const contentResponse = await fetch(`${soraApiBaseUrl}/v1/videos/${soraVideoId}/content`, {
      method: "GET",
      headers: authHeader,
    });

    if (!contentResponse.ok) {
      throw new Error(`Failed to download video: ${contentResponse.status}`);
    }

    // 获取视频 URL 或直接处理二进制流
    let videoUrl: string;
    const contentType = contentResponse.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      // API 返回 JSON 包含 URL
      const contentData = await contentResponse.json();
      videoUrl = contentData.url || contentData.download_url;
      console.log(`[VideoTask ${taskId}] Video URL from JSON: ${videoUrl}`);
    } else if (contentType?.includes("video/") || contentType?.includes("application/octet-stream")) {
      // API 直接返回视频二进制流，需要上传到 R2
      console.log(`[VideoTask ${taskId}] Received video stream directly, uploading to R2...`);

      // 获取视频数据
      const videoBuffer = await contentResponse.arrayBuffer();

      // 生成唯一文件名
      const fileName = `sora-${soraVideoId}-${Date.now()}.mp4`;

      // 直接上传 Buffer 到 R2
      const { uploadVideoBuffer } = await import("./storage");
      videoUrl = await uploadVideoBuffer(Buffer.from(videoBuffer), fileName);

      console.log(`[VideoTask ${taskId}] Video uploaded to R2: ${videoUrl}`);
    } else {
      // 其他情况，尝试使用响应 URL（可能是重定向后的 URL）
      videoUrl = contentResponse.url;
      console.log(`[VideoTask ${taskId}] Using response URL: ${videoUrl}`);
    }

    // Step 4: 如果是 URL，需要上传到 R2 存储；如果已经是 R2 URL，跳过
    let finalVideoUrl = videoUrl;
    const isAlreadyR2Url = videoUrl.includes(process.env.R2_PUBLIC_URL || "doubao.luzhipeng.com");

    if (!isAlreadyR2Url) {
      try {
        finalVideoUrl = await uploadVideoFromUrl(videoUrl);
        console.log(`[VideoTask ${taskId}] ✅ Video uploaded to R2: ${finalVideoUrl}`);
      } catch (uploadError) {
        console.error(`[VideoTask ${taskId}] ⚠️ Failed to upload to R2, using original URL:`, uploadError);
        // 如果上传失败，使用原始 URL（可能会过期）
      }
    } else {
      console.log(`[VideoTask ${taskId}] Video already on R2, skipping upload`);
    }

    // Step 5: 更新任务状态为完成
    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        videoUrl: finalVideoUrl,
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[VideoTask ${taskId}] ✅ Task completed successfully`);

  } catch (error) {
    // 异常：更新状态为 failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[VideoTask ${taskId}] ❌ Exception: ${errorMessage}`);
  }
}

/**
 * 清理旧任务（可选，用于定期清理数据库）
 */
export async function cleanupOldVideoTasks(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.videoTask.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
