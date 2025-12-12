"use server";

/**
 * 图片生成 Server Actions
 *
 * 这是兼容层，调用新的图片生成适配器系统
 * 保留原有的 generateImageAction 和 rewritePrompt 接口
 */

import OpenAI from "openai";
import { generateImage } from "@/lib/image-generation";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";
import type { ImageModel, ImageResolution, AspectRatio } from "@/lib/image-generation/types";

// OpenAI Client for Prompt Rewriting
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

/**
 * 使用 AI 优化提示词
 */
export async function rewritePrompt(prompt: string) {
  if (!process.env.OPENAI_API_KEY) {
    return prompt + " (OpenAI Key Missing)";
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "zai-glm-4.6",
      messages: [
        {
          role: "system",
          content: "You are an expert AI art prompt engineer. Rewrite the user's prompt to be more descriptive, artistic, and suitable for a high-quality image generation model. Keep it under 100 words. Return only the rewritten prompt."
        },
        { role: "user", content: prompt }
      ],
    });

    return response.choices[0]?.message?.content || prompt;
  } catch (error) {
    console.error("OpenAI Rewrite Error:", error);
    return prompt;
  }
}

/**
 * 生成图片 - 兼容层
 *
 * 保持原有接口不变，内部调用新的适配器系统
 *
 * @param prompt 提示词
 * @param model 模型 ID（nano-banana, nano-banana-pro, seedream-4.5）
 * @param configOptions 配置选项
 * @param referenceImages 参考图片 URL 列表
 */
export async function generateImageAction(
  prompt: string,
  model: GeminiImageModel | ImageModel = "nano-banana-pro",
  configOptions: ImageGenerationConfig = {},
  referenceImages: string[] = []
): Promise<{
  success: boolean;
  imageUrl?: string;
  error?: string;
  prompt?: string;
  model?: string;
}> {
  console.log(`[generateImageAction] 开始生成，模型: ${model}`);

  // 转换参数格式
  const result = await generateImage({
    prompt,
    model: model as ImageModel,
    resolution: configOptions.imageSize as ImageResolution,
    aspectRatio: configOptions.aspectRatio as AspectRatio,
    referenceImages,
  });

  // 转换返回格式以保持兼容
  return {
    success: result.success,
    imageUrl: result.imageUrl,
    error: result.error,
    prompt: prompt,
    model: result.meta?.model || model,
  };
}
