// Chat Agent ReAct 循环 - 流式版本

import Anthropic from '@anthropic-ai/sdk';
import type {
  ClaudeMessage,
  ClaudeContent,
  ClaudeToolUseBlock,
  ToolContext,
  ToolResult,
  WebSocketClient,
  ReActConfig,
  ChatAgentTool,
  ClaudeTool,
} from './types';
import { DEFAULT_REACT_CONFIG } from './types';
import { getTool } from './tool-registry';

// Anthropic 客户端
const anthropic = new Anthropic();

// 系统提示词
const SYSTEM_PROMPT = `你是一个智能助手，可以帮助用户完成各种任务。你有以下能力：

1. **网络搜索** (web_search): 搜索互联网获取最新信息
2. **深度研究** (deep_research): 对复杂话题进行深入研究分析
3. **生成图片** (generate_image): 根据描述生成图片
4. **编辑图片** (edit_image): 修改或编辑已有图片
5. **分析文档** (analyze_document): 分析用户上传的文档
6. **代码执行** (code_interpreter): 执行代码进行图片处理等操作

## 工具使用原则

- 根据用户需求选择最合适的工具
- 可以组合使用多个工具完成复杂任务
- 工具调用前先简要说明你的计划
- 工具返回结果后，总结要点并回复用户

## 并行工具调用（重要）

**你必须在单个响应中同时调用多个工具，而不是顺序调用。**

当用户需要多个独立的操作时（如生成多张图片、同时搜索和生成图片等），你应该：
1. 在同一个响应中返回所有需要的工具调用
2. 不要等待一个工具完成后再调用下一个
3. 系统会并行执行所有工具调用，大大提高效率

示例：如果用户要求"生成3张不同视角的图片"，你应该在一个响应中同时返回3个 generate_image 工具调用，而不是只返回1个。

## 图片生成规则

- 当用户要求生成图片时，必须调用 generate_image 工具
- 如果需要生成多张图片，在**同一个响应中同时调用多个** generate_image 工具
- 不要只描述图片或列出提示词，直接调用工具生成
- 每次 generate_image 调用只能生成一张图片

当用户上传图片时，图片URL会在对话上下文中，你可以在需要时引用这些URL。

请用中文与用户交流，除非用户明确要求使用其他语言。`;

/**
 * 运行 ReAct 循环
 */
export async function runReactLoop(
  messages: ClaudeMessage[],
  tools: ClaudeTool[],
  toolInstances: Map<string, ChatAgentTool>,
  context: ToolContext,
  ws: WebSocketClient,
  config: ReActConfig = DEFAULT_REACT_CONFIG
): Promise<void> {
  let iteration = 0;

  while (iteration < config.maxIterations) {
    iteration++;

    // 检查是否中断
    if (context.abortSignal.aborted) {
      ws.send({ type: 'error', message: '用户中断', code: 'ABORTED' });
      return;
    }

    try {
      // 调用 Claude API（流式）
      const stream = anthropic.messages.stream({
        model: config.model,
        max_tokens: config.maxTokens,
        system: SYSTEM_PROMPT,
        messages: messages as Anthropic.MessageParam[],
        tools: tools as Anthropic.Tool[],
      });

      // 收集本轮响应内容
      const contentBlocks: ClaudeContent[] = [];
      let currentToolUse: {
        id: string;
        name: string;
        inputJson: string;
      } | null = null;

      // 处理流式事件
      for await (const event of stream) {
        // 检查中断
        if (context.abortSignal.aborted) {
          ws.send({ type: 'error', message: '用户中断', code: 'ABORTED' });
          return;
        }

        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'text') {
              // 文本块开始
              contentBlocks.push({ type: 'text', text: '' });
            } else if (event.content_block.type === 'tool_use') {
              // 工具调用开始
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: '',
              };
              ws.send({
                type: 'tool_start',
                toolId: event.content_block.id,
                name: event.content_block.name,
                input: {},
              });
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              // 文本增量 - 流式发送
              ws.send({ type: 'content_chunk', content: event.delta.text });
              // 累积到 contentBlocks
              const lastBlock = contentBlocks[contentBlocks.length - 1];
              if (lastBlock && lastBlock.type === 'text') {
                lastBlock.text += event.delta.text;
              }
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              // 工具输入 JSON 增量
              currentToolUse.inputJson += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentToolUse) {
              // 工具调用块结束，解析输入
              let parsedInput = {};
              try {
                parsedInput = JSON.parse(currentToolUse.inputJson || '{}');
              } catch {
                // 保持空对象
              }

              // 发送工具输入更新事件
              ws.send({
                type: 'tool_input',
                toolId: currentToolUse.id,
                input: parsedInput,
              });

              contentBlocks.push({
                type: 'tool_use',
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: parsedInput,
              });
              currentToolUse = null;
            }
            break;
        }
      }

      // 获取最终消息
      const finalMessage = await stream.finalMessage();

      // 检查是否有工具调用
      const toolUseBlocks = contentBlocks.filter(
        (b): b is ClaudeToolUseBlock => b.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // 没有工具调用，循环结束
        ws.send({ type: 'done', messageId: finalMessage.id });
        return;
      }

      // 将助手消息添加到历史
      messages.push({
        role: 'assistant',
        content: contentBlocks,
      });

      // 并行执行工具调用
      const toolPromises = toolUseBlocks.map(async (toolUse) => {
        const tool = toolInstances.get(toolUse.name);
        if (!tool) {
          // 工具不存在
          ws.send({
            type: 'tool_end',
            toolId: toolUse.id,
            output: { success: false, error: `未知工具: ${toolUse.name}` },
            duration: 0,
          });
          return {
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: `未知工具: ${toolUse.name}` }),
          };
        }

        const startTime = Date.now();

        // 进度定时器 - 每 5 秒发送一次进度
        const progressInterval = setInterval(() => {
          ws.send({
            type: 'tool_progress',
            toolId: toolUse.id,
            elapsed: Date.now() - startTime,
            status: '执行中...',
          });
        }, 5000);

        try {
          // 执行工具
          const result = await tool.execute(
            toolUse.input,
            context,
            {
              onProgress: (status: string) => {
                ws.send({
                  type: 'tool_progress',
                  toolId: toolUse.id,
                  elapsed: Date.now() - startTime,
                  status,
                });
              },
              onChunk: (chunk: string) => {
                ws.send({
                  type: 'tool_chunk',
                  toolId: toolUse.id,
                  chunk,
                });
              },
            }
          );

          const duration = Date.now() - startTime;

          ws.send({
            type: 'tool_end',
            toolId: toolUse.id,
            output: result,
            duration,
          });

          return {
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : '未知错误';

          ws.send({
            type: 'tool_end',
            toolId: toolUse.id,
            output: { success: false, error: errorMessage },
            duration,
          });

          return {
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: errorMessage }),
          };
        } finally {
          clearInterval(progressInterval);
        }
      });

      // 等待所有工具执行完成
      const toolResults = await Promise.all(toolPromises);

      // 将工具结果添加到消息历史
      messages.push({
        role: 'user',
        content: toolResults.map(r => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      });

      // 继续下一轮循环...
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      ws.send({ type: 'error', message: errorMessage, code: 'API_ERROR' });
      return;
    }
  }

  // 达到最大迭代次数
  ws.send({
    type: 'error',
    message: `达到最大迭代次数 (${config.maxIterations})`,
    code: 'MAX_ITERATIONS',
  });
}

/**
 * 构建初始消息
 */
export function buildInitialMessages(
  userContent: string,
  attachedImages: string[],
  attachedDocuments: { filename: string; content: string }[]
): ClaudeMessage[] {
  const content: ClaudeContent[] = [];

  // 添加图片
  for (const imageUrl of attachedImages) {
    content.push({
      type: 'image',
      source: {
        type: 'url',
        url: imageUrl,
      },
    });
  }

  // 添加文档信息
  if (attachedDocuments.length > 0) {
    let docInfo = '\n\n[已上传的文档]\n';
    for (const doc of attachedDocuments) {
      docInfo += `- ${doc.filename}\n`;
    }
    content.push({ type: 'text', text: userContent + docInfo });
  } else {
    content.push({ type: 'text', text: userContent });
  }

  return [{ role: 'user', content }];
}

/**
 * 追加用户消息到历史
 */
export function appendUserMessage(
  messages: ClaudeMessage[],
  userContent: string,
  attachedImages: string[],
  attachedDocuments: { filename: string; content: string }[]
): void {
  const content: ClaudeContent[] = [];

  // 添加新图片
  for (const imageUrl of attachedImages) {
    content.push({
      type: 'image',
      source: {
        type: 'url',
        url: imageUrl,
      },
    });
  }

  // 添加文本
  let text = userContent;
  if (attachedDocuments.length > 0) {
    text += '\n\n[新上传的文档]\n';
    for (const doc of attachedDocuments) {
      text += `- ${doc.filename}\n`;
    }
  }
  content.push({ type: 'text', text });

  messages.push({ role: 'user', content });
}
