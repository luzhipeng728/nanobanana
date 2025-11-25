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

// 为单帧生成提示词（看上一帧图片）
async function generateFramePrompt(
  anthropic: Anthropic,
  baseAnalysis: string,
  animationPrompt: string,
  frameIndex: number,
  previousFrameUrl: string | null
): Promise<string> {
  const framePosition = frameIndex + 1;
  const animationPhase = 
    frameIndex < 3 ? "building up (0% → 30%)" :
    frameIndex < 6 ? "peak intensity (30% → 70%)" :
    frameIndex < 9 ? "winding down (70% → 95%)" : "returning to start (95% → 100%/0%)";

  // 构建消息内容
  const content: Anthropic.ContentBlockParam[] = [];
  
  // 如果有上一帧，让 Claude 看到它
  if (previousFrameUrl && frameIndex > 0) {
    content.push({
      type: "image",
      source: { type: "url", url: previousFrameUrl },
    });
  }

  content.push({
    type: "text",
    text: `${previousFrameUrl && frameIndex > 0 ? `This is frame ${frameIndex} of the animation. ` : ''}Generate image prompt for frame ${framePosition}/10 of a "${animationPrompt}" animation.

Base subject analysis:
${baseAnalysis.substring(0, 600)}

Frame ${framePosition} details:
- Animation phase: ${animationPhase}
- Progress: ${(frameIndex / 9 * 100).toFixed(0)}%
${frameIndex === 0 ? '- FIRST frame: neutral starting pose' : ''}
${frameIndex === 9 ? '- LAST frame: must look similar to frame 1 for smooth loop' : ''}

RULES:
- EXACT same subject, background, art style
- Only change: ${animationPrompt} (~10% change)
- Be specific about pose/expression changes

Output ONLY the English prompt (60-80 words).`
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : `Frame ${framePosition} of ${animationPrompt} animation`;
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
        step: "🚀 任务已创建，开始链式生成...",
        progress: 20,
      });

      // Step 4: 后台链式生成（不等待）
      processChainedFrames(
        taskId,
        baseAnalysis,
        animationPrompt,
        referenceImage,
        (model || "nano-banana") as GeminiImageModel,
        config || {}
      ).catch((err) => {
        console.error(`[Sticker ${taskId}] Chain generation error:`, err);
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

// 后台链式生成：带超时和重试
async function processChainedFrames(
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

  console.log(`[Sticker ${taskId}] Starting generation with retry support...`);

  // 当前参考图：用于 Gemini 生成
  let currentReferenceImage = originalReferenceImage;

  for (let i = 0; i < 10; i++) {
    frameStatuses[i] = "generating";
    
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: { frameStatuses: JSON.stringify(frameStatuses) },
    });

    try {
      // 上一帧 URL（给 Claude 看）
      const previousFrameUrl = i > 0 ? generatedFrames[i - 1] : null;

      // Step A: Claude 生成提示词（带超时和重试）
      console.log(`[Sticker ${taskId}] Generating prompt for frame ${i + 1}...`);
      
      const framePrompt = await withRetry(
        () => withTimeout(
          generateFramePrompt(anthropic, baseAnalysis, animationPrompt, i, previousFrameUrl),
          60000, // 60秒超时（图片处理需要更长时间）
          `Claude prompt generation timeout for frame ${i + 1}`
        ),
        3, // 最多重试3次
        3000,
        `Frame ${i + 1} prompt`
      );
      
      console.log(`[Sticker ${taskId}] Frame ${i + 1} prompt: ${framePrompt.substring(0, 80)}...`);

      // Step B: Gemini 生成图片（generateImageAction 内部已有重试）
      console.log(`[Sticker ${taskId}] Generating image for frame ${i + 1}...`);
      
      const result = await withTimeout(
        generateImageAction(
          framePrompt,
          model,
          config,
          [currentReferenceImage]
        ),
        120000, // 2分钟超时（图片生成较慢）
        `Gemini image generation timeout for frame ${i + 1}`
      );

      if (result.success && result.imageUrl) {
        generatedFrames[i] = result.imageUrl;
        frameStatuses[i] = "completed";
        currentReferenceImage = result.imageUrl;
        console.log(`[Sticker ${taskId}] Frame ${i + 1} completed ✓`);
      } else {
        throw new Error(result.error || "Image generation failed");
      }
    } catch (err) {
      frameStatuses[i] = "error";
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Sticker ${taskId}] Frame ${i + 1} error: ${errorMsg}`);
      
      // 如果不是第一帧失败，继续尝试下一帧（跳过失败的帧）
      // 但如果是第一帧失败，后面的帧都没有参考，所以要停止
      if (i === 0) {
        console.error(`[Sticker ${taskId}] First frame failed, cannot continue`);
        break;
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

  console.log(`[Sticker ${taskId}] ✅ Generation finished (${completedCount}/10 frames)`);
}
