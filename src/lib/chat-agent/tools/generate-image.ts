// 生成图片工具

import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult } from '../types';
import { generateImageSchema } from '../tool-registry';

// 图片生成 API 配置（复用现有的生图接口）
const IMAGE_GEN_API_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/generate-image`
  : '/api/generate-image';

interface ImageGenRequest {
  prompt: string;
  model?: string;
  referenceImages?: string[];
  aspectRatio?: string;
}

interface ImageGenResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

/**
 * 轮询任务状态
 */
async function pollTaskStatus(
  taskId: string,
  callbacks: ToolCallbacks,
  abortSignal: AbortSignal,
  maxWaitTime: number = 120000 // 最大等待 2 分钟
): Promise<ImageGenResponse> {
  const startTime = Date.now();
  const pollInterval = 2000; // 每 2 秒轮询一次

  while (Date.now() - startTime < maxWaitTime) {
    if (abortSignal.aborted) {
      throw new Error('用户中断');
    }

    const response = await fetch(`/api/image-task?taskId=${taskId}`, {
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`查询任务状态失败: ${response.status}`);
    }

    const result: ImageGenResponse = await response.json();

    if (result.status === 'completed') {
      return result;
    }

    if (result.status === 'failed') {
      throw new Error(result.error || '图片生成失败');
    }

    // 更新进度
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    callbacks.onProgress(`生成中... (${elapsed}s)`);

    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('图片生成超时');
}

/**
 * 生成图片工具
 */
export const generateImageTool: ChatAgentTool = {
  name: 'generate_image',
  description: `根据文字描述生成图片。

功能：
- 支持各种风格：写实、动漫、艺术等
- 支持参考图：可以基于上传的图片生成相似风格
- 支持多种比例：1:1、16:9、9:16 等

使用提示：
- 提供详细的图片描述会获得更好的效果
- 如果用户上传了参考图，可以通过 referenceImageUrl 参数传递`,

  schema: generateImageSchema,

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ): Promise<ToolResult> {
    const {
      prompt,
      style,
      referenceImageUrl,
      aspectRatio = '1:1',
    } = input as {
      prompt: string;
      style?: string;
      referenceImageUrl?: string;
      aspectRatio?: string;
    };

    callbacks.onProgress('准备生成图片...');

    // 构建提示词（根据风格调整）
    let enhancedPrompt = prompt;
    if (style) {
      const styleMap: Record<string, string> = {
        realistic: 'photorealistic, highly detailed, 8k resolution',
        anime: 'anime style, vibrant colors, detailed illustration',
        artistic: 'artistic, creative, unique style',
        photo: 'photograph, professional photography, high quality',
      };
      enhancedPrompt = `${prompt}, ${styleMap[style] || ''}`;
    }

    // 确定参考图（优先使用参数，否则使用上下文中的第一张图）
    const refImage = referenceImageUrl || context.attachedImages[0];

    try {
      callbacks.onProgress('调用图片生成 API...');

      // 创建生图任务
      const createResponse = await fetch(IMAGE_GEN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          model: 'nano-banana', // 默认模型
          referenceImages: refImage ? [refImage] : [],
          aspectRatio,
        } as ImageGenRequest),
        signal: context.abortSignal,
      });

      if (!createResponse.ok) {
        throw new Error(`创建任务失败: ${createResponse.status}`);
      }

      const createResult: ImageGenResponse = await createResponse.json();

      if (!createResult.taskId) {
        throw new Error('未获取到任务 ID');
      }

      callbacks.onProgress(`任务已创建: ${createResult.taskId}`);

      // 轮询任务状态
      const finalResult = await pollTaskStatus(
        createResult.taskId,
        callbacks,
        context.abortSignal
      );

      if (!finalResult.imageUrl) {
        throw new Error('未获取到生成的图片');
      }

      callbacks.onProgress('图片生成完成！');

      return {
        success: true,
        imageUrl: finalResult.imageUrl,
        data: {
          prompt: enhancedPrompt,
          originalPrompt: prompt,
          style,
          referenceImage: refImage,
          aspectRatio,
          imageUrl: finalResult.imageUrl,
          taskId: createResult.taskId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '图片生成失败';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

export default generateImageTool;
