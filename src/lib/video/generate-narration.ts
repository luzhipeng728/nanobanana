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

/** 单段讲解的 TTS 参数 */
export interface NarrationTTSParams {
  /** 情感/风格（如：neutral, happy, sad, excited, calm, serious） */
  emotion?: string;
  /** 音调 (0.5-2.0)，默认 1.0 */
  pitch?: number;
  /** 音量 (0.5-2.0)，默认 1.0 */
  volume?: number;
}

/** 单段讲解内容 */
export interface NarrationItem {
  /** 讲解文案 */
  text: string;
  /** TTS 参数 */
  ttsParams?: NarrationTTSParams;
}

export interface NarrationResult {
  /** 每张图片的讲解文案（兼容旧格式） */
  narrations: string[];
  /** 每张图片的完整讲解数据（包含 TTS 参数） */
  items: NarrationItem[];
}

// 讲解文案生成系统提示词
const NARRATION_SYSTEM_PROMPT = `你是一位专业的讲解员和配音文案撰写专家。你的任务是为一组图片生成讲解旁白文案，并为每段配置合适的 TTS 语音参数。

## 核心原则

1. **沉浸式讲解**：直接描述内容和场景，不要使用"这张图"、"画面中"等元描述词汇
2. **自然流畅**：像在给观众讲故事一样自然流畅
3. **适合朗读**：文案需要适合 TTS 语音合成，避免过长的句子
4. **情感丰富**：根据图片内容调整语气和情感，并设置相应的 TTS 参数

## 输出格式

你必须返回一个 JSON 对象，包含 items 数组，每个元素包含讲解文案和 TTS 参数。

### TTS 参数说明
- **emotion**: 情感风格，可选值：neutral（中性）、happy（愉快）、sad（忧伤）、excited（兴奋）、calm（平静）、serious（严肃）、tender（温柔）、storytelling（叙事）
- **pitch**: 音调，范围 0.8-1.2，默认 1.0（低沉用 0.9，清亮用 1.1）
- **volume**: 音量，范围 0.8-1.2，默认 1.0（轻声用 0.9，强调用 1.1）

示例输出：
\`\`\`json
{
  "items": [
    {
      "text": "阳光穿过稀疏的云层，洒落在宁静的湖面上。远处的山峦层叠，如同一幅水墨画卷...",
      "ttsParams": {
        "emotion": "calm",
        "pitch": 1.0,
        "volume": 1.0
      }
    },
    {
      "text": "走进这座古老的城堡，每一块石砖都诉说着历史的故事...",
      "ttsParams": {
        "emotion": "storytelling",
        "pitch": 0.95,
        "volume": 1.0
      }
    }
  ]
}
\`\`\`

## 讲解要求

1. 每段讲解控制在 50-150 字之间（适合 10-30 秒语音）
2. 使用中文撰写
3. 语言优美、有画面感
4. 前后内容要有连贯性，像在讲述一个完整的故事
5. **重要**：整个系列的 TTS 参数要保持相对一致，避免每段风格差异过大

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
  let items: NarrationItem[] = [];

  // 尝试从 markdown 代码块中提取 JSON
  const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) ||
                    output.match(/```\s*([\s\S]*?)\s*```/) ||
                    output.match(/\{[\s\S]*(?:"items"|"narrations")[\s\S]*\}/);

  if (jsonMatch) {
    const jsonString = jsonMatch[1] || jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonString.trim());

      // 新格式：items 数组
      if (parsed.items && Array.isArray(parsed.items)) {
        items = parsed.items.map((item: { text?: string; ttsParams?: NarrationTTSParams } | string) => {
          if (typeof item === 'string') {
            return { text: item };
          }
          return {
            text: item.text || '',
            ttsParams: item.ttsParams,
          };
        });
      }
      // 兼容旧格式：narrations 数组
      else if (parsed.narrations && Array.isArray(parsed.narrations)) {
        items = parsed.narrations.map((text: string) => ({ text }));
      }
    } catch (e) {
      console.error("[Narration] JSON parse error:", e);
    }
  }

  // 如果解析失败，尝试按段落分割
  if (items.length === 0) {
    console.log("[Narration] Fallback: splitting by paragraphs");
    const paragraphs = output
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 20 && !p.startsWith('{') && !p.startsWith('```'));

    if (paragraphs.length >= request.prompts.length) {
      items = paragraphs.slice(0, request.prompts.length).map(text => ({ text }));
    }
  }

  // 如果还是没有，生成默认文案
  if (items.length === 0) {
    console.log("[Narration] Fallback: generating default narrations");
    items = request.prompts.map((prompt, i) => {
      if (prompt) {
        return { text: `让我们来欣赏这幅作品。${prompt.slice(0, 100)}...` };
      }
      return { text: `这是幻灯片的第 ${i + 1} 个画面。` };
    });
  }

  // 确保数量匹配
  while (items.length < request.prompts.length) {
    items.push({ text: `这是一幅精心创作的作品。` });
  }

  // 截断到正确数量
  items = items.slice(0, request.prompts.length);

  // 提取纯文本数组（兼容旧接口）
  const narrations = items.map(item => item.text);

  console.log(`[Narration] Generated ${narrations.length} narrations with TTS params`);
  return { narrations, items };
}
