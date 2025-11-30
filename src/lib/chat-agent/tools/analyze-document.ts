// 文档分析工具

import Anthropic from '@anthropic-ai/sdk';
import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult } from '../types';
import { analyzeDocumentSchema } from '../tool-registry';

// Anthropic 客户端
const anthropic = new Anthropic();

// 分析类型对应的提示词
const ANALYSIS_PROMPTS: Record<string, string> = {
  summary: `请对以下文档进行摘要总结：

要求：
1. 提取文档的核心要点
2. 保持逻辑结构清晰
3. 控制在 500 字以内
4. 使用中文输出`,

  extract: `请从以下文档中提取关键信息：

要求：
1. 提取所有重要的数据、日期、人名、组织名等
2. 以结构化的方式呈现
3. 标注信息在文档中的位置（如果可能）`,

  qa: `请基于以下文档回答问题。

要求：
1. 答案必须基于文档内容
2. 如果文档中没有相关信息，请明确说明
3. 引用文档中的相关段落`,

  translate: `请将以下文档翻译成中文：

要求：
1. 保持原文的格式和结构
2. 专业术语保留原文并在括号中注明
3. 翻译要准确流畅`,
};

/**
 * 使用 Claude 分析文档
 */
async function analyzeWithClaude(
  content: string,
  analysisType: string,
  query: string | undefined,
  callbacks: ToolCallbacks,
  abortSignal: AbortSignal
): Promise<string> {
  // 构建系统提示
  const systemPrompt = ANALYSIS_PROMPTS[analysisType] || ANALYSIS_PROMPTS.summary;

  // 构建用户消息
  let userMessage = `文档内容：\n\n${content}`;
  if (query && analysisType === 'qa') {
    userMessage += `\n\n问题：${query}`;
  } else if (query) {
    userMessage += `\n\n补充要求：${query}`;
  }

  callbacks.onProgress('正在分析文档...');

  // 使用流式 API
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullContent = '';

  for await (const event of stream) {
    if (abortSignal.aborted) {
      throw new Error('用户中断');
    }

    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullContent += event.delta.text;

      // 流式输出
      if (callbacks.onChunk) {
        callbacks.onChunk(event.delta.text);
      }
    }
  }

  return fullContent;
}

/**
 * 文档分析工具
 */
export const analyzeDocumentTool: ChatAgentTool = {
  name: 'analyze_document',
  description: `分析用户上传的文档。

支持的分析类型：
- summary: 文档摘要
- extract: 提取关键信息
- qa: 基于文档回答问题
- translate: 翻译文档

支持的文档格式：PDF、Word、TXT、Markdown 等（需要先在前端解析为文本）`,

  schema: analyzeDocumentSchema,

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ): Promise<ToolResult> {
    const {
      documentContent,
      documentUrl,
      analysisType = 'summary',
      query,
    } = input as {
      documentContent?: string;
      documentUrl?: string;
      analysisType?: 'summary' | 'extract' | 'qa' | 'translate';
      query?: string;
    };

    callbacks.onProgress('准备分析文档...');

    // 获取文档内容
    let content = documentContent;

    // 如果没有直接内容，尝试从上下文获取
    if (!content && context.attachedDocuments.length > 0) {
      content = context.attachedDocuments[0].content;
      callbacks.onProgress(`使用上下文中的文档: ${context.attachedDocuments[0].filename}`);
    }

    // 如果提供了 URL，尝试下载
    if (!content && documentUrl) {
      try {
        callbacks.onProgress('下载文档...');
        const response = await fetch(documentUrl, {
          signal: context.abortSignal,
        });

        if (!response.ok) {
          throw new Error(`下载文档失败: ${response.status}`);
        }

        content = await response.text();
      } catch (error) {
        return {
          success: false,
          error: `无法获取文档内容: ${error instanceof Error ? error.message : '未知错误'}`,
        };
      }
    }

    if (!content) {
      return {
        success: false,
        error: '没有找到要分析的文档。请上传文档或提供文档内容。',
      };
    }

    // 检查内容长度
    if (content.length > 100000) {
      callbacks.onProgress('文档较长，将进行分段分析...');
      // 截取前 100000 字符（约 50k tokens）
      content = content.slice(0, 100000);
    }

    try {
      const analysis = await analyzeWithClaude(
        content,
        analysisType,
        query,
        callbacks,
        context.abortSignal
      );

      callbacks.onProgress('文档分析完成！');

      return {
        success: true,
        analysis,
        data: {
          analysisType,
          query,
          analysisLength: analysis.length,
          documentLength: content.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文档分析失败';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

export default analyzeDocumentTool;
