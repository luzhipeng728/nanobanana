"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { query } from "@anthropic-ai/claude-agent-sdk";

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

export type PPTTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface PPTMaterial {
  type: "image" | "text";
  url?: string;
  content?: string;
}

export interface SlideData {
  id: string;
  layout: "title" | "content" | "two-column" | "image-focus" | "ending";
  title: string;
  subtitle?: string;
  content?: string[];
  imageUrl?: string;
  notes?: string;
}

export interface PPTTaskResult {
  id: string;
  status: PPTTaskStatus;
  topic: string;
  template: string;
  slides?: SlideData[];
  pptUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 创建 PPT 生成任务
 */
export async function createPPTTask(
  topic: string,
  template: string = "business",
  primaryColor: string = "#3B82F6",
  description?: string,
  materials: PPTMaterial[] = []
): Promise<{ taskId: string }> {
  const userId = await getCurrentUserId();

  const task = await prisma.pPTTask.create({
    data: {
      status: "pending",
      topic,
      description,
      template,
      primaryColor,
      materials: materials.length > 0 ? JSON.stringify(materials) : null,
      userId,
    },
  });

  // 异步处理任务(不等待)
  processPPTTask(task.id).catch((error) => {
    console.error(`Error processing PPT task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询 PPT 任务状态
 */
export async function getPPTTaskStatus(taskId: string): Promise<PPTTaskResult | null> {
  const task = await prisma.pPTTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as PPTTaskStatus,
    topic: task.topic,
    template: task.template,
    slides: task.slides ? JSON.parse(task.slides) : undefined,
    pptUrl: task.pptUrl || undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

/**
 * 处理 PPT 生成任务(后台执行)
 * 使用 Claude Agent SDK 调用 pptx skill
 */
async function processPPTTask(taskId: string): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.pPTTask.update({
      where: { id: taskId },
      data: { status: "processing", updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.pPTTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const materials: PPTMaterial[] = task.materials ? JSON.parse(task.materials) : [];

    console.log(`[PPT Task ${taskId}] Starting PPT generation with Claude Agent SDK...`);
    console.log(`[PPT Task ${taskId}] Topic: ${task.topic}, Template: ${task.template}`);

    // 构建 prompt
    const userPrompt = buildPPTPrompt(
      task.topic,
      task.description,
      task.template,
      task.primaryColor,
      materials
    );

    console.log(`[PPT Task ${taskId}] Prompt: ${userPrompt.substring(0, 200)}...`);

    // 使用 Claude Agent SDK 调用
    let resultText = "";
    let fileId: string | undefined;
    const slides: SlideData[] = [];

    for await (const message of query({
      prompt: userPrompt,
      options: {
        maxTurns: 10,
        permissionMode: "acceptEdits",
      }
    })) {
      console.log(`[PPT Task ${taskId}] Message type: ${message.type}`);

      // 处理结果消息
      if (message.type === "result") {
        resultText = (message as any).result || "";
        console.log(`[PPT Task ${taskId}] Result: ${resultText.substring(0, 200)}...`);
      }

      // 处理文本消息，尝试提取幻灯片信息
      if (message.type === "assistant" && (message as any).message?.content) {
        for (const block of (message as any).message.content) {
          if (block.type === "text" && block.text) {
            // 尝试从文本中解析幻灯片信息
            const parsedSlides = parseSlideText(block.text);
            if (parsedSlides.length > 0) {
              slides.push(...parsedSlides);
            }
          }
        }
      }
    }

    console.log(`[PPT Task ${taskId}] Generation completed, slides: ${slides.length}`);

    // 如果没有解析到幻灯片，创建默认预览
    if (slides.length === 0) {
      slides.push({
        id: "slide-1",
        layout: "title",
        title: task.topic,
        subtitle: "由 AI 生成",
        content: ["PPT 文件已生成", "请查看详细内容"],
      });
    }

    // 更新任务为完成
    await prisma.pPTTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        fileId,
        slides: slides.length > 0 ? JSON.stringify(slides) : null,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`[PPT Task ${taskId}] ✅ Completed successfully`);
  } catch (error) {
    console.error(`[PPT Task ${taskId}] ❌ Failed:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await prisma.pPTTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * 从文本中解析幻灯片信息
 */
function parseSlideText(text: string): SlideData[] {
  const slides: SlideData[] = [];
  const lines = text.split('\n');
  let currentSlide: Partial<SlideData> | null = null;
  let slideCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测幻灯片标题
    if (trimmed.match(/^(Slide\s*\d+[:\s]|#\s|##\s|幻灯片\s*\d+)/i)) {
      if (currentSlide && currentSlide.title) {
        slides.push({
          id: `slide-${slideCounter++}`,
          layout: slideCounter === 1 ? "title" : "content",
          title: currentSlide.title,
          subtitle: currentSlide.subtitle,
          content: currentSlide.content,
          imageUrl: currentSlide.imageUrl,
        } as SlideData);
      }

      currentSlide = {
        title: trimmed.replace(/^(Slide\s*\d+[:\s]|#\s|##\s|幻灯片\s*\d+[:\s]?)/i, '').trim(),
        content: [],
      };
    } else if (currentSlide && (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*'))) {
      if (!currentSlide.content) currentSlide.content = [];
      currentSlide.content.push(trimmed.replace(/^[-•*]\s*/, ''));
    }
  }

  // 添加最后一张幻灯片
  if (currentSlide && currentSlide.title) {
    slides.push({
      id: `slide-${slideCounter++}`,
      layout: slideCounter === 1 ? "title" : "content",
      title: currentSlide.title,
      subtitle: currentSlide.subtitle,
      content: currentSlide.content,
      imageUrl: currentSlide.imageUrl,
    } as SlideData);
  }

  return slides;
}

/**
 * 构建 PPT 生成 prompt
 */
function buildPPTPrompt(
  topic: string,
  description: string | null,
  template: string,
  primaryColor: string,
  materials: PPTMaterial[]
): string {
  const templateNames: Record<string, string> = {
    business: "商务专业",
    tech: "科技现代",
    minimal: "简约清新",
    creative: "创意活泼",
  };

  let prompt = `创建一个关于「${topic}」的 PowerPoint 演示文稿。

设计要求:
- 风格: ${templateNames[template] || template}
- 主色调: ${primaryColor}
- 页数: 5-8页,包含封面页、内容页和结束页
- 每页内容要简洁有力,使用要点列表`;

  if (description) {
    prompt += `\n\n补充说明: ${description}`;
  }

  if (materials.length > 0) {
    const imageUrls = materials.filter(m => m.type === "image" && m.url).map(m => m.url);
    if (imageUrls.length > 0) {
      prompt += `\n\n请在适当的幻灯片中使用以下图片素材:\n${imageUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}`;
    }

    const textContents = materials.filter(m => m.type === "text" && m.content).map(m => m.content);
    if (textContents.length > 0) {
      prompt += `\n\n参考文本内容:\n${textContents.join('\n\n')}`;
    }
  }

  prompt += `\n\n请生成专业的 PPT 演示文稿文件(.pptx)。`;

  return prompt;
}

/**
 * 清理旧任务(可选,用于定期清理数据库)
 */
export async function cleanupOldPPTTasks(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.pPTTask.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
