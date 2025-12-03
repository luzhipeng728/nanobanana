// Scrollytelling Agent 类型定义

// 图片信息
export interface ImageInfo {
  url: string;
  prompt?: string;  // 用户提供的描述
  analysis?: string; // Claude 分析的结果
}

// 章节结构
export interface ChapterPlan {
  title: string;
  subtitle?: string;
  imageUrl: string;
  keyPoints: string[];      // 关键数据点
  chartType?: 'line' | 'bar' | 'pie' | 'gauge' | 'radar';  // 推荐的图表类型
  chartData?: any;          // 图表数据
  searchQuery?: string;     // 需要搜索的查询
  searchResults?: string;   // 搜索结果
  content?: string;         // 补充内容
}

// 网页结构规划
export interface WebStructurePlan {
  theme: string;            // 整体主题风格
  colorScheme: string[];    // 配色方案
  chapters: ChapterPlan[];  // 章节列表
  overallNarrative: string; // 整体叙事线索
  interactionTypes: string[]; // 交互类型
}

// Agent 状态
export interface ScrollytellingAgentState {
  iteration: number;
  maxIterations: number;
  isComplete: boolean;
  images: ImageInfo[];
  structurePlan?: WebStructurePlan;
  collectedMaterials: string[];
  finalPrompt?: string;
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
  | { type: 'phase'; phase: 'preparation' | 'generation'; message: string }
  | { type: 'thinking_chunk'; iteration: number; chunk: string }
  | { type: 'thought'; iteration: number; content: string }
  | { type: 'action'; iteration: number; tool: string; input: Record<string, any> }
  | { type: 'observation'; iteration: number; result: any }
  | { type: 'image_analysis'; index: number; analysis: string }
  | { type: 'structure_planned'; plan: WebStructurePlan }
  | { type: 'search_start'; query: string; chapter: number }
  | { type: 'search_result'; chapter: number; summary: string }
  | { type: 'data_generated'; chapter: number; chartType: string }
  | { type: 'prompt_ready'; promptLength: number }
  | { type: 'html_chunk'; chunk: string }
  | { type: 'complete'; htmlLength: number }
  | { type: 'error'; error: string };

// 最终输出
export interface ScrollytellingFinalOutput {
  structurePlan: WebStructurePlan;
  finalPrompt: string;
  materials: {
    searchResults: string[];
    chartConfigs: any[];
  };
}

// Agent 配置
export interface ScrollytellingAgentConfig {
  theme?: string;           // 用户指定的主题
  enableSearch?: boolean;   // 是否启用搜索
  maxSearchQueries?: number; // 最大搜索次数
}
