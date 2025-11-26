// Sprite Sheet 动画配置
export interface SpriteConfig {
  rows: number;           // 行数
  cols: number;           // 列数
  totalFrames: number;    // 实际帧数（最后一行可能不满）
  fps: number;            // 播放速度
  scale: number;          // 导出缩放 (1, 2, 4)
  autoTransparent: boolean; // 自动透明背景
  direction: 'row' | 'column'; // 'row' = 行优先, 'column' = 列优先
}

// 图片尺寸
export interface ImageDimensions {
  width: number;
  height: number;
}

// 生成分辨率
export type ImageResolution = '1K' | '2K' | '4K';

// 生成模式
export type GenerationMode = 'replica' | 'creative';

// 生成配置
export interface GenerationConfig {
  mode: GenerationMode;
  templateImage: string | null;  // Replica 模式需要
  characterImage: string | null; // 角色参考图
  prompt: string;                // 风格提示词
  actionPrompt: string;          // Creative 模式动作描述
  size: ImageResolution;
}

// Sprite 节点数据
export interface SpriteNodeData {
  taskId?: string;
  // 生成配置
  generationConfig?: GenerationConfig;
  // Sprite Sheet 图片
  spriteSheetUrl?: string;
  // Sprite 配置
  spriteConfig?: SpriteConfig;
  // 图片尺寸
  dimensions?: ImageDimensions;
  // 状态
  isLoading?: boolean;
  isAnalyzing?: boolean;
  isGenerating?: boolean;
  error?: string;
}

// 默认 Sprite 配置
export const DEFAULT_SPRITE_CONFIG: SpriteConfig = {
  rows: 4,
  cols: 4,
  totalFrames: 16,
  fps: 6,  // 降低默认 FPS，避免动画播放过快
  scale: 1,
  autoTransparent: true,
  direction: 'row'
};

// 默认生成配置
export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  mode: 'creative',
  templateImage: null,
  characterImage: null,
  prompt: '',
  actionPrompt: '',
  size: '2K'
};
