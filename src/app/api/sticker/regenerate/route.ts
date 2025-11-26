import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";

// 带超时的 Promise 包装
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// 带重试的异步函数执行器
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 2000,
  taskName: string = "operation"
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Retry] ${taskName} attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        console.log(`[Retry] Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 1.5; // 指数退避
      }
    }
  }

  throw lastError || new Error(`${taskName} failed after ${maxRetries} attempts`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, frameIndex } = body;

    if (!taskId) {
      return NextResponse.json({ error: "缺少 taskId" }, { status: 400 });
    }

    if (frameIndex === undefined || frameIndex < 0 || frameIndex > 9) {
      return NextResponse.json({ error: "无效的帧索引 (0-9)" }, { status: 400 });
    }

    // 获取任务信息
    const task = await prisma.stickerTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    // 解析存储的 prompts 和 frames
    let framePrompts: string[] = [];
    let frames: (string | null)[] = [];
    let frameStatuses: string[] = [];

    try {
      framePrompts = JSON.parse(task.customPrompt || "[]");
      frames = JSON.parse(task.frames || "[]");
      frameStatuses = JSON.parse(task.frameStatuses || "[]");
    } catch (e) {
      console.error("[Regenerate] Failed to parse task data:", e);
      return NextResponse.json({ error: "任务数据解析失败" }, { status: 500 });
    }

    // 确保有对应的 prompt
    if (!framePrompts[frameIndex]) {
      return NextResponse.json({ error: "该帧没有对应的提示词" }, { status: 400 });
    }

    const prompt = framePrompts[frameIndex];
    const model = (task.model || "nano-banana") as GeminiImageModel;
    let config: ImageGenerationConfig = {};

    try {
      config = JSON.parse(task.config || "{}");
    } catch {
      config = {};
    }

    console.log(`[Regenerate] Task ${taskId} Frame ${frameIndex + 1} - Starting regeneration`);
    console.log(`[Regenerate] Using prompt: ${prompt.substring(0, 100)}...`);

    // 更新状态为 generating
    frameStatuses[frameIndex] = "generating";
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: { frameStatuses: JSON.stringify(frameStatuses) },
    });

    // 使用原始参考图重新生成
    const result = await withRetry(
      () => withTimeout(
        generateImageAction(
          prompt,
          model,
          config,
          task.referenceImage ? [task.referenceImage] : []
        ),
        120000, // 2分钟超时
        `Frame ${frameIndex + 1} regeneration timeout`
      ),
      2,
      2000,
      `Regenerate Frame ${frameIndex + 1}`
    );

    if (result.success && result.imageUrl) {
      // 更新帧数据
      frames[frameIndex] = result.imageUrl;
      frameStatuses[frameIndex] = "completed";

      await prisma.stickerTask.update({
        where: { id: taskId },
        data: {
          frames: JSON.stringify(frames),
          frameStatuses: JSON.stringify(frameStatuses),
          completedFrames: frameStatuses.filter(s => s === "completed").length,
        },
      });

      console.log(`[Regenerate] Task ${taskId} Frame ${frameIndex + 1} - Success ✓`);

      return NextResponse.json({
        success: true,
        frameUrl: result.imageUrl,
        frameIndex,
      });
    } else {
      // 生成失败
      frameStatuses[frameIndex] = "error";
      await prisma.stickerTask.update({
        where: { id: taskId },
        data: { frameStatuses: JSON.stringify(frameStatuses) },
      });

      console.error(`[Regenerate] Task ${taskId} Frame ${frameIndex + 1} - Failed:`, result.error);

      return NextResponse.json({
        success: false,
        error: result.error || "图片生成失败",
      }, { status: 500 });
    }
  } catch (error) {
    console.error("[Regenerate] Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "重新生成失败",
    }, { status: 500 });
  }
}
