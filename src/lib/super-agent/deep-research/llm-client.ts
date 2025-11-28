// DeepResearch LLM 客户端 - 支持 OpenAI 格式 (GLM) + Anthropic 回退

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from '@/lib/claude-config';

// OpenAI 格式客户端配置（用于 GLM 等模型）
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'zai-glm-4.6';

// GLM 模型配置
// 注意：GLM 4.6 是 reasoning 模型，会先输出思考过程再输出答案
// 需要足够的 tokens 让它完成思考 + 输出最终答案
const GLM_MAX_TOKENS = 4096; // 增加到 4K 以容纳思考过程
const GLM_TIMEOUT = 60000;   // 60 秒超时（reasoning 需要更多时间）

// Anthropic 客户端（回退用）
const anthropic = new Anthropic();

// OpenAI 客户端（GLM）
let openaiClient: OpenAI | null = null;

if (OPENAI_BASE_URL && OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    baseURL: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
    timeout: GLM_TIMEOUT,
  });
  console.log(`[LLM Client] GLM client initialized: ${OPENAI_MODEL} @ ${OPENAI_BASE_URL}`);
} else {
  console.log('[LLM Client] GLM not configured, using Anthropic only');
}

/**
 * LLM 响应结果
 */
export interface LLMResponse {
  text: string;
  model: string;
  usedFallback: boolean;
}

/**
 * 调用 LLM 获取文本响应
 * 优先使用 GLM（快速便宜），失败时回退到 Haiku
 */
export async function callLLM(prompt: string): Promise<LLMResponse> {
  // 1. 尝试 GLM
  if (openaiClient) {
    try {
      const response = await openaiClient.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: GLM_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, // 低温度，输出更稳定
      });

      // GLM 4.6 是 reasoning 模型，会同时返回 reasoning（思考）和 content（答案）
      // 优先使用 content，它是最终答案
      const message = response.choices?.[0]?.message as any;

      // 优先取 content（最终答案）
      let text = message?.content;

      // 如果 content 为空但有 reasoning，尝试从 reasoning 中提取
      if (!text && message?.reasoning) {
        console.log('[LLM Client] GLM content is empty, trying to extract from reasoning');
        text = message.reasoning;
      }

      if (text) {
        console.log(`[LLM Client] GLM response - content: ${!!message?.content}, reasoning: ${!!message?.reasoning}`);
        return {
          text,
          model: OPENAI_MODEL,
          usedFallback: false,
        };
      }

      console.warn('[LLM Client] GLM returned empty response, falling back to Haiku');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[LLM Client] GLM error: ${errorMessage}, falling back to Haiku`);
    }
  }

  // 2. 回退到 Haiku
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_LIGHT_MODEL,
      max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return {
        text: content.text,
        model: CLAUDE_LIGHT_MODEL,
        usedFallback: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[LLM Client] Haiku error: ${errorMessage}`);
    throw new Error(`LLM call failed: ${errorMessage}`);
  }

  throw new Error('LLM call failed: no text response');
}

/**
 * 调用 LLM 并解析 JSON 响应
 * 带有自动重试和 JSON 修复
 */
export async function callLLMForJSON<T>(prompt: string): Promise<T | null> {
  try {
    const response = await callLLM(prompt);
    const parsed = safeParseJSON(response.text);

    if (parsed) {
      if (!response.usedFallback) {
        console.log(`[LLM Client] ${response.model} JSON parsed successfully`);
      }
      return parsed as T;
    }

    console.warn(`[LLM Client] Failed to parse JSON from ${response.model}`);
    return null;
  } catch (error) {
    console.error('[LLM Client] callLLMForJSON error:', error);
    return null;
  }
}

/**
 * 安全解析 JSON，支持多种容错方式
 */
function safeParseJSON(text: string): any {
  // 1. 尝试直接提取 JSON 对象
  const jsonMatches = text.match(/\{[\s\S]*\}/g);
  if (!jsonMatches) return null;

  for (const jsonStr of jsonMatches) {
    // 尝试直接解析
    try {
      return JSON.parse(jsonStr);
    } catch {
      // 继续尝试修复
    }

    // 2. 尝试修复常见问题
    let fixed = jsonStr
      // 移除尾部多余的逗号
      .replace(/,\s*([}\]])/g, '$1')
      // 修复单引号
      .replace(/'/g, '"');

    try {
      return JSON.parse(fixed);
    } catch {
      // 继续尝试
    }

    // 3. 尝试提取关键字段（针对评估响应）
    try {
      const scoreMatch = jsonStr.match(/"score"\s*:\s*(\d+)/);
      const reasoningMatch = jsonStr.match(/"reasoning"\s*:\s*"([^"]*)"/);

      if (scoreMatch) {
        return {
          score: parseInt(scoreMatch[1], 10),
          reasoning: reasoningMatch ? reasoningMatch[1] : '',
          missingCriticalInfo: [],
          suggestedQueries: []
        };
      }
    } catch {
      // 放弃
    }
  }

  return null;
}
