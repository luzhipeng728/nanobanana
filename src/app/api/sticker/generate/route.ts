import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";

// 使用 Claude 分析图片并生成 10 帧提示词
async function analyzeAndGenerateFramePrompts(
  imageUrl: string,
  animationPrompt: string,
  onAnalysisChunk: (chunk: string) => Promise<void>
): Promise<{ analysis: string; framePrompts: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }

  const anthropic = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  let analysisText = "";
  
  // 第一步：分析图片
  const analysisStream = anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: `请仔细分析这张图片，我需要基于它生成一个「${animationPrompt}」动画效果的 10 帧连续图片。

请描述：
1. **主体特征**：角色/物体的外形、颜色、风格、特征细节
2. **背景描述**：背景的颜色、元素、氛围
3. **艺术风格**：画风、色调、质感
4. **适合的动画方式**：根据"${animationPrompt}"这个动画描述，分析这个主体最适合怎样的动画表现

用中文描述，要详细具体。`,
          },
        ],
      },
    ],
  });

  for await (const event of analysisStream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const chunk = event.delta.text;
      analysisText += chunk;
      await onAnalysisChunk(chunk);
    }
  }

  // 第二步：生成 10 帧提示词
  const frameResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: `基于这张参考图和以下分析，为「${animationPrompt}」动画生成 10 帧连续的图像提示词。

图片分析：
${analysisText}

【关键要求】
1. 每帧提示词必须用英文，要非常详细（至少 100 字）
2. 10 帧必须形成平滑的循环动画（第10帧要能自然接回第1帧）
3. 帧与帧之间的变化必须非常微小和渐进（变化幅度控制在 5-15%）
4. 所有帧必须保持完全相同的：主体外观、背景、艺术风格、构图、色调
5. 只改变与动画相关的微小细节（如表情、姿态的细微变化）
6. 每帧要明确说明当前动画进度百分比

【动画节奏参考】
- 帧 1-3: 动画开始，变化逐渐增加
- 帧 4-6: 动画达到高峰
- 帧 7-9: 动画逐渐回归
- 帧 10: 接近初始状态，准备循环

【输出格式】
必须严格按照以下 JSON 格式输出，不要有任何其他文字：

\`\`\`json
{
  "frames": [
    "完整的第1帧提示词，包含所有主体细节和当前动画状态",
    "完整的第2帧提示词，包含所有主体细节和当前动画状态",
    "完整的第3帧提示词，包含所有主体细节和当前动画状态",
    "完整的第4帧提示词，包含所有主体细节和当前动画状态",
    "完整的第5帧提示词，包含所有主体细节和当前动画状态",
    "完整的第6帧提示词，包含所有主体细节和当前动画状态",
    "完整的第7帧提示词，包含所有主体细节和当前动画状态",
    "完整的第8帧提示词，包含所有主体细节和当前动画状态",
    "完整的第9帧提示词，包含所有主体细节和当前动画状态",
    "完整的第10帧提示词，包含所有主体细节和当前动画状态"
  ]
}
\`\`\``,
          },
        ],
      },
    ],
  });

  // 解析帧提示词
  let framePrompts: string[] = [];
  const frameContent = frameResponse.content.find(block => block.type === "text");
  if (frameContent && frameContent.type === "text") {
    const jsonMatch = frameContent.text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.frames && Array.isArray(parsed.frames)) {
          framePrompts = parsed.frames;
        }
      } catch (e) {
        console.error("Failed to parse frame prompts JSON:", e);
        // 尝试修复 JSON
        try {
          const fixedJson = jsonMatch[1]
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]");
          const parsed = JSON.parse(fixedJson);
          if (parsed.frames && Array.isArray(parsed.frames)) {
            framePrompts = parsed.frames;
          }
        } catch (e2) {
          console.error("Failed to fix JSON:", e2);
        }
      }
    }
    
    // 备用解析：查找所有引号内的内容
    if (framePrompts.length === 0) {
      const allQuoted = frameContent.text.match(/"([^"]{50,})"/g);
      if (allQuoted && allQuoted.length >= 10) {
        framePrompts = allQuoted.slice(0, 10).map(s => s.slice(1, -1));
      }
    }
  }

  // 如果还是没有 10 帧，生成默认的
  if (framePrompts.length !== 10) {
    console.warn(`Failed to generate 10 frame prompts (got ${framePrompts.length}), using fallback`);
    const basePrompt = analysisText.substring(0, 300).replace(/\n/g, " ");
    framePrompts = Array(10).fill(0).map((_, i) => {
      const progress = i < 5 ? (i + 1) * 20 : (10 - i) * 20;
      return `${basePrompt}, animation: ${animationPrompt}, frame ${i + 1} of 10, animation intensity ${progress}%, smooth continuous motion, consistent style and appearance`;
    });
  }

  return { analysis: analysisText, framePrompts };
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: any) => {
    await writer.write(
      encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
    );
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

      // Step 1: Claude 分析图片并生成帧提示词
      await sendEvent({
        type: "status",
        step: "👁️ Claude 正在分析参考图片...",
        progress: 5,
      });

      await sendEvent({ type: "claude_analysis_start" });
      
      let analysis = "";
      let framePrompts: string[] = [];
      
      try {
        const result = await analyzeAndGenerateFramePrompts(
          referenceImage,
          animationPrompt,
          async (chunk) => {
            await sendEvent({ type: "claude_analysis_chunk", chunk });
          }
        );
        analysis = result.analysis;
        framePrompts = result.framePrompts;
      } catch (err) {
        console.error("Claude analysis error:", err);
        await sendEvent({ type: "error", error: "图片分析失败: " + (err instanceof Error ? err.message : "未知错误") });
        await writer.close();
        return;
      }
      
      await sendEvent({ type: "claude_analysis_end" });
      await sendEvent({ type: "frame_prompts", prompts: framePrompts });

      await sendEvent({
        type: "status",
        step: "✅ 分析完成，准备生成帧...",
        progress: 15,
      });

      // 创建任务记录
      await prisma.stickerTask.create({
        data: {
          id: taskId,
          status: "processing",
          animationType: animationPrompt,
          referenceImage,
          model: model || "nano-banana",
          config: JSON.stringify(config || {}),
          customPrompt: JSON.stringify(framePrompts),
          totalFrames: 10,
          completedFrames: 0,
          frames: JSON.stringify([]),
          frameStatuses: JSON.stringify(Array(10).fill("pending")),
        },
      });

      // 通知前端创建 StickerNode
      await sendEvent({
        type: "sticker_created",
        taskId,
      });

      // 异步生成 10 帧图片（后台执行）
      generateFramesAsync(taskId, framePrompts, model || "nano-banana", config || {}, referenceImage);

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

// 异步生成帧（后台执行）
async function generateFramesAsync(
  taskId: string,
  framePrompts: string[],
  model: GeminiImageModel,
  config: ImageGenerationConfig,
  referenceImage: string
) {
  const generatedFrames: (string | null)[] = Array(10).fill(null);
  const frameStatuses: string[] = Array(10).fill("pending");

  // 并发生成，但限制并发数为 2（避免 API 限流）
  const MAX_CONCURRENT = 2;
  
  for (let batch = 0; batch < Math.ceil(10 / MAX_CONCURRENT); batch++) {
    const startIdx = batch * MAX_CONCURRENT;
    const endIdx = Math.min(startIdx + MAX_CONCURRENT, 10);
    
    const batchPromises = [];
    
    for (let i = startIdx; i < endIdx; i++) {
      frameStatuses[i] = "generating";
      
      // 更新数据库状态
      await prisma.stickerTask.update({
        where: { id: taskId },
        data: {
          frameStatuses: JSON.stringify(frameStatuses),
        },
      });

      const framePrompt = framePrompts[i] || `Frame ${i + 1}`;
      
      // 构建完整提示词
      const fullPrompt = `CRITICAL: Generate an image that maintains PERFECT CONSISTENCY with the reference image.

${framePrompt}

Animation context: This is frame ${i + 1} of a 10-frame seamless loop animation.

Essential requirements:
- EXACT SAME character/subject appearance, outfit, colors as reference
- EXACT SAME background, composition, lighting as reference  
- EXACT SAME art style, texture, and color palette as reference
- ONLY the animation-related micro-changes should differ
- Frame ${i + 1}/10 should smoothly connect to adjacent frames
- Square aspect ratio (1:1)`;
      
      batchPromises.push(
        (async (frameIndex: number) => {
          try {
            console.log(`[Sticker ${taskId}] Generating frame ${frameIndex + 1}/10...`);
            
            const result = await generateImageAction(
              fullPrompt,
              model,
              { ...config, aspectRatio: "1:1" },
              [referenceImage]
            );

            if (result.success && result.imageUrl) {
              generatedFrames[frameIndex] = result.imageUrl;
              frameStatuses[frameIndex] = "completed";
              console.log(`[Sticker ${taskId}] Frame ${frameIndex + 1} completed`);
            } else {
              frameStatuses[frameIndex] = "error";
              console.error(`[Sticker ${taskId}] Frame ${frameIndex + 1} failed:`, result.error);
            }
          } catch (err) {
            frameStatuses[frameIndex] = "error";
            console.error(`[Sticker ${taskId}] Frame ${frameIndex + 1} error:`, err);
          }

          // 更新数据库
          const completedCount = frameStatuses.filter(s => s === "completed").length;
          await prisma.stickerTask.update({
            where: { id: taskId },
            data: {
              frames: JSON.stringify(generatedFrames.filter(f => f !== null)),
              frameStatuses: JSON.stringify(frameStatuses),
              completedFrames: completedCount,
            },
          });
        })(i)
      );
    }

    await Promise.all(batchPromises);
  }

  // 最终更新
  const completedCount = frameStatuses.filter(s => s === "completed").length;
  const allCompleted = completedCount === 10;
  
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

  console.log(`[Sticker ${taskId}] Generation ${allCompleted ? "completed" : "partially completed"} (${completedCount}/10 frames)`);
}
