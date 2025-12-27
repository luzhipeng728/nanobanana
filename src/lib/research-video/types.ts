/**
 * 研究视频生成系统 - 类型定义
 */

// ============ 研究相关类型 ============

/** 研究维度 */
export interface ResearchDimension {
  id: string;
  dimension: string;      // 维度名称，如 "技术突破"
  query: string;          // 深度研究的搜索查询
  priority: number;       // 优先级 1-5
  status: 'pending' | 'researching' | 'completed' | 'failed';
  result?: string;        // 研究结果
  error?: string;         // 错误信息
}

/** 研究维度生成配置 */
export interface DimensionGeneratorConfig {
  topic: string;
  maxDimensions?: number;  // 默认 3-4
}

/** 并行研究配置 */
export interface ParallelResearchConfig {
  dimensions: ResearchDimension[];
  topic: string;
  reasoningEffort?: 'low' | 'medium' | 'high';  // 研究强度
  onProgress?: (dimension: ResearchDimension, progress: number) => void;
}

/** 研究结果 */
export interface ResearchResult {
  dimensions: ResearchDimension[];
  mergedResult: string;
  totalTime: number;       // 总耗时（毫秒）
}

// ============ 脚本相关类型 ============

/** 脚本分段 */
export interface ScriptSegment {
  order: number;
  text: string;
  estimatedDuration: number;  // 基于字数估算的时长（秒）
  emotion?: 'neutral' | 'happy' | 'sad' | 'excited' | 'calm' | 'serious';
  imageHint?: string;         // 配图提示
  // v2 新增字段
  chapterTitle?: string;      // 章节标题（用于信息图显示）
  keyPoints?: string[];       // 关键要点列表
  visualStyle?: 'infographic' | 'news' | 'data' | 'story' | 'comparison';
}

/** 脚本生成配置 */
export interface ScriptGeneratorConfig {
  researchResult: string;    // 合并后的研究结果
  topic: string;
  title?: string;
}

/** 脚本生成结果 */
export interface ScriptResult {
  title: string;
  fullScript: string;
  segments: ScriptSegment[];
  estimatedDuration: number;
}

// ============ TTS 相关类型 ============

/** TTS 参数 */
export interface TTSParams {
  emotion?: string;
  pitch?: number;        // 0.8-1.2
  volume?: number;       // 0.9-1.1
}

/** TTS 生成结果 */
export interface TTSResult {
  segmentOrder: number;
  audioUrl: string;
  duration: number;      // 实际时长（秒）
  peakVolume?: number;   // 峰值音量（用于标准化）
}

/** TTS 批量生成配置 */
export interface TTSBatchConfig {
  segments: ScriptSegment[];
  speaker: string;
  speed: number;
  ttsParams?: TTSParams;       // 额外的 TTS 参数（pitch, volume 等）
  normalizeVolume?: boolean;   // 是否标准化音量
  onProgress?: (completed: number, total: number) => void;
}

// ============ 图片相关类型 ============

/** 单张图片信息（用于多图模式） */
export interface SegmentImage {
  index: number;              // 图片索引 (0, 1, 2...)
  imageUrl: string;           // 图片 URL
  prompt: string;             // 生成提示词
  durationRatio: number;      // 时长比例 (0.0 - 1.0)，所有图片的比例之和为 1
  contentSummary?: string;    // 该图片涵盖的内容摘要（用于调试）
}

/** AI 决定的图片生成计划 */
export interface ImageGenerationPlan {
  imageCount: number;         // 1-3 张图片
  images: Array<{
    contentPortion: string;   // 该图片涵盖的内容部分
    prompt: string;           // 生成提示词
    durationRatio: number;    // 时长比例
  }>;
  reasoning?: string;         // AI 决策理由
}

/** 图片分配结果 */
export interface ImageAllocation {
  segmentOrder: number;
  imageCount: number;         // 该段需要几张图
  imageDurations: number[];   // 每张图的展示时长
}

/** 配图提示词生成配置 */
export interface ImagePromptConfig {
  segment: ScriptSegment;
  audioDuration: number;
  previousPrompt?: string;    // 上一张图片的提示词（保持连贯）
  style?: string;             // 整体风格
  aspectRatio?: string;       // 画面比例
}

/** 配图生成结果（支持多图） */
export interface ImageResult {
  segmentOrder: number;
  imageUrl: string;
  prompt: string;
  // 多图模式新增字段
  images?: SegmentImage[];     // 多图时的完整信息
}

/** 图片批量生成配置 */
export interface ImageBatchConfig {
  segments: ScriptSegment[];
  ttsResults: TTSResult[];
  imageModel: string;
  aspectRatio: string;
  style?: string;
  onProgress?: (completed: number, total: number) => void;
}

// ============ 视频合成相关类型 ============

/** 视频合成片段（支持多图） */
export interface VideoSegmentData {
  order: number;
  text: string;
  audioUrl: string;
  audioDuration: number;
  imageUrl: string;              // 主图（兼容旧模式）
  // 多图模式
  images?: Array<{
    imageUrl: string;
    durationRatio: number;       // 该图片占音频时长的比例
  }>;
}

/** 视频合成配置 */
export interface VideoComposeConfig {
  projectId: string;
  segments: VideoSegmentData[];
  aspectRatio: string;
  onProgress?: (progress: number, message: string) => void;
}

/** 视频合成结果 */
export interface VideoComposeResult {
  videoUrl: string;
  duration: number;
  coverUrl?: string;
}

// ============ SSE 事件类型 ============

export type ResearchVideoEventType =
  | 'project_created'
  | 'dimensions_generating'
  | 'dimensions_generated'
  | 'research_start'
  | 'research_dimension_start'
  | 'research_dimension_progress'
  | 'research_dimension_complete'
  | 'research_complete'
  | 'content_filter_start'
  | 'content_filter_chunk'
  | 'content_filter_progress'
  | 'content_filter_complete'
  | 'script_start'
  | 'script_progress'
  | 'script_chunk'
  | 'script_complete'
  | 'tts_start'
  | 'tts_progress'
  | 'tts_segment_complete'
  | 'tts_complete'
  | 'images_start'
  | 'images_progress'
  | 'images_segment_complete'
  | 'images_complete'
  | 'compose_start'
  | 'compose_progress'
  | 'compose_complete'
  | 'complete'
  | 'error'
  | 'heartbeat';

export interface ResearchVideoEvent {
  type: ResearchVideoEventType;
  data?: any;
  progress?: number;       // 0-100
  message?: string;
  timestamp?: number;
}

// ============ 项目状态类型 ============

export type ProjectStatus =
  | 'draft'
  | 'researching'
  | 'scripting'
  | 'generating_tts'
  | 'generating_images'
  | 'ready_for_edit'
  | 'composing'
  | 'completed'
  | 'failed';

/** 项目配置 */
export interface ProjectConfig {
  topic: string;
  speaker: string;
  speed: number;
  imageModel: string;
  aspectRatio: string;
}

// ============ 常量 ============

/** 中文平均语速（字/秒） */
export const CHARS_PER_SECOND = 4.5;

/** 估算文本时长 */
export function estimateDuration(text: string): number {
  return text.length / CHARS_PER_SECOND;
}

/** 根据时长分配图片数量 */
export function allocateImageCount(audioDuration: number): number {
  if (audioDuration <= 5) return 1;
  return Math.ceil(audioDuration / 4);
}
