// ReAct 核心循环 - 推理-行动-观察循环

import Anthropic from '@anthropic-ai/sdk';
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
    message += `\n请在适当时机使用 \`analyze_image\` 工具分析这些图片。\n`;
  }

  message += `\n## 开始任务\n\n请开始 ReAct 工作流程：\n1. 首先使用 \`skill_matcher\` 分析需求并匹配技能\n2. 根据匹配结果决定后续步骤\n3. 生成、评估、优化提示词\n4. 最终使用 \`finalize_output\` 输出结果`;

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
      // 调用 Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages
      });

      // 收集本轮的思考和行动
      let currentThought = '';
      const toolCalls: Array<{ id: string; name: string; input: Record<string, any> }> = [];

      // 处理响应内容
      for (const block of response.content) {
        if (block.type === 'text') {
          currentThought += block.text;

          // 发送思考事件
          await sendEvent({
            type: 'thought',
            iteration: state.iteration,
            content: block.text
          });
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, any>
          });

          // 发送行动事件
          await sendEvent({
            type: 'action',
            iteration: state.iteration,
            tool: block.name,
            input: block.input as Record<string, any>
          });
        }
      }

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
        // 没有工具调用，检查是否是结束
        if (response.stop_reason === 'end_turn') {
          // Claude 主动结束但没有使用 finalize_output，提示继续
          messages.push({
            role: 'assistant',
            content: response.content
          });
          messages.push({
            role: 'user',
            content: `请继续完成任务。你必须使用 \`finalize_output\` 工具来输出最终结果。

当前状态：
- 迭代次数: ${state.iteration}/${state.maxIterations}
- 评估分数: ${state.evaluationScore}
- 匹配技能: ${state.matchedSkill || '无'}

${state.evaluationScore >= 85 ? '评估分数已达标，请使用 finalize_output 输出最终结果。' : '请继续优化提示词或使用 finalize_output 输出当前最佳结果。'}`
          });
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
