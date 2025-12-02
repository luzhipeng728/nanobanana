"use server";

import { prisma } from "@/lib/prisma";
import { textToSpeech, TTS_SPEAKERS, type SpeakerKey } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";
import { getCurrentUser } from "./user";

export interface CreateTTSTaskInput {
  text: string;
  speaker?: string;
  speed?: number;
}

export interface TTSTaskResult {
  id: string;
  status: string;
  text: string;
  speaker: string;
  speed: number;
  audioUrl?: string | null;
  error?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

/**
 * 创建 TTS 任务并立即开始处理
 */
export async function createTTSTask(input: CreateTTSTaskInput): Promise<{ taskId: string }> {
  const { text, speaker = "zh_female_vivi", speed = 1.0 } = input;

  if (!text || !text.trim()) {
    throw new Error("Text is required");
  }

  if (text.length > 5000) {
    throw new Error("Text too long (max 5000 characters)");
  }

  // 获取当前用户（可选）
  const user = await getCurrentUser();

  // 创建任务记录
  const task = await prisma.tTSTask.create({
    data: {
      status: "pending",
      text: text.trim(),
      speaker,
      speed,
      userId: user?.id,
    },
  });

  console.log(`[TTS] Created task ${task.id} for text: "${text.substring(0, 50)}..."`);

  // 异步处理任务（不等待完成）
  processTTSTask(task.id).catch((error) => {
    console.error(`[TTS] Background processing failed for task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 获取 TTS 任务状态
 */
export async function getTTSTaskStatus(taskId: string): Promise<TTSTaskResult | null> {
  const task = await prisma.tTSTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      text: true,
      speaker: true,
      speed: true,
      audioUrl: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return task;
}

/**
 * 后台处理 TTS 任务
 */
async function processTTSTask(taskId: string): Promise<void> {
  console.log(`[TTS] Processing task ${taskId}...`);

  // 更新状态为 processing
  const task = await prisma.tTSTask.update({
    where: { id: taskId },
    data: { status: "processing" },
  });

  try {
    // 获取发音人 ID
    let speakerId = task.speaker;
    if (task.speaker in TTS_SPEAKERS) {
      speakerId = TTS_SPEAKERS[task.speaker as SpeakerKey].id;
    }

    // 调用 TTS 服务
    const result = await textToSpeech(task.text, {
      speaker: speakerId,
      speed: task.speed,
    });

    if (!result.success || !result.audioBuffer) {
      throw new Error(result.error || "TTS generation failed");
    }

    console.log(`[TTS] Task ${taskId}: Audio generated, size: ${result.audioBuffer.length} bytes`);

    // 上传到 R2
    const audioUrl = await uploadBufferToR2(
      result.audioBuffer,
      result.mimeType || "audio/mpeg",
      "audio"
    );

    console.log(`[TTS] Task ${taskId}: Audio uploaded to ${audioUrl}`);

    // 更新任务为完成
    await prisma.tTSTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        audioUrl,
        completedAt: new Date(),
      },
    });

    console.log(`[TTS] Task ${taskId}: Completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[TTS] Task ${taskId}: Failed -`, errorMessage);

    // 更新任务为失败
    await prisma.tTSTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
      },
    });
  }
}
