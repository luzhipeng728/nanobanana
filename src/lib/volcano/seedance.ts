/**
 * Seedance 视频生成 API (图生视频)
 * 支持首帧和首尾帧参考
 */

import { v4 as uuidv4 } from 'uuid'
import { uploadBufferToR2 } from '../r2'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

// 默认模型（可通过参数覆盖）
const DEFAULT_MODEL = 'doubao-seedance-1-0-lite-i2v-250428'

// 可用的 Seedance 模型
export const SEEDANCE_MODELS = {
  'seedance-lite': 'doubao-seedance-1-0-lite-i2v-250428',
  'seedance-pro': 'doubao-seedance-1-0-pro-i2v-250428',
} as const

interface VideoTaskResponse {
  id: string
  status: string
  content?: {
    video_url?: string
  }
  output?: {
    video_url?: string
  }
  error?: {
    message: string
  }
}

interface ContentItem {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
  role?: 'first_frame' | 'last_frame'
}

export interface CreateVideoTaskOptions {
  /** 首帧图片 (base64 或 URL) */
  startFrame: string
  /** 尾帧图片 (base64 或 URL)，可选 */
  endFrame?: string | null
  /** 视频时长 (2-12秒) */
  duration: number
  /** 宽高比 ("16:9", "9:16", "1:1" 等) */
  aspectRatio: string
  /** 模型 ID */
  model?: string
  /** 提示词 (可选) */
  prompt?: string
}

/**
 * 创建视频生成任务
 */
export async function createVideoTask(options: CreateVideoTaskOptions): Promise<string> {
  const {
    startFrame,
    endFrame,
    duration,
    aspectRatio,
    model = DEFAULT_MODEL,
    prompt = '平滑的镜头运动，电影级过渡效果',
  } = options

  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY environment variable is required')
  }

  // 构建内容数组
  const content: ContentItem[] = [
    {
      type: 'text',
      text: prompt,
    },
    {
      type: 'image_url',
      image_url: { url: startFrame },
      role: 'first_frame',
    },
  ]

  if (endFrame) {
    content.push({
      type: 'image_url',
      image_url: { url: endFrame },
      role: 'last_frame',
    })
  }

  // Seedance duration 必须是整数，范围 2-12 秒
  const validDuration = Math.round(Math.min(12, Math.max(2, duration)))

  console.log('[Seedance] 创建任务:', {
    model,
    duration: validDuration,
    aspectRatio,
    hasEndFrame: !!endFrame,
  })

  const requestBody = {
    model,
    content,
    ratio: aspectRatio,
    duration: validDuration,
    watermark: false,
  }

  const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Seedance create task error: ${error}`)
  }

  const data: VideoTaskResponse = await response.json()
  return data.id
}

/**
 * 轮询视频任务状态
 */
export async function pollVideoTask(
  taskId: string,
  maxAttempts = 120
): Promise<{ videoUrl: string; localPath?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks/${taskId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to poll task: ${response.statusText}`)
    }

    const data: VideoTaskResponse = await response.json()

    // 处理两种可能的响应格式
    const videoUrl = data.content?.video_url || data.output?.video_url

    if (data.status === 'succeeded' && videoUrl) {
      // 下载视频并上传到 R2
      const videoResponse = await fetch(videoUrl)
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`)
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

      // 上传到 R2
      const filename = `videos/${uuidv4()}.mp4`
      const r2Url = await uploadBufferToR2(videoBuffer, filename, 'video/mp4')

      return {
        videoUrl: r2Url,
        localPath: filename,
      }
    }

    if (data.status === 'failed') {
      throw new Error(`Video generation failed: ${data.error?.message || 'Unknown error'}`)
    }

    // 等待5秒后再次轮询
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  throw new Error('Video generation timed out')
}

/**
 * 获取视频任务状态（不等待完成）
 */
export async function getVideoTaskStatus(taskId: string): Promise<{
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  videoUrl?: string
  error?: string
}> {
  const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks/${taskId}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to get task status: ${response.statusText}`)
  }

  const data: VideoTaskResponse = await response.json()
  const videoUrl = data.content?.video_url || data.output?.video_url

  return {
    status: data.status as 'pending' | 'processing' | 'succeeded' | 'failed',
    videoUrl,
    error: data.error?.message,
  }
}

/**
 * 生成视频（创建任务并等待完成）
 */
export async function generateVideo(options: CreateVideoTaskOptions): Promise<string> {
  const taskId = await createVideoTask(options)
  const result = await pollVideoTask(taskId)
  return result.videoUrl
}
