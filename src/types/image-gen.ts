/**
 * 图片生成类型定义
 *
 * 注意：新的图片生成系统使用 @/lib/image-generation/types.ts 中的类型
 * 这里保留旧类型以保持向后兼容
 */

// ============================================================================
// 旧类型定义（保持向后兼容）
// ============================================================================

/** @deprecated 使用 IMAGE_MODELS 代替 */
export const GEMINI_IMAGE_MODELS = {
  "nano-banana": "gemini-2.5-flash-image",
  "nano-banana-pro": "gemini-3-pro-image-preview",
} as const;

/** @deprecated 使用 ImageModel 代替 */
export type GeminiImageModel = keyof typeof GEMINI_IMAGE_MODELS;

// ============================================================================
// 新类型定义
// ============================================================================

/** 所有可用的图片生成模型 */
export const IMAGE_MODELS = {
  "nano-banana": {
    adapter: "gemini",
    apiModel: "gemini-2.5-flash-image",
    label: "Gemini 快速",
    description: "快速生成，适合日常使用",
  },
  "nano-banana-pro": {
    adapter: "gemini",
    apiModel: "gemini-3-pro-image-preview",
    label: "Gemini 高级",
    description: "高质量生成，支持 Google Search 增强",
  },
  "seedream-4.5": {
    adapter: "seedream",
    apiModel: "doubao-seedream-4-5-251128",
    label: "Seedream 4.5",
    description: "字节跳动 Seedream，支持组图功能",
  },
} as const;

/** 图片生成模型 ID */
export type ImageModel = keyof typeof IMAGE_MODELS;

// ============================================================================
// 分辨率选项
// ============================================================================

export const RESOLUTION_OPTIONS = {
  '1K': { value: '1K', label: '1K', pixels: '1024×1024' },
  '2K': { value: '2K', label: '2K', pixels: '2048×2048' },
  '4K': { value: '4K', label: '4K', pixels: '4096×4096' },
} as const;

export type ImageResolution = keyof typeof RESOLUTION_OPTIONS;

// ============================================================================
// 配置类型
// ============================================================================

export interface ImageGenerationConfig {
  /** 画面比例 */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'auto';

  /** 分辨率等级 */
  imageSize?: ImageResolution;

  /** 自定义分辨率（如 "1920x1080"） */
  resolution?: string;
}
