/**
 * Canvas Tools - 统一类型定义
 *
 * 为 Claude Agent SDK 和 MCP Server 提供标准化的工具接口
 */

// ============================================================================
// 通用类型
// ============================================================================

export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  /** 任务 ID（用于异步任务） */
  taskId?: string
}

export type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1' | '3:2' | '2:3'

// ============================================================================
// 图片生成
// ============================================================================

/** 支持的图片生成模型 */
export type ImageModel =
  | 'nano-banana'           // Gemini 基础版
  | 'nano-banana-pro'       // Gemini Pro
  | 'seedream-4.5'          // 字节跳动 Seedream

export interface GenerateImageParams {
  /** 提示词 */
  prompt: string
  /** 模型 ID */
  model: ImageModel
  /** 分辨率 */
  resolution?: '1K' | '2K' | '4K'
  /** 宽高比 */
  aspectRatio?: AspectRatio
  /** 参考图片（用于图生图） */
  referenceImages?: string[]
  /** 图生图强度 (0-1)，越低越接近原图 */
  strength?: number
  /** 负面提示词 */
  negativePrompt?: string
}

export interface GenerateImageResult {
  /** 生成的图片 URL 或 base64 */
  imageUrl: string
  /** 使用的模型 */
  model: string
  /** 实际分辨率 */
  resolution: string
}

// ============================================================================
// 视频生成
// ============================================================================

/** 支持的视频生成模型 */
export type VideoModel =
  | 'seedance-lite'         // 快速生成（1.0 版本）
  | 'seedance-pro'          // 高质量（1.0 版本）
  | 'seedance-1.5-pro'      // 最新版，支持音视频同步
  | 'seedance-1.5-pro-silent'  // 1.5 Pro 无音频版本，价格减半

export interface GenerateVideoParams {
  /** 首帧图片（base64 或 URL） */
  startFrame: string
  /** 尾帧图片（可选） */
  endFrame?: string
  /** 视频时长（2-12 秒） */
  duration: number
  /** 宽高比 */
  aspectRatio: AspectRatio
  /** 模型 */
  model?: VideoModel
  /** 提示词（描述运动效果） */
  prompt?: string
  /** 是否生成音频（仅 Seedance 1.5 Pro 支持，默认 true） */
  withAudio?: boolean
}

export interface GenerateVideoResult {
  /** 视频 URL */
  videoUrl: string
  /** 任务 ID */
  taskId: string
  /** 视频时长 */
  duration: number
}

// ============================================================================
// TTS 语音合成
// ============================================================================

export interface GenerateTTSParams {
  /** 要合成的文本 */
  text: string
  /** 音色类型 */
  voiceType?: string
  /** 语速 (0.5-2.0) */
  speedRatio?: number
  /** 音量 (0.5-2.0) */
  volumeRatio?: number
}

export interface GenerateTTSResult {
  /** 音频 URL 或 base64 */
  audioUrl: string
  /** 音频时长（秒） */
  duration: number
}

// ============================================================================
// FFmpeg 操作
// ============================================================================

export interface MergeVideosParams {
  /** 视频文件路径/URL 列表 */
  videoPaths: string[]
  /** 输出目录 */
  outputDir?: string
}

export interface AddAudioParams {
  /** 视频路径 */
  videoPath: string
  /** 音频路径 */
  audioPath: string
  /** 解说脚本（用于字幕） */
  script?: string
  /** 音频时长 */
  audioDuration?: number
  /** 输出目录 */
  outputDir?: string
}

export interface FFmpegResult {
  /** 输出文件路径 */
  outputPath: string
}

export interface VideoInfoResult {
  /** 视频时长（秒） */
  duration: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
  /** 帧率 */
  fps: number
  /** 编码格式 */
  codec: string
}

// ============================================================================
// 图片分析
// ============================================================================

export interface AnalyzeImageParams {
  /** 图片（base64 或 URL） */
  image: string
  /** 分析提示词 */
  prompt?: string
  /** 分析重点 */
  focus?: Array<'quality' | 'content' | 'style' | 'text' | 'composition' | 'layout' | 'garbled'>
  /** 使用的模型 */
  model?: 'claude' | 'gemini' | 'doubao'
  /** 预期的图片描述（用于对比检查） */
  expectedDescription?: string
  /** 是否为图文并茂的信息图 */
  isInfoGraphic?: boolean
}

export interface AnalyzeImageResult {
  /** 分析结果描述 */
  description: string
  /** 质量评分 (0-100) */
  qualityScore?: number
  /** 检测到的问题 */
  issues?: string[]
  /** 改进建议 */
  suggestions?: string[]
  /** 提取的文字 */
  extractedText?: string[]
  /** 是否通过检查 */
  passed?: boolean
  /** 布局是否正常 */
  layoutOk?: boolean
  /** 是否有乱码 */
  hasGarbledText?: boolean
  /** 乱码区域描述 */
  garbledAreas?: string[]
  /** 布局问题描述 */
  layoutIssues?: string[]
  /** 重新生成的建议提示词 */
  retryPrompt?: string
}

// ============================================================================
// 视频分析
// ============================================================================

export interface AnalyzeVideoParams {
  /** 视频路径或 URL */
  videoPath: string
  /** 分析提示词 */
  prompt?: string
  /** 检查点 */
  checkPoints?: string[]
  /** 使用的模型 */
  model?: 'gemini'
  /** 预期场景描述 */
  sceneDescription?: string
  /** 预期动作 */
  expectedAction?: string
}

export interface AnalyzeVideoResult {
  /** 分析结果描述 */
  description: string
  /** 是否通过检查 */
  passed: boolean
  /** 检测到的问题 */
  issues?: string[]
  /** 时间戳标注的问题 */
  timestampedIssues?: Array<{
    timestamp: number
    description: string
  }>
  /** 改进建议 */
  suggestions?: string[]
  /** 视觉质量评分 (1-10) */
  visualQuality?: number
  /** 动作自然度评分 (1-10) */
  motionNaturalness?: number
  /** 场景一致性评分 (1-10) */
  sceneCoherence?: number
  /** 总体评分 (1-10) */
  overallScore?: number
  /** 建议操作 */
  recommendation?: 'approve' | 'retry' | 'continue'
  /** 重试时的调整提示词 */
  retryPromptAdjustment?: string
}

// ============================================================================
// Deep Research
// ============================================================================

export interface DeepResearchParams {
  /** 研究主题 */
  topic: string
  /** 研究强度 */
  reasoningEffort?: 'low' | 'medium' | 'high'
  /** 补充上下文 */
  context?: string
}

export interface DeepResearchResult {
  /** 研究报告 */
  report: string
  /** 引用来源 */
  sources: Array<{
    title: string
    url: string
    snippet?: string
  }>
  /** 关键发现 */
  keyFindings?: string[]
}

// ============================================================================
// 分镜生成
// ============================================================================

export interface StoryboardScene {
  /** 场景 ID */
  id: string
  /** 顺序 */
  order: number
  /** 场景描述 */
  description: string
  /** 图片生成提示词 */
  imagePrompt: string
  /** 解说词 */
  narration: string
  /** 预估时长（秒） */
  duration: number
}

export interface GenerateStoryboardParams {
  /** 内容/主题 */
  content: string
  /** 场景数量 */
  sceneCount?: number
  /** 宽高比 */
  aspectRatio?: AspectRatio
  /** 总时长限制（秒） */
  maxDuration?: number
  /** 风格 */
  style?: 'informative' | 'narrative' | 'tutorial' | 'news'
}

export interface GenerateStoryboardResult {
  /** 标题 */
  title: string
  /** 总时长 */
  totalDuration: number
  /** 场景列表 */
  scenes: StoryboardScene[]
}

// ============================================================================
// 工具定义（用于 MCP/Claude Agent SDK）
// ============================================================================

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
      items?: { type: string }
      default?: unknown
    }>
    required: string[]
  }
}
