/**
 * Deep Research 工具
 *
 * 使用 Perplexity / HyprLab 进行深度研究
 */

import type {
  ToolResult,
  DeepResearchParams,
  DeepResearchResult,
  GenerateStoryboardParams,
  GenerateStoryboardResult,
  StoryboardScene,
} from './types'

// ============================================================================
// Deep Research
// ============================================================================

/**
 * 深度研究
 *
 * 使用 Perplexity sonar-deep-research 进行深度互联网研究
 */
export async function deepResearch(
  params: DeepResearchParams
): Promise<ToolResult<DeepResearchResult>> {
  const {
    topic,
    reasoningEffort = 'low',
    context,
  } = params

  console.log(`[ResearchTool] 深度研究, 主题: ${topic}, 强度: ${reasoningEffort}`)

  const apiKey = process.env.HYPRLAB_API_KEY

  if (!apiKey) {
    return { success: false, error: 'HYPRLAB_API_KEY 未配置' }
  }

  try {
    // 构建系统提示词
    let systemPrompt = `你是一个专业的研究助手。请对以下主题进行深入研究：\n\n主题：${topic}`

    if (context) {
      systemPrompt += `\n\n背景信息：${context}`
    }

    systemPrompt += `\n\n请提供：
1. 详细的研究报告
2. 关键发现
3. 引用来源

返回 JSON 格式：
{
  "report": "完整研究报告",
  "keyFindings": ["发现1", "发现2"],
  "sources": [{"title": "标题", "url": "链接", "snippet": "摘要"}]
}`

    const response = await fetch('https://api.hyprlab.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar-deep-research',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: topic },
        ],
        reasoning_effort: reasoningEffort,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `研究 API 错误: ${error}` }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // 尝试解析 JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          success: true,
          data: {
            report: parsed.report || content,
            sources: parsed.sources || [],
            keyFindings: parsed.keyFindings || [],
          },
        }
      }
    } catch {
      // JSON 解析失败，返回原始内容
    }

    return {
      success: true,
      data: {
        report: content,
        sources: [],
        keyFindings: [],
      },
    }
  } catch (error) {
    console.error('[ResearchTool] 研究失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '研究失败',
    }
  }
}

// ============================================================================
// 分镜生成
// ============================================================================

/**
 * 生成分镜计划
 *
 * 根据内容自动生成视频分镜
 */
export async function generateStoryboard(
  params: GenerateStoryboardParams
): Promise<ToolResult<GenerateStoryboardResult>> {
  const {
    content,
    sceneCount = 5,
    aspectRatio = '16:9',
    maxDuration = 120,
    style = 'informative',
  } = params

  console.log(`[ResearchTool] 生成分镜, 场景数: ${sceneCount}, 风格: ${style}`)

  try {
    const { chatWithDoubao } = await import('../volcano/doubao')

    const styleDescriptions = {
      informative: '信息展示型，客观专业',
      narrative: '故事叙述型，有起承转合',
      tutorial: '教程演示型，步骤清晰',
      news: '新闻资讯型，简洁有力',
    }

    const response = await chatWithDoubao([
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `根据以下内容生成视频分镜计划：

内容：${content}

要求：
1. 风格：${styleDescriptions[style]}
2. 场景数量：${sceneCount} 个
3. 总时长不超过 ${maxDuration} 秒
4. 宽高比：${aspectRatio}

为每个场景生成：
- id: 唯一标识
- order: 顺序号
- description: 场景描述（中文）
- imagePrompt: 图片生成提示词（英文，详细描述画面内容、风格、色调）
- narration: 解说词（中文）
- duration: 时长（秒）

返回 JSON 格式：
{
  "title": "视频标题",
  "totalDuration": 总时长,
  "scenes": [...]
}`,
          },
        ],
      },
    ])

    // 解析响应
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])

        // 验证并补全场景数据
        const scenes: StoryboardScene[] = (parsed.scenes || []).map((scene: Partial<StoryboardScene>, index: number) => ({
          id: scene.id || `scene-${index + 1}`,
          order: scene.order ?? index,
          description: scene.description || '',
          imagePrompt: scene.imagePrompt || '',
          narration: scene.narration || '',
          duration: scene.duration || Math.floor(maxDuration / sceneCount),
        }))

        return {
          success: true,
          data: {
            title: parsed.title || '未命名视频',
            totalDuration: parsed.totalDuration || scenes.reduce((sum, s) => sum + s.duration, 0),
            scenes,
          },
        }
      }
    } catch {
      // JSON 解析失败
    }

    return {
      success: false,
      error: '分镜生成失败：无法解析响应',
    }
  } catch (error) {
    console.error('[ResearchTool] 生成分镜失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成分镜失败',
    }
  }
}

/**
 * 视频分段类型
 */
export interface VideoSegment {
  index: number
  start: number
  end: number
  duration: number
  type: 'text-transition' | 'dynamic'
  note: string
}

/**
 * 计算视频分段
 *
 * 根据音频时长计算视频分段，考虑 Seedance 的 2-12s 限制
 *
 * 关键设计：
 * - 第一段固定 5s，用于信息图文字过渡（文字淡出）
 * - 后续段落为纯动态内容，无文字
 * - 通过 first/last frame chaining 保持连贯性
 *
 * 为什么这样设计？
 * AI 生成的视频会导致文字乱码，所以文字必须在静态图片中
 * 第一段从图文开始，让文字过渡淡出，后续都是纯动态画面
 */
export function calculateSegments(params: {
  audioDuration: number
  firstSegmentDuration?: number
  maxSegmentDuration?: number
  targetSegmentDuration?: number
}): ToolResult<{ segments: VideoSegment[]; totalSegments: number }> {
  const {
    audioDuration,
    firstSegmentDuration = 5,   // 第一段：5s（信息图 → 文字淡出）
    maxSegmentDuration = 12,    // Seedance 最大时长
    targetSegmentDuration = 8,  // 目标时长（质量舒适区）
  } = params

  const MIN_SEGMENT = 2  // Seedance 最小时长

  if (audioDuration <= 0) {
    return { success: false, error: '音频时长必须大于 0' }
  }

  const segments: VideoSegment[] = []
  let currentTime = 0

  // 第一段：文字过渡段（固定时长）
  const firstDuration = Math.min(firstSegmentDuration, audioDuration)
  segments.push({
    index: 0,
    start: 0,
    end: firstDuration,
    duration: firstDuration,
    type: 'text-transition',
    note: 'Info-graphic with text → text fades away',
  })
  currentTime = firstDuration

  // 后续段落：纯动态内容
  let remaining = audioDuration - firstDuration
  let segmentIndex = 1

  while (remaining > 0) {
    let duration: number

    if (remaining <= maxSegmentDuration) {
      // 剩余时间在一个段落内可以处理
      duration = Math.max(MIN_SEGMENT, remaining)
    } else if (remaining <= maxSegmentDuration + MIN_SEGMENT) {
      // 避免最后剩余太短的段落，均分
      duration = Math.ceil(remaining / 2)
    } else {
      // 正常分段，使用目标时长
      duration = Math.min(targetSegmentDuration, remaining)
    }

    segments.push({
      index: segmentIndex,
      start: currentTime,
      end: currentTime + duration,
      duration: Math.round(duration * 10) / 10,  // 保留一位小数
      type: 'dynamic',
      note: 'Pure motion, no text (chain from previous endFrame)',
    })

    currentTime += duration
    remaining -= duration
    segmentIndex++
  }

  return {
    success: true,
    data: {
      segments,
      totalSegments: segments.length,
    },
  }
}

// ============================================================================
// 完整解说稿生成
// ============================================================================

export interface GenerateNarrationParams {
  /** 场景列表 */
  scenes: Array<{
    title: string
    description: string
    narration?: string
  }>
  /** 风格 */
  style?: 'news_broadcast' | 'documentary' | 'tutorial'
  /** 标题 */
  title?: string
}

export interface GenerateNarrationResult {
  /** 完整解说稿 */
  fullNarration: string
  /** 总字数 */
  wordCount: number
  /** 预估时长（秒） */
  estimatedDuration: number
  /** 按场景拆分的解说 */
  narrationByScene: string[]
}

/**
 * 生成完整解说稿
 *
 * 一次性生成完整稿件，保证：
 * - 有开场白
 * - 有过渡语
 * - 有总结语
 * - 整体语气连贯
 */
export async function generateFullNarration(
  params: GenerateNarrationParams
): Promise<ToolResult<GenerateNarrationResult>> {
  const { scenes, style = 'news_broadcast', title = 'AI新闻速报' } = params

  console.log(`[ResearchTool] 生成完整解说稿, 场景数: ${scenes.length}, 风格: ${style}`)

  try {
    const { chatWithDoubao } = await import('../volcano/doubao')

    const styleGuides = {
      news_broadcast: '新闻播报风格，专业、客观、简洁有力',
      documentary: '纪录片风格，娓娓道来、深入浅出',
      tutorial: '教程风格，清晰易懂、循序渐进',
    }

    const sceneDescriptions = scenes.map((s, i) =>
      `场景${i + 1}: ${s.title}\n内容要点: ${s.description}`
    ).join('\n\n')

    const prompt = `请为以下视频生成完整的解说稿。

标题：${title}
风格：${styleGuides[style]}
场景数：${scenes.length}

场景内容：
${sceneDescriptions}

要求：
1. 必须有开场白（介绍今天的主题）
2. 每个场景之间必须有过渡语（"接下来"、"另一个值得关注的是"等）
3. 必须有总结语（回顾要点，告别）
4. 每个场景的解说 50-100 字
5. 整体语气连贯自然，像真人播报
6. 总字数 ${scenes.length * 75} 字左右

返回 JSON 格式：
{
  "fullNarration": "完整的解说稿文本",
  "narrationByScene": ["场景1解说", "场景2解说", ...]
}`

    const response = await chatWithDoubao([
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ])

    // 解析响应
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const fullNarration = parsed.fullNarration || ''
        const wordCount = fullNarration.length
        // 中文大约 3-4 字/秒
        const estimatedDuration = Math.round(wordCount / 3.5)

        return {
          success: true,
          data: {
            fullNarration,
            wordCount,
            estimatedDuration,
            narrationByScene: parsed.narrationByScene || [],
          },
        }
      }
    } catch {
      // JSON 解析失败，尝试直接使用响应
    }

    // 如果无法解析 JSON，直接使用响应文本
    const wordCount = response.length
    return {
      success: true,
      data: {
        fullNarration: response,
        wordCount,
        estimatedDuration: Math.round(wordCount / 3.5),
        narrationByScene: [],
      },
    }
  } catch (error) {
    console.error('[ResearchTool] 生成解说稿失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成解说稿失败',
    }
  }
}

// ============================================================================
// 工具定义
// ============================================================================

export const RESEARCH_TOOL_DEFINITIONS = [
  {
    name: 'deep_research',
    description: '对指定主题进行深度互联网研究，获取最新信息',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: '研究主题',
        },
        reasoningEffort: {
          type: 'string',
          description: '研究强度：low (1-3分钟), medium (3-7分钟), high (7-15分钟)',
          enum: ['low', 'medium', 'high'],
          default: 'low',
        },
        context: {
          type: 'string',
          description: '补充背景信息',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'generate_storyboard',
    description: '根据内容生成视频分镜计划',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '视频内容/主题',
        },
        sceneCount: {
          type: 'number',
          description: '场景数量',
          default: 5,
        },
        aspectRatio: {
          type: 'string',
          description: '宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1'],
          default: '16:9',
        },
        maxDuration: {
          type: 'number',
          description: '最大时长（秒）',
          default: 120,
        },
        style: {
          type: 'string',
          description: '视频风格',
          enum: ['informative', 'narrative', 'tutorial', 'news'],
          default: 'informative',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'calculate_segments',
    description: '根据音频时长计算视频分段。考虑 Seedance 2-12s 限制，第一段固定 5s 用于文字过渡（因为 AI 视频会导致文字乱码），后续为纯动态内容',
    inputSchema: {
      type: 'object' as const,
      properties: {
        audioDuration: {
          type: 'number',
          description: '音频总时长（秒）',
        },
        firstSegmentDuration: {
          type: 'number',
          description: '第一段时长（秒），用于文字过渡',
          default: 5,
        },
        maxSegmentDuration: {
          type: 'number',
          description: 'Seedance 最大时长限制（秒）',
          default: 12,
        },
        targetSegmentDuration: {
          type: 'number',
          description: '目标分段时长（秒），质量舒适区',
          default: 8,
        },
      },
      required: ['audioDuration'],
    },
  },
  {
    name: 'generate_full_narration',
    description: '根据场景列表生成完整的解说稿，包含开场白、过渡语和总结语，保证语气连贯自然',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scenes: {
          type: 'array',
          description: '场景列表',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '场景标题' },
              description: { type: 'string', description: '场景描述/内容要点' },
              narration: { type: 'string', description: '原有解说词（可选）' },
            },
            required: ['title', 'description'],
          },
        },
        style: {
          type: 'string',
          description: '解说风格',
          enum: ['news_broadcast', 'documentary', 'tutorial'],
          default: 'news_broadcast',
        },
        title: {
          type: 'string',
          description: '视频标题',
          default: 'AI新闻速报',
        },
      },
      required: ['scenes'],
    },
  },
]
