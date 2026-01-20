/**
 * FFmpeg 工具
 *
 * 视频/音频处理操作
 */

import ffmpeg from 'fluent-ffmpeg'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import type {
  ToolResult,
  MergeVideosParams,
  AddAudioParams,
  FFmpegResult,
  VideoInfoResult,
} from './types'

// 设置 FFmpeg 路径
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg')
ffmpeg.setFfprobePath('/usr/bin/ffprobe')

// 默认输出目录
const DEFAULT_OUTPUT_DIR = '/tmp/canvas-tools-output'

// ============================================================================
// 视频操作
// ============================================================================

/**
 * 合并多个视频
 */
export async function mergeVideos(
  params: MergeVideosParams
): Promise<ToolResult<FFmpegResult>> {
  const { videoPaths, outputDir = DEFAULT_OUTPUT_DIR } = params

  if (videoPaths.length === 0) {
    return { success: false, error: '视频列表不能为空' }
  }

  console.log(`[FFmpegTool] 合并 ${videoPaths.length} 个视频`)

  try {
    await mkdir(outputDir, { recursive: true })

    const outputPath = join(outputDir, `merged-${Date.now()}.mp4`)
    const listPath = join(outputDir, `list-${Date.now()}.txt`)

    // 创建 concat 文件列表
    const listContent = videoPaths.map(p => `file '${p}'`).join('\n')
    await writeFile(listPath, listContent)

    return new Promise((resolve) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', async () => {
          try {
            await unlink(listPath)
          } catch { /* ignore */ }
          resolve({ success: true, data: { outputPath } })
        })
        .on('error', (err) => {
          resolve({ success: false, error: `FFmpeg 错误: ${err.message}` })
        })
        .run()
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '合并失败',
    }
  }
}

/**
 * 为视频添加音频
 */
export async function addAudioToVideo(
  params: AddAudioParams
): Promise<ToolResult<FFmpegResult>> {
  const { videoPath, audioPath, outputDir = DEFAULT_OUTPUT_DIR } = params

  console.log(`[FFmpegTool] 添加音频: ${audioPath} -> ${videoPath}`)

  try {
    await mkdir(outputDir, { recursive: true })

    const outputPath = join(outputDir, `with-audio-${Date.now()}.mp4`)

    return new Promise((resolve) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
        ])
        .output(outputPath)
        .on('end', () => {
          resolve({ success: true, data: { outputPath } })
        })
        .on('error', (err) => {
          resolve({ success: false, error: `FFmpeg 错误: ${err.message}` })
        })
        .run()
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '添加音频失败',
    }
  }
}

/**
 * 为视频添加音频和字幕
 */
export async function addAudioAndSubtitles(
  params: AddAudioParams & { outputDir?: string }
): Promise<ToolResult<FFmpegResult>> {
  const {
    videoPath,
    audioPath,
    script,
    audioDuration,
    outputDir = DEFAULT_OUTPUT_DIR,
  } = params

  if (!script || !audioDuration) {
    // 没有脚本，只添加音频
    return addAudioToVideo({ videoPath, audioPath })
  }

  console.log(`[FFmpegTool] 添加音频和字幕`)

  try {
    await mkdir(outputDir, { recursive: true })

    const outputPath = join(outputDir, `final-${Date.now()}.mp4`)

    // 生成字幕文件
    const subtitles = splitTextToSubtitles(script, audioDuration)
    const srtContent = generateSrtContent(subtitles)
    const srtPath = join(outputDir, `subtitle-${Date.now()}.srt`)
    await writeFile(srtPath, '\uFEFF' + srtContent, 'utf-8')

    // 字幕样式
    const subtitleFilter = `subtitles='${srtPath}':force_style='FontName=Noto Sans CJK SC,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,MarginV=30'`

    return new Promise((resolve) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .videoFilters(subtitleFilter)
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
          '-preset', 'fast',
        ])
        .output(outputPath)
        .on('end', async () => {
          try {
            await unlink(srtPath)
          } catch { /* ignore */ }
          resolve({ success: true, data: { outputPath } })
        })
        .on('error', (err) => {
          resolve({ success: false, error: `FFmpeg 错误: ${err.message}` })
        })
        .run()
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理失败',
    }
  }
}

/**
 * 获取视频信息
 */
export async function getVideoInfo(
  videoPath: string
): Promise<ToolResult<VideoInfoResult>> {
  console.log(`[FFmpegTool] 获取视频信息: ${videoPath}`)

  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        resolve({ success: false, error: err.message })
        return
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video')
      if (!videoStream) {
        resolve({ success: false, error: '未找到视频流' })
        return
      }

      resolve({
        success: true,
        data: {
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: eval(videoStream.r_frame_rate || '0'),
          codec: videoStream.codec_name || 'unknown',
        },
      })
    })
  })
}

/**
 * 获取音频时长
 */
export async function getAudioDuration(
  audioPath: string
): Promise<ToolResult<{ duration: number }>> {
  console.log(`[FFmpegTool] 获取音频时长: ${audioPath}`)

  return new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        resolve({ success: false, error: err.message })
        return
      }

      resolve({
        success: true,
        data: { duration: metadata.format.duration || 0 },
      })
    })
  })
}

/**
 * 从图片创建静态视频
 */
export async function createImageVideo(params: {
  imagePath: string
  duration: number
  outputDir?: string
}): Promise<ToolResult<FFmpegResult>> {
  const { imagePath, duration, outputDir = DEFAULT_OUTPUT_DIR } = params

  console.log(`[FFmpegTool] 从图片创建视频, 时长: ${duration}s`)

  try {
    await mkdir(outputDir, { recursive: true })

    const outputPath = join(outputDir, `image-video-${Date.now()}.mp4`)

    return new Promise((resolve) => {
      ffmpeg()
        .input(imagePath)
        .inputOptions(['-loop', '1'])
        .outputOptions([
          '-c:v', 'libx264',
          '-t', String(duration),
          '-pix_fmt', 'yuv420p',
          '-preset', 'fast',
        ])
        .output(outputPath)
        .on('end', () => {
          resolve({ success: true, data: { outputPath } })
        })
        .on('error', (err) => {
          resolve({ success: false, error: `FFmpeg 错误: ${err.message}` })
        })
        .run()
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建失败',
    }
  }
}

/**
 * 提取视频帧
 */
export async function extractFrame(params: {
  videoPath: string
  timestamp: number
  outputDir?: string
}): Promise<ToolResult<{ imagePath: string }>> {
  const { videoPath, timestamp, outputDir = DEFAULT_OUTPUT_DIR } = params

  console.log(`[FFmpegTool] 提取帧, 时间: ${timestamp}s`)

  try {
    await mkdir(outputDir, { recursive: true })

    const outputPath = join(outputDir, `frame-${Date.now()}.png`)

    return new Promise((resolve) => {
      ffmpeg()
        .input(videoPath)
        .inputOptions(['-ss', String(timestamp)])
        .outputOptions(['-vframes', '1'])
        .output(outputPath)
        .on('end', () => {
          resolve({ success: true, data: { imagePath: outputPath } })
        })
        .on('error', (err) => {
          resolve({ success: false, error: `FFmpeg 错误: ${err.message}` })
        })
        .run()
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '提取失败',
    }
  }
}

// ============================================================================
// 字幕辅助函数
// ============================================================================

interface SubtitleSegment {
  index: number
  startTime: string
  endTime: string
  text: string
}

function formatSrtTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function splitTextToSubtitles(text: string, totalDuration: number): SubtitleSegment[] {
  if (!text || totalDuration <= 0) return []

  // 按句号、问号、感叹号分割成句子（保留逗号等不分割）
  const sentenceRegex = /[。！？.!?]+/g
  const segments: string[] = []

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = sentenceRegex.exec(text)) !== null) {
    const segment = text.slice(lastIndex, match.index + match[0].length).trim()
    if (segment) {
      segments.push(segment)
    }
    lastIndex = match.index + match[0].length
  }

  const remaining = text.slice(lastIndex).trim()
  if (remaining) {
    segments.push(remaining)
  }

  if (segments.length === 0) {
    segments.push(text.trim())
  }

  // 按字数比例分配时间（而不是平均分配）
  const totalChars = segments.reduce((sum, s) => sum + s.length, 0)

  const result: SubtitleSegment[] = []
  let currentTime = 0

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    // 该句子的时长 = (字数占比) * 总时长
    const segmentDuration = (segment.length / totalChars) * totalDuration

    result.push({
      index: i + 1,
      startTime: formatSrtTime(currentTime),
      endTime: formatSrtTime(currentTime + segmentDuration),
      text: segment,
    })

    currentTime += segmentDuration
  }

  return result
}

function generateSrtContent(subtitles: SubtitleSegment[]): string {
  return subtitles
    .map(sub => `${sub.index}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}\n`)
    .join('\n')
}

// ============================================================================
// 工具定义
// ============================================================================

export const FFMPEG_TOOL_DEFINITIONS = [
  {
    name: 'merge_videos',
    description: '合并多个视频文件',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPaths: {
          type: 'array',
          description: '视频文件路径列表',
          items: { type: 'string' },
        },
        outputDir: {
          type: 'string',
          description: '输出目录',
        },
      },
      required: ['videoPaths'],
    },
  },
  {
    name: 'add_audio_to_video',
    description: '为视频添加音频轨道',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: {
          type: 'string',
          description: '视频文件路径',
        },
        audioPath: {
          type: 'string',
          description: '音频文件路径',
        },
      },
      required: ['videoPath', 'audioPath'],
    },
  },
  {
    name: 'add_audio_and_subtitles',
    description: '为视频添加音频和字幕',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: {
          type: 'string',
          description: '视频文件路径',
        },
        audioPath: {
          type: 'string',
          description: '音频文件路径',
        },
        script: {
          type: 'string',
          description: '字幕文本',
        },
        audioDuration: {
          type: 'number',
          description: '音频时长（秒）',
        },
      },
      required: ['videoPath', 'audioPath'],
    },
  },
  {
    name: 'get_video_info',
    description: '获取视频文件信息（时长、分辨率等）',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: {
          type: 'string',
          description: '视频文件路径',
        },
      },
      required: ['videoPath'],
    },
  },
  {
    name: 'get_audio_duration',
    description: '获取音频文件时长',
    inputSchema: {
      type: 'object' as const,
      properties: {
        audioPath: {
          type: 'string',
          description: '音频文件路径',
        },
      },
      required: ['audioPath'],
    },
  },
  {
    name: 'create_image_video',
    description: '从静态图片创建视频',
    inputSchema: {
      type: 'object' as const,
      properties: {
        imagePath: {
          type: 'string',
          description: '图片文件路径',
        },
        duration: {
          type: 'number',
          description: '视频时长（秒）',
        },
      },
      required: ['imagePath', 'duration'],
    },
  },
  {
    name: 'extract_frame',
    description: '从视频中提取指定时间的帧',
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: {
          type: 'string',
          description: '视频文件路径',
        },
        timestamp: {
          type: 'number',
          description: '时间戳（秒）',
        },
      },
      required: ['videoPath', 'timestamp'],
    },
  },
]
