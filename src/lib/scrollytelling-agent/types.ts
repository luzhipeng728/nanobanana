// Scrollytelling 动效网站 Agent 类型定义

// 参考图片信息（仅作参考，不直接使用）
export interface ImageInfo {
  url: string;
  prompt?: string;  // 用户提供的描述
  analysis?: string; // Claude 分析的结果
}

// Section 图片生成配置
export interface SlideImageConfig {
  prompt: string;           // 生图提示词
  aspectRatio: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';  // 图片比例
  style?: string;           // 风格说明
  generatedUrl?: string;    // 生成后的图片 URL
  taskId?: string;          // 生图任务 ID
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

// 文字动画配置
export interface TextAnimationConfig {
  element: string;          // 元素描述（如：标题、段落）
  effect: 'letter-by-letter' | 'word-by-word' | 'line-by-line' | 'fade-in' | 'slide-up' | 'typewriter' | 'gradient-reveal';
  stagger?: number;         // 错落延迟时间（秒）
}

// Section 结构（网站的全屏区块）
export interface SlidePlan {
  title: string;
  subtitle?: string;
  layout: 'hero' | 'content' | 'image-left' | 'image-right' | 'full-image' | 'two-column' | 'data' | 'cards' | 'timeline' | 'cta';
  imageConfig?: SlideImageConfig;  // 需要 AI 生成的图片配置
  keyPoints: string[];      // 关键内容点
  chartType?: 'line' | 'bar' | 'pie' | 'gauge' | 'radar';  // 图表类型
  chartData?: any;          // 图表数据
  searchQuery?: string;     // 需要搜索的查询
  searchResults?: string;   // 搜索结果
  content?: string;         // 补充内容

  // GSAP ScrollTrigger 动画配置
  scrollAnimation?: 'fade-in' | 'slide-up' | 'slide-left' | 'slide-right' | 'scale-in' | 'parallax' | 'pin' | 'stagger';
  pinSection?: boolean;     // 是否固定此 section
  scrub?: boolean;          // 动画是否与滚动同步
  backgroundColor?: string;    // 背景颜色
  backgroundGradient?: string; // 背景渐变
  textAnimations?: TextAnimationConfig[];  // 文字动画配置
  specialEffects?: string[];   // 特殊效果（counter、parallax-image、hover-card 等）

  // 兼容旧字段
  autoAnimate?: boolean;
  transition?: string;
  transitionSpeed?: string;
  fragments?: any[];
  animations?: string[];
}

// 演示文稿结构规划
export interface PresentationPlan {
  theme: string;            // 整体主题风格
  colorScheme: string[];    // 配色方案
  slides: SlidePlan[];      // 幻灯片列表
  overallNarrative: string; // 整体叙事线索
  interactionTypes: string[]; // 交互类型
  globalTransition: 'none' | 'fade' | 'slide' | 'convex' | 'concave' | 'zoom';  // 全局过渡效果
  transitions: string;      // 转场效果（向后兼容）
}

// 兼容旧接口（映射到新结构）
export interface WebStructurePlan extends PresentationPlan {
  chapters: SlidePlan[];    // 兼容旧代码
}

// 深度研究结果
export interface DeepResearchResult {
  topic: string;
  summary: string;              // 研究摘要
  keyFindings: string[];        // 关键发现
  dataPoints: string[];         // 数据点
  designSuggestions: string[];  // 设计建议
  colorRecommendations: string[]; // 配色建议
  visualStyle: string;          // 推荐视觉风格
  researchDuration: number;     // 研究耗时（秒）
}

// Agent 状态
export interface ScrollytellingAgentState {
  iteration: number;
  maxIterations: number;
  isComplete: boolean;
  images: ImageInfo[];          // 参考图片（仅供分析）
  userPrompt?: string;          // 用户提示词（无图片时必须）
  deepResearch?: DeepResearchResult;  // 深度研究结果
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
  userPrompt?: string;      // 用户提示词（无图片时必须）
  enableSearch?: boolean;   // 是否启用搜索
  maxSearchQueries?: number; // 最大搜索次数
  imageResolution?: '1k' | '2k' | '4k';  // 图片分辨率
}

// 兼容旧类型
export type ChapterPlan = SlidePlan;
