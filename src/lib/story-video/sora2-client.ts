/**
 * Sora2 视频生成 API 客户端
 *
 * 使用 dyuapi.com 提供的 Sora2 图生视频 API
 * 文档: https://6ibmqmipvf.apifox.cn/368653012e0
 */

import { PrismaClient } from '@prisma/client';
import type { Sora2Model, Sora2CreateResponse, Sora2StatusResponse } from './types';

const prisma = new PrismaClient();

// API 配置
const SORA2_API_BASE_URL = 'https://api.dyuapi.com';
const SORA2_API_KEY = process.env.SORA2_API_KEY || 'sk-jqdyLpf7gnIZsN6iwAUEEWwZtcjDiSc2VvF5z1wXzIPLvLkB';

// 轮询配置
const POLL_INTERVAL = 10000;  // 10秒
const MAX_POLL_ATTEMPTS = 180; // 最多轮询30分钟

export interface Sora2GenerateParams {
  imageUrl: string;           // 输入图片URL
  prompt: string;             // 视频生成提示词
  model: Sora2Model;          // 模型选择
  sceneId?: string;           // 关联场景ID（可选）
  userId?: string;            // 用户ID（可选）
}

export interface Sora2GenerateResult {
  success: boolean;
  taskId?: string;            // 内部任务ID
  externalTaskId?: string;    // Sora2 API任务ID
  videoUrl?: string;          // 视频URL（完成后）
  lastFrameUrl?: string;      // 尾帧URL（完成后）
  duration?: number;          // 视频时长
  error?: string;
}

/**
 * 创建 Sora2 视频生成任务
 */
export async function createSora2Task(params: Sora2GenerateParams): Promise<{ taskId: string }> {
  const { imageUrl, prompt, model, sceneId, userId } = params;

  // 创建任务记录
  const task = await prisma.sora2Task.create({
    data: {
      status: 'pending',
      model,
      prompt,
      inputImageUrl: imageUrl,
      sceneId,
      userId,
    },
  });

  // 异步处理任务
  processSora2Task(task.id).catch((error) => {
    console.error(`[Sora2Task ${task.id}] Error:`, error);
  });

  return { taskId: task.id };
}

/**
 * 获取任务状态
 */
export async function getSora2TaskStatus(taskId: string): Promise<Sora2GenerateResult> {
  const task = await prisma.sora2Task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  return {
    success: task.status === 'completed',
    taskId: task.id,
    externalTaskId: task.externalTaskId || undefined,
    videoUrl: task.videoUrl || undefined,
    lastFrameUrl: task.lastFrameUrl || undefined,
    duration: task.duration || undefined,
    error: task.status === 'failed' ? (task.error || 'Unknown error') : undefined,
  };
}

/**
 * 处理 Sora2 任务（后台执行）
 */
async function processSora2Task(taskId: string): Promise<void> {
  try {
    // 更新状态为处理中
    await prisma.sora2Task.update({
      where: { id: taskId },
      data: { status: 'processing', progress: 5, updatedAt: new Date() },
    });

    const task = await prisma.sora2Task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    console.log(`[Sora2Task ${taskId}] Starting video generation...`);
    console.log(`[Sora2Task ${taskId}] Model: ${task.model}`);
    console.log(`[Sora2Task ${taskId}] Input image: ${task.inputImageUrl.substring(0, 50)}...`);

    // Step 1: 调用 Sora2 API 创建任务
    const createResponse = await fetch(`${SORA2_API_BASE_URL}/v1/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SORA2_API_KEY}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        image_url: task.inputImageUrl,
        prompt: task.prompt,
        model: task.model,
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`[Sora2Task ${taskId}] API error:`, errorText);
      throw new Error(`Sora2 API error: ${createResponse.status} - ${errorText}`);
    }

    const createResult: Sora2CreateResponse = await createResponse.json();
    const externalTaskId = createResult.id;

    console.log(`[Sora2Task ${taskId}] External task created: ${externalTaskId}`);

    // 保存外部任务ID
    await prisma.sora2Task.update({
      where: { id: taskId },
      data: {
        externalTaskId,
        progress: 10,
        updatedAt: new Date(),
      },
    });

    // Step 2: 轮询任务状态
    let pollCount = 0;
    let completed = false;
    let videoUrl: string | null = null;

    while (pollCount < MAX_POLL_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      pollCount++;

      const statusResponse = await fetch(`${SORA2_API_BASE_URL}/v1/videos/${externalTaskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SORA2_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (!statusResponse.ok) {
        console.warn(`[Sora2Task ${taskId}] Status check failed: ${statusResponse.status}`);
        continue;
      }

      const statusResult: Sora2StatusResponse = await statusResponse.json();
      console.log(`[Sora2Task ${taskId}] Poll #${pollCount}: status=${statusResult.status}, progress=${statusResult.progress || 0}`);

      // 更新进度
      const progress = Math.min(90, 10 + (statusResult.progress || 0) * 0.8);
      await prisma.sora2Task.update({
        where: { id: taskId },
        data: { progress: Math.round(progress), updatedAt: new Date() },
      });

      if (statusResult.status === 'completed') {
        completed = true;
        console.log(`[Sora2Task ${taskId}] ✅ Video generation completed!`);
        break;
      }

      if (statusResult.status === 'failed') {
        const errorMsg = statusResult.error?.message || 'Video generation failed';
        throw new Error(errorMsg);
      }
    }

    if (!completed) {
      throw new Error('Video generation timed out (30 minutes)');
    }

    // Step 3: 获取视频内容
    console.log(`[Sora2Task ${taskId}] Downloading video...`);

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
    const contentType = contentResponse.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const contentData = await contentResponse.json();
      videoUrl = contentData.url || contentData.download_url;
    } else if (contentType?.includes('video/') || contentType?.includes('application/octet-stream')) {
      // 直接返回视频流，需要上传到 R2
      console.log(`[Sora2Task ${taskId}] Uploading video to R2...`);
      const videoBuffer = await contentResponse.arrayBuffer();
      const fileName = `sora2-${externalTaskId}-${Date.now()}.mp4`;

      const { uploadVideoBuffer } = await import('@/app/actions/storage');
      videoUrl = await uploadVideoBuffer(Buffer.from(videoBuffer), fileName);
    } else {
      videoUrl = contentResponse.url;
    }

    console.log(`[Sora2Task ${taskId}] Video URL: ${videoUrl}`);

    // Step 4: 提取尾帧
    let lastFrameUrl: string | null = null;
    if (videoUrl) {
      try {
        lastFrameUrl = await extractLastFrame(videoUrl, taskId);
        console.log(`[Sora2Task ${taskId}] Last frame extracted: ${lastFrameUrl}`);
      } catch (error) {
        console.warn(`[Sora2Task ${taskId}] Failed to extract last frame:`, error);
      }
    }

    // Step 5: 计算视频时长
    const duration = task.model.includes('15s') ? 15 : 10;

    // Step 6: 更新任务状态为完成
    await prisma.sora2Task.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        videoUrl,
        lastFrameUrl,
        duration,
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[Sora2Task ${taskId}] ✅ Task completed successfully`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await prisma.sora2Task.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[Sora2Task ${taskId}] ❌ Error: ${errorMessage}`);
  }
}

/**
 * 从视频中提取尾帧
 * 先下载视频，获取时长，再 seek 到末尾提取帧
 */
async function extractLastFrame(videoUrl: string, taskId: string): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const videoPath = path.join(tempDir, `video-${taskId}-${timestamp}.mp4`);
  const outputPath = path.join(tempDir, `last-frame-${taskId}-${timestamp}.jpg`);

  try {
    // Step 1: 下载视频到本地
    console.log(`[Sora2Task ${taskId}] Downloading video for frame extraction...`);
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }
    const videoBuffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(videoPath, videoBuffer);
    console.log(`[Sora2Task ${taskId}] Video downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Step 2: 使用 ffprobe 获取视频时长
    let duration = 15; // 默认 15 秒
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
      );
      duration = parseFloat(stdout.trim()) || 15;
      console.log(`[Sora2Task ${taskId}] Video duration: ${duration}s`);
    } catch (probeError) {
      console.warn(`[Sora2Task ${taskId}] ffprobe failed, using default duration:`, probeError);
    }

    // Step 3: 计算 seek 位置（倒数 0.5 秒）
    const seekTime = Math.max(0, duration - 0.5);

    // Step 4: 使用 ffmpeg 提取帧
    const ffmpegCmd = `ffmpeg -y -ss ${seekTime} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`;
    console.log(`[Sora2Task ${taskId}] Extracting frame at ${seekTime}s`);

    try {
      await execAsync(ffmpegCmd);
    } catch (ffmpegError: any) {
      console.error(`[Sora2Task ${taskId}] FFmpeg error:`, ffmpegError.stderr || ffmpegError.message);
      throw new Error(`FFmpeg failed: ${ffmpegError.message}`);
    }

    // Step 5: 检查输出文件是否存在
    try {
      await fs.access(outputPath);
    } catch {
      throw new Error('FFmpeg did not produce output file');
    }

    // Step 6: 上传到 R2
    const imageBuffer = await fs.readFile(outputPath);
    const { uploadImageBuffer } = await import('@/app/actions/storage');
    const imageUrl = await uploadImageBuffer(imageBuffer, `last-frame-${taskId}.jpg`);

    console.log(`[Sora2Task ${taskId}] Last frame extracted successfully`);

    // 清理临时文件
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return imageUrl;

  } catch (error) {
    // 清理可能存在的临时文件
    await fs.unlink(videoPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
}

/**
 * 选择合适的 Sora2 模型
 */
export function selectSora2Model(
  aspectRatio: '16:9' | '9:16',
  actionComplexity: 'simple' | 'moderate' | 'complex'
): Sora2Model {
  const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';

  // 复杂动作用15秒，简单动作用10秒
  const duration = actionComplexity === 'simple' ? 10 : 15;

  if (orientation === 'portrait') {
    return duration === 15 ? 'sora2-portrait-15s' : 'sora2-portrait';
  } else {
    return duration === 15 ? 'sora2-landscape-15s' : 'sora2-landscape';
  }
}

/**
 * 等待任务完成（阻塞式）
 */
export async function waitForSora2Task(
  taskId: string,
  onProgress?: (progress: number) => void,
  timeoutMs: number = 1800000 // 30分钟
): Promise<Sora2GenerateResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await getSora2TaskStatus(taskId);

    if (result.success) {
      return result;
    }

    if (result.error) {
      return result;
    }

    // 获取进度
    const task = await prisma.sora2Task.findUnique({
      where: { id: taskId },
      select: { progress: true },
    });

    if (task && onProgress) {
      onProgress(task.progress);
    }

    // 等待一段时间再检查
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return { success: false, error: 'Timeout waiting for task completion' };
}
