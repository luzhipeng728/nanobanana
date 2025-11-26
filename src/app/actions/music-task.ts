"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

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

export type MusicTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface MusicTaskResult {
  id: string;
  status: MusicTaskStatus;
  prompt: string;
  lyrics?: string;
  numberOfSongs: number;
  musicUrls?: Array<{ url: string; flacUrl: string; duration: number; lyrics?: string }>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 从 lyrics_sections 提取歌词文本
 */
function extractLyricsFromSections(lyricsSections: any[]): string {
  if (!lyricsSections || lyricsSections.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (const section of lyricsSections) {
    // 添加节类型标记（如果需要）
    if (section.section_type && section.section_type !== 'intro' && section.section_type !== 'outro') {
      const sectionLabel = section.section_type.replace('_', ' ').toUpperCase();
      lines.push(`[${sectionLabel}]`);
    }

    // 提取该节的所有歌词行
    if (section.lines && Array.isArray(section.lines)) {
      for (const line of section.lines) {
        if (line.text) {
          lines.push(line.text);
        }
      }
    }

    // 节之间添加空行
    if (section.section_type !== 'intro' && section.section_type !== 'outro') {
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

/**
 * 创建音乐生成任务
 */
export async function createMusicTask(
  prompt: string,
  lyrics?: string,
  numberOfSongs: number = 2
): Promise<{ taskId: string }> {
  const userId = await getCurrentUserId();

  const task = await prisma.musicTask.create({
    data: {
      status: "pending",
      prompt,
      lyrics: lyrics || null,
      numberOfSongs,
      userId,  // 关联当前用户
    },
  });

  // 异步处理任务（不等待）
  processMusicTask(task.id).catch((error) => {
    console.error(`Error processing music task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询任务状态
 */
export async function getMusicTaskStatus(taskId: string): Promise<MusicTaskResult | null> {
  const task = await prisma.musicTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as MusicTaskStatus,
    prompt: task.prompt,
    lyrics: task.lyrics || undefined,
    numberOfSongs: task.numberOfSongs,
    musicUrls: task.musicUrls ? JSON.parse(task.musicUrls) : undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

/**
 * 处理音乐生成任务（后台执行）
 */
async function processMusicTask(taskId: string): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.musicTask.update({
      where: { id: taskId },
      data: { status: "processing", updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.musicTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    console.log(`[MusicTask ${taskId}] Starting music generation...`);
    console.log(`[MusicTask ${taskId}] Prompt: ${task.prompt.substring(0, 50)}...`);

    // 调用 Mureka API 生成音乐
    const murekaApiUrl = process.env.MUREKA_API_URL;
    const murekaApiToken = process.env.MUREKA_API_TOKEN;

    if (!murekaApiUrl || !murekaApiToken) {
      throw new Error("Mureka API credentials not configured");
    }

    // 第一步：创建音乐生成任务
    const payload: any = {
      model: "auto",
      n: task.numberOfSongs,
    };

    // 只添加非空的参数
    if (task.prompt) {
      payload.prompt = task.prompt;
    }
    if (task.lyrics) {
      payload.lyrics = task.lyrics;
    }

    console.log(`[MusicTask ${taskId}] Calling Mureka API with payload:`, JSON.stringify(payload));

    const generateResponse = await fetch(`${murekaApiUrl}/v1/song/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${murekaApiToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(`Mureka API error: ${generateResponse.status} - ${errorText}`);
    }

    const generateData = await generateResponse.json();
    const externalTaskId = generateData.id;

    if (!externalTaskId) {
      throw new Error("No task ID returned from Mureka API");
    }

    console.log(`[MusicTask ${taskId}] Mureka task created: ${externalTaskId}`);

    // 保存外部任务 ID
    await prisma.musicTask.update({
      where: { id: taskId },
      data: { externalTaskId, updatedAt: new Date() },
    });

    // 第二步：轮询任务状态直到完成
    let attempts = 0;
    const maxAttempts = 120; // 最多轮询 10 分钟 (每 5 秒一次)
    let completed = false;

    while (attempts < maxAttempts && !completed) {
      // 等待 5 秒
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;

      console.log(`[MusicTask ${taskId}] Polling attempt ${attempts}/${maxAttempts}...`);

      const queryResponse = await fetch(`${murekaApiUrl}/v1/song/query/${externalTaskId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${murekaApiToken}`,
        },
      });

      if (!queryResponse.ok) {
        console.warn(`[MusicTask ${taskId}] Query failed: ${queryResponse.status}`);
        continue;
      }

      const queryData = await queryResponse.json();
      const status = queryData.status;

      console.log(`[MusicTask ${taskId}] Status: ${status}`);

      if (status === "succeeded") {
        // 任务成功
        const choices = queryData.choices || [];
        const musicUrls = choices.map((choice: any) => {
          // 提取每首歌的歌词
          const lyricsText = choice.lyrics_sections
            ? extractLyricsFromSections(choice.lyrics_sections)
            : '';

          return {
            url: choice.url,
            flacUrl: choice.flac_url,
            duration: choice.duration,
            lyrics: lyricsText,
          };
        });

        // 使用第一首歌的歌词作为任务的歌词（如果用户没有提供歌词）
        const taskLyrics = task.lyrics || (musicUrls[0]?.lyrics || null);

        await prisma.musicTask.update({
          where: { id: taskId },
          data: {
            status: "completed",
            musicUrls: JSON.stringify(musicUrls),
            lyrics: taskLyrics,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        console.log(`[MusicTask ${taskId}] ✅ Completed successfully with ${musicUrls.length} songs`);
        if (musicUrls[0]?.lyrics) {
          console.log(`[MusicTask ${taskId}] Extracted lyrics (${musicUrls[0].lyrics.length} chars)`);
        }
        completed = true;
      } else if (status === "failed") {
        // 任务失败
        throw new Error(queryData.error || "Music generation failed");
      }
      // 其他状态（preparing, queued, running, streaming）继续轮询
    }

    if (!completed) {
      throw new Error("Music generation timeout after 10 minutes");
    }
  } catch (error) {
    // 异常：更新状态为 failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.musicTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[MusicTask ${taskId}] ❌ Exception: ${errorMessage}`);
  }
}

/**
 * 清理旧任务（可选，用于定期清理数据库）
 */
export async function cleanupOldMusicTasks(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.musicTask.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
