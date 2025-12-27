/**
 * 故事视频智能体 - 类型定义
 */

// ============================================================================
// 内容类型
// ============================================================================

export type ContentType = 'children_book' | 'poetry' | 'science' | 'fairy_tale';

export interface ContentTypeConfig {
  label: string;
  artStyleHint: string;
  structureHint: string;
  defaultAspectRatio: '16:9' | '9:16';
}

export const CONTENT_TYPE_CONFIGS: Record<ContentType, ContentTypeConfig> = {
  children_book: {
    label: '儿童绘本',
    artStyleHint: 'watercolor children\'s book illustration, soft colors, cute characters',
    structureHint: '起承转合结构，6-12个场景',
    defaultAspectRatio: '16:9',
  },
  poetry: {
    label: '古诗解说',
    artStyleHint: 'traditional Chinese ink painting, elegant and poetic atmosphere',
    structureHint: '按诗句划分场景，配合意境画面',
    defaultAspectRatio: '16:9',
  },
  science: {
    label: '科普动画',
    artStyleHint: 'modern flat illustration, infographic style, educational',
    structureHint: '按知识点划分，配合图表动画',
    defaultAspectRatio: '16:9',
  },
  fairy_tale: {
    label: '童话故事',
    artStyleHint: 'fantasy illustration, magical atmosphere, detailed backgrounds',
    structureHint: '戏剧冲突结构，多角色互动',
    defaultAspectRatio: '16:9',
  },
};

// ============================================================================
// Sora2 视频模型
// ============================================================================

export type Sora2Model =
  | 'sora2-portrait'      // 10秒竖屏
  | 'sora2-portrait-15s'  // 15秒竖屏
  | 'sora2-landscape'     // 10秒横屏
  | 'sora2-landscape-15s'; // 15秒横屏

export interface Sora2ModelInfo {
  id: Sora2Model;
  duration: 10 | 15;
  orientation: 'portrait' | 'landscape';
  label: string;
}

export const SORA2_MODELS: Record<Sora2Model, Sora2ModelInfo> = {
  'sora2-portrait': {
    id: 'sora2-portrait',
    duration: 10,
    orientation: 'portrait',
    label: '竖屏 10秒',
  },
  'sora2-portrait-15s': {
    id: 'sora2-portrait-15s',
    duration: 15,
    orientation: 'portrait',
    label: '竖屏 15秒',
  },
  'sora2-landscape': {
    id: 'sora2-landscape',
    duration: 10,
    orientation: 'landscape',
    label: '横屏 10秒',
  },
  'sora2-landscape-15s': {
    id: 'sora2-landscape-15s',
    duration: 15,
    orientation: 'landscape',
    label: '横屏 15秒',
  },
};

// ============================================================================
// 分镜脚本
// ============================================================================

export interface StoryboardScene {
  order: number;
  description: string;           // 场景画面描述
  expectedAction: string;        // 预期动作
  characters: string[];          // 出场角色
  duration: 10 | 15;            // AI决定的时长
  orientation: 'portrait' | 'landscape';
  narration?: string;           // 配音文字 (15s≈45字, 10s≈28字)
  displayText?: string;         // 显示在画面上的文字
  transitionFrom?: string;      // 从前一场景过渡
  transitionTo?: string;        // 到下一场景过渡
  soundEffects?: string[];      // 音效建议
  cameraMovement?: string;      // 运镜建议
  mood?: string;                // 氛围 (epic, romantic, mysterious, etc.)
  lighting?: string;            // 灯光 (natural, golden hour, dramatic, etc.)
}

export interface CharacterReference {
  name: string;
  description: string;          // 角色特征描述
  firstAppearance: number;      // 首次出场场景
}

export interface Storyboard {
  title: string;
  totalDuration: number;        // 预计总时长（秒）
  sceneCount: number;
  scenes: StoryboardScene[];
  characters: CharacterReference[];
  artStyle: string;             // 统一画风描述
  bgmSuggestion?: string;       // 背景音乐建议
}

// ============================================================================
// 视频片段
// ============================================================================

export interface VideoSegment {
  id: string;
  order: number;
  inputFrame: string;           // 输入帧URL
  prompt: string;               // 视频生成提示词
  model: Sora2Model;
  videoUrl?: string;            // 生成的视频URL
  lastFrame?: string;           // 尾帧URL
  duration?: number;            // 实际时长
  status: 'pending' | 'generating' | 'evaluating' | 'approved' | 'failed';
  taskId?: string;              // Sora2任务ID
  evaluation?: VideoEvaluation;
}

export interface VideoEvaluation {
  visualQuality: number;        // 画面质量 1-10
  characterConsistency: number; // 角色一致性 1-10
  motionNaturalness: number;    // 动作自然度 1-10
  actionCompletion: 'complete' | 'partial' | 'incomplete';
  sceneCoherence: number;       // 场景连贯性 1-10
  overallScore: number;         // 综合评分 1-10
  issues: string[];             // 发现的问题
  recommendation: 'approve' | 'continue' | 'retry';
  continuationPrompt?: string;  // 续接提示词（如果需要续接）
  retryPromptAdjustment?: string; // 重试时的提示词调整建议
  reasoning: string;            // 评估理由
}

// ============================================================================
// 项目状态
// ============================================================================

export type ProjectStatus =
  | 'draft'
  | 'planning'
  | 'generating_frames'
  | 'generating_videos'
  | 'evaluating'
  | 'composing'
  | 'completed'
  | 'failed';

export type SceneStatus =
  | 'pending'
  | 'generating_frame'
  | 'generating_video'
  | 'evaluating'
  | 'approved'
  | 'failed';

// ============================================================================
// 生成配置
// ============================================================================

export interface StoryVideoConfig {
  contentType: ContentType;
  artStyle: string;
  aspectRatio: '16:9' | '9:16';
  qualityMode: 'economy' | 'standard' | 'high_quality';
  voiceId?: string;
  bgmStyle?: string;
  maxScenesPerVideo: number;    // 单个场景最大续接次数
  qualityThreshold: number;     // 质量通过阈值
  maxRetries: number;           // 单场景最大重试次数
}

export const DEFAULT_CONFIG: StoryVideoConfig = {
  contentType: 'children_book',
  artStyle: 'watercolor children\'s book illustration, soft colors, cute characters',
  aspectRatio: '16:9',
  qualityMode: 'standard',
  maxScenesPerVideo: 3,         // 最多续接3次 = 45秒
  qualityThreshold: 7,          // 评分7分以上通过
  maxRetries: 3,
};

// ============================================================================
// SSE 事件类型
// ============================================================================

export type StoryVideoEventType =
  | 'project_created'
  | 'planning_start'
  | 'planning_progress'
  | 'planning_complete'
  | 'scene_frame_start'
  | 'scene_frame_complete'
  | 'scene_video_start'
  | 'scene_video_progress'
  | 'scene_video_complete'
  | 'scene_evaluation_start'
  | 'scene_evaluation_complete'
  | 'scene_retry'
  | 'scene_continue'
  | 'scene_approved'
  | 'composing_start'
  | 'composing_progress'
  | 'composing_complete'
  | 'project_complete'
  | 'error'
  | 'log';

export interface StoryVideoEvent {
  type: StoryVideoEventType;
  data?: any;
  message?: string;
  timestamp: number;
}

// ============================================================================
// API 响应
// ============================================================================

export interface Sora2CreateResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  created_at: number;
  size?: string;
}

export interface Sora2StatusResponse extends Sora2CreateResponse {
  error?: {
    message: string;
    type: string;
    code: string;
  };
}
