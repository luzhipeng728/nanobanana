// Reveal.js 演示文稿 Agent 类型定义

// 参考图片信息（仅作参考，不直接使用）
export interface ImageInfo {
  url: string;
  prompt?: string;  // 用户提供的描述
  analysis?: string; // Claude 分析的结果
}

// 幻灯片图片生成配置
export interface SlideImageConfig {
  prompt: string;           // 生图提示词
  aspectRatio: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';  // 图片比例
  style?: string;           // 风格说明
  generatedUrl?: string;    // 生成后的图片 URL
  taskId?: string;          // 生图任务 ID
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

// 幻灯片结构（替代原来的章节）
export interface SlidePlan {
  title: string;
  subtitle?: string;
  layout: 'title' | 'content' | 'image-left' | 'image-right' | 'full-image' | 'two-column' | 'data';
  imageConfig?: SlideImageConfig;  // 需要 AI 生成的图片配置
  keyPoints: string[];      // 关键数据点
  chartType?: 'line' | 'bar' | 'pie' | 'gauge' | 'radar';  // 推荐的图表类型
  chartData?: any;          // 图表数据
  searchQuery?: string;     // 需要搜索的查询
  searchResults?: string;   // 搜索结果
  content?: string;         // 补充内容
  animations?: string[];    // 动画效果
}

// 演示文稿结构规划
export interface PresentationPlan {
  theme: string;            // 整体主题风格
  colorScheme: string[];    // 配色方案
  slides: SlidePlan[];      // 幻灯片列表
  overallNarrative: string; // 整体叙事线索
  interactionTypes: string[]; // 交互类型
  transitions: string;      // 转场效果
}

// 兼容旧接口（映射到新结构）
export interface WebStructurePlan extends PresentationPlan {
  chapters: SlidePlan[];    // 兼容旧代码
}

// Agent 状态
export interface ScrollytellingAgentState {
  iteration: number;
  maxIterations: number;
  isComplete: boolean;
  images: ImageInfo[];          // 参考图片（仅供分析）
  structurePlan?: PresentationPlan;
  collectedMaterials: string[];
  finalPrompt?: string;
  generatedImages?: SlideImageConfig[];  // 生成的图片
}

// 工具调用结果
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// 流事件类型
export type ScrollytellingStreamEvent =
  | { type: 'start'; message: string }
  | { type: 'phase'; phase: 'preparation' | 'image_generation' | 'generation'; message: string }
  | { type: 'thinking_chunk'; iteration: number; chunk: string }
  | { type: 'thought'; iteration: number; content: string }
  | { type: 'action'; iteration: number; tool: string; input: Record<string, any> }
  | { type: 'observation'; iteration: number; result: any }
  | { type: 'image_analysis'; index: number; analysis: string }
  | { type: 'structure_planned'; plan: PresentationPlan }
  | { type: 'search_start'; query: string; chapter: number }
  | { type: 'search_result'; chapter: number; summary: string }
  | { type: 'data_generated'; chapter: number; chartType: string }
  | { type: 'prompt_ready'; promptLength: number }
  // 新增：图片生成相关事件
  | { type: 'image_gen_start'; slideIndex: number; prompt: string }
  | { type: 'image_gen_progress'; slideIndex: number; status: string }
  | { type: 'image_gen_complete'; slideIndex: number; imageUrl: string }
  | { type: 'image_gen_error'; slideIndex: number; error: string }
  | { type: 'all_images_complete'; count: number }
  // HTML 生成
  | { type: 'html_chunk'; chunk: string }
  | { type: 'complete'; htmlLength: number }
  | { type: 'error'; error: string };

// 最终输出
export interface ScrollytellingFinalOutput {
  structurePlan: PresentationPlan;
  finalPrompt: string;
  materials: {
    searchResults: string[];
    chartConfigs: any[];
  };
  generatedImages: SlideImageConfig[];  // 新增：生成的图片
}

// Agent 配置
export interface ScrollytellingAgentConfig {
  theme?: string;           // 用户指定的主题
  enableSearch?: boolean;   // 是否启用搜索
  maxSearchQueries?: number; // 最大搜索次数
  imageResolution?: '1k' | '2k' | '4k';  // 图片分辨率
}

// 兼容旧类型
export type ChapterPlan = SlidePlan;
