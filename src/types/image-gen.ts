// Available Gemini image generation models
export const GEMINI_IMAGE_MODELS = {
  "nano-banana": "gemini-2.5-flash-image",
  "nano-banana-pro": "gemini-3-pro-image-preview",
} as const;

export type GeminiImageModel = keyof typeof GEMINI_IMAGE_MODELS;

// Resolution options with detailed descriptions
export const RESOLUTION_OPTIONS = {
  '1K': { value: '1K', label: '1K (1024×1024)', pixels: '1024×1024' },
  '2K': { value: '2K', label: '2K (2048×2048)', pixels: '2048×2048' },
  '4K': { value: '4K', label: '4K (4096×4096)', pixels: '4096×4096' },
} as const;

export type ImageResolution = keyof typeof RESOLUTION_OPTIONS;

export interface ImageGenerationConfig {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: ImageResolution;
  resolution?: string; // Custom resolution like "1920x1080"
}
