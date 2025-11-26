"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { createCanvas, loadImage } from "canvas";
import { uploadBufferToR2 } from "@/lib/r2";
import type { GenerationMode, ImageResolution, SpriteConfig } from "@/types/sprite";

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

export type SpriteTaskStatus = "pending" | "processing" | "completed" | "failed";

// Claude 分析结果
export interface SpriteAnalysis {
  rows: number;
  cols: number;
  totalFrames: number;
  direction: "row" | "column";
  blankFrames: number[]; // 空白帧的索引列表
}

export interface SpriteTaskResult {
  id: string;
  status: SpriteTaskStatus;
  mode: GenerationMode;
  spriteSheetUrl?: string;
  frameUrls?: string[];      // R2 上的帧 URL 列表
  spriteConfig?: SpriteConfig;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateSpriteTaskParams {
  mode: GenerationMode;
  templateImage?: string;
  characterImage: string;
  prompt?: string;
  actionPrompt?: string;
  size: ImageResolution;
  aspectRatio?: string;
}

/**
 * 创建精灵图生成任务
 */
export async function createSpriteTask(
  params: CreateSpriteTaskParams
): Promise<{ taskId: string }> {
  const userId = await getCurrentUserId();

  const task = await prisma.spriteTask.create({
    data: {
      status: "pending",
      mode: params.mode,
      templateImage: params.templateImage || null,
      characterImage: params.characterImage,
      prompt: params.prompt || null,
      actionPrompt: params.actionPrompt || null,
      size: params.size,
      aspectRatio: params.aspectRatio || "1:1",
      userId,
    },
  });

  // 异步处理任务（不等待）
  processSpriteTask(task.id).catch((error) => {
    console.error(`Error processing sprite task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询任务状态
 */
export async function getSpriteTaskStatus(taskId: string): Promise<SpriteTaskResult | null> {
  const task = await prisma.spriteTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as SpriteTaskStatus,
    mode: task.mode as GenerationMode,
    spriteSheetUrl: task.spriteSheetUrl || undefined,
    frameUrls: task.frameUrls ? JSON.parse(task.frameUrls) : undefined,
    spriteConfig: task.spriteConfig ? JSON.parse(task.spriteConfig) : undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

// ============ 内部实现 ============

// 初始化 Gemini 客户端
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY 未配置");
  }
  return new GoogleGenAI({ apiKey });
}

// 初始化 Claude 客户端
function getClaudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
}

// 重试机制
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isOverloaded =
      error.status === 503 ||
      error.code === 503 ||
      (error.message && error.message.includes("overloaded"));

    if (retries > 0 && isOverloaded) {
      console.warn(`Model overloaded. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * 将图片 URL 或 base64 统一转换为纯 base64 数据
 */
async function toBase64(imageSource: string): Promise<string> {
  if (imageSource.startsWith("data:image/")) {
    return imageSource.replace(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/, "");
  }

  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    console.log("[Sprite Task] Downloading image from URL:", imageSource.substring(0, 50) + "...");

    const response = await fetch(imageSource);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    console.log("[Sprite Task] Image downloaded, size:", Math.round(arrayBuffer.byteLength / 1024), "KB");
    return base64;
  }

  return imageSource;
}

/**
 * 检测 base64 图片的媒体类型
 */
function detectImageMediaType(base64: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  // PNG: 89 50 4E 47
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  // JPEG: FF D8 FF
  if (base64.startsWith("/9j/")) return "image/jpeg";
  // GIF: 47 49 46 38
  if (base64.startsWith("R0lGOD")) return "image/gif";
  // WebP: 52 49 46 46
  if (base64.startsWith("UklGR")) return "image/webp";
  // 默认返回 PNG
  return "image/png";
}

/**
 * 使用 Claude 分析精灵图的布局
 */
async function analyzeSpriteWithClaude(imageBase64: string): Promise<SpriteAnalysis> {
  const anthropic = getClaudeClient();

  console.log("[Sprite Task] Using Claude to analyze sprite sheet...");

  // 检测图片的真实媒体类型
  const mediaType = detectImageMediaType(imageBase64);
  console.log(`[Sprite Task] Detected media type: ${mediaType}`);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `分析这张精灵图（sprite sheet），确定其网格布局。

请仔细观察：
1. 图片被分成几行几列的网格？
2. 总共有多少个动画帧？（注意：有些格子可能是空白的）
3. 动画的阅读顺序是行优先（从左到右，然后下一行）还是列优先（从上到下，然后下一列）？
4. 哪些格子是空白的？（列出它们的索引，从0开始）

请只返回 JSON 格式，不要其他文字：
{
  "rows": 数字,
  "cols": 数字,
  "totalFrames": 实际有内容的帧数,
  "direction": "row" 或 "column",
  "blankFrames": [空白帧的索引数组，如果没有空白帧就是空数组]
}`,
          },
        ],
      },
    ],
  });

  // 解析 Claude 的响应
  const textContent = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textContent) {
    throw new Error("Claude 返回空响应");
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Claude response:", textContent.text);
    throw new Error("无法从 Claude 响应中解析 JSON");
  }

  const analysis = JSON.parse(jsonMatch[0]) as SpriteAnalysis;
  console.log("[Sprite Task] Claude analysis result:", analysis);

  return analysis;
}

/**
 * 在后端切割精灵图并上传每一帧到 R2
 */
async function splitAndUploadFrames(
  imageBase64: string,
  analysis: SpriteAnalysis
): Promise<string[]> {
  console.log("[Sprite Task] Splitting sprite sheet into frames...");

  // 加载图片
  const buffer = Buffer.from(imageBase64, "base64");
  const image = await loadImage(buffer);

  const frameWidth = image.width / analysis.cols;
  const frameHeight = image.height / analysis.rows;
  const frameUrls: string[] = [];

  console.log(`[Sprite Task] Frame size: ${frameWidth}x${frameHeight}, Total cells: ${analysis.rows * analysis.cols}`);

  // 计算要切割的帧数
  const totalCells = analysis.rows * analysis.cols;

  for (let i = 0; i < totalCells; i++) {
    // 跳过空白帧
    if (analysis.blankFrames.includes(i)) {
      console.log(`[Sprite Task] Skipping blank frame ${i}`);
      continue;
    }

    // 计算帧的位置
    let col: number, row: number;
    if (analysis.direction === "column") {
      row = i % analysis.rows;
      col = Math.floor(i / analysis.rows);
    } else {
      col = i % analysis.cols;
      row = Math.floor(i / analysis.cols);
    }

    // 创建 canvas 切割帧
    const canvas = createCanvas(frameWidth, frameHeight);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      image,
      col * frameWidth, row * frameHeight,
      frameWidth, frameHeight,
      0, 0,
      frameWidth, frameHeight
    );

    // 转换为 Buffer
    const frameBuffer = canvas.toBuffer("image/png");

    // 上传到 R2
    const frameUrl = await uploadBufferToR2(frameBuffer, "image/png", "sprites");
    frameUrls.push(frameUrl);

    console.log(`[Sprite Task] Uploaded frame ${i} -> ${frameUrl.substring(0, 50)}...`);
  }

  console.log(`[Sprite Task] Total ${frameUrls.length} frames uploaded to R2`);
  return frameUrls;
}

// Replica 模式：模板 + 角色 → 生成新角色的相同动作
async function generateSpriteReplica(
  templateSource: string,
  characterSource: string,
  prompt: string,
  size: ImageResolution,
  aspectRatio: string = "1:1"
): Promise<string> {
  const genAI = getGeminiClient();

  const cleanTemplate = await toBase64(templateSource);
  const cleanCharacter = await toBase64(characterSource);

  return withRetry(async () => {
    const textPrompt = `
        Create a high-quality pixel art sprite sheet based on the visual style of the character provided in the second image.
        CRITICAL INSTRUCTIONS:
        1. The layout, grid structure, and poses MUST EXACTLY match the first image (the template sprite sheet).
        2. DO NOT STRETCH the sprites. Maintain the original internal aspect ratio of the characters.
        3. If the output aspect ratio (${aspectRatio}) differs from the template, add padding (empty space) rather than stretching the content.
        4. Apply the character's appearance (colors, clothing, features) to the poses in the template.
        ${prompt ? `Additional instructions: ${prompt}` : ''}
      `;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: textPrompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanTemplate
            }
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanCharacter
            }
          }
        ]
      },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: aspectRatio
        }
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data as string; // 返回纯 base64
        }
      }
    }

    throw new Error("No image generated in response");
  });
}

// Creative 模式：角色 + 动作描述 → 生成新动作 Sprite Sheet
async function generateSpriteCreative(
  characterSource: string,
  actionPrompt: string,
  stylePrompt: string,
  size: ImageResolution
): Promise<string> {
  const genAI = getGeminiClient();

  const cleanCharacter = await toBase64(characterSource);

  return withRetry(async () => {
    const textPrompt = `
        Create a high-quality pixel art sprite sheet for game animation.

        REFERENCE CHARACTER:
        See the attached image. You MUST maintain the exact identity, colors, and design of this character.

        ACTION:
        ${actionPrompt}

        REQUIREMENTS:
        1. Generate a sequence of animation frames showing the character performing the action.
        2. Arrange the frames in a clean, regular GRID (e.g., 3x3, 4x4, 5x5, or a horizontal strip) so they can be easily sliced.
        3. Ensure consistent sizing and positioning for each frame.
        4. Visual Style: ${stylePrompt || "Match the reference character's style"}.
        5. Background: Solid uniform color (easy to remove) or transparent.

        OUTPUT FORMAT:
        A single image file containing the sprite sheet.
      `;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: textPrompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanCharacter
            }
          }
        ]
      },
      config: {
        imageConfig: {
          imageSize: size,
          aspectRatio: "1:1"
        }
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return part.inlineData.data as string; // 返回纯 base64
        }
      }
    }

    throw new Error("No image generated in response");
  });
}

/**
 * 处理精灵图生成任务（后台执行）
 */
async function processSpriteTask(taskId: string): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.spriteTask.update({
      where: { id: taskId },
      data: { status: "processing", updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.spriteTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    console.log(`[Sprite Task ${taskId}] Starting sprite generation...`);
    console.log(`[Sprite Task ${taskId}] Mode: ${task.mode}`);

    // Step 1: 生成精灵图
    let spriteBase64: string;

    if (task.mode === "replica") {
      if (!task.templateImage || !task.characterImage) {
        throw new Error("Replica 模式需要模板和角色图片");
      }

      spriteBase64 = await generateSpriteReplica(
        task.templateImage,
        task.characterImage,
        task.prompt || "",
        task.size as ImageResolution,
        task.aspectRatio
      );
    } else {
      if (!task.characterImage || !task.actionPrompt) {
        throw new Error("Creative 模式需要角色图片和动作描述");
      }

      spriteBase64 = await generateSpriteCreative(
        task.characterImage,
        task.actionPrompt,
        task.prompt || "",
        task.size as ImageResolution
      );
    }

    console.log(`[Sprite Task ${taskId}] Sprite generated, uploading to R2...`);

    // Step 2: 上传原始精灵图到 R2
    const spriteBuffer = Buffer.from(spriteBase64, "base64");
    const spriteSheetUrl = await uploadBufferToR2(spriteBuffer, "image/png", "sprites");
    console.log(`[Sprite Task ${taskId}] Sprite sheet uploaded: ${spriteSheetUrl.substring(0, 50)}...`);

    // Step 3: 使用 Claude 分析精灵图布局
    console.log(`[Sprite Task ${taskId}] Analyzing sprite layout with Claude...`);
    const analysis = await analyzeSpriteWithClaude(spriteBase64);

    // Step 4: 切割帧并上传到 R2
    console.log(`[Sprite Task ${taskId}] Splitting and uploading frames...`);
    const frameUrls = await splitAndUploadFrames(spriteBase64, analysis);

    // 检查是否有空白帧（警告，但不阻止完成）
    const hasBlankFrames = analysis.blankFrames.length > 0;
    if (hasBlankFrames) {
      console.warn(`[Sprite Task ${taskId}] ⚠️ ${analysis.blankFrames.length} blank frames detected`);
    }

    // 构建 spriteConfig
    const spriteConfig: SpriteConfig = {
      rows: analysis.rows,
      cols: analysis.cols,
      totalFrames: frameUrls.length,
      fps: 6,
      scale: 1,
      autoTransparent: true,
      direction: analysis.direction,
    };

    // 成功：更新状态为 completed
    await prisma.spriteTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        spriteSheetUrl,
        frameUrls: JSON.stringify(frameUrls),
        spriteConfig: JSON.stringify({
          ...spriteConfig,
          blankFrames: analysis.blankFrames, // 保存空白帧信息
        }),
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[Sprite Task ${taskId}] ✅ Completed! ${frameUrls.length} frames, ${analysis.blankFrames.length} blank`);

  } catch (error) {
    // 异常：更新状态为 failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.spriteTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[Sprite Task ${taskId}] ❌ Failed: ${errorMessage}`);
  }
}
