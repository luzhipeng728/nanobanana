import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from "@/lib/claude-config";
import { streamAnthropicText, callAnthropicText } from "@/lib/anthropic-stream";

export interface SoraAnalyzeEvent {
  type: "status" | "analysis_start" | "analysis_chunk" | "analysis_end" | "prompt_ready" | "error";
  step?: string;
  progress?: number;
  chunk?: string;
  prompt?: string;
  analysis?: string;
  error?: string;
}

/**
 * Sora2 视频提示词优化 API
 * 简洁实用，专注于生成有效的视频动作描述
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: SoraAnalyzeEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  (async () => {
    try {
      const body = await request.json();
      const { userRequest, imageUrl, durationSeconds = 8 } = body as {
        userRequest: string;
        imageUrl?: string;
        durationSeconds?: number;
      };

      if (!userRequest) {
        await sendEvent({ type: "error", error: "请输入视频描述" });
        await writer.close();
        return;
      }

      let imageAnalysis = "";

      // 有图片时：分析图片内容
      if (imageUrl) {
        await sendEvent({
          type: "status",
          step: "👁️ 分析图片内容...",
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

        // 简洁的图片分析
        for await (const chunk of streamAnthropicText({
          model: CLAUDE_LIGHT_MODEL,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                {
                  type: "text",
                  text: `分析这张图片，为生成 ${durationSeconds} 秒视频做准备。

用户想要的动作：${userRequest}

请简洁描述：
1. **画面主体**：人物外观、服装、表情、姿态
2. **场景环境**：地点、光线、氛围
3. **动作建议**：基于用户想法，设计自然流畅的动作

用中文简洁回答。`,
                },
              ],
            },
          ],
        })) {
          imageAnalysis += chunk;
          await sendEvent({ type: "analysis_chunk", chunk });
        }

        await sendEvent({ type: "analysis_end" });
      } else {
        // 无图片：直接优化提示词
        await sendEvent({
          type: "status",
          step: "🎬 构思视频画面...",
          progress: 10,
        });

        await sendEvent({ type: "analysis_start" });

        for await (const chunk of streamAnthropicText({
          model: CLAUDE_LIGHT_MODEL,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `基于用户描述，构思一个 ${durationSeconds} 秒的视频画面。

用户描述：${userRequest}

请简洁设计：
1. **画面主体**：人物/物体的外观细节
2. **场景环境**：地点、时间、光线、氛围
3. **动作设计**：${durationSeconds}秒内的动作流程

用中文简洁回答。`,
            },
          ],
        })) {
          imageAnalysis += chunk;
          await sendEvent({ type: "analysis_chunk", chunk });
        }

        await sendEvent({ type: "analysis_end" });
      }

      await sendEvent({
        type: "status",
        step: "✨ 生成视频提示词...",
        progress: 60,
      });

      // 生成最终提示词 - 简洁有效
      let generatedPrompt = (await callAnthropicText({
        model: CLAUDE_LIGHT_MODEL,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `基于以下分析，生成一段视频生成提示词。

## 分析内容：
${imageAnalysis}

## 用户原始描述：
${userRequest}

## 视频时长：${durationSeconds} 秒

## 要求：
1. 提示词要具体描述动作过程，不要只描述静态画面
2. 包含表情、眼神、肢体动作等细节
3. 描述环境氛围、光线变化
4. 保持自然流畅，适合 ${durationSeconds} 秒时长
5. 用英文输出（视频模型对英文效果更好）
6. 直接输出提示词，不要任何解释

示例格式：
"A young woman with long black hair stands in a sunlit garden. She slowly turns her head toward the camera, her eyes meeting the lens with a gentle smile forming on her lips. The golden hour light catches her hair as a soft breeze lifts a few strands. Her expression shifts from contemplative to warmly inviting as she tilts her head slightly."`,
          },
        ],
      })).trim() || userRequest;

      // 清理可能的引号包裹
      if (generatedPrompt.startsWith('"') && generatedPrompt.endsWith('"')) {
        generatedPrompt = generatedPrompt.slice(1, -1);
      }

      await sendEvent({
        type: "status",
        step: "✅ 提示词已就绪！",
        progress: 100,
      });

      await sendEvent({
        type: "prompt_ready",
        prompt: generatedPrompt,
        analysis: imageAnalysis || undefined,
      });
    } catch (error) {
      console.error("Sora analyze error:", error);
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
