"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { generateImageAction } from "./generate";
import { checkBalance, deductBalance } from "@/lib/billing";
import { getModelPrice } from "@/lib/pricing";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";

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

export type ImageTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface ImageTaskResult {
  id: string;
  status: ImageTaskStatus;
  prompt: string;
  model: string;
  imageUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 创建图片生成任务
 */
export async function createImageTask(
  prompt: string,
  model: GeminiImageModel,
  config: ImageGenerationConfig = {},
  referenceImages: string[] = []
): Promise<{ taskId: string; error?: string }> {
  const userId = await getCurrentUserId();

  // 检查用户余额是否足够
  if (userId) {
    const price = getModelPrice(model);
    if (price > 0) {
      const { sufficient, balance } = await checkBalance(userId, price);
      if (!sufficient) {
        return {
          taskId: "",
          error: `余额不足，当前余额 ¥${balance.toFixed(2)}，本次需要 ¥${price.toFixed(2)}`,
        };
      }
    }
  }

  const task = await prisma.imageTask.create({
    data: {
      status: "pending",
      prompt,
      model,
      config: JSON.stringify(config),
      referenceImages: referenceImages.length > 0 ? JSON.stringify(referenceImages) : null,
      userId,  // 关联当前用户
    },
  });

  // 异步处理任务（不等待）
  processImageTask(task.id).catch((error) => {
    console.error(`Error processing task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询任务状态
 */
export async function getImageTaskStatus(taskId: string): Promise<ImageTaskResult | null> {
  const task = await prisma.imageTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as ImageTaskStatus,
    prompt: task.prompt,
    model: task.model,
    imageUrl: task.imageUrl || undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

/**
 * 处理图片生成任务（后台执行）
 */
async function processImageTask(taskId: string): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.imageTask.update({
      where: { id: taskId },
      data: { status: "processing", updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.imageTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    // 解析配置
    const config: ImageGenerationConfig = task.config ? JSON.parse(task.config) : {};
    const referenceImages: string[] = task.referenceImages ? JSON.parse(task.referenceImages) : [];

    console.log(`[Task ${taskId}] Starting image generation...`);
    console.log(`[Task ${taskId}] Model: ${task.model}, Prompt: ${task.prompt.substring(0, 50)}...`);

    // 执行图片生成
    const result = await generateImageAction(
      task.prompt,
      task.model as GeminiImageModel,
      config,
      referenceImages
    );

    if (result.success && result.imageUrl) {
      // 成功：更新状态为 completed
      await prisma.imageTask.update({
        where: { id: taskId },
        data: {
          status: "completed",
          imageUrl: result.imageUrl,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 扣费（仅当有用户 ID 时）
      if (task.userId) {
        const billingResult = await deductBalance(
          task.userId,
          "image",
          task.model,
          taskId,
          `图片生成: ${task.prompt.substring(0, 50)}...`
        );
        if (billingResult.success) {
          console.log(`[Task ${taskId}] 💰 Charged ¥${billingResult.amount?.toFixed(2)}, balance: ¥${billingResult.balanceAfter?.toFixed(2)}`);
        } else {
          console.warn(`[Task ${taskId}] ⚠️ Billing failed: ${billingResult.error}`);
        }
      }

      console.log(`[Task ${taskId}] ✅ Completed successfully`);
    } else {
      // 失败：更新状态为 failed
      await prisma.imageTask.update({
        where: { id: taskId },
        data: {
          status: "failed",
          error: result.error || "Unknown error",
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.error(`[Task ${taskId}] ❌ Failed: ${result.error}`);
    }
  } catch (error) {
    // 异常：更新状态为 failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.imageTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[Task ${taskId}] ❌ Exception: ${errorMessage}`);
  }
}

/**
 * 清理旧任务（可选，用于定期清理数据库）
 */
export async function cleanupOldTasks(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.imageTask.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
