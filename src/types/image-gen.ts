// Available Gemini image generation models
export const GEMINI_IMAGE_MODELS = {
  "nano-banana": "gemini-2.5-flash-image",
  "nano-banana-pro": "gemini-3-pro-image-preview",
} as const;

export type GeminiImageModel = keyof typeof GEMINI_IMAGE_MODELS;

export interface ImageGenerationConfig {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K' | '4K';
}
