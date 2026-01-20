/**
 * 视频生成工具 - 统一接口
 *
 * 支持模型：
 * - seedance-lite: 快速生成（2-5秒）
 * - seedance-pro: 高质量生成
 * - seedance-1.5-pro: 最新版，支持音视频同步
 */

import {
  createVideoTask,
  pollVideoTask,
  getVideoTaskStatus,
  SEEDANCE_MODELS,
} from '../volcano/seedance'
import type {
  ToolResult,
  GenerateVideoParams,
  GenerateVideoResult,
  AnalyzeVideoParams,
  AnalyzeVideoResult,
} from './types'

// ============================================================================
// 429 重试辅助函数
// ============================================================================

/**
 * 带重试的 API 调用（处理 429 限流）
 * @param fn 要执行的异步函数
 * @param retries 最大重试次数
 * @param delays 重试延迟数组（秒）
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delays = [5, 10, 20, 40, 60]
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const msg = err.message || ''
      // 可重试的错误类型：429限流、超时、网络错误
      const isRetryable = msg.includes('429') ||
                          msg.includes('rate') ||
                          msg.includes('Too Many Requests') ||
                          msg.includes('Timeout') ||
                          msg.includes('timeout') ||
                          msg.includes('ETIMEDOUT') ||
                          msg.includes('ECONNRESET') ||
                          msg.includes('network') ||
                          msg.includes('fetch failed')
      if (!isRetryable || i === retries) throw err
      const delay = delays[Math.min(i, delays.length - 1)]
      console.log(`[VideoTool] 遇到可重试错误，等待 ${delay}s 后重试 (${i + 1}/${retries})...`, msg.slice(0, 100))
      await new Promise(r => setTimeout(r, delay * 1000))
    }
  }
  throw new Error('重试次数已用完')
}

// ============================================================================
// 视频生成
// ============================================================================

/**
 * 创建视频生成任务
 *
 * 返回任务 ID，可用于轮询状态
 */
export async function createVideoGenerationTask(
  params: GenerateVideoParams
): Promise<ToolResult<{ taskId: string }>> {
  const {
    startFrame,
    endFrame,
    duration,
    aspectRatio,
    model = 'seedance-lite',
    prompt = '平滑的镜头运动，电影级过渡效果',
    withAudio,
  } = params

  console.log(`[VideoTool] 创建视频任务, 模型: ${model}, 时长: ${duration}s`)

  try {
    // 获取模型 ID 和音频设置
    let modelId: string
    let audioEnabled: boolean | undefined

    switch (model) {
      case 'seedance-lite':
        modelId = SEEDANCE_MODELS['seedance-lite']
        break
      case 'seedance-pro':
        modelId = SEEDANCE_MODELS['seedance-pro']
        break
      case 'seedance-1.5-pro':
        modelId = SEEDANCE_MODELS['seedance-1.5-pro']
        audioEnabled = withAudio !== false  // 默认 true
        break
      case 'seedance-1.5-pro-silent':
        modelId = SEEDANCE_MODELS['seedance-1.5-pro-silent']
        audioEnabled = false  // 强制无音频
        break
      default:
        modelId = SEEDANCE_MODELS['seedance-lite']
    }

    const taskId = await createVideoTask({
      startFrame,
      endFrame: endFrame || undefined,
      duration,
      aspectRatio,
      model: modelId,
      prompt,
      withAudio: audioEnabled,
    })

    return {
      success: true,
      data: { taskId },
    }
  } catch (error) {
    console.error('[VideoTool] 创建任务失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建任务失败',
    }
  }
}

/**
 * 获取视频生成任务状态
 */
export async function getVideoTaskProgress(
  taskId: string
): Promise<ToolResult<{
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  videoUrl?: string
  error?: string
}>> {
  try {
    const status = await getVideoTaskStatus(taskId)
    return {
      success: true,
      data: status,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取状态失败',
    }
  }
}

/**
 * 生成视频（同步等待完成）
 *
 * 注意：这是一个长时间运行的操作（可能需要几分钟）
 */
export async function generateVideo(
  params: GenerateVideoParams
): Promise<ToolResult<GenerateVideoResult>> {
  const {
    startFrame,
    endFrame,
    duration,
    aspectRatio,
    model = 'seedance-lite',
    prompt = '平滑的镜头运动，电影级过渡效果',
    withAudio,
  } = params

  console.log(`[VideoTool] 生成视频, 模型: ${model}, 时长: ${duration}s`)

  try {
    // 获取模型 ID 和音频设置
    let modelId: string
    let audioEnabled: boolean | undefined

    switch (model) {
      case 'seedance-lite':
        modelId = SEEDANCE_MODELS['seedance-lite']
        break
      case 'seedance-pro':
        modelId = SEEDANCE_MODELS['seedance-pro']
        break
      case 'seedance-1.5-pro':
        modelId = SEEDANCE_MODELS['seedance-1.5-pro']
        audioEnabled = withAudio !== false  // 默认 true
        break
      case 'seedance-1.5-pro-silent':
        modelId = SEEDANCE_MODELS['seedance-1.5-pro-silent']
        audioEnabled = false  // 强制无音频
        break
      default:
        modelId = SEEDANCE_MODELS['seedance-lite']
    }

    // 创建任务
    const taskId = await createVideoTask({
      startFrame,
      endFrame: endFrame || undefined,
      duration,
      aspectRatio,
      model: modelId,
      prompt,
      withAudio: audioEnabled,
    })

    console.log(`[VideoTool] 任务已创建: ${taskId}，等待完成...`)

    // 轮询等待完成
    const result = await pollVideoTask(taskId)

    return {
      success: true,
      data: {
        videoUrl: result.videoUrl,
        taskId,
        duration,
      },
    }
  } catch (error) {
    console.error('[VideoTool] 生成失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    }
  }
}

// ============================================================================
// 批量视频生成
// ============================================================================

/**
 * 批量视频生成参数
 */
export interface BatchGenerateVideoParams {
  /** 视频任务列表 */
  tasks: Array<{
    /** 任务 ID（用于匹配结果） */
    id: string
    /** 首帧图片 */
    startFrame: string
    /** 尾帧图片（可选） */
    endFrame?: string
    /** 视频时长（2-12s） */
    duration: number
    /** 运动效果描述 */
    prompt?: string
    /** 场景描述（中文，用于记录） */
    description?: string
  }>
  /** 统一的宽高比 */
  aspectRatio?: '16:9' | '9:16' | '4:3' | '1:1'
  /** 统一的模型 */
  model?: 'seedance-lite' | 'seedance-pro' | 'seedance-1.5-pro' | 'seedance-1.5-pro-silent'
  /** 最大并发数（默认 20） */
  concurrency?: number
  /** 是否生成音频（仅 Seedance 1.5 Pro 支持，默认 true） */
  withAudio?: boolean
}

/**
 * 批量视频生成结果
 */
export interface BatchGenerateVideoResult {
  successCount: number
  failedCount: number
  results: Array<{
    id: string
    success: boolean
    videoUrl?: string
    taskId?: string
    error?: string
    description?: string
  }>
}

/**
 * 批量并发生成视频
 *
 * 支持多任务并发生成，默认并发数为 20
 */
export async function generateVideosBatch(
  params: BatchGenerateVideoParams
): Promise<ToolResult<BatchGenerateVideoResult>> {
  const {
    tasks,
    aspectRatio = '16:9',
    model = 'seedance-lite',
    concurrency = 20,
    withAudio,
  } = params

  console.log(`[VideoTool] 批量生成视频, 任务数: ${tasks.length}, 并发数: ${concurrency}, 模型: ${model}, 音频: ${withAudio ?? 'default'}`)

  if (tasks.length === 0) {
    return { success: false, error: '任务列表不能为空' }
  }

  // 分批并发执行
  async function runBatched<T, R>(
    items: T[],
    batchSize: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(
        batch.map((item, idx) => fn(item, i + idx))
      )
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({ success: false, error: result.reason?.message || '未知错误' } as R)
        }
      }
    }
    return results
  }

  try {
    const startTime = Date.now()

    const videoResults = await runBatched(
      tasks,
      concurrency,
      async (task, index) => {
        console.log(`[VideoTool] 开始生成视频 ${index + 1}/${tasks.length}: ${task.id}`)

        try {
          // 使用 429 重试机制
          const result = await callWithRetry(() =>
            generateVideo({
              startFrame: task.startFrame,
              endFrame: task.endFrame,
              duration: task.duration,
              aspectRatio,
              model,
              prompt: task.prompt || '平滑的镜头运动',
              withAudio,
            })
          )

          if (result.success) {
            console.log(`[VideoTool] ✅ 视频 ${task.id} 生成成功`)
          } else {
            console.log(`[VideoTool] ❌ 视频 ${task.id} 生成失败: ${result.error}`)
          }

          return {
            id: task.id,
            success: result.success,
            videoUrl: result.data?.videoUrl,
            taskId: result.data?.taskId,
            error: result.error,
            description: task.description,
          }
        } catch (retryError: any) {
          console.log(`[VideoTool] ❌ 视频 ${task.id} 重试失败: ${retryError.message}`)
          return {
            id: task.id,
            success: false,
            error: retryError.message,
            description: task.description,
          }
        }
      }
    )

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const successCount = videoResults.filter((r) => r.success).length
    const failedCount = videoResults.length - successCount

    console.log(`[VideoTool] 批量生成完成, 成功: ${successCount}, 失败: ${failedCount}, 耗时: ${elapsed}s`)

    return {
      success: true,
      data: { successCount, failedCount, results: videoResults },
    }
  } catch (error) {
    console.error('[VideoTool] 批量生成失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '批量生成失败',
    }
  }
}

// ============================================================================
// 视频分析
// ============================================================================

/**
 * 分析视频质量和内容
 *
 * 使用 Gemini 3 Pro 进行视频分析
 */
export async function analyzeVideo(
  params: AnalyzeVideoParams
): Promise<ToolResult<AnalyzeVideoResult>> {
  const {
    videoPath,
    prompt = '分析这个视频的质量和内容',
    checkPoints = [],
    sceneDescription,
    expectedAction,
  } = params

  console.log(`[VideoTool] 分析视频: ${videoPath}`)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { success: false, error: 'GEMINI_API_KEY 未配置' }
  }

  try {
    // 动态导入 Gemini SDK
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    // 构建分析提示词
    let analysisPrompt = `你是一个专业的视频质量审核员。请分析这个视频并提供详细评估。

分析要求：${prompt}
`

    if (sceneDescription) {
      analysisPrompt += `\n预期场景描述：${sceneDescription}`
    }

    if (expectedAction) {
      analysisPrompt += `\n预期动作：${expectedAction}`
    }

    if (checkPoints.length > 0) {
      analysisPrompt += `\n\n请检查以下要点：\n${checkPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    }

    analysisPrompt += `

请评估以下方面（每项 1-10 分）：
1. 视觉质量：清晰度、伪影、模糊等
2. 动作自然度：动作是否流畅、符合物理规律
3. 场景一致性：是否与预期场景匹配
4. 整体完成度：动作是否完整

基于评估，给出建议：
- "approve": 质量好（总分 >= 7）且动作完整 → 可以使用
- "retry": 质量差（总分 < 7）→ 需要重新生成
- "continue": 质量好但动作未完成 → 需要继续生成

返回 JSON 格式：
{
  "description": "视频整体描述",
  "visualQuality": 8,
  "motionNaturalness": 7,
  "sceneCoherence": 8,
  "overallScore": 7.5,
  "passed": true,
  "recommendation": "approve",
  "issues": ["问题1", "问题2"],
  "timestampedIssues": [{"timestamp": 2.5, "description": "问题描述"}],
  "suggestions": ["建议1"],
  "retryPromptAdjustment": "如需重试，调整后的提示词"
}

只返回 JSON 对象，不要有其他内容。`

    // 判断是 URL 还是 base64
    const isUrl = videoPath.startsWith('http://') || videoPath.startsWith('https://')
    const isBase64 = videoPath.startsWith('data:')

    let videoPart: { fileData: { mimeType: string; fileUri: string } } | { inlineData: { mimeType: string; data: string } }

    if (isUrl) {
      videoPart = {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: videoPath,
        },
      }
    } else if (isBase64) {
      // 从 data URL 提取 base64 数据
      const matches = videoPath.match(/^data:([^;]+);base64,(.+)$/)
      if (!matches) {
        return { success: false, error: '无效的 base64 视频数据' }
      }
      videoPart = {
        inlineData: {
          mimeType: matches[1],
          data: matches[2],
        },
      }
    } else {
      // 假设是本地文件路径，需要先读取
      const fs = await import('fs/promises')
      const buffer = await fs.readFile(videoPath)
      videoPart = {
        inlineData: {
          mimeType: 'video/mp4',
          data: buffer.toString('base64'),
        },
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: analysisPrompt },
            videoPart,
          ],
        },
      ],
    })

    let jsonStr = response.text?.trim() || ''

    // 清理 JSON
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7)
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3)
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3)
    }

    const parsed = JSON.parse(jsonStr.trim())

    return {
      success: true,
      data: {
        description: parsed.description || '视频分析完成',
        passed: parsed.passed ?? (parsed.overallScore >= 7),
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
        timestampedIssues: parsed.timestampedIssues || [],
        visualQuality: parsed.visualQuality,
        motionNaturalness: parsed.motionNaturalness,
        sceneCoherence: parsed.sceneCoherence,
        overallScore: parsed.overallScore,
        recommendation: parsed.recommendation,
        retryPromptAdjustment: parsed.retryPromptAdjustment,
      },
    }
  } catch (error) {
    console.error('[VideoTool] 分析失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '分析失败',
    }
  }
}

// ============================================================================
// 批量视频分析
// ============================================================================

/**
 * 批量视频分析参数
 */
export interface BatchAnalyzeVideoParams {
  /** 视频列表 */
  videos: Array<{
    /** 视频 ID */
    id: string
    /** 视频路径或 URL */
    videoPath: string
    /** 分析提示词 */
    prompt?: string
    /** 预期场景描述 */
    sceneDescription?: string
    /** 预期动作 */
    expectedAction?: string
  }>
  /** 最大并发数（默认 20） */
  concurrency?: number
}

/**
 * 批量视频分析结果
 */
export interface BatchAnalyzeVideoResult {
  successCount: number
  failedCount: number
  results: Array<{
    id: string
    success: boolean
    passed?: boolean
    overallScore?: number
    recommendation?: string
    error?: string
  }>
}

/**
 * 批量并发分析视频
 */
export async function analyzeVideosBatch(
  params: BatchAnalyzeVideoParams
): Promise<ToolResult<BatchAnalyzeVideoResult>> {
  const { videos, concurrency = 20 } = params

  console.log(`[VideoTool] 批量分析视频, 数量: ${videos.length}, 并发数: ${concurrency}`)

  if (videos.length === 0) {
    return { success: false, error: '视频列表不能为空' }
  }

  async function runBatched<T, R>(
    items: T[],
    batchSize: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(
        batch.map((item, idx) => fn(item, i + idx))
      )
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({ success: false, error: result.reason?.message || '未知错误' } as R)
        }
      }
    }
    return results
  }

  try {
    const startTime = Date.now()

    const analysisResults = await runBatched(
      videos,
      concurrency,
      async (video, index) => {
        console.log(`[VideoTool] 开始分析视频 ${index + 1}/${videos.length}: ${video.id}`)

        const result = await analyzeVideo({
          videoPath: video.videoPath,
          prompt: video.prompt,
          sceneDescription: video.sceneDescription,
          expectedAction: video.expectedAction,
        })

        return {
          id: video.id,
          success: result.success,
          passed: result.data?.passed,
          overallScore: result.data?.overallScore,
          recommendation: result.data?.recommendation,
          error: result.error,
        }
      }
    )

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const successCount = analysisResults.filter((r) => r.success).length
    const failedCount = analysisResults.length - successCount

    console.log(`[VideoTool] 批量分析完成, 成功: ${successCount}, 失败: ${failedCount}, 耗时: ${elapsed}s`)

    return {
      success: true,
      data: { successCount, failedCount, results: analysisResults },
    }
  } catch (error) {
    console.error('[VideoTool] 批量分析失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '批量分析失败',
    }
  }
}

// ============================================================================
// 工具定义
// ============================================================================

export const VIDEO_TOOL_DEFINITIONS = [
  {
    name: 'generate_video',
    description: '从图片生成视频。注意：AI 视频会导致文字乱码，文字内容应放在静态图片中。第一段用图文作为首帧，后续段落通过 first/last frame chaining 保持连贯',
    inputSchema: {
      type: 'object' as const,
      properties: {
        startFrame: {
          type: 'string',
          description: '首帧图片（base64 或 URL）',
        },
        endFrame: {
          type: 'string',
          description: '尾帧图片（可选，用于生成过渡视频）',
        },
        duration: {
          type: 'number',
          description: '视频时长（2-12 秒）',
          default: 5,
        },
        aspectRatio: {
          type: 'string',
          description: '宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1'],
          default: '16:9',
        },
        model: {
          type: 'string',
          description: '使用的模型',
          enum: ['seedance-lite', 'seedance-pro', 'seedance-1.5-pro'],
          default: 'seedance-lite',
        },
        prompt: {
          type: 'string',
          description: '运动效果描述',
          default: '平滑的镜头运动，电影级过渡效果',
        },
      },
      required: ['startFrame', 'duration', 'aspectRatio'],
    },
  },
  {
    name: 'create_video_task',
    description: '创建视频生成任务（异步），返回任务 ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        startFrame: {
          type: 'string',
          description: '首帧图片',
        },
        endFrame: {
          type: 'string',
          description: '尾帧图片（可选）',
        },
        duration: {
          type: 'number',
          description: '视频时长（2-12 秒）',
        },
        aspectRatio: {
          type: 'string',
          description: '宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1'],
        },
        model: {
          type: 'string',
          description: '使用的模型',
          enum: ['seedance-lite', 'seedance-pro', 'seedance-1.5-pro'],
        },
      },
      required: ['startFrame', 'duration', 'aspectRatio'],
    },
  },
  {
    name: 'get_video_task_status',
    description: '获取视频生成任务状态',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskId: {
          type: 'string',
          description: '任务 ID',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'analyze_video',
    description: '使用 Gemini 分析视频质量、动作自然度、场景一致性。返回评分和建议（approve/retry/continue）',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: {
          type: 'string',
          description: '视频路径或 URL',
        },
        prompt: {
          type: 'string',
          description: '分析提示词',
          default: '分析这个视频的质量和内容',
        },
        checkPoints: {
          type: 'array',
          description: '检查要点列表',
          items: { type: 'string' },
        },
        sceneDescription: {
          type: 'string',
          description: '预期场景描述（用于对比检查）',
        },
        expectedAction: {
          type: 'string',
          description: '预期动作（用于检查动作是否完成）',
        },
      },
      required: ['videoPath'],
    },
  },
  {
    name: 'generate_videos_batch',
    description: `批量并发生成视频。支持多任务同时生成。

**核心能力：**
- 并发生成：多个视频任务同时执行
- 自动调度：通过 concurrency 控制并发数（默认 8）
- 批量结果：返回所有任务的生成结果

**适用场景：**
- 新闻视频：批量生成多个场景的视频片段
- 多镜头：一次生成多个镜头
- 批量处理任务`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        tasks: {
          type: 'array',
          description: '视频任务列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务唯一标识' },
              startFrame: { type: 'string', description: '首帧图片' },
              endFrame: { type: 'string', description: '尾帧图片（可选）' },
              duration: { type: 'number', description: '视频时长（2-12s）' },
              prompt: { type: 'string', description: '运动效果描述' },
              description: { type: 'string', description: '场景描述' },
            },
            required: ['id', 'startFrame', 'duration'],
          },
        },
        aspectRatio: {
          type: 'string',
          description: '统一的宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1'],
          default: '16:9',
        },
        model: {
          type: 'string',
          description: '统一使用的模型',
          enum: ['seedance-lite', 'seedance-pro', 'seedance-1.5-pro'],
          default: 'seedance-lite',
        },
        concurrency: {
          type: 'number',
          description: '最大并发数',
          default: 20,
        },
      },
      required: ['tasks'],
    },
  },
  {
    name: 'analyze_videos_batch',
    description: `批量并发分析视频。支持多视频同时分析。

**核心能力：**
- 并发分析：多个视频同时分析
- 统一结果：返回所有视频的分析结果
- 质量评分：每个视频返回 passed/overallScore/recommendation`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        videos: {
          type: 'array',
          description: '视频列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '视频唯一标识' },
              videoPath: { type: 'string', description: '视频路径或 URL' },
              prompt: { type: 'string', description: '分析提示词' },
              sceneDescription: { type: 'string', description: '预期场景描述' },
              expectedAction: { type: 'string', description: '预期动作' },
            },
            required: ['id', 'videoPath'],
          },
        },
        concurrency: {
          type: 'number',
          description: '最大并发数',
          default: 20,
        },
      },
      required: ['videos'],
    },
  },
]
