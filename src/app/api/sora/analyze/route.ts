import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from "@/lib/claude-config";

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
 * Sora 视频智能分析 API
 * 1. 分析输入图片的内容、人物、场景
 * 2. 根据时长生成详细的视频描述（包含心理活动、表情变化、动作细节）
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

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        await sendEvent({ type: "error", error: "ANTHROPIC_API_KEY 未配置" });
        await writer.close();
        return;
      }

      const anthropic = new Anthropic({
        apiKey,
        baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
      });

      let imageAnalysis = "";

      // 第一阶段：详细分析图片
      if (imageUrl) {
        await sendEvent({
          type: "status",
          step: "👁️ AI 正在分析图片内容...",
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

        // 流式分析图片 - 支持分镜图识别
        const analysisStream = anthropic.messages.stream({
          model: CLAUDE_LIGHT_MODEL,
          max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                {
                  type: "text",
                  text: `请仔细分析这张图片，为 Sora 视频生成做准备。

用户的创意想法：${userRequest}
视频时长：${durationSeconds} 秒

**首先判断：这是分镜图（Storyboard）还是单张图片？**

---

## 如果是【分镜图】（多个画面/面板）：

请按照分镜顺序依次描述：

### 分镜 1 (第X秒)
- 画面内容
- 人物动作/表情
- 镜头运动（推、拉、摇、移等）
- 情绪/氛围

### 分镜 2 (第X秒)
...以此类推

**时间分配建议**：根据 ${durationSeconds} 秒总时长，合理分配每个分镜的时间。

---

## 如果是【单张图片】：

### 1. 人物/主体分析
- 外貌特征（年龄、性别、发型、服装风格）
- 当前姿态和表情
- 可能的性格特点和情绪状态

### 2. 场景环境
- 地点和时间（室内/室外、白天/夜晚）
- 背景元素和氛围
- 光线条件和色调

### 3. 动态化建议
- 人物可以做的动作序列
- 头发、衣服等动态效果
- 背景中可以运动的元素

### 4. 心理和情感
- 基于表情推测的内心独白
- 情绪变化轨迹
- 与用户创意的结合

---

请用中文详细描述，这些信息会帮助生成电影级的视频描述。`,
                },
              ],
            },
          ],
        });

        for await (const event of analysisStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            imageAnalysis += chunk;
            await sendEvent({ type: "analysis_chunk", chunk });
          }
        }

        await sendEvent({ type: "analysis_end" });

        await sendEvent({
          type: "status",
          step: "✨ 正在创作视频剧本...",
          progress: 60,
        });
      } else {
        await sendEvent({
          type: "status",
          step: "🎬 正在生成视频描述...",
          progress: 30,
        });
      }

      // 第二阶段：生成 Sora 视频提示词
      const durationGuide = getDurationGuide(durationSeconds);

      // 检测是否是分镜分析
      const isStoryboard = imageAnalysis.includes("分镜") || imageAnalysis.includes("Storyboard") || imageAnalysis.includes("面板");

      const promptSystemMessage = imageUrl
        ? `You are a professional video director creating prompts for OpenAI Sora.

## Image Analysis:
${imageAnalysis}

## User's Creative Idea: ${userRequest}
## Video Duration: ${durationSeconds} seconds
## Analysis Type: ${isStoryboard ? "STORYBOARD (Multiple Scenes)" : "Single Image"}

${durationGuide}

${isStoryboard ? `
## STORYBOARD MODE - CRITICAL:

The image contains a STORYBOARD with multiple panels/scenes.
You MUST create a continuous narrative that follows the storyboard sequence.

**Structure:**
- Describe the video as a flowing sequence matching the storyboard panels
- Use time markers to indicate transitions
- Maintain visual and emotional continuity between scenes
- Include camera movements that connect scenes (cuts, transitions, zooms)

**Example for storyboard:**
"Opening on a close-up of trembling hands gripping a letter (0-2s), pull back to reveal a young woman's tear-streaked face (2-4s). Cut to her walking down a rainy street, umbrella tilted against the wind (4-7s). Final shot: she looks up at the sky, a small smile breaking through as sunlight pierces the clouds (7-10s)."

Generate a sequential narrative (100-180 words) following the storyboard exactly.
` : `
## SINGLE IMAGE MODE:

**Structure your prompt with these elements:**
1. **Opening Scene** (0-2s): Establish the mood and initial state
2. **Main Action** (middle): The key movement or emotion
3. **Subtle Details**: Micro-expressions, hair movement, fabric motion
4. **Internal Thoughts**: What the subject might be thinking/feeling
5. **Atmospheric Elements**: Wind, light changes, ambient motion

**Example for 8s video:**
"A young woman with flowing auburn hair sits by a rain-streaked window, her eyes reflecting distant memories. She slowly turns her head, a gentle smile forming as if remembering something precious. Her fingers absently trace the condensation on the glass. The soft afternoon light catches the tears gathering in her eyes - not of sadness, but of bittersweet nostalgia. Outside, cherry blossoms drift past like scattered thoughts."

Generate a rich, emotional prompt (80-150 words) that brings this image to life.
`}

**IMPORTANT:**
- Write in present tense, describing what IS happening
- Include emotional undertones and psychological depth
- Add physical micro-details (blinking, breathing, slight movements)
- Describe the atmosphere and mood
- Keep it cinematic and evocative

Output ONLY the prompt text in English, nothing else.`
        : `You are a professional video director creating prompts for OpenAI Sora.

User's creative idea: ${userRequest}
Video Duration: ${durationSeconds} seconds

${durationGuide}

## Sora Text-to-Video Best Practices:

**Include these elements:**
1. **Subject**: Detailed description of who/what
2. **Setting**: Where and when, atmosphere
3. **Action**: What's happening, the motion
4. **Emotion**: The feeling and mood
5. **Details**: Small movements, environmental effects
6. **Camera**: Angle and movement suggestions

**Example:**
"A wise elderly craftsman with weathered hands carefully shapes a piece of glowing metal in his dimly lit workshop. Sparks dance around him like fireflies as he works with practiced precision. His eyes, crinkled with concentration, reflect decades of mastery. The warm orange glow of the forge illuminates dust particles floating in the air."

Generate a vivid, cinematic prompt (60-120 words).
Output ONLY the prompt text in English, nothing else.`;

      const promptResponse = await anthropic.messages.create({
        model: CLAUDE_LIGHT_MODEL,
        max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
        messages: [{ role: "user", content: promptSystemMessage }],
      });

      const textBlock = promptResponse.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );

      const generatedPrompt = textBlock?.text?.trim() || userRequest;

      await sendEvent({
        type: "status",
        step: "✅ 视频剧本创作完成！",
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

/**
 * 根据时长提供不同的创作指导
 */
function getDurationGuide(seconds: number): string {
  if (seconds <= 4) {
    return `## Duration Guide (${seconds}s - Short):
- Focus on ONE key moment or emotion
- Simple, impactful action
- Think of it as a perfect GIF or moment capture
- Example: A single glance, a smile forming, wind catching hair`;
  } else if (seconds <= 8) {
    return `## Duration Guide (${seconds}s - Medium):
- Allow for a small emotional arc
- Can include a subtle transition (e.g., neutral → smile)
- Add environmental motion (wind, light shifts)
- Include micro-expressions and natural movements
- Example: Looking away pensively, then turning with a warm smile`;
  } else {
    return `## Duration Guide (${seconds}s - Extended):
- Create a mini narrative arc
- Multiple subtle emotion changes
- Include interaction with environment
- Build atmosphere over time
- Can include gentle camera movement
- Example: Starting distant in thought, then noticing something, reacting with wonder`;
  }
}
