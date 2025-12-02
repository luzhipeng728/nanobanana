/**
 * 使用 Claude 为幻灯片图片生成讲解文案
 */

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from "@/lib/claude-config";

export interface NarrationRequest {
  /** 图片提示词列表 */
  prompts: string[];
  /** 讲解风格（可选） */
  style?: string;
  /** 幻灯片标题 */
  title: string;
}

export interface NarrationResult {
  /** 每张图片的讲解文案 */
  narrations: string[];
}

// 讲解文案生成系统提示词
const NARRATION_SYSTEM_PROMPT = `你是一位专业的讲解员和配音文案撰写专家。你的任务是为一组图片生成讲解旁白文案。

## 核心原则

1. **沉浸式讲解**：直接描述内容和场景，不要使用"这张图"、"画面中"等元描述词汇
2. **自然流畅**：像在给观众讲故事一样自然流畅
3. **适合朗读**：文案需要适合 TTS 语音合成，避免过长的句子
4. **情感丰富**：根据图片内容调整语气和情感

## 输出格式

你必须返回一个 JSON 对象，包含 narrations 数组，每个元素对应一张图片的讲解文案。

示例输出：
\`\`\`json
{
  "narrations": [
    "阳光穿过稀疏的云层，洒落在宁静的湖面上。远处的山峦层叠，如同一幅水墨画卷...",
    "走进这座古老的城堡，每一块石砖都诉说着历史的故事..."
  ]
}
\`\`\`

## 讲解要求

1. 每段讲解控制在 50-150 字之间（适合 10-30 秒语音）
2. 使用中文撰写
3. 语言优美、有画面感
4. 前后内容要有连贯性，像在讲述一个完整的故事

直接输出 JSON，不要有任何额外说明。`;

/**
 * 生成讲解文案
 */
export async function generateNarrations(request: NarrationRequest): Promise<NarrationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }

  const anthropic = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  // 构建用户消息
  let userMessage = `请为以下幻灯片图片生成讲解旁白文案。

幻灯片标题：${request.title}

图片列表（共 ${request.prompts.length} 张）：
${request.prompts.map((prompt, i) => `${i + 1}. ${prompt || '(无描述)'}`).join('\n')}
`;

  if (request.style) {
    userMessage += `\n讲解风格要求：${request.style}`;
  } else {
    userMessage += `\n请根据图片内容自动判断最合适的讲解风格。`;
  }

  userMessage += `\n\n请直接输出 JSON 格式的讲解文案，每张图片一段。`;

  console.log(`[Narration] Generating narrations for ${request.prompts.length} images...`);

  const response = await anthropic.messages.create({
    model: CLAUDE_LIGHT_MODEL,
    max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
    system: NARRATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // 提取文本响应
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );

  if (!textBlock) {
    throw new Error("Claude 返回内容为空");
  }

  const output = textBlock.text;
  console.log(`[Narration] Claude response length: ${output.length}`);

  // 解析 JSON
  let narrations: string[] = [];

  // 尝试从 markdown 代码块中提取 JSON
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) ||
                    output.match(/```\s*([\s\S]*?)\s*```/) ||
                    output.match(/\{[\s\S]*"narrations"[\s\S]*\}/);

  if (jsonMatch) {
    const jsonString = jsonMatch[1] || jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonString.trim());
      if (parsed.narrations && Array.isArray(parsed.narrations)) {
        narrations = parsed.narrations;
      }
    } catch (e) {
      console.error("[Narration] JSON parse error:", e);
    }
  }

  // 如果解析失败，尝试按段落分割
  if (narrations.length === 0) {
    console.log("[Narration] Fallback: splitting by paragraphs");
    const paragraphs = output
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 20 && !p.startsWith('{') && !p.startsWith('```'));

    if (paragraphs.length >= request.prompts.length) {
      narrations = paragraphs.slice(0, request.prompts.length);
    }
  }

  // 如果还是没有，生成默认文案
  if (narrations.length === 0) {
    console.log("[Narration] Fallback: generating default narrations");
    narrations = request.prompts.map((prompt, i) => {
      if (prompt) {
        return `让我们来欣赏这幅作品。${prompt.slice(0, 100)}...`;
      }
      return `这是幻灯片的第 ${i + 1} 个画面。`;
    });
  }

  // 确保数量匹配
  while (narrations.length < request.prompts.length) {
    narrations.push(`这是一幅精心创作的作品。`);
  }

  console.log(`[Narration] Generated ${narrations.length} narrations`);
  return { narrations: narrations.slice(0, request.prompts.length) };
}
