/**
 * Agent Executor - Claude Agent SDK 执行器
 *
 * 支持 WebSocket 实时状态更新的 Agent 执行环境
 */

import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'events'
import { executeTool, ALL_TOOL_DEFINITIONS, hasToolExecutor } from './index'
import type { ToolResult } from './types'

// ============================================================================
// 类型定义
// ============================================================================

export interface AgentExecutionEvent {
  type: 'start' | 'thinking' | 'tool_call' | 'tool_result' | 'message' | 'complete' | 'error'
  timestamp: number
  data: unknown
}

export interface AgentExecutionOptions {
  model?: string
  maxTurns?: number
  systemPrompt?: string
  onEvent?: (event: AgentExecutionEvent) => void
}

export interface AgentExecutionResult {
  success: boolean
  finalMessage?: string
  toolCalls: Array<{
    tool: string
    input: Record<string, unknown>
    result: ToolResult
  }>
  error?: string
  totalTurns: number
}

// ============================================================================
// Agent 执行器
// ============================================================================

/**
 * 创建 Agent 执行器
 */
export function createAgentExecutor(options: AgentExecutionOptions = {}) {
  const {
    model = 'claude-sonnet-4-20250514',
    maxTurns = 20,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    onEvent,
  } = options

  const emitter = new EventEmitter()

  // 如果提供了事件回调，注册监听器
  if (onEvent) {
    emitter.on('event', onEvent)
  }

  /**
   * 发送事件
   */
  function emit(type: AgentExecutionEvent['type'], data: unknown) {
    const event: AgentExecutionEvent = {
      type,
      timestamp: Date.now(),
      data,
    }
    emitter.emit('event', event)
  }

  /**
   * 执行 Agent 任务
   */
  async function execute(userMessage: string): Promise<AgentExecutionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      emit('error', { message: 'ANTHROPIC_API_KEY 未配置' })
      return {
        success: false,
        error: 'ANTHROPIC_API_KEY 未配置',
        toolCalls: [],
        totalTurns: 0,
      }
    }

    const client = new Anthropic({ apiKey })
    const toolCalls: AgentExecutionResult['toolCalls'] = []

    // 构建工具定义（转换为 Claude API 格式）
    const tools = ALL_TOOL_DEFINITIONS.map((def) => ({
      name: def.name,
      description: def.description,
      input_schema: def.inputSchema,
    }))

    // 初始化消息历史
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: userMessage },
    ]

    emit('start', { userMessage, model, maxTurns })

    let turn = 0

    try {
      while (turn < maxTurns) {
        turn++
        emit('thinking', { turn, maxTurns })

        // 调用 Claude API
        const response = await client.messages.create({
          model,
          max_tokens: 8192,
          system: systemPrompt,
          tools,
          messages,
        })

        // 处理响应
        const assistantContent = response.content
        let hasToolUse = false

        // 添加助手消息到历史
        messages.push({ role: 'assistant', content: assistantContent })

        // 处理内容块
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

        for (const block of assistantContent) {
          if (block.type === 'text') {
            emit('message', { text: block.text })
          } else if (block.type === 'tool_use') {
            hasToolUse = true

            const toolName = block.name
            const toolInput = block.input as Record<string, unknown>

            emit('tool_call', {
              id: block.id,
              tool: toolName,
              input: toolInput,
            })

            // 检查工具是否存在
            if (!hasToolExecutor(toolName)) {
              const error = `未知工具: ${toolName}`
              emit('tool_result', { id: block.id, tool: toolName, error })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ success: false, error }),
                is_error: true,
              })

              toolCalls.push({
                tool: toolName,
                input: toolInput,
                result: { success: false, error },
              })

              continue
            }

            // 执行工具
            try {
              const result = await executeTool(toolName, toolInput)

              emit('tool_result', {
                id: block.id,
                tool: toolName,
                result,
              })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
                is_error: !result.success,
              })

              toolCalls.push({
                tool: toolName,
                input: toolInput,
                result,
              })
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : '工具执行失败'
              emit('tool_result', { id: block.id, tool: toolName, error: errorMessage })

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ success: false, error: errorMessage }),
                is_error: true,
              })

              toolCalls.push({
                tool: toolName,
                input: toolInput,
                result: { success: false, error: errorMessage },
              })
            }
          }
        }

        // 如果有工具调用，添加工具结果到消息历史
        if (toolResults.length > 0) {
          messages.push({ role: 'user', content: toolResults })
        }

        // 检查是否结束
        if (response.stop_reason === 'end_turn' && !hasToolUse) {
          // 提取最终文本消息
          const finalText = assistantContent
            .filter((b) => b.type === 'text')
            .map((b) => (b as Anthropic.Messages.TextBlock).text)
            .join('\n')

          emit('complete', { finalMessage: finalText, totalTurns: turn })

          return {
            success: true,
            finalMessage: finalText,
            toolCalls,
            totalTurns: turn,
          }
        }

        // 没有工具调用但没有结束，继续
        if (!hasToolUse) {
          const finalText = assistantContent
            .filter((b) => b.type === 'text')
            .map((b) => (b as Anthropic.Messages.TextBlock).text)
            .join('\n')

          emit('complete', { finalMessage: finalText, totalTurns: turn })

          return {
            success: true,
            finalMessage: finalText,
            toolCalls,
            totalTurns: turn,
          }
        }
      }

      // 达到最大轮次
      emit('error', { message: '达到最大执行轮次' })
      return {
        success: false,
        error: '达到最大执行轮次',
        toolCalls,
        totalTurns: turn,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '执行失败'
      emit('error', { message: errorMessage })
      return {
        success: false,
        error: errorMessage,
        toolCalls,
        totalTurns: turn,
      }
    }
  }

  return {
    execute,
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    off: (event: string, handler: (...args: unknown[]) => void) => emitter.off(event, handler),
  }
}

// ============================================================================
// 默认系统提示词
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的视频创作助手，可以使用多种工具来完成复杂的视频制作任务。

可用工具包括：

**图片工具**
- generate_image: 生成图片（支持 nano-banana、nano-banana-pro、seedream-4.5）
- extend_image: 扩展图片到目标比例
- compress_image: 压缩图片
- analyze_image: 分析图片质量和内容

**视频工具**
- generate_video: 从图片生成视频（支持 seedance-lite、seedance-pro）
- create_video_task: 创建异步视频生成任务
- get_video_task_status: 获取视频任务状态
- analyze_video: 分析视频质量

**TTS 工具**
- generate_tts: 文本转语音
- generate_script: 根据内容生成解说脚本

**FFmpeg 工具**
- merge_videos: 合并多个视频
- add_audio_to_video: 为视频添加音频
- add_audio_and_subtitles: 添加音频和字幕
- get_video_info: 获取视频信息
- get_audio_duration: 获取音频时长
- create_image_video: 从静态图片创建视频
- extract_frame: 从视频提取帧

**研究工具**
- deep_research: 深度互联网研究
- generate_storyboard: 生成视频分镜计划
- calculate_segments: 计算视频分段

工作流程建议：
1. 理解用户需求，必要时使用 deep_research 获取信息
2. 使用 generate_storyboard 规划视频结构
3. 为每个场景生成图片（注意保持风格一致）
4. 使用 analyze_image 检查图片质量，不合格则重新生成
5. 为每个场景生成视频片段
6. 生成解说脚本和 TTS 音频
7. 使用 FFmpeg 工具合并视频、添加音频和字幕

保持风格一致性技巧：
- 使用 seedream-4.5 的图生图功能，以第一张图为参考
- 在 prompt 中详细描述人物特征和画面风格
- 使用 analyze_image 检查风格是否一致

请认真完成用户的任务，遇到问题及时调整策略。`
