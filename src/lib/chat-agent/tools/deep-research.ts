// 深度研究工具 - 使用 Perplexity Sonar Deep Research

import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult } from '../types';
import { deepResearchSchema } from '../tool-registry';

// Perplexity API 配置
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityCitation {
  url: string;
  text?: string;
}

interface PerplexityResponse {
  id: string;
  choices: {
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }[];
  citations?: PerplexityCitation[];
}

/**
 * 执行深度研究
 */
async function performDeepResearch(
  topic: string,
  reasoningEffort: 'low' | 'medium' | 'high',
  additionalContext: string | undefined,
  callbacks: ToolCallbacks,
  abortSignal: AbortSignal
): Promise<{ report: string; citations: string[] }> {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_API_KEY 未配置');
  }

  // 构建系统提示
  const systemPrompt = `你是一个专业的研究助手。请对给定的主题进行深入研究和分析。
要求：
1. 提供准确、最新的信息
2. 包含多个来源和观点
3. 结构化呈现研究结果
4. 标注信息来源`;

  // 构建用户消息
  let userMessage = `请对以下主题进行深度研究：\n\n${topic}`;
  if (additionalContext) {
    userMessage += `\n\n补充背景：${additionalContext}`;
  }

  const messages: PerplexityMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // 根据研究强度选择模型
  const model = reasoningEffort === 'high'
    ? 'sonar-deep-research'
    : reasoningEffort === 'medium'
      ? 'sonar-pro'
      : 'sonar';

  callbacks.onProgress(`启动 ${model} 模型进行研究...`);

  // 调用 Perplexity API（流式）
  const response = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      return_citations: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Perplexity API 错误: ${response.status}`);
  }

  // 处理流式响应
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let citations: string[] = [];
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6); // 移除 'data: '
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';

          if (content) {
            fullContent += content;
            chunkCount++;

            // 每 10 个 chunk 发送一次进度
            if (chunkCount % 10 === 0) {
              callbacks.onProgress(`研究中... (${fullContent.length} 字符)`);
            }

            // 流式输出
            if (callbacks.onChunk) {
              callbacks.onChunk(content);
            }
          }

          // 提取引用
          if (parsed.citations) {
            citations = parsed.citations.map((c: PerplexityCitation) => c.url);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { report: fullContent, citations };
}

/**
 * 深度研究工具
 */
export const deepResearchTool: ChatAgentTool = {
  name: 'deep_research',
  description: `深度研究智能体 - 对复杂话题进行深入的互联网研究。

研究强度：
- low: 快速研究，约 1-3 分钟
- medium: 标准研究，约 3-7 分钟
- high: 深度研究，约 7-15 分钟

适用于：新闻资讯、深度分析、技术调研、市场研究等需要综合多个来源信息的场景。`,

  schema: deepResearchSchema,

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ): Promise<ToolResult> {
    const {
      topic,
      reasoning_effort = 'low',
      context: additionalContext,
    } = input as {
      topic: string;
      reasoning_effort?: 'low' | 'medium' | 'high';
      context?: string;
    };

    callbacks.onProgress(`开始深度研究: "${topic}" (强度: ${reasoning_effort})`);

    try {
      const { report, citations } = await performDeepResearch(
        topic,
        reasoning_effort,
        additionalContext,
        callbacks,
        context.abortSignal
      );

      callbacks.onProgress(`研究完成，报告长度: ${report.length} 字符`);

      return {
        success: true,
        researchReport: report,
        data: {
          topic,
          reasoningEffort: reasoning_effort,
          report,
          citations,
          reportLength: report.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '研究失败';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

export default deepResearchTool;
