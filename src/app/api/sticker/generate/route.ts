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
            text: `Analyze this image carefully for creating a "${animationPrompt}" animation.

I need EXTREMELY DETAILED descriptions of STATIC elements that must remain UNCHANGED across all animation frames.

Please describe in English:

## 1. SUBJECT (EXACT details that must stay fixed):
- Face shape, skin tone, facial features (except expression)
- Hair: exact style, color, length, how it's arranged, any accessories
- Body pose: exact position of torso, shoulders, arms, hands
- Camera angle and distance from subject

## 2. CLOTHING & ACCESSORIES (EXACT details):
- Every piece of clothing with colors, patterns, textures
- All accessories: jewelry, glasses, hair clips, etc.
- How clothes are positioned/draped

## 3. BACKGROUND (EXACT details):
- Background color or gradient
- All elements present (if any)
- Lighting direction and quality

## 4. ART STYLE:
- Rendering style (photorealistic, anime, cartoon, etc.)
- Color palette and saturation
- Lighting quality and shadows

## 5. ANIMATION NOTES for "${animationPrompt}":
- What facial features should change (eyes, eyebrows, mouth, cheeks only)
- Suggest VERY SUBTLE progression (5-10% change per frame)
- Keep all other elements COMPLETELY STATIC

Output in clear English with bullet points.`,
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
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `Based on this subject analysis, generate 10 image prompts for a "${animationPrompt}" animation sequence.

Subject Analysis:
${baseAnalysis.substring(0, 1200)}

## ABSOLUTE REQUIREMENTS FOR SMOOTH ANIMATION:

### 1. STATIC ELEMENTS (MUST BE IDENTICAL in ALL 10 prompts):
- Character's hair style, color, and arrangement
- Clothing and accessories (exact same items, colors, positions)
- Background (same color, same elements, same composition)
- Art style and rendering quality
- Lighting direction and color temperature
- Character's body pose and position (torso, shoulders, arms, hands)
- Camera angle and distance

### 2. ANIMATION RULES - ONLY FACE CHANGES:
- Animation "${animationPrompt}" should ONLY affect:
  * Eyes (shape, openness, direction)
  * Eyebrows (angle, height)
  * Mouth (shape, openness)
  * Cheeks (blush, puffing)
- NEVER change: hair, body, clothes, pose, background, camera angle

### 3. EXTREMELY SUBTLE TRANSITIONS:
- Each frame changes by only 5-10% from the previous frame
- Frame 1: Completely neutral face (baseline)
- Frames 2-4: Very gradual build-up (barely noticeable changes each frame)
- Frame 5-6: Peak expression (maximum but still natural)
- Frames 7-9: Very gradual return to neutral
- Frame 10: Nearly identical to Frame 1 (for smooth loop)

### 4. PROMPT STRUCTURE (use this exact format for each):
"[EXACT subject description from analysis], [EXACT clothing], [EXACT pose], [EXACT background], [EXACT art style], [SPECIFIC facial expression for this frame only]"

## OUTPUT FORMAT:
Generate EXACTLY 10 prompts, each 80-100 words, separated by "---":

Prompt 1:
[Complete prompt with neutral face - this is the baseline]
---
Prompt 2:
[Same as Prompt 1 but with 5% expression change]
---
...continue to Prompt 10...

REMEMBER: The viewer should see a smooth animation where ONLY the face subtly changes. Any change in hair, clothes, pose, or background will ruin the animation.`
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
