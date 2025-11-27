// ReAct 核心循环 - 推理-行动-观察循环（流式版本）

import Anthropic from '@anthropic-ai/sdk';
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

// 初始化 Anthropic 客户端
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未配置');
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined
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

// 运行 ReAct 循环（流式版本）
export async function runReActLoop(
  userRequest: string,
  referenceImages: string[] | undefined,
  sendEvent: (event: SuperAgentStreamEvent) => Promise<void>
): Promise<FinalOutput> {
  const anthropic = getAnthropicClient();
  const systemPrompt = buildSystemPrompt();
  const tools = formatToolsForClaude();

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

  // 构建消息历史
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildInitialMessage(userRequest, referenceImages)
    }
  ];

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
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
              collector.currentToolInput += event.delta.partial_json;
            }
            break;
          }

          case 'content_block_stop': {
            const idx = event.index;
            const block = collector.contentBlocks[idx];

            if (block?.type === 'tool_use') {
              // 解析工具输入
              try {
                const input = collector.currentToolInput
                  ? JSON.parse(collector.currentToolInput)
                  : {};
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
              } catch (e) {
                console.error('[SuperAgent] Failed to parse tool input:', e);
              }
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

        // 如果有当前提示词，输出它
        if (state.currentPrompt) {
          const forceResult: FinalOutput = {
            finalPrompt: state.currentPrompt,
            prompts: [{
              id: `prompt-${Date.now()}`,
              scene: '默认场景',
              prompt: state.currentPrompt,
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
        throw error;
      }
    }
  }

  // 如果循环结束但没有结果
  throw new Error('ReAct 循环结束但未生成结果');
}
