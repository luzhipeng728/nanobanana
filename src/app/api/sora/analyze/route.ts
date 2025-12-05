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

        // 流式分析图片 - 支持分镜图识别（基于 Sora 2 最佳实践）
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
                  text: `作为专业视频导演，请分析这张图片，为 Sora 2 视频生成做准备。

用户的创意想法：${userRequest}
视频时长：${durationSeconds} 秒

**首先判断：这是分镜图（Storyboard，多个画面/面板）还是单张图片？**

---

## 如果是【分镜图/故事板】（多个画面/面板）：

⚠️ **重要**：这是用于指导"真实视频拍摄"的故事板，不是要复制的漫画！
- 分镜图是"拍摄参考"，最终视频应该是**写实风格**或**电影动画风格**
- 不要生成漫画风格、不要生成图片切换、不要保留分镜的线条/格子
- 要生成真实的人物动作、真实的场景、流畅的运动

按照分镜顺序，用电影镜头语言描述**真实拍摄**效果：

### Panel 1 (00:00-XX:XX)
- **真实场景**：将漫画场景转化为真实环境描述
- **人物外观**：基于分镜描述真实人物（不是漫画角色）
- **真实动作**：人物如何真实地移动、说话、表情变化
- **摄影机**：镜头类型、角度、运动
- **对白处理**：如果分镜有文字对白，描述人物"说话"的动作

### Panel 2 (XX:XX-XX:XX)
...以此类推

**关键转化原则**：
- 漫画分镜 → 真实视频镜头
- 漫画对白框 → 人物说话动作（嘴唇动、表情配合）
- 漫画特效线 → 真实物理运动（速度感、模糊效果）
- 漫画风格 → 写实/电影风格

**时间分配**：根据 ${durationSeconds} 秒总时长，合理分配每个镜头的时间戳。

---

## 如果是【单张图片】：

### 1. 主体分析
- 外貌特征（年龄、性别、发型、服装细节）
- 当前姿态和表情
- 性格暗示和情绪状态

### 2. 场景环境
- 地点和时间（室内/室外、白天/夜晚）
- 空间布局（前景、中景、背景元素）
- 光线条件（光源方向、强度、色温）

### 3. 动态规划（${durationSeconds}秒时间线）
根据时长规划动作序列：
- **开场 (0-2秒)**：建立初始状态
- **发展 (中段)**：主要动作/情绪变化
- **收尾 (最后1-2秒)**：自然结束状态

具体动态元素：
- 人物动作（微表情、眨眼、呼吸、转头、手势）
- 环境动态（风吹头发/衣服、光影变化、背景元素运动）

### 4. 摄影机建议
- 推荐镜头类型和焦距
- 是否需要镜头运动
- 景深建议（浅景深聚焦主体 vs 深景深展示环境）

### 5. 情感/心理
- 内心独白（ta在想什么？）
- 情绪弧线（从什么情绪到什么情绪）

---

请用中文详细描述，像给摄影师做 briefing 一样具体。`,
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
        // 无图片模式：先分析用户需求，流式展示思考过程
        await sendEvent({
          type: "status",
          step: "🧠 AI 正在理解你的创意...",
          progress: 10,
        });

        await sendEvent({ type: "analysis_start" });

        // 流式分析用户需求（基于 Sora 2 最佳实践）
        const thinkingStream = anthropic.messages.stream({
          model: CLAUDE_LIGHT_MODEL,
          max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
          messages: [
            {
              role: "user",
              content: `作为专业电影摄影师，请为 Sora 2 视频生成分析用户的创意需求。

用户的创意想法：${userRequest}
视频时长：${durationSeconds} 秒

请像给摄影团队做 briefing 一样详细分析：

### 1. 创意解读
- 用户想要表达的核心主题/情感是什么？
- 画面的 "钩子" 是什么（最吸引人的视觉元素）？

### 2. 场景设计
- **地点**：具体场景（室内/室外/城市/自然等）
- **时间**：白天/夜晚/黄金时段/蓝调时刻
- **氛围**：色调（暖/冷）、天气、环境细节
- **光线**：主光源方向、强度、色温

### 3. 主体设计
- 人物/物体的详细外观描述
- 服装、材质、颜色
- 初始姿态和表情

### 4. 动作时间线（${durationSeconds}秒）
${durationSeconds <= 4
  ? "短片节奏：聚焦单一动作或情绪瞬间\n- 0-1秒：建立\n- 1-3秒：核心动作\n- 3-4秒：定格"
  : durationSeconds <= 8
    ? "中等节奏：可包含情绪弧线\n- 0-2秒：建立场景和初始状态\n- 2-6秒：主要动作/情绪发展\n- 6-8秒：收尾/情绪释放"
    : "叙事节奏：可构建完整故事\n- 0-3秒：场景建立\n- 3-8秒：动作发展和情绪变化\n- 8-12秒：高潮和结尾"}

### 5. 摄影机设计
- **镜头类型**：wide/medium/close-up
- **焦距建议**：24mm广角/50mm标准/85mm人像
- **角度**：平视/仰拍/俯拍
- **运动**：静止/推进/跟踪/摇移
- **景深**：浅景深（突出主体）/ 深景深（环境叙事）

### 6. 物理细节
- 头发/衣物如何随风或动作移动
- 光线如何与材质交互（反射、透射）
- 环境粒子（灰尘、雨滴、花瓣等）

请用中文详细分析，这些信息将用于生成专业的 Sora 2 提示词。`,
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

      // 第二阶段：生成 Sora 视频提示词
      const durationGuide = getDurationGuide(durationSeconds);

      // 检测是否是分镜分析
      const isStoryboard = imageAnalysis.includes("分镜") || imageAnalysis.includes("Storyboard") || imageAnalysis.includes("面板");

      const promptSystemMessage = imageUrl
        ? `You are an expert cinematographer crafting prompts for OpenAI Sora 2.

## Your Analysis:
${imageAnalysis}

## User's Creative Idea: ${userRequest}
## Video Duration: ${durationSeconds} seconds
## Mode: ${isStoryboard ? "STORYBOARD (Multi-Shot Sequence)" : "Single Image Animation"}

${durationGuide}

${isStoryboard ? `
## STORYBOARD MODE - REALISTIC VIDEO (NOT COMIC SLIDESHOW!)

⚠️ CRITICAL: The storyboard is a REFERENCE for filming, NOT content to reproduce!
- Output must be PHOTOREALISTIC or CINEMATIC ANIMATION style
- NO comic/manga aesthetics, NO panel borders, NO speech bubbles
- Generate REAL human movements, REAL environments, FLUID motion
- If storyboard has dialogue text, describe characters SPEAKING (lips moving, expressions)

**Transform each panel into a REAL video shot:**

**Required Elements:**
- Setting: Real-world environment (not comic background)
- Characters: Photorealistic humans with detailed features (not cartoon)
- Motion: Continuous fluid movement (not static poses)
- Camera: Professional cinematography (lens, angle, movement)
- Physics: Real hair movement, fabric motion, environmental effects
- Dialogue: If text in storyboard, show character speaking naturally

**Example (10s storyboard → realistic video):**
"Cinematic wide shot of a rain-soaked city street at dusk, neon signs reflecting on wet asphalt (00:00-00:02). A young woman in a red trench coat walks purposefully toward camera, her heels splashing in puddles, hair damp from rain (00:02-00:05). Medium close-up: she pauses, water droplets on her face catching the neon glow, her eyes searching left then right with subtle concern (00:05-00:08). Over-shoulder shot: her hand pushes open a heavy wooden door, warm amber light spilling out onto her face as she steps inside (00:08-00:10)."

Generate a CINEMATIC video prompt (150-220 words) that transforms the storyboard into REALISTIC footage.
` : `
## SINGLE IMAGE MODE - Cinematic Animation

Transform this static image into a living moment. Structure your prompt like a director's brief:

**Layer 1 - Setting & Atmosphere:**
Environment, time of day, weather, lighting direction and color temperature.

**Layer 2 - Subject & State:**
Detailed appearance, current pose, expression, implied emotion.

**Layer 3 - Motion Timeline (${durationSeconds}s):**
- Opening (0-2s): Initial state, camera establishes scene
- Development: Primary action/emotion shift
- Resolution: Natural ending state

**Layer 4 - Micro-Details:**
Breathing, blinking, hair movement, fabric motion, environmental particles.

**Layer 5 - Camera:**
Shot type, focal length (35mm/50mm/85mm), depth of field, any movement.

**Example (8s single image):**
"Medium close-up, 50mm lens, shallow depth of field. A young woman with auburn hair sits by a rain-streaked window, soft diffused daylight from the left casting gentle shadows. She gazes outward, lost in thought. Slowly, she turns her head toward camera, a faint smile forming as if remembering something precious. Her fingers trace the condensation on the glass. Wind from an open window stirs loose strands of her hair. In the background, blurred cherry blossoms drift past the glass like scattered memories."

Generate a rich cinematic prompt (100-180 words).
`}

## SORA 2 PROMPT RULES:
- Style: PHOTOREALISTIC or CINEMATIC (never comic/manga/cartoon unless explicitly requested)
- Write in present tense (what IS happening)
- Be specific about camera: lens (35mm/50mm/85mm), angle, movement
- Include physics: wind, material behavior, light interaction, reflections
- Add micro-movements: breathing, blinking, hair sway, fabric motion
- Describe spatial relationships: foreground, background, depth
- For dialogue scenes: describe lips moving, facial expressions matching speech
- Keep one continuous shot unless storyboard mode requires cuts

**NEVER include in output:**
- Comic/manga art style descriptions
- Panel borders or speech bubbles
- Static pose descriptions
- "Illustration" or "drawing" or "artwork" language

Output ONLY the English prompt text, no explanations.`
        : `You are an expert cinematographer crafting prompts for OpenAI Sora 2.

## Your Creative Analysis:
${imageAnalysis}

## User's Original Idea: ${userRequest}
## Video Duration: ${durationSeconds} seconds

${durationGuide}

## Your Task:
Transform this concept into a professional Sora 2 video prompt using cinematography language.

**Prompt Structure:**
1. **Setting**: Location, time, atmosphere, lighting (direction, color, intensity)
2. **Subject**: Who/what, detailed appearance, current state
3. **Action**: Specific visible movements over ${durationSeconds} seconds
4. **Camera**: Shot type, focal length, angle, movement (if any)
5. **Physics**: Material behavior, wind, particles, reflections
6. **Mood**: Emotional undertone, psychological depth

**Example:**
"Wide shot, 35mm lens, golden hour. A weathered craftsman with silver-streaked hair stands in his workshop, amber light streaming through dusty windows. He carefully shapes glowing metal on an anvil, sparks dancing upward like fireflies. His calloused hands move with practiced precision. Sweat beads on his forehead. The warm forge-glow illuminates floating dust particles. He pauses, examines his work, then nods with quiet satisfaction."

Generate a vivid, cinematic prompt (100-180 words) with specific camera and physics details.
Output ONLY the English prompt text, no explanations.`;

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
 * 根据时长提供专业的 Sora 2 创作指导
 */
function getDurationGuide(seconds: number): string {
  if (seconds <= 4) {
    return `## Duration: ${seconds}s (Single Moment)

**Pacing Strategy:**
- One camera setup, one focused action
- Ideal for: a glance, a gesture, a reaction
- Keep it simple but visually striking

**Shot Structure:**
- 0-1s: Establish subject and setting
- 1-3s: Single key action or emotion
- 3-4s: Hold or subtle resolve

**Camera:** Static or minimal movement (slight push-in works well)
**Avoid:** Multiple cuts, complex sequences, too many actions`;
  } else if (seconds <= 8) {
    return `## Duration: ${seconds}s (Emotional Arc)

**Pacing Strategy:**
- Room for one emotional transition
- Can include: setup → development → micro-resolution
- Best for character moments and atmospheric pieces

**Shot Structure:**
- 0-2s: Establish scene, subject in initial state
- 2-5s: Primary action unfolds, emotion shifts
- 5-8s: Resolution, new emotional state, or lingering moment

**Camera:** Can include one smooth movement (dolly, slow pan)
**Physics:** Add environmental motion - wind, light shifts, particles
**Micro-details:** Breathing, blinking, hair movement, fabric shifts`;
  } else {
    return `## Duration: ${seconds}s (Mini Narrative)

**Pacing Strategy:**
- Full story arc possible: beginning → middle → end
- Can include 2-3 distinct beats or shots
- Best for short scenes with clear progression

**Shot Structure:**
- 0-3s: Wide establishing, set the scene
- 3-7s: Action develops, emotional journey
- 7-10s: Climax or key moment
- 10-12s: Resolution, final state

**Camera:** Multiple angles possible, use cuts or continuous movement
**Storytelling:** Include cause-and-effect, character motivation
**Physics:** Complex interactions (objects, environment, lighting changes)
**Audio consideration:** If using audio, time dialogue to key moments`;
  }
}
