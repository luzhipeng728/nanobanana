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
const NARRATION_SYSTEM_PROMPT = `你是专业讲解员。为图片生成讲解旁白。

规则：
1. 第N段讲解必须对应第N张图片，严禁错位
2. 每段50-150字，适合朗读
3. 沉浸式描述，不要说"这张图"
4. 输出纯JSON，无其他内容

输出格式：
{"items":[{"text":"讲解文案1"},{"text":"讲解文案2"}]}`;

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

  // 构建用户消息 - 简洁明了
  const imageList = request.prompts.map((prompt, i) =>
    `${i + 1}. ${prompt || '(无描述)'}`
  ).join('\n');

  let userMessage = `标题：${request.title}

图片列表（共${request.prompts.length}张，按顺序）：
${imageList}

请为每张图片生成一段讲解，输出JSON格式：
{"items":[{"text":"第1张图的讲解"},{"text":"第2张图的讲解"},...]}

注意：第1段讲解必须讲第1张图的内容"${request.prompts[0] || ''}"，第2段讲第2张图，以此类推。`;

  if (request.style) {
    userMessage += `\n风格：${request.style}`;
  }

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
  console.log(`[Narration] Claude response:\n${output}`);

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

  // 如果还是没有，基于 prompt 生成简单文案（不要用"这是第N个画面"这种垃圾）
  if (items.length === 0) {
    console.log("[Narration] Fallback: generating narrations from prompts");
    items = request.prompts.map((prompt) => {
      if (prompt && prompt.trim()) {
        // 直接用 prompt 内容作为讲解，稍作润色
        const cleanPrompt = prompt.trim();
        // 如果 prompt 比较短，直接使用；如果长，截取并添加省略
        if (cleanPrompt.length <= 150) {
          return { text: cleanPrompt };
        } else {
          return { text: cleanPrompt.slice(0, 140) + '...' };
        }
      }
      // 没有描述的情况，用标题
      return { text: `${request.title}的精彩画面` };
    });
  }

  // 确保数量匹配
  while (items.length < request.prompts.length) {
    const idx = items.length;
    const prompt = request.prompts[idx];
    items.push({ text: prompt?.trim() || `${request.title}` });
  }

  // 截断到正确数量
  items = items.slice(0, request.prompts.length);

  // 提取纯文本数组（兼容旧接口）
  const narrations = items.map(item => item.text);

  console.log(`[Narration] Generated ${narrations.length} narrations with TTS params`);
  return { narrations, items };
}
