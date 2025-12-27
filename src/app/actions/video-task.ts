"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

const prisma = new PrismaClient();

// Sora2 API 配置 (dyuapi.com)
const SORA2_API_BASE_URL = 'https://api.dyuapi.com';
const SORA2_API_KEY = process.env.SORA2_API_KEY;

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
// Sora2 模型支持 10s 和 15s
export type SoraDuration = "10" | "15";

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

// Sora2 API 响应类型
interface Sora2CreateResponse {
  id: string;
  status: string;
  model: string;
  progress?: number;
}

interface Sora2StatusResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: {
    message: string;
  };
}

/**
 * 创建视频生成任务
 */
export async function createVideoTask(
  prompt: string,
  orientation: "portrait" | "landscape" = "portrait",
  inputImage?: string,
  durationSeconds: SoraDuration = "10"
): Promise<{ taskId: string }> {
  const userId = await getCurrentUserId();

  const task = await prisma.videoTask.create({
    data: {
      status: "pending",
      prompt,
      orientation,
      inputImage: inputImage || null,
      userId,
    },
  });

  // 异步处理任务
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
 * 选择 Sora2 模型
 */
function selectSora2Model(orientation: "portrait" | "landscape", durationSeconds: SoraDuration): string {
  const is15s = durationSeconds === "15";

  if (orientation === "portrait") {
    return is15s ? "sora2-portrait-15s" : "sora2-portrait";
  } else {
    return is15s ? "sora2-landscape-15s" : "sora2-landscape";
  }
}

/**
 * 处理视频生成任务
 * 使用 Sora2 API (dyuapi.com)
 */
async function processVideoTask(taskId: string, durationSeconds: SoraDuration = "10"): Promise<void> {
  try {
    // 更新状态
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: "processing", progress: 5, updatedAt: new Date() },
    });

    const task = await prisma.videoTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (!SORA2_API_KEY) {
      throw new Error("SORA2_API_KEY not configured");
    }

    console.log(`[VideoTask ${taskId}] Starting Sora2 video generation...`);
    console.log(`[VideoTask ${taskId}] Prompt: ${task.prompt.substring(0, 50)}...`);
    console.log(`[VideoTask ${taskId}] Orientation: ${task.orientation}, Duration: ${durationSeconds}s`);

    // 选择模型
    const model = selectSora2Model(task.orientation as "portrait" | "landscape", durationSeconds);
    console.log(`[VideoTask ${taskId}] Using model: ${model}`);

    // 如果没有图片，需要先生成首帧
    let imageUrl = task.inputImage;
    if (!imageUrl) {
      console.log(`[VideoTask ${taskId}] No input image, generating first frame...`);

      // 使用 nano-banana 生成首帧
      const { generateImage } = await import('@/lib/image-generation');
      const imageResult = await generateImage({
        prompt: task.prompt,
        model: 'nano-banana',
        aspectRatio: task.orientation === 'portrait' ? '9:16' : '16:9',
      });

      if (!imageResult.success || !imageResult.imageUrl) {
        throw new Error('Failed to generate first frame');
      }

      imageUrl = imageResult.imageUrl;
      console.log(`[VideoTask ${taskId}] First frame generated: ${imageUrl}`);

      // 更新进度
      await prisma.videoTask.update({
        where: { id: taskId },
        data: { progress: 15, updatedAt: new Date() },
      });
    }

    // Step 1: 创建 Sora2 任务
    console.log(`[VideoTask ${taskId}] Creating Sora2 task...`);

    const createResponse = await fetch(`${SORA2_API_BASE_URL}/v1/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SORA2_API_KEY}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: task.prompt,
        model: model,
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`[VideoTask ${taskId}] Sora2 API error:`, errorText);
      throw new Error(`Sora2 API error: ${createResponse.status} - ${errorText}`);
    }

    const createResult: Sora2CreateResponse = await createResponse.json();
    const externalTaskId = createResult.id;

    console.log(`[VideoTask ${taskId}] Sora2 task created: ${externalTaskId}`);

    await prisma.videoTask.update({
      where: { id: taskId },
      data: { progress: 20, updatedAt: new Date() },
    });

    // Step 2: 轮询状态
    const maxPollAttempts = 180;
    const pollInterval = 10000;
    let pollCount = 0;
    let videoCompleted = false;

    while (pollCount < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollCount++;

      const statusResponse = await fetch(`${SORA2_API_BASE_URL}/v1/videos/${externalTaskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SORA2_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (!statusResponse.ok) {
        console.warn(`[VideoTask ${taskId}] Status check failed: ${statusResponse.status}`);
        continue;
      }

      const statusResult: Sora2StatusResponse = await statusResponse.json();
      console.log(`[VideoTask ${taskId}] Poll #${pollCount}: status=${statusResult.status}, progress=${statusResult.progress || 0}`);

      // 更新进度
      const progress = Math.min(90, 20 + (statusResult.progress || 0) * 0.7);
      await prisma.videoTask.update({
        where: { id: taskId },
        data: { progress: Math.round(progress), updatedAt: new Date() },
      });

      if (statusResult.status === 'completed') {
        videoCompleted = true;
        console.log(`[VideoTask ${taskId}] Video generation completed!`);
        break;
      }

      if (statusResult.status === 'failed') {
        const errorMsg = statusResult.error?.message || 'Video generation failed';
        throw new Error(errorMsg);
      }
    }

    if (!videoCompleted) {
      throw new Error('Video generation timed out (30 minutes)');
    }

    // Step 3: 获取视频内容
    console.log(`[VideoTask ${taskId}] Downloading video...`);

    const contentResponse = await fetch(`${SORA2_API_BASE_URL}/v1/videos/${externalTaskId}/content`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SORA2_API_KEY}`,
      },
    });

    if (!contentResponse.ok) {
      throw new Error(`Failed to download video: ${contentResponse.status}`);
    }

    // 处理视频内容
    let videoUrl: string;
    const contentType = contentResponse.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const contentData = await contentResponse.json();
      videoUrl = contentData.url || contentData.download_url;
    } else if (contentType?.includes('video/') || contentType?.includes('application/octet-stream')) {
      // 直接返回视频流，上传到 R2
      console.log(`[VideoTask ${taskId}] Uploading video to R2...`);
      const videoBuffer = await contentResponse.arrayBuffer();
      const fileName = `sora2-${externalTaskId}-${Date.now()}.mp4`;

      const { uploadVideoBuffer } = await import('./storage');
      videoUrl = await uploadVideoBuffer(Buffer.from(videoBuffer), fileName);
    } else {
      videoUrl = contentResponse.url;
    }

    console.log(`[VideoTask ${taskId}] Video URL: ${videoUrl}`);

    // 如果需要上传到 R2
    const isAlreadyR2 = videoUrl.includes(process.env.R2_PUBLIC_URL || 'doubao.luzhipeng.com');
    if (!isAlreadyR2) {
      try {
        const { uploadVideoFromUrl } = await import('./storage');
        videoUrl = await uploadVideoFromUrl(videoUrl);
        console.log(`[VideoTask ${taskId}] Video uploaded to R2: ${videoUrl}`);
      } catch (uploadError) {
        console.warn(`[VideoTask ${taskId}] Failed to upload to R2, using original URL`);
      }
    }

    // 更新完成
    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        videoUrl,
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[VideoTask ${taskId}] Task completed successfully`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[VideoTask ${taskId}] Error: ${errorMessage}`);
  }
}

/**
 * 清理旧任务
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
