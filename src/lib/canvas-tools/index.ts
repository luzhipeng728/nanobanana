/**
 * Canvas Tools - 统一工具库
 *
 * 为 Claude Agent SDK 提供的工具集合
 * 支持图片生成、视频生成、TTS、FFmpeg、Deep Research 等功能
 */

// ============================================================================
// 类型导出
// ============================================================================

export * from './types'

// ============================================================================
// 工具函数导出
// ============================================================================

// 图片工具
export {
  generateImage,
  generateImagesBatch,
  extendImage,
  compressImage,
  analyzeImage,
  analyzeImagesBatch,
  IMAGE_TOOL_DEFINITIONS,
  type BatchGenerateImageParams,
  type BatchGenerateImageResult,
  type BatchAnalyzeImageParams,
  type BatchAnalyzeImageResult,
} from './image-tool'

// 视频工具
export {
  createVideoGenerationTask,
  getVideoTaskProgress,
  generateVideo,
  generateVideosBatch,
  analyzeVideo,
  analyzeVideosBatch,
  VIDEO_TOOL_DEFINITIONS,
  type BatchGenerateVideoParams,
  type BatchGenerateVideoResult,
  type BatchAnalyzeVideoParams,
  type BatchAnalyzeVideoResult,
} from './video-tool'

// TTS 工具
export {
  generateTTS,
  generateScript,
  TTS_TOOL_DEFINITIONS,
} from './tts-tool'

// FFmpeg 工具
export {
  mergeVideos,
  addAudioToVideo,
  addAudioAndSubtitles,
  getVideoInfo,
  getAudioDuration,
  createImageVideo,
  extractFrame,
  FFMPEG_TOOL_DEFINITIONS,
} from './ffmpeg-tool'

// 研究工具
export {
  deepResearch,
  generateStoryboard,
  calculateSegments,
  generateFullNarration,
  RESEARCH_TOOL_DEFINITIONS,
  type VideoSegment,
  type GenerateNarrationParams,
  type GenerateNarrationResult,
} from './research-tool'

// ============================================================================
// 统一工具定义（用于 MCP / Claude Agent SDK）
// ============================================================================

import { IMAGE_TOOL_DEFINITIONS } from './image-tool'
import { VIDEO_TOOL_DEFINITIONS } from './video-tool'
import { TTS_TOOL_DEFINITIONS } from './tts-tool'
import { FFMPEG_TOOL_DEFINITIONS } from './ffmpeg-tool'
import { RESEARCH_TOOL_DEFINITIONS } from './research-tool'

/**
 * 所有工具定义
 */
export const ALL_TOOL_DEFINITIONS = [
  ...IMAGE_TOOL_DEFINITIONS,
  ...VIDEO_TOOL_DEFINITIONS,
  ...TTS_TOOL_DEFINITIONS,
  ...FFMPEG_TOOL_DEFINITIONS,
  ...RESEARCH_TOOL_DEFINITIONS,
]

// ============================================================================
// 工具执行器
// ============================================================================

import { generateImage, generateImagesBatch, extendImage, compressImage, analyzeImage, analyzeImagesBatch } from './image-tool'
import { createVideoGenerationTask, getVideoTaskProgress, generateVideo, generateVideosBatch, analyzeVideo, analyzeVideosBatch } from './video-tool'
import { generateTTS, generateScript } from './tts-tool'
import { mergeVideos, addAudioToVideo, addAudioAndSubtitles, getVideoInfo, getAudioDuration, createImageVideo, extractFrame } from './ffmpeg-tool'
import { deepResearch, generateStoryboard, calculateSegments, generateFullNarration } from './research-tool'
import type { ToolResult } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolExecutor = (params: any) => Promise<ToolResult>

/**
 * 工具执行器映射
 */
const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // 图片工具
  generate_image: generateImage,
  generate_images_batch: generateImagesBatch,
  extend_image: extendImage,
  compress_image: compressImage,
  analyze_image: analyzeImage,
  analyze_images_batch: analyzeImagesBatch,

  // 视频工具
  generate_video: generateVideo,
  generate_videos_batch: generateVideosBatch,
  create_video_task: createVideoGenerationTask,
  get_video_task_status: (params) => getVideoTaskProgress(params.taskId as string),
  analyze_video: analyzeVideo,
  analyze_videos_batch: analyzeVideosBatch,

  // TTS 工具
  generate_tts: generateTTS,
  generate_script: generateScript,

  // FFmpeg 工具
  merge_videos: mergeVideos,
  add_audio_to_video: addAudioToVideo,
  add_audio_and_subtitles: addAudioAndSubtitles,
  get_video_info: (params) => getVideoInfo(params.videoPath as string),
  get_audio_duration: (params) => getAudioDuration(params.audioPath as string),
  create_image_video: createImageVideo,
  extract_frame: extractFrame,

  // 研究工具
  deep_research: deepResearch,
  generate_storyboard: generateStoryboard,
  calculate_segments: (params) => Promise.resolve(calculateSegments(params as {
    audioDuration: number
    firstSegmentDuration?: number
    maxSegmentDuration?: number
    targetSegmentDuration?: number
  })),
  generate_full_narration: generateFullNarration,
}

/**
 * 执行工具
 *
 * @param toolName 工具名称
 * @param params 工具参数
 * @returns 工具结果
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[toolName]

  if (!executor) {
    return {
      success: false,
      error: `未知工具: ${toolName}`,
    }
  }

  try {
    return await executor(params)
  } catch (error) {
    console.error(`[CanvasTools] 执行工具 ${toolName} 失败:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '工具执行失败',
    }
  }
}

/**
 * 获取工具定义
 *
 * @param toolName 工具名称（可选，不传返回所有）
 */
export function getToolDefinition(toolName?: string) {
  if (!toolName) {
    return ALL_TOOL_DEFINITIONS
  }

  return ALL_TOOL_DEFINITIONS.find((def) => def.name === toolName)
}

/**
 * 检查工具是否存在
 */
export function hasToolExecutor(toolName: string): boolean {
  return toolName in TOOL_EXECUTORS
}
