import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from "@/lib/claude-config";
import { streamAnthropicText, callAnthropicText } from "@/lib/anthropic-stream";

export interface VeoAnalyzeEvent {
  type: "status" | "analysis_start" | "analysis_chunk" | "analysis_end" | "prompt_ready" | "error";
  step?: string;
  progress?: number;
  chunk?: string;
  prompt?: string;
  analysis?: string;
  error?: string;
}

/**
 * 流式分析图片并生成视频提示词
 * 类似 Agent 的两阶段流程：先分析图片，再生成提示词
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: VeoAnalyzeEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  (async () => {
    try {
      const body = await request.json();
      const { userRequest, imageUrl } = body as {
        userRequest: string;
        imageUrl?: string;
      };

      if (!userRequest) {
        await sendEvent({ type: "error", error: "请输入视频描述" });
        await writer.close();
        return;
      }

      let imageAnalysis = "";

      // 第一阶段：如果有图片，先详细分析图片
      if (imageUrl) {
        await sendEvent({
          type: "status",
          step: "👁️ Claude 正在分析参考图片...",
          progress: 10,
        });

        await sendEvent({ type: "analysis_start" });

        // 构建图片内容
        const imageContent: Anthropic.ImageBlockParam[] = [];
        if (imageUrl.startsWith("data:")) {
          const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            imageContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: match[2],
              },
            });
          }
        } else {
          imageContent.push({
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          });
        }

        // 流式分析图片
        for await (const chunk of streamAnthropicText({
          model: CLAUDE_LIGHT_MODEL,
          max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                {
                  type: "text",
                  text: `请仔细分析这张图片，为视频生成做准备。

用户想要的效果：${userRequest}

请详细描述：
1. **主体分析**：图片中的人物/物体的姿态、表情、服装、特征
2. **场景环境**：背景、光线、色调、氛围
3. **构图风格**：拍摄角度、景深、艺术风格
4. **动态建议**：基于用户需求，建议哪些动作/运镜最合适

请用中文回答，描述要详细具体。`,
                },
              ],
            },
          ],
        })) {
          imageAnalysis += chunk;
          await sendEvent({ type: "analysis_chunk", chunk });
        }

        await sendEvent({ type: "analysis_end" });

        await sendEvent({
          type: "status",
          step: "✅ 图片分析完成，正在生成视频提示词...",
          progress: 50,
        });
      } else {
        await sendEvent({
          type: "status",
          step: "🎬 正在生成视频提示词...",
          progress: 30,
        });
      }

      // 第二阶段：基于分析结果生成视频提示词
      const promptSystemMessage = imageUrl
        ? `You are a professional video prompt engineer for Google Veo 3.1 (image-to-video mode).

Based on the image analysis below, generate a video prompt that animates this image.

## Image Analysis:
${imageAnalysis}

## User's Request: ${userRequest}

## Veo 3.1 Image-to-Video Best Practices:

**CRITICAL RULES:**
1. The source image already provides background and style - ONLY describe the motion/animation
2. Use generic terms like "the subject", "the woman", "the figure" - DO NOT re-describe physical features
3. Focus on THREE types of motion:
   - Camera movement (pan, tilt, zoom, tracking, crane, dolly)
   - Subject animation (walking, turning, gesturing, expressions)
   - Environment animation (wind, water, particles, lighting changes)

**Prompt Structure:**
[Camera Movement] + [Subject Action] + [Environment Animation] + [Mood/Atmosphere]

**AVOID:**
- Re-describing what's already in the image
- Complex multi-event narratives
- Using quotes for dialogue

**Examples:**
- "Slow dolly in, the subject turns her head and smiles softly, hair gently swaying in the breeze, warm afternoon light"
- "Camera slowly pans right, the figure walks forward confidently, leaves rustling in the background"

Generate a concise prompt (30-60 words) focusing ONLY on the animation/motion.
Output ONLY the prompt text in English, nothing else.`
        : `You are a professional video prompt engineer for Google Veo 3.1 (text-to-video mode).

User's request: ${userRequest}

## Veo 3.1 Text-to-Video Best Practices:

**Include these elements:**
1. **Subject**: Who/what is the focus
2. **Action**: What's happening
3. **Scene/Setting**: Where and when
4. **Camera**: Angle and movement
5. **Style**: Visual aesthetic
6. **Lighting**: Light sources and mood
7. **Atmosphere**: Environmental effects

**Example:**
"Cinematic close-up of a wise elderly woman, weathered hands holding a glowing crystal, warm candlelight casting soft shadows, slow push-in, mystical atmosphere"

Generate a detailed prompt (50-80 words) with cinematic depth.
Output ONLY the prompt text in English, nothing else.`;

      const generatedPrompt = (await callAnthropicText({
        model: CLAUDE_LIGHT_MODEL,
        max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
        messages: [{ role: "user", content: promptSystemMessage }],
      })).trim() || userRequest;

      await sendEvent({
        type: "status",
        step: "✨ 视频提示词生成完成！",
        progress: 100,
      });

      await sendEvent({
        type: "prompt_ready",
        prompt: generatedPrompt,
        analysis: imageAnalysis || undefined,
      });
    } catch (error) {
      console.error("Veo analyze error:", error);
      await sendEvent({
        type: "error",
        error: error instanceof Error ? error.message : "分析失败",
      });
    } finally {
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
