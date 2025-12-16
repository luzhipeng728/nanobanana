// ReAct 核心循环 - 推理-行动-观察循环（流式版本）

import Anthropic from '@anthropic-ai/sdk';

/**
 * 转义 JSON 字符串中的特殊字符
 * 处理未正确转义的换行符、制表符、引号等
 */
function escapeJsonString(str: string): string {
  // 在 JSON 字符串值内部，需要转义的字符
  return str
    .replace(/\\/g, '\\\\')  // 反斜杠必须先处理
    .replace(/\n/g, '\\n')   // 换行符
    .replace(/\r/g, '\\r')   // 回车符
    .replace(/\t/g, '\\t')   // 制表符
    .replace(/\f/g, '\\f')   // 换页符
    .replace(/"/g, '\\"');   // 双引号
}

/**
 * 修复 JSON 字符串值中的未转义字符
 * 这个函数会找到所有的字符串值并正确转义它们
 */
function fixJsonStringValues(jsonText: string): string {
  // 使用状态机来处理 JSON 字符串
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i];

    if (escaped) {
      // 上一个字符是反斜杠，这个字符是转义序列的一部分
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      result += char;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString) {
      // 在字符串内部，转义特殊字符
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * 安全解析 JSON，支持多种容错方式
 * 处理 Claude 返回的可能不完整或格式有问题的 JSON
 */
function safeParseJSON(text: string): Record<string, any> | null {
  if (!text || !text.trim()) {
    return null;
  }

  // 1. 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试修复
  }

  // 1.5. 尝试修复未转义的字符串值后再解析
  try {
    const fixedText = fixJsonStringValues(text);
    return JSON.parse(fixedText);
  } catch {
    // 继续尝试其他方法
  }

  // 2. 尝试提取 JSON 对象
  const jsonMatches = text.match(/\{[\s\S]*\}/g);
  if (jsonMatches) {
    for (const jsonStr of jsonMatches) {
      try {
        return JSON.parse(jsonStr);
      } catch {
        // 继续尝试修复
      }

      // 2.5. 尝试修复字符串值中的未转义字符
      try {
        const fixedStr = fixJsonStringValues(jsonStr);
        return JSON.parse(fixedStr);
      } catch {
        // 继续尝试
      }

      // 3. 尝试修复常见问题
      let fixed = jsonStr
        // 移除尾部多余的逗号
        .replace(/,\s*([}\]])/g, '$1')
        // 修复未闭合的字符串（在 JSON 末尾添加引号和括号）
        .replace(/,\s*"[^"]*$/g, '}')
        // 修复单引号
        .replace(/'/g, '"');

      try {
        return JSON.parse(fixed);
      } catch {
        // 继续尝试
      }

      // 3.5. 修复后再处理字符串值
      try {
        const doubleFixed = fixJsonStringValues(fixed);
        return JSON.parse(doubleFixed);
      } catch {
        // 继续尝试
      }

      // 4. 尝试截断到最后一个完整的属性
      try {
        // 找到最后一个完整的 key-value 对
        const lastCompleteComma = fixed.lastIndexOf('",');
        if (lastCompleteComma > 0) {
          const truncated = fixed.substring(0, lastCompleteComma + 1) + '}';
          return JSON.parse(truncated);
        }
      } catch {
        // 放弃这个匹配
      }
    }
  }

  // 5. 尝试提取 JSON 数组
  const arrayMatches = text.match(/\[[\s\S]*\]/g);
  if (arrayMatches) {
    for (const arrayStr of arrayMatches) {
      try {
        return JSON.parse(arrayStr);
      } catch {
        // 尝试修复
      }

      // 修复字符串值
      try {
        const fixedStr = fixJsonStringValues(arrayStr);
        return JSON.parse(fixedStr);
      } catch {
        // 继续
      }

      // 其他修复
      let fixed = arrayStr
        .replace(/,\s*\]/g, ']')
        .replace(/'/g, '"');
      try {
        return JSON.parse(fixed);
      } catch {
        // 继续
      }

      // 修复后再处理字符串值
      try {
        const doubleFixed = fixJsonStringValues(fixed);
        return JSON.parse(doubleFixed);
      } catch {
        // 继续
      }
    }
  }

  console.warn('[safeParseJSON] Failed to parse JSON, returning null:', text.substring(0, 200));
  return null;
}
import type {
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  RawMessageStreamEvent
} from '@anthropic-ai/sdk/resources';
import { formatToolsForClaude } from './tools';
import { buildSystemPrompt } from './system-prompt';
import { executeToolCall } from './tool-handlers';
import type {
  ReActState,
  ThoughtStep,
  FinalOutput,
  SuperAgentStreamEvent
} from '@/types/super-agent';
import { CLAUDE_MODEL, CLAUDE_MAX_TOKENS } from '@/lib/claude-config';

// 初始化 Anthropic 客户端（启用 structured outputs beta）
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未配置');
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    // 启用 structured outputs beta，确保工具调用返回符合 schema 的 JSON
    defaultHeaders: {
      'anthropic-beta': 'structured-outputs-2025-11-13'
    }
  });
}

// 流式响应收集器
interface StreamCollector {
  contentBlocks: ContentBlock[];
  currentBlockIndex: number;
  currentText: string;
  currentToolInput: string;
  stopReason: string | null;
}

// 构建初始用户消息
function buildInitialMessage(
  userRequest: string,
  referenceImages?: string[]
): string {
  let message = `## 用户需求\n\n${userRequest}\n`;

  if (referenceImages && referenceImages.length > 0) {
    message += `\n## 参考图片\n\n用户提供了 ${referenceImages.length} 张参考图片：\n`;
    referenceImages.forEach((url, i) => {
      message += `- 图片 ${i + 1}: ${url}\n`;
    });
    message += `\n⚠️ **重要提醒**：用户提供了参考图片，你生成的提示词中**必须包含参考指令**，例如：
- "Follow the visual style, color palette, and artistic approach of the reference image"
- "Maintain the same aesthetic and composition style as the reference"

没有这个指令，生图模型可能会忽略参考图片！\n`;
  }

  message += `\n## 开始探索\n\n请根据用户需求，自主决定如何完成任务。你可以：
- 直接生成提示词（如果需求简单清晰）
- 先搜索相关信息（如果需要实时数据或参考）
- 查看是否有匹配的技能模板（如果想借鉴现有模板）
- 分析参考图片（如果用户提供了）

**你来决定流程，不需要遵循固定步骤。**
当你准备好最终提示词时，调用 \`finalize_output\` 输出结果。`;

  return message;
}

// ReAct 循环选项
export interface ReActLoopOptions {
  enableDeepResearch?: boolean; // 是否启用深度研究
  reasoningEffort?: 'low' | 'medium' | 'high'; // 深度研究强度
  conversationId?: string;      // 对话 ID（用于多轮对话）
  historyMessages?: Anthropic.MessageParam[]; // 历史消息（从对话管理器获取）
}

// 运行 ReAct 循环（流式版本）
export async function runReActLoop(
  userRequest: string,
  referenceImages: string[] | undefined,
  sendEvent: (event: SuperAgentStreamEvent) => Promise<void>,
  options: ReActLoopOptions = {}
): Promise<FinalOutput> {
  const { enableDeepResearch = false, reasoningEffort = 'low', historyMessages = [] } = options;

  const anthropic = getAnthropicClient();
  const systemPrompt = buildSystemPrompt({ enableDeepResearch, reasoningEffort });  // 传递参数控制 system prompt 中的工具说明
  const tools = formatToolsForClaude({ enableDeepResearch });

  // 初始化状态
  const state: ReActState = {
    iteration: 0,
    maxIterations: 8, // 最多8轮迭代
    thoughtHistory: [],
    currentPrompt: null,
    evaluationScore: 0,
    isComplete: false,
    matchedSkill: null
  };

  // 构建消息历史（支持多轮对话）
  const messages: Anthropic.MessageParam[] = [
    // 先添加历史消息（如果有）
    ...historyMessages,
    // 再添加当前用户请求
    {
      role: 'user',
      content: buildInitialMessage(userRequest, referenceImages)
    }
  ];

  // 日志：显示是否有历史消息
  if (historyMessages.length > 0) {
    console.log(`[SuperAgent] Continuing conversation with ${historyMessages.length} history messages`);
  }

  await sendEvent({
    type: 'start',
    message: '开始分析需求...'
  });

  // ReAct 循环
  while (!state.isComplete && state.iteration < state.maxIterations) {
    state.iteration++;

    console.log(`[SuperAgent] Iteration ${state.iteration}/${state.maxIterations}`);

    try {
      // 流式调用 Claude
      const stream = anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: systemPrompt,
        tools,
        messages
      });

      // 流式响应收集器
      const collector: StreamCollector = {
        contentBlocks: [],
        currentBlockIndex: -1,
        currentText: '',
        currentToolInput: '',
        stopReason: null
      };

      // 收集本轮的思考和行动
      let currentThought = '';
      const toolCalls: Array<{ id: string; name: string; input: Record<string, any> }> = [];

      // 处理流式事件
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start': {
            collector.currentBlockIndex = event.index;
            collector.currentText = '';
            collector.currentToolInput = '';

            if (event.content_block.type === 'text') {
              collector.contentBlocks[event.index] = {
                type: 'text',
                text: ''
              } as TextBlock;
            } else if (event.content_block.type === 'tool_use') {
              collector.contentBlocks[event.index] = {
                type: 'tool_use',
                id: event.content_block.id,
                name: event.content_block.name,
                input: {}
              } as ToolUseBlock;

              // 发送工具开始事件
              await sendEvent({
                type: 'action',
                iteration: state.iteration,
                tool: event.content_block.name,
                input: {} // 输入稍后会通过 delta 传入
              });
            }
            break;
          }

          case 'content_block_delta': {
            const idx = event.index;
            if (event.delta.type === 'text_delta') {
              const chunk = event.delta.text;
              collector.currentText += chunk;
              currentThought += chunk;

              // 更新 contentBlocks
              const block = collector.contentBlocks[idx] as TextBlock;
              if (block) {
                block.text += chunk;
              }

              // 实时发送思考 chunk
              await sendEvent({
                type: 'thinking_chunk',
                iteration: state.iteration,
                chunk
              });
            } else if (event.delta.type === 'input_json_delta') {
              const partialJson = event.delta.partial_json;
              collector.currentToolInput += partialJson;

              // 获取当前工具名称
              const currentBlock = collector.contentBlocks[idx];
              const toolName = currentBlock?.type === 'tool_use' ? currentBlock.name : 'unknown';

              const totalSize = collector.currentToolInput.length;
              const chunkSize = partialJson.length;

              // 每次都发送流式事件，让前端实时显示生成内容
              // 这样可以防止长时间无响应导致超时，同时让用户看到实际生成的内容
              await sendEvent({
                type: 'tool_input_chunk',
                iteration: state.iteration,
                tool: toolName,
                chunk: partialJson,        // 新增：当前 chunk 内容
                content: collector.currentToolInput,  // 新增：累积的完整内容
                chunkSize,
                totalSize
              });
            }
            break;
          }

          case 'content_block_stop': {
            const idx = event.index;
            const block = collector.contentBlocks[idx];

            if (block?.type === 'tool_use') {
              // 解析工具输入（带容错）
              let input: Record<string, any> = {};
              try {
                if (collector.currentToolInput) {
                  input = safeParseJSON(collector.currentToolInput) || {};
                }
              } catch (e) {
                console.error('[SuperAgent] Failed to parse tool input, using empty object:', e);
                // 容错：使用空对象继续
                input = {};
              }

              (block as ToolUseBlock).input = input;

              toolCalls.push({
                id: block.id,
                name: block.name,
                input
              });

              // 发送完整的工具调用事件
              await sendEvent({
                type: 'action',
                iteration: state.iteration,
                tool: block.name,
                input
              });
            } else if (block?.type === 'text' && collector.currentText) {
              // 发送完整思考事件
              await sendEvent({
                type: 'thought',
                iteration: state.iteration,
                content: collector.currentText
              });
            }
            break;
          }

          case 'message_stop': {
            // 消息结束
            break;
          }

          case 'message_delta': {
            if (event.delta.stop_reason) {
              collector.stopReason = event.delta.stop_reason;
            }
            break;
          }
        }
      }

      // 构建最终响应对象（用于消息历史）
      const response = {
        content: collector.contentBlocks.filter(Boolean),
        stop_reason: collector.stopReason
      };

      // 如果有工具调用，执行它们
      if (toolCalls.length > 0) {
        // 添加助手消息
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // 执行每个工具调用
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          console.log(`[SuperAgent] Executing tool: ${toolCall.name}`);

          const result = await executeToolCall(
            toolCall.name,
            toolCall.input,
            sendEvent
          );

          // 发送观察事件
          await sendEvent({
            type: 'observation',
            iteration: state.iteration,
            result: result.data || result.error
          });

          // 记录步骤
          const step: ThoughtStep = {
            iteration: state.iteration,
            thought: currentThought,
            action: toolCall.name,
            actionInput: toolCall.input,
            observation: JSON.stringify(result.data || result.error)
          };
          state.thoughtHistory.push(step);

          // 添加工具结果
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result)
          });

          // 检查是否完成
          if (toolCall.name === 'finalize_output' && result.success && result.data) {
            state.isComplete = true;
            const finalResult = result.data as FinalOutput;
            finalResult.iterationCount = state.iteration;
            finalResult.matchedSkill = state.matchedSkill;
            return finalResult;
          }

          // 更新状态
          if (toolCall.name === 'skill_matcher' && result.data?.matched) {
            state.matchedSkill = result.data.skill_name;
          }

          if (toolCall.name === 'evaluate_prompt' && result.data?.score) {
            state.evaluationScore = result.data.score;
          }

          if (toolCall.name === 'generate_prompt' && result.data?.prompt) {
            state.currentPrompt = result.data.prompt;
          }

          // 如果工具指示不应继续，但不是 finalize_output，则强制继续
          // 只有 finalize_output 可以结束循环
        }

        // 添加工具结果消息
        messages.push({
          role: 'user',
          content: toolResults
        });
      } else {
        // 没有工具调用 - 模型输出了纯文本
        if (response.stop_reason === 'end_turn') {
          messages.push({
            role: 'assistant',
            content: response.content
          });

          // 检查是否已经有足够的探索
          const hasEnoughExploration = state.iteration >= 2 || state.thoughtHistory.length >= 2;

          if (hasEnoughExploration) {
            // 温和提醒：可以继续探索或准备输出
            messages.push({
              role: 'user',
              content: `你的思考很好。现在你可以：
1. 继续探索（使用工具获取更多信息）
2. 准备输出（使用 \`finalize_output\` 输出最终提示词）

如果你认为已经有足够的信息，请直接调用 \`finalize_output\` 输出结果。`
            });
          } else {
            // 早期阶段：鼓励继续探索
            messages.push({
              role: 'user',
              content: `继续你的探索。你可以：
- 使用 \`research_topic\` 深入研究
- 使用 \`web_search\` 快速查询
- 使用 \`skill_matcher\` 查看模板
- 或者直接调用 \`finalize_output\` 输出结果（如果你已经准备好）`
            });
          }
        }
      }

      // 检查迭代限制
      if (state.iteration >= state.maxIterations && !state.isComplete) {
        // 强制结束
        await sendEvent({
          type: 'thought',
          iteration: state.iteration,
          content: '已达到最大迭代次数，将输出当前最佳结果。'
        });

        // 尝试构建一个回退结果
        const lastThought = state.thoughtHistory.length > 0
          ? state.thoughtHistory[state.thoughtHistory.length - 1].thought
          : '';
        const fallbackPrompt = state.currentPrompt ||
          (lastThought
            ? `Based on the analysis: ${lastThought.substring(0, 500)}`
            : `Generate an image based on the user's request`);

        const forceResult: FinalOutput = {
          finalPrompt: fallbackPrompt,
          prompts: [{
            id: `prompt-${Date.now()}`,
            scene: '默认场景',
            prompt: fallbackPrompt,
            chineseTexts: []
          }],
          chineseTexts: [],
          generationTips: ['已达到最大迭代次数，建议手动检查和优化提示词'],
          recommendedModel: 'nano-banana-pro',
          iterationCount: state.iteration,
          matchedSkill: state.matchedSkill
        };

        await sendEvent({
          type: 'complete',
          result: forceResult
        });

        return forceResult;
      }

    } catch (error) {
      console.error('[SuperAgent] Error in iteration:', error);
      await sendEvent({
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      });

      // 如果是可恢复的错误，继续尝试
      if (state.iteration < state.maxIterations) {
        messages.push({
          role: 'user',
          content: `发生错误: ${error instanceof Error ? error.message : '未知错误'}。请尝试其他方法继续完成任务。`
        });
      } else {
        // 达到最大迭代次数，返回一个回退结果而不是抛出错误
        const fallbackResult: FinalOutput = {
          finalPrompt: state.currentPrompt || '无法生成提示词，请重试',
          prompts: [{
            id: `prompt-${Date.now()}`,
            scene: '错误恢复',
            prompt: state.currentPrompt || '无法生成提示词，请重试',
            chineseTexts: []
          }],
          chineseTexts: [],
          generationTips: [`执行出错: ${error instanceof Error ? error.message : '未知错误'}`],
          recommendedModel: 'nano-banana-pro',
          iterationCount: state.iteration,
          matchedSkill: state.matchedSkill
        };

        await sendEvent({
          type: 'complete',
          result: fallbackResult
        });

        return fallbackResult;
      }
    }
  }

  // 如果循环结束但没有结果，返回一个回退结果
  const emergencyResult: FinalOutput = {
    finalPrompt: state.currentPrompt || '循环结束但未能生成结果，请重试',
    prompts: [{
      id: `prompt-${Date.now()}`,
      scene: '紧急回退',
      prompt: state.currentPrompt || '循环结束但未能生成结果，请重试',
      chineseTexts: []
    }],
    chineseTexts: [],
    generationTips: ['ReAct 循环异常结束，建议重新尝试'],
    recommendedModel: 'nano-banana-pro',
    iterationCount: state.iteration,
    matchedSkill: state.matchedSkill
  };

  await sendEvent({
    type: 'complete',
    result: emergencyResult
  });

  return emergencyResult;
}
