import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { streamAnthropicText } from "@/lib/anthropic-stream";
import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from "@/lib/claude-config";

// 获取当前用户 ID
async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("userId")?.value || null;
  } catch {
    return null;
  }
}

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
  let analysisText = "";

  for await (const chunk of streamAnthropicText({
    model: CLAUDE_LIGHT_MODEL,
    max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
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
  })) {
    analysisText += chunk;
    await onChunk(chunk);
  }

  return analysisText;
}

// 生成模板 + 表情变化的结构化方法
async function generateAllFramePrompts(
  anthropic: Anthropic,
  baseAnalysis: string,
  animationPrompt: string
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: CLAUDE_LIGHT_MODEL,
    max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
    messages: [{
      role: "user",
      content: `Based on this image analysis, I need to create a "${animationPrompt}" sticker animation with 10 frames.

Image Analysis:
${baseAnalysis.substring(0, 1500)}

## CRITICAL REQUIREMENTS FOR STICKER ANIMATION:

### MANDATORY BACKGROUND:
- Background MUST be: **solid pure white (#FFFFFF)** or **solid light gray (#F5F5F5)**
- NO gradients, NO patterns, NO scenery, NO shadows on background
- This is for a sticker/emoji, clean background is essential

### MANDATORY CONSISTENCY (same in ALL frames):
- Exact same skin tone and color (no color shifts between frames)
- Exact same hair color, style, arrangement
- Exact same clothing colors and details
- Exact same lighting direction and intensity
- Exact same camera angle and framing

## YOUR TASK:
Generate a JSON with TWO parts:

### Part 1: BASE_TEMPLATE
Describe the subject for sticker use:
- Face shape, skin tone (be SPECIFIC about color, e.g., "fair peachy skin tone")
- Hair style/color/arrangement (EXACT details)
- Clothing with EXACT colors
- MUST include: "solid pure white background, no shadows, flat even lighting, sticker style, clean edges"
- Camera: head and shoulders portrait, centered

### Part 2: EXPRESSIONS array
10 SHORT facial expressions (10-15 words each) for "${animationPrompt}":
- Frame 1: Neutral baseline
- Frames 2-4: Subtle build-up (5% change each)
- Frames 5-6: Peak expression
- Frames 7-9: Return to neutral
- Frame 10: Match frame 1

Only describe: eyes, eyebrows, mouth, cheeks. NO other changes.

## OUTPUT (JSON only, no markdown):
{
  "base_template": "A young woman with long dark braided hair, fair peachy skin tone, wearing white V-neck blouse, solid pure white background, no shadows, flat even studio lighting, sticker style portrait, head and shoulders, centered composition, clean crisp edges",
  "expressions": [
    "neutral relaxed face, eyes forward, natural closed-lip smile",
    "eyes slightly brighter, mouth corners lifting 5%",
    "gentle smile forming, eyes softening",
    "warm smile, slight eye crinkle, faint blush",
    "full smile, eyes curved happily, rosy cheeks",
    "brightest smile, eyes squinted with joy, prominent blush",
    "smile softening, eyes still warm, blush fading",
    "returning to gentle smile, relaxed eyes",
    "soft pleasant look, nearly neutral",
    "neutral relaxed face, matching frame 1"
  ]
}

Output ONLY valid JSON.`
    }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  const fullText = textBlock?.type === "text" ? textBlock.text : "";

  // 解析 JSON 响应
  let baseTemplate = "";
  let expressions: string[] = [];

  try {
    // 尝试提取 JSON（可能被 markdown 包裹）
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      baseTemplate = parsed.base_template || "";
      expressions = parsed.expressions || [];
    }
  } catch (e) {
    console.error("[generateAllFramePrompts] Failed to parse JSON:", e);
  }

  // 如果解析失败，使用备用方案
  if (!baseTemplate || expressions.length < 10) {
    console.warn("[generateAllFramePrompts] Fallback to simple prompts");
    const fallbackPrompts: string[] = [];
    const expressionStages = [
      "neutral relaxed expression",
      "slightly brighter eyes, hint of smile",
      "gentle smile forming",
      "warm smile, eyes brightening",
      "full smile, eyes curved happily",
      "brightest expression, joyful smile",
      "smile softening",
      "returning to gentle expression",
      "nearly neutral, soft look",
      "neutral relaxed expression"
    ];

    for (let i = 0; i < 10; i++) {
      fallbackPrompts.push(`${baseAnalysis.substring(0, 300)}, ${expressionStages[i]}, consistent style and lighting`);
    }
    return fallbackPrompts;
  }

  // 组合基础模板和表情，生成 10 个完整提示词
  const prompts: string[] = [];

  // 强制添加一致性约束
  const consistencySuffix = ", solid pure white background #FFFFFF, consistent skin tone, consistent lighting, sticker style, no background elements";

  for (let i = 0; i < 10; i++) {
    const expression = expressions[i] || expressions[expressions.length - 1] || "neutral expression";
    // 将基础模板和表情组合，确保静态部分完全一致
    const fullPrompt = `${baseTemplate}, ${expression}${consistencySuffix}`;
    prompts.push(fullPrompt);
  }

  console.log(`[generateAllFramePrompts] Generated ${prompts.length} prompts with template method`);
  console.log(`[generateAllFramePrompts] Base template: ${baseTemplate.substring(0, 100)}...`);

  return prompts;
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

      const userId = await getCurrentUserId();

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
          userId,  // 关联当前用户
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

  console.log(`[Sticker ${taskId}] Starting parallel generation with model: ${model}`);

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
