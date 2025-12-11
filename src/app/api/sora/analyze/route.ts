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
 * Sora 2 视频智能分析 API
 * 基于 OpenAI Cookbook 官方 Sora 2 Prompting Guide 最佳实践
 *
 * 核心结构：Style → Scene → Cinematography → Actions → Background Sound
 * 像给摄影团队做 briefing 一样写提示词
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

        // 流式分析图片 - 基于 Sora 2 Cookbook 官方最佳实践
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
                  text: `你是一位专业电影摄影师，正在为 Sora 2 视频生成分析这张图片。
像给摄影团队做 briefing 一样，详细描述如何将这张静态图片变成 ${durationSeconds} 秒的电影级视频。

用户的创意想法：${userRequest}

请按以下 Sora 2 官方推荐结构分析：

## 1. Style 风格定位
- 电影风格/年代感（如：现代电影、复古胶片、纪录片风格等）
- 视觉美学（色调倾向、质感、氛围）
- 参考风格（如有）

## 2. Scene 场景描述
- **环境**：具体地点、时间（白天/夜晚/黄金时段）
- **主体**：人物/物体的详细外观（服装、发型、表情、姿态）
- **空间层次**：前景、中景、背景各有什么元素
- **氛围细节**：天气、温度感、环境粒子（灰尘/雨滴/花瓣等）

## 3. Cinematography 摄影设计
- **Camera 机位**：景别（wide/medium/close-up）、角度（平视/俯拍/仰拍）
- **Lens 镜头**：焦距建议（24mm广角/35mm/50mm标准/85mm人像）
- **Movement 运动**：静止/推进(dolly-in)/跟踪/横摇(pan)/摇移
- **Depth 景深**：浅景深（突出主体）或深景深（展示环境）
- **Lighting 光线**：主光方向、色温、质感（硬光/柔光）

## 4. Actions 动作设计 (${durationSeconds}秒时间线)
根据 ${durationSeconds} 秒时长设计连贯的动作序列：
${durationSeconds <= 4
  ? "- 聚焦单一关键动作或情绪瞬间\n- 保持简洁但视觉冲击力强"
  : durationSeconds <= 8
    ? "- 0-2秒：建立初始状态\n- 2-6秒：主要动作/情绪发展\n- 6-8秒：自然收尾"
    : "- 0-3秒：场景建立\n- 3-8秒：动作发展\n- 8-12秒：收尾"}

具体描述：
- **主体动作**：表情变化、眼神、肢体动作、手势
- **微动态**：呼吸起伏、眨眼、嘴唇微动、头发飘动
- **物理效果**：衣物摆动、材质反射、光影变化

## 5. Mood 情绪氛围
- 整体情绪基调
- 心理暗示（主体在想什么/感受什么）
- 情绪弧线（从什么状态到什么状态）

请用中文详细描述，像给专业摄影团队做 briefing 一样具体。`,
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
          step: "✨ 正在生成 Sora 2 提示词...",
          progress: 60,
        });
      } else {
        // 无图片模式：先分析用户需求，流式展示思考过程
        await sendEvent({
          type: "status",
          step: "🎬 AI 正在构思视频画面...",
          progress: 10,
        });

        await sendEvent({ type: "analysis_start" });

        // 流式分析用户需求（基于 Sora 2 Cookbook 官方最佳实践）
        const thinkingStream = anthropic.messages.stream({
          model: CLAUDE_LIGHT_MODEL,
          max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
          messages: [
            {
              role: "user",
              content: `你是一位专业电影摄影师，正在为 Sora 2 视频生成设计一个 ${durationSeconds} 秒的视频画面。
像给摄影团队做 briefing 一样，基于用户的想法构建完整的视觉方案。

用户的创意想法：${userRequest}

请按以下 Sora 2 官方推荐结构设计：

## 1. Style 风格定位
- 电影风格/年代感（现代、复古胶片、科幻、纪录片等）
- 视觉美学（色调、质感、整体氛围）
- 风格参考（如有适合的电影/导演风格）

## 2. Scene 场景设计
- **环境**：具体地点类型、时间（白天/黄金时段/夜晚/蓝调时刻）
- **主体**：人物/物体的详细外观（年龄、服装、发型、材质、颜色）
- **空间层次**：前景、中景、背景各安排什么元素
- **氛围细节**：天气、温度感、环境粒子（灰尘/雨滴/落叶/光斑等）

## 3. Cinematography 摄影设计
- **Camera 机位**：景别（wide establishing / medium / close-up / extreme close-up）
- **Lens 镜头**：焦距（24mm广角/35mm/50mm标准/85mm人像/135mm长焦）
- **Angle 角度**：平视(eye level)/低角度(low angle)/高角度(high angle)
- **Movement 运动**：静止/缓慢推进(slow dolly-in)/跟踪(tracking)/横摇(pan)/升降(crane)
- **Depth 景深**：浅景深虚化背景 or 深景深展示环境
- **Lighting 光线**：主光方向和类型、色温、软硬光质感

## 4. Actions 动作时间线 (${durationSeconds}秒)
${durationSeconds <= 4
  ? "**短片节奏** - 聚焦单一动作或情绪瞬间：\n- 0-1秒：快速建立主体\n- 1-3秒：核心动作/表情\n- 3-4秒：定格或微妙变化"
  : durationSeconds <= 8
    ? "**中等节奏** - 包含完整情绪弧线：\n- 0-2秒：建立场景，主体初始状态\n- 2-5秒：主要动作展开，情绪发展\n- 5-8秒：情绪释放或自然收尾"
    : "**叙事节奏** - 构建完整小故事：\n- 0-3秒：场景建立，交代环境\n- 3-7秒：动作发展，情绪变化\n- 7-10秒：情节推进\n- 10-12秒：高潮或意味深长的结尾"}

具体动作设计：
- **主体动作**：表情变化、眼神移动、肢体语言、手势
- **微动态**：呼吸、眨眼、嘴唇微动、发丝飘动
- **物理效果**：衣物随动作摆动、材质反光、环境光影变化

## 5. Mood 情绪氛围
- 整体情绪基调（温暖/冷峻/神秘/浪漫/紧张等）
- 心理暗示（主体的内心状态）
- 情绪弧线（从___到___的变化）

请用中文详细设计，这些信息将用于生成专业的 Sora 2 提示词。`,
            },
          ],
        });

        for await (const event of thinkingStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            imageAnalysis += chunk;
            await sendEvent({ type: "analysis_chunk", chunk });
          }
        }

        await sendEvent({ type: "analysis_end" });

        await sendEvent({
          type: "status",
          step: "✨ 正在生成专业提示词...",
          progress: 60,
        });
      }

      // 第二阶段：生成 Sora 2 视频提示词（基于 OpenAI Cookbook 官方结构）
      const durationGuide = getDurationGuide(durationSeconds);

      // 统一的 Sora 2 Cookbook 提示词生成模板
      const promptSystemMessage = `You are an expert cinematographer crafting prompts for OpenAI Sora 2.
Your task is to write prompts as if briefing a professional film crew.

## Your Analysis:
${imageAnalysis}

## User's Creative Idea: ${userRequest}
## Video Duration: ${durationSeconds} seconds

${durationGuide}

## SORA 2 COOKBOOK PROMPT STRUCTURE

Write the prompt following this official structure (combine into flowing prose):

**1. Style (开头)**
Film era/aesthetic, visual style, color grade, texture.
Examples: "Style: 1970s romantic drama, shot on 35mm film with natural flares, soft focus, and warm halation"

**2. Scene Description (主体)**
- Setting: specific location, time of day, weather, atmosphere
- Subject: detailed appearance (clothing, hair, expression, pose)
- Environment: foreground/background elements, spatial depth
- Ambient details: particles, reflections, environmental motion

**3. Cinematography (技术)**
- Camera: shot type (wide/medium/close-up), angle (eye level/low/high)
- Lens: focal length (24mm/35mm/50mm/85mm), depth of field
- Movement: static, dolly-in, tracking, pan, crane
- Lighting: key light direction, color temperature, quality (soft/hard)

**4. Actions (动态)**
Describe what happens over ${durationSeconds} seconds:
- Character actions and movements
- Micro-details: breathing, blinking, hair movement, fabric motion
- Physics: material behavior, wind effects, light changes
${durationSeconds <= 4 ? "Focus on ONE key moment or gesture." : durationSeconds <= 8 ? "Include setup → action → subtle resolution." : "Include clear beginning → development → ending arc."}

**5. Mood/Atmosphere (可选)**
Emotional tone, psychological undertone.

## OFFICIAL SORA 2 EXAMPLE (reference style):
"Style: 1970s romantic drama, shot on 35 mm film with natural flares, soft focus, and warm halation. Slight gate weave and handheld micro-shake evoke vintage intimacy. At golden hour, a brick tenement rooftop transforms into a small stage. Laundry lines strung with white sheets sway in the wind, catching the last rays of sunlight. Strings of mismatched fairy bulbs hum faintly overhead. A young woman in a flowing red silk dress dances barefoot, curls glowing in the fading light. Her partner — sleeves rolled, suspenders loose — claps along, his smile wide and unguarded. Cinematography: Camera: medium-wide shot, slow dolly-in from eye level. Lens: 40 mm spherical; shallow focus to isolate the couple from skyline. Lighting: golden natural key with tungsten bounce. Mood: nostalgic, tender, cinematic. Actions: She spins; her dress flares, catching sunlight. He steps in, catches her hand, and dips her into shadow. Sheets drift across frame, briefly veiling the skyline before parting again."

## RULES:
- Write in present tense (what IS happening)
- Be specific about camera parameters (actual mm values, not vague terms)
- Include physics: wind, material behavior, light interaction
- Add micro-movements: breathing, blinking, hair sway, fabric motion
- Describe spatial relationships clearly
- Keep as ONE continuous shot (no cuts)
- Style should be PHOTOREALISTIC or CINEMATIC unless user requests otherwise

## OUTPUT:
Generate a professional Sora 2 prompt (120-200 words) in English.
Output ONLY the prompt text, no explanations or labels.`;

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
        step: "✅ Sora 2 提示词已就绪！",
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
 * 根据时长提供专业的 Sora 2 创作指导
 * 基于 OpenAI Cookbook 官方最佳实践
 */
function getDurationGuide(seconds: number): string {
  if (seconds <= 4) {
    return `## Duration: ${seconds}s — Single Moment

**Best For:** A glance, a gesture, a reaction, a single striking visual
**Approach:** One camera setup, one focused action, maximum visual impact

**Timing:**
- 0-1s: Establish subject in environment
- 1-3s: The key moment/action/expression
- 3-4s: Hold or subtle micro-movement

**Camera:** Static or minimal movement (gentle push-in works well)
**Physics:** Focus on 1-2 micro-details (hair sway, fabric ripple, light flicker)
**Avoid:** Complex sequences, multiple actions, camera movement changes`;
  } else if (seconds <= 8) {
    return `## Duration: ${seconds}s — Emotional Arc

**Best For:** Character moments, mood pieces, single emotional transition
**Approach:** Setup → Development → Subtle resolution

**Timing:**
- 0-2s: Establish scene and subject's initial state
- 2-5s: Primary action/emotion unfolds
- 5-8s: Resolution or new emotional state

**Camera:** One smooth movement allowed (slow dolly-in, gentle pan)
**Physics:** Environmental motion (wind, light shifts, ambient particles)
**Micro-details:** Breathing rhythm, blinking, hair/fabric response to movement
**Lens:** 50mm or 85mm for character focus, shallow depth of field`;
  } else {
    return `## Duration: ${seconds}s — Mini Narrative

**Best For:** Short scene with clear progression, beginning-middle-end
**Approach:** Full story arc with 2-3 distinct beats

**Timing:**
- 0-3s: Wide establishing shot, set the scene
- 3-7s: Action develops, emotional journey
- 7-10s: Climax or key turning point
- 10-12s: Resolution, final meaningful state

**Camera:** Can include smooth continuous movement or gentle reframe
**Storytelling:** Cause-and-effect, show character motivation through action
**Physics:** Complex interactions (multiple elements responding to environment)
**Depth:** Use foreground/background relationship to create visual interest
**Lens:** Start wide (35mm), can end tighter if following action`;
  }
}
