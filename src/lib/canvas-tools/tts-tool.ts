/**
 * TTS 语音合成工具
 *
 * 使用 Volcano TTS API
 */

import type {
  ToolResult,
  GenerateTTSParams,
  GenerateTTSResult,
} from './types'

const TTS_API_URL = 'https://openspeech.bytedance.com/api/v1/tts'

interface TTSResponse {
  code: number
  message: string
  data: string // base64 audio
  addition?: {
    duration?: string | number // 毫秒
  }
}

// ============================================================================
// TTS 生成
// ============================================================================

/**
 * 生成语音
 */
export async function generateTTS(
  params: GenerateTTSParams
): Promise<ToolResult<GenerateTTSResult>> {
  const {
    text,
    voiceType = process.env.NEXT_PUBLIC_DEFAULT_VOICE_TYPE || 'zh_female_tianmeixiaoyuan_moon_bigtts',
    speedRatio = 1.0,
    volumeRatio = 1.0,
  } = params

  if (!text?.trim()) {
    return { success: false, error: '文本不能为空' }
  }

  const accessToken = process.env.TTS_ACCESS_TOKEN
  const appId = process.env.TTS_APP_ID

  if (!accessToken || !appId) {
    return { success: false, error: 'TTS 配置缺失 (TTS_ACCESS_TOKEN, TTS_APP_ID)' }
  }

  console.log(`[TTSTool] 生成语音, 音色: ${voiceType}, 文本长度: ${text.length}`)

  try {
    const requestBody = {
      app: {
        appid: appId,
        token: accessToken,
        cluster: 'volcano_tts',
      },
      user: { uid: 'canvas-tools' },
      audio: {
        voice_type: voiceType,
        encoding: 'mp3',
        speed_ratio: speedRatio,
        volume_ratio: volumeRatio,
        pitch_ratio: 1.0,
      },
      request: {
        reqid: `tts-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        text_type: 'plain',
        operation: 'query',
        with_frontend: 1,
        frontend_type: 'unitTson',
      },
    }

    const response = await fetch(TTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `TTS API 错误: ${error}` }
    }

    const data: TTSResponse = await response.json()

    if (data.code !== 3000) {
      return { success: false, error: `TTS 错误: ${data.message} (code: ${data.code})` }
    }

    if (!data.data) {
      return { success: false, error: '未返回音频数据' }
    }

    // 计算时长
    let duration: number
    if (data.addition?.duration) {
      const durationMs = typeof data.addition.duration === 'string'
        ? parseInt(data.addition.duration, 10)
        : data.addition.duration
      duration = durationMs / 1000
    } else {
      // 估算：128kbps MP3 约 16KB/秒
      const audioBuffer = Buffer.from(data.data, 'base64')
      duration = audioBuffer.length / 16000
    }

    return {
      success: true,
      data: {
        audioUrl: `data:audio/mp3;base64,${data.data}`,
        duration,
      },
    }
  } catch (error) {
    console.error('[TTSTool] 生成失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败',
    }
  }
}

/**
 * 生成解说脚本
 *
 * 根据内容自动生成适合 TTS 的解说词
 */
export async function generateScript(params: {
  content: string
  wordCount?: number
  style?: 'informative' | 'narrative' | 'conversational'
}): Promise<ToolResult<{ script: string }>> {
  const {
    content,
    wordCount = 50,
    style = 'informative',
  } = params

  console.log(`[TTSTool] 生成脚本, 风格: ${style}, 字数: ${wordCount}`)

  try {
    const { chatWithDoubao } = await import('../volcano/doubao')

    const styleInstructions = {
      informative: '客观、专业、简洁',
      narrative: '故事性、引人入胜、有节奏',
      conversational: '口语化、亲切、自然',
    }

    const response = await chatWithDoubao([
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `根据以下内容生成解说词。

内容：${content}

要求：
1. 风格：${styleInstructions[style]}
2. 字数：约 ${wordCount} 字
3. 适合语音朗读，不要有难以发音的符号
4. 直接输出解说词，不要加标题或前缀`,
          },
        ],
      },
    ])

    return {
      success: true,
      data: { script: response.trim() },
    }
  } catch (error) {
    console.error('[TTSTool] 生成脚本失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成脚本失败',
    }
  }
}

// ============================================================================
// 工具定义
// ============================================================================

export const TTS_TOOL_DEFINITIONS = [
  {
    name: 'generate_tts',
    description: '将文本转换为语音',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: '要合成的文本',
        },
        voiceType: {
          type: 'string',
          description: '音色类型',
          default: 'zh_female_tianmeixiaoyuan_moon_bigtts',
        },
        speedRatio: {
          type: 'number',
          description: '语速 (0.5-2.0)',
          default: 1.0,
        },
        volumeRatio: {
          type: 'number',
          description: '音量 (0.5-2.0)',
          default: 1.0,
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'generate_script',
    description: '根据内容生成解说脚本',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: '要生成脚本的内容',
        },
        wordCount: {
          type: 'number',
          description: '目标字数',
          default: 50,
        },
        style: {
          type: 'string',
          description: '脚本风格',
          enum: ['informative', 'narrative', 'conversational'],
          default: 'informative',
        },
      },
      required: ['content'],
    },
  },
]
