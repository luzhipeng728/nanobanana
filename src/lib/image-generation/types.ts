/**
 * 图片生成适配器 - 统一类型定义
 */

// ============ 分辨率与比例 ============

export type ImageResolution = '1K' | '2K' | '4K';
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'auto';

// ============ 模型定义 ============

export const IMAGE_MODELS = {
  'nano-banana': {
    adapter: 'gemini',
    apiModel: 'gemini-2.5-flash-image',
    label: 'Gemini 快速',
    description: '快速生成，适合日常使用',
  },
  'nano-banana-pro': {
    adapter: 'gemini',
    apiModel: 'gemini-3-pro-image-preview',
    label: 'Gemini 高级',
    description: '高质量生成，支持 Google Search',
  },
  'seedream-4.5': {
    adapter: 'seedream',
    apiModel: 'doubao-seedream-4-5-251128',
    label: 'Seedream 4.5',
    description: '字节跳动 Seedream，支持组图功能',
  },
  'glm-image': {
    adapter: 'glm',
    apiModel: 'glm-image',
    label: 'GLM 智谱',
    description: '智谱 AI，中文文字渲染能力强',
  },
} as const;

export type ImageModel = keyof typeof IMAGE_MODELS;

// ============ 模型权限分类 ============

/**
 * 基础模型 - 所有登录用户都可使用
 */
export const BASE_MODELS: ImageModel[] = ['seedream-4.5'];
// GLM 暂时隐藏，等部署环境变量配置好后再开放
// export const BASE_MODELS: ImageModel[] = ['seedream-4.5', 'glm-image'];

/**
 * 高级模型 - 需要单独授权
 */
export const PREMIUM_MODELS: ImageModel[] = ['nano-banana', 'nano-banana-pro'];

/**
 * 检查模型是否为基础模型（无需授权）
 */
export function isBaseModel(model: ImageModel): boolean {
  return BASE_MODELS.includes(model);
}

/**
 * 检查模型是否为高级模型（需要授权）
 */
export function isPremiumModel(model: ImageModel): boolean {
  return PREMIUM_MODELS.includes(model);
}

/**
 * 根据用户已授权的模型列表，返回用户可用的所有模型
 * @param grantedModels 用户被授权的高级模型 ID 列表
 */
export function getAvailableModelsForUser(grantedModels: string[]): ImageModel[] {
  // 基础模型 + 用户被授权的高级模型
  const premiumGranted = PREMIUM_MODELS.filter(m => grantedModels.includes(m));
  return [...BASE_MODELS, ...premiumGranted];
}

// ============ 输入参数 ============

export interface ImageGenerationParams {
  /** 提示词 */
  prompt: string;

  /** 模型 ID */
  model: ImageModel;

  /** 分辨率 */
  resolution?: ImageResolution;

  /** 画面比例 */
  aspectRatio?: AspectRatio;

  /** 参考图片 URL 列表 */
  referenceImages?: string[];

  /** 模型特定选项 */
  extraOptions?: ImageGenerationExtraOptions;
}

export interface ImageGenerationExtraOptions {
  // ============ Seedream 专用 ============

  /** 组图功能开关 */
  sequentialImageGeneration?: 'disabled' | 'auto';

  /** 组图配置（仅当 sequentialImageGeneration 为 'auto' 时生效） */
  sequentialImageGenerationOptions?: {
    /** 组图数量 */
    imageCount?: number;
  };

  // ============ Gemini 专用 ============

  /** 启用 Google Search（仅 Pro 模型支持） */
  enableGoogleSearch?: boolean;
}

// ============ 输出结果 ============

export interface ImageGenerationResult {
  /** 是否成功 */
  success: boolean;

  /** 生成的图片 URL（单图） */
  imageUrl?: string;

  /** 生成的图片 URL 列表（组图功能） */
  imageUrls?: string[];

  /** 错误信息 */
  error?: string;

  /** 元信息 */
  meta?: ImageGenerationMeta;
}

export interface ImageGenerationMeta {
  /** 实际使用的模型 */
  model: string;

  /** 实际生成的分辨率，如 "2048x2048" */
  actualResolution?: string;

  /** 用量统计 */
  usage?: {
    generatedImages: number;
    tokens?: number;
  };
}

// ============ 能力声明（给前端用）============

export interface AdapterCapabilities {
  /** 适配器名称 */
  name: string;

  /** 支持的模型列表 */
  models: Array<{
    id: string;
    label: string;
    description?: string;
  }>;

  /** 支持的分辨率 */
  supportedResolutions: ImageResolution[];

  /** 支持的比例 */
  supportedAspectRatios: AspectRatio[];

  /** 是否支持参考图片 */
  supportsReferenceImages: boolean;

  /** 最大参考图片数量 */
  maxReferenceImages: number;

  /** 额外选项配置（用于前端动态渲染） */
  extraOptions?: ExtraOptionConfig[];
}

export interface ExtraOptionConfig {
  /** 选项 key */
  key: string;

  /** 显示标签 */
  label: string;

  /** 输入类型 */
  type: 'boolean' | 'select' | 'number';

  /** select 类型的选项列表 */
  options?: Array<{ value: string; label: string }>;

  /** 默认值 */
  default?: unknown;

  /** 描述信息 */
  description?: string;
}

// ============ 验证结果 ============

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
