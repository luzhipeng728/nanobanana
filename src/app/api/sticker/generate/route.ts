import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";

// 初始化 Anthropic 客户端
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
}

// 分析原始图片，获取基础描述（流式）
async function analyzeOriginalImage(
  imageUrl: string,
  animationPrompt: string,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const anthropic = getAnthropicClient();
  let analysisText = "";
  
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: imageUrl },
          },
          {
            type: "text",
            text: `请仔细分析这张图片，我需要基于它生成一个「${animationPrompt}」动画效果。

请用英文描述以下内容（这将用于图像生成）：
1. **Subject**: 主体的外形、颜色、姿态、表情等详细特征
2. **Background**: 背景的颜色、元素、氛围
3. **Art Style**: 画风、色调、质感
4. **Animation Plan**: 如何将"${animationPrompt}"这个动画分解为10帧的微小渐进变化

请直接用英文输出，格式清晰。`,
          },
        ],
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const chunk = event.delta.text;
      analysisText += chunk;
      await onChunk(chunk);
    }
  }

  return analysisText;
}

// 一次性生成 10 帧的提示词
async function generateAllFramePrompts(
  anthropic: Anthropic,
  baseAnalysis: string,
  animationPrompt: string
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `Based on this subject analysis, generate 10 image prompts for a "${animationPrompt}" animation loop.

Subject Analysis:
${baseAnalysis.substring(0, 1000)}

CRITICAL RULES:
1. ALL 10 prompts must describe the EXACT SAME subject, background, art style, lighting
2. The ONLY difference between frames is the animation element (${animationPrompt})
3. Changes between consecutive frames must be VERY SUBTLE (~10% change)
4. Frame 1 = neutral starting pose
5. Frame 10 must be almost identical to Frame 1 (for smooth loop)
6. Animation arc: build up (1-4) → peak (5-7) → return (8-10)

FORMAT: Output EXACTLY 10 prompts, each 60-80 words, separated by "---":

Prompt 1:
[prompt for frame 1 - neutral starting pose]
---
Prompt 2:
[prompt for frame 2 - slight change]
---
...continue to Prompt 10...`
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const fullText = textBlock?.type === "text" ? textBlock.text : "";
  
  // 解析 10 个 prompts
  const prompts: string[] = [];
  const parts = fullText.split("---");
  
  for (const part of parts) {
    // 提取 "Prompt N:" 后面的内容
    const match = part.match(/Prompt \d+:?\s*([\s\S]*)/i);
    if (match && match[1]) {
      const prompt = match[1].trim();
      if (prompt.length > 20) {
        prompts.push(prompt);
      }
    }
  }
  
  // 如果解析失败，用简单分割
  if (prompts.length < 10) {
    const simpleParts = fullText.split(/(?:Prompt \d+:?|---)/i).filter(p => p.trim().length > 20);
    for (let i = prompts.length; i < 10 && i < simpleParts.length; i++) {
      prompts.push(simpleParts[i].trim());
    }
  }
  
  // 补充缺失的 prompts
  while (prompts.length < 10) {
    prompts.push(`Frame ${prompts.length + 1} of ${animationPrompt} animation, same subject and style`);
  }
  
  console.log(`[generateAllFramePrompts] Generated ${prompts.length} prompts`);
  return prompts.slice(0, 10);
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: any) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  (async () => {
    try {
      const body = await request.json();
      const { referenceImage, animationPrompt, model, config } = body;

      if (!referenceImage) {
        await sendEvent({ type: "error", error: "缺少参考图片" });
        await writer.close();
        return;
      }

      if (!animationPrompt) {
        await sendEvent({ type: "error", error: "缺少动画描述" });
        await writer.close();
        return;
      }

      const taskId = uuidv4();

      // Step 1: 分析原始图片（流式显示）
      await sendEvent({
        type: "status",
        step: "👁️ Claude 正在分析参考图片...",
        progress: 5,
      });
      await sendEvent({ type: "claude_analysis_start" });

      let baseAnalysis = "";
      try {
        baseAnalysis = await analyzeOriginalImage(
          referenceImage,
          animationPrompt,
          async (chunk) => {
            await sendEvent({ type: "claude_analysis_chunk", chunk });
          }
        );
      } catch (err) {
        console.error("Analysis error:", err);
        await sendEvent({ type: "error", error: "图片分析失败" });
        await writer.close();
        return;
      }

      await sendEvent({ type: "claude_analysis_end" });

      // Step 2: 创建任务记录
      await sendEvent({
        type: "status",
        step: "📝 创建任务...",
        progress: 15,
      });

      await prisma.stickerTask.create({
        data: {
          id: taskId,
          status: "processing",
          animationType: animationPrompt,
          referenceImage,
          model: model || "nano-banana",
          config: JSON.stringify(config || {}),
          customPrompt: baseAnalysis, // 存储基础分析
          totalFrames: 10,
          completedFrames: 0,
          frames: JSON.stringify([]),
          frameStatuses: JSON.stringify(Array(10).fill("pending")),
        },
      });

      // Step 3: 立即创建 StickerNode
      await sendEvent({
        type: "sticker_created",
        taskId,
      });

      await sendEvent({
        type: "status",
        step: "🚀 任务已创建，开始并发生成 10 帧...",
        progress: 20,
      });

      // Step 4: 后台并发生成（不等待）
      processParallelFrames(
        taskId,
        baseAnalysis,
        animationPrompt,
        referenceImage,
        (model || "nano-banana") as GeminiImageModel,
        config || {}
      ).catch((err) => {
        console.error(`[Sticker ${taskId}] Parallel generation error:`, err);
      });

      await sendEvent({
        type: "complete",
        progress: 100,
      });

      await writer.close();
    } catch (error) {
      console.error("Sticker generation error:", error);
      await sendEvent({
        type: "error",
        error: error instanceof Error ? error.message : "生成失败",
      });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

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

// 后台并发生成：一次生成 10 个 prompts，然后并发生成图片
async function processParallelFrames(
  taskId: string,
  baseAnalysis: string,
  animationPrompt: string,
  originalReferenceImage: string,
  model: GeminiImageModel,
  config: ImageGenerationConfig
) {
  const anthropic = getAnthropicClient();
  const generatedFrames: (string | null)[] = Array(10).fill(null);
  const frameStatuses: string[] = Array(10).fill("pending");

  console.log(`[Sticker ${taskId}] Starting parallel generation...`);

  try {
    // Step 1: 一次性生成 10 个 prompts
    console.log(`[Sticker ${taskId}] Generating all 10 prompts...`);
    
    const framePrompts = await withRetry(
      () => withTimeout(
        generateAllFramePrompts(anthropic, baseAnalysis, animationPrompt),
        90000, // 90秒超时
        "Claude prompt generation timeout"
      ),
      3,
      3000,
      "Generate all prompts"
    );
    
    console.log(`[Sticker ${taskId}] Got ${framePrompts.length} prompts, starting parallel image generation...`);
    
    // 存储 prompts 到数据库
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: { customPrompt: JSON.stringify(framePrompts) },
    });

    // Step 2: 10 张图片全并发生成（每张都用原始参考图）
    // 标记所有帧为 generating
    for (let i = 0; i < 10; i++) {
      frameStatuses[i] = "generating";
    }
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: { frameStatuses: JSON.stringify(frameStatuses) },
    });

    console.log(`[Sticker ${taskId}] Starting 10 concurrent image generations...`);

    // 10 个并发请求
    const allPromises = framePrompts.map((prompt, frameIndex) =>
      withRetry(
        () => withTimeout(
          generateImageAction(
            prompt,
            model,
            config,
            [originalReferenceImage] // 每帧都用同一个原始参考图！
          ),
          120000, // 2分钟超时
          `Frame ${frameIndex + 1} timeout`
        ),
        2, // 重试 2 次
        2000,
        `Frame ${frameIndex + 1}`
      ).then(result => ({ frameIndex, result }))
       .catch(err => ({ frameIndex, error: err }))
    );

    // 等待所有完成
    const allResults = await Promise.all(allPromises);

    // 处理所有结果
    for (const item of allResults) {
      const { frameIndex } = item;
      if ('result' in item && item.result.success && item.result.imageUrl) {
        generatedFrames[frameIndex] = item.result.imageUrl;
        frameStatuses[frameIndex] = "completed";
        console.log(`[Sticker ${taskId}] Frame ${frameIndex + 1} completed ✓`);
      } else {
        frameStatuses[frameIndex] = "error";
        const errorMsg = 'error' in item ? item.error?.message : item.result?.error;
        console.error(`[Sticker ${taskId}] Frame ${frameIndex + 1} failed: ${errorMsg}`);
      }
    }

    // 更新数据库
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: {
        frames: JSON.stringify(generatedFrames),
        frameStatuses: JSON.stringify(frameStatuses),
        completedFrames: frameStatuses.filter(s => s === "completed").length,
      },
    });

    console.log(`[Sticker ${taskId}] All 10 frames done, ${frameStatuses.filter(s => s === "completed").length}/10 completed`);
    
  } catch (err) {
    console.error(`[Sticker ${taskId}] Fatal error:`, err);
  }

  // 最终状态
  const completedCount = frameStatuses.filter(s => s === "completed").length;
  await prisma.stickerTask.update({
    where: { id: taskId },
    data: {
      status: completedCount >= 5 ? "completed" : "failed",
      frames: JSON.stringify(generatedFrames),
      frameStatuses: JSON.stringify(frameStatuses),
      completedFrames: completedCount,
      completedAt: new Date(),
    },
  });

  console.log(`[Sticker ${taskId}] ✅ Parallel generation finished (${completedCount}/10 frames)`);
}
