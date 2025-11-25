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

// 为单帧生成提示词（基于上一帧）
async function generateFramePrompt(
  anthropic: Anthropic,
  baseAnalysis: string,
  animationPrompt: string,
  frameIndex: number,
  previousFrameUrl: string | null,
  isFirstFrame: boolean
): Promise<string> {
  const framePosition = frameIndex + 1;
  const animationPhase = 
    frameIndex < 3 ? "building up" :
    frameIndex < 6 ? "peak intensity" :
    frameIndex < 9 ? "winding down" : "returning to start";

  const prompt = isFirstFrame
    ? `Based on this image analysis, generate a detailed image prompt for frame 1 of a 10-frame "${animationPrompt}" animation.

Analysis: ${baseAnalysis}

This is the STARTING frame. The subject should be in its initial/neutral state, ready to begin the animation.

Output ONLY the image generation prompt in English (100+ words), no explanations.`
    : `Generate the image prompt for frame ${framePosition}/10 of a "${animationPrompt}" animation.

Base analysis: ${baseAnalysis}

Animation phase: ${animationPhase}
Previous frame was frame ${frameIndex}.

CRITICAL RULES:
- Frame ${framePosition} must be only 5-10% different from frame ${frameIndex}
- The change must be TINY and gradual
- Maintain EXACT same: subject appearance, background, art style, colors
- Only change the specific animation element (${animationPrompt})
${frameIndex === 9 ? '- This is the LAST frame - must transition smoothly back to frame 1' : ''}

Output ONLY the image generation prompt in English (100+ words), no explanations.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
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

// 后台链式生成：每帧基于上一帧
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

  console.log(`[Sticker ${taskId}] Starting chained generation...`);

  // 当前参考图：初始为原始图，之后用上一帧
  let currentReferenceImage = originalReferenceImage;

  for (let i = 0; i < 10; i++) {
    frameStatuses[i] = "generating";
    
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: { frameStatuses: JSON.stringify(frameStatuses) },
    });

    try {
      // Step A: 为当前帧生成提示词
      console.log(`[Sticker ${taskId}] Generating prompt for frame ${i + 1}...`);
      const framePrompt = await generateFramePrompt(
        anthropic,
        baseAnalysis,
        animationPrompt,
        i,
        i > 0 ? generatedFrames[i - 1] : null,
        i === 0
      );
      console.log(`[Sticker ${taskId}] Frame ${i + 1} prompt: ${framePrompt.substring(0, 80)}...`);

      // Step B: 用上一帧作为参考生成当前帧图片
      console.log(`[Sticker ${taskId}] Generating image for frame ${i + 1}...`);
      const result = await generateImageAction(
        framePrompt,
        model,
        { ...config, aspectRatio: "1:1" },
        [currentReferenceImage]
      );

      if (result.success && result.imageUrl) {
        generatedFrames[i] = result.imageUrl;
        frameStatuses[i] = "completed";
        // 更新参考图为当前帧
        currentReferenceImage = result.imageUrl;
        console.log(`[Sticker ${taskId}] Frame ${i + 1} completed ✓`);
      } else {
        frameStatuses[i] = "error";
        console.error(`[Sticker ${taskId}] Frame ${i + 1} failed:`, result.error);
      }
    } catch (err) {
      frameStatuses[i] = "error";
      console.error(`[Sticker ${taskId}] Frame ${i + 1} error:`, err);
    }

    // 更新数据库
    const completedFrameUrls = generatedFrames.filter((f): f is string => f !== null);
    await prisma.stickerTask.update({
      where: { id: taskId },
      data: {
        frames: JSON.stringify(completedFrameUrls),
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
      frames: JSON.stringify(generatedFrames.filter(f => f !== null)),
      frameStatuses: JSON.stringify(frameStatuses),
      completedFrames: completedCount,
      completedAt: new Date(),
    },
  });

  console.log(`[Sticker ${taskId}] ✅ Chained generation finished (${completedCount}/10 frames)`);
}
