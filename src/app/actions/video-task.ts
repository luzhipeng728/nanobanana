"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { uploadVideoFromUrl } from "./storage";
import FormData from "form-data";

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

    if (!soraApiToken) {
      throw new Error("Sora API token not configured");
    }

    // 根据方向选择分辨率
    const size = task.orientation === "portrait" ? "720x1280" : "1280x720";

    // Step 1: 创建视频生成任务
    let createResponse: Response;

    if (task.inputImage) {
      // 图生视频模式 - 使用 form-data 包正确处理 multipart/form-data
      console.log(`[VideoTask ${taskId}] Image-to-video mode with input: ${task.inputImage}`);

      // 下载图片
      const imageResponse = await fetch(task.inputImage);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download input image: ${imageResponse.status}`);
      }
      const imageArrayBuffer = await imageResponse.arrayBuffer();
      const imageBuffer = Buffer.from(imageArrayBuffer);

      // 根据 URL 或响应头确定 MIME 类型
      let mimeType = imageResponse.headers.get("content-type") || "image/png";
      // 确保是支持的格式
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        // 根据 URL 扩展名判断
        const url = task.inputImage.toLowerCase();
        if (url.includes(".jpg") || url.includes(".jpeg")) {
          mimeType = "image/jpeg";
        } else if (url.includes(".webp")) {
          mimeType = "image/webp";
        } else {
          mimeType = "image/png"; // 默认 PNG
        }
      }

      // 确定文件扩展名
      const extMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      const ext = extMap[mimeType] || "png";

      console.log(`[VideoTask ${taskId}] Downloaded image, size: ${(imageBuffer.length / 1024).toFixed(1)} KB, type: ${mimeType}`);

      // 使用 form-data 包构建 multipart/form-data
      const formData = new FormData();
      formData.append("model", "sora-2");
      formData.append("prompt", task.prompt);
      formData.append("size", size);
      formData.append("seconds", durationSeconds);
      formData.append("input_reference", imageBuffer, {
        filename: `input.${ext}`,
        contentType: mimeType,
      });

      console.log(`[VideoTask ${taskId}] Sending multipart/form-data request...`);

      // 使用 form-data 的 getHeaders() 获取正确的 Content-Type（包含 boundary）
      const headers = formData.getHeaders();
      headers["Authorization"] = `Bearer ${soraApiToken}`;

      // 将 Buffer 转换为 Uint8Array 以兼容 fetch body 类型
      const bodyBuffer = formData.getBuffer();

      createResponse = await fetch(`${soraApiBaseUrl}/v1/videos`, {
        method: "POST",
        headers: headers,
        body: new Uint8Array(bodyBuffer),
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
          Authorization: `Bearer ${soraApiToken}`,
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
        headers: {
          Authorization: `Bearer ${soraApiToken}`,
        },
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
      headers: {
        Authorization: `Bearer ${soraApiToken}`,
      },
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
