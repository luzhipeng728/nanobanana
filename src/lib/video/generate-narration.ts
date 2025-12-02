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
const NARRATION_SYSTEM_PROMPT = `你是一位专业的讲解员和配音文案撰写专家。你的任务是为一组图片生成讲解旁白文案。

## ⚠️ 最重要的规则：严格对应！

**每一段讲解必须严格对应其编号的图片内容！**

- 第 1 段讲解 → 必须描述「图片 1」的内容
- 第 2 段讲解 → 必须描述「图片 2」的内容
- 第 N 段讲解 → 必须描述「图片 N」的内容

**绝对不允许出现错位！** 如果图片 1 是「春天的樱花」，第 1 段讲解就必须讲樱花，不能讲其他图片的内容。

## 核心原则

1. **严格对应**：每段讲解必须准确描述对应编号图片的内容，不能错位
2. **沉浸式讲解**：直接描述内容和场景，不要使用"这张图"、"画面中"等元描述词汇
3. **自然流畅**：像在给观众讲故事一样自然流畅
4. **适合朗读**：文案需要适合 TTS 语音合成，避免过长的句子

## 输出格式

返回 JSON 对象，items 数组中每个元素的顺序必须与图片顺序完全一致：

\`\`\`json
{
  "items": [
    {
      "imageIndex": 1,
      "imageDescription": "简述图片1的内容",
      "text": "针对图片1的讲解文案...",
      "ttsParams": { "emotion": "calm", "pitch": 1.0, "volume": 1.0 }
    },
    {
      "imageIndex": 2,
      "imageDescription": "简述图片2的内容",
      "text": "针对图片2的讲解文案...",
      "ttsParams": { "emotion": "calm", "pitch": 1.0, "volume": 1.0 }
    }
  ]
}
\`\`\`

### TTS 参数说明
- **emotion**: neutral/happy/sad/excited/calm/serious/tender/storytelling
- **pitch**: 0.8-1.2，默认 1.0
- **volume**: 0.8-1.2，默认 1.0

## 讲解要求

1. 每段讲解 50-150 字（适合 10-30 秒语音）
2. 使用中文撰写
3. 语言优美、有画面感
4. 前后内容要有连贯性
5. TTS 参数保持相对一致

## 自检清单（生成后请检查）

✅ 第 1 段是否讲的是图片 1 的内容？
✅ 第 2 段是否讲的是图片 2 的内容？
✅ 每段的 imageDescription 是否与对应图片描述匹配？
✅ 没有任何错位或混淆？

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

  // 构建用户消息 - 强调每张图片的内容和顺序
  const imageList = request.prompts.map((prompt, i) => {
    const desc = prompt || '(无描述)';
    return `【图片 ${i + 1}】${desc}`;
  }).join('\n\n');

  let userMessage = `请为以下 ${request.prompts.length} 张幻灯片图片生成讲解旁白文案。

## 幻灯片标题
${request.title}

## 图片内容详情（请仔细阅读每张图片的描述）

${imageList}

---

## ⚠️ 重要提醒

1. **你必须按顺序生成 ${request.prompts.length} 段讲解**
2. **第 1 段讲解必须对应【图片 1】的内容：${request.prompts[0] || '(无描述)'}**
${request.prompts.length > 1 ? `3. **第 2 段讲解必须对应【图片 2】的内容：${request.prompts[1] || '(无描述)'}**` : ''}
${request.prompts.length > 2 ? `4. **以此类推，每段必须严格对应其编号图片**` : ''}

请确保每段讲解的内容与对应图片描述完全匹配，不要错位！
`;

  if (request.style) {
    userMessage += `\n讲解风格要求：${request.style}`;
  }

  userMessage += `\n\n现在请输出 JSON，确保 items 数组有 ${request.prompts.length} 个元素，顺序与图片一一对应。`;

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
        items = parsed.items.map((item: { text?: string; imageIndex?: number; imageDescription?: string; ttsParams?: NarrationTTSParams } | string, index: number) => {
          if (typeof item === 'string') {
            return { text: item };
          }

          // 验证 imageIndex 是否正确（如果提供了）
          if (item.imageIndex !== undefined && item.imageIndex !== index + 1) {
            console.warn(`[Narration] Warning: Item ${index + 1} has imageIndex ${item.imageIndex}, may be misaligned!`);
          }

          // 记录每段对应的图片描述，便于调试
          if (item.imageDescription && item.text) {
            console.log(`[Narration] Item ${index + 1}: "${item.imageDescription.slice(0, 30)}..." -> "${item.text.slice(0, 30)}..."`);
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

  // 验证数量是否匹配
  if (items.length > 0 && items.length !== request.prompts.length) {
    console.warn(`[Narration] Warning: Generated ${items.length} items but expected ${request.prompts.length}!`);
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
