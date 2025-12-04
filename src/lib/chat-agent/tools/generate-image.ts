// 生成图片工具

import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult } from '../types';
import { generateImageSchema } from '../tool-registry';

// 获取基础 URL（服务端需要绝对 URL）
function getBaseUrl(): string {
  // 服务端：使用环境变量或默认本地地址
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';
  }
  // 客户端：使用当前 origin
  return window.location.origin;
}

// 图片生成 API 配置
const getImageGenApiUrl = () => `${getBaseUrl()}/api/generate-image`;
const getImageTaskApiUrl = (taskId: string) => `${getBaseUrl()}/api/image-task?taskId=${taskId}`;

interface ImageGenRequest {
  prompt: string;
  model?: string;
  referenceImages?: string[];
  aspectRatio?: string;
  resolution?: '1k' | '2k' | '4k';
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

    const response = await fetch(getImageTaskApiUrl(taskId), {
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
  description: `根据文字描述生成图片（使用 Gemini 3 Pro 模型）。

功能：
- 支持多种风格：realistic（逼真）、anime（动漫）、artistic（艺术）、photo（专业摄影）、cinematic（电影感）、cyberpunk（赛博朋克）、watercolor（水彩）、3d（3D渲染）、minimalist（极简）
- 支持参考图：基于上传的图片生成相似风格
- 支持多种比例：auto（自动）、1:1、16:9、9:16、4:3、3:4、3:2、2:3
- 支持多种分辨率：1k(1024px)、2k(2048px)、4k(4096px)

提示词最佳实践（来自 Gemini 官方）：
- 用完整句子描述场景，而非堆砌关键词
- 描述光线、材质、氛围等细节
- 使用摄影术语：shallow depth of field、golden hour、wide-angle shot 等
- 修图时明确说明"保持其它不变"

分辨率：默认 2k，高清场景可选 4k`,

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
      aspectRatio = 'auto',
      resolution = '2k',
    } = input as {
      prompt: string;
      style?: string;
      referenceImageUrl?: string;
      aspectRatio?: 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3';
      resolution?: '1k' | '2k' | '4k';
    };

    callbacks.onProgress('准备生成图片...');

    // 构建提示词（根据风格调整）- 基于 Gemini 最佳实践
    // 叙事化描述优于关键词堆砌，使用摄影术语控制镜头效果
    let enhancedPrompt = prompt;
    if (style) {
      const styleMap: Record<string, string> = {
        // 逼真摄影 - 强调光线、镜头、材质
        realistic: 'Photorealistic rendering with meticulous attention to detail. Shot with professional-grade camera, shallow depth of field (f/2.8), natural lighting with soft shadows. Visible textures on surfaces, ray-traced reflections, 8K resolution.',
        // 动漫风格 - 强调色彩、线条、表现力
        anime: 'Japanese anime art style with expressive character design, large emotive eyes with detailed catch lights. Vibrant saturated color palette, clean linework with subtle gradients. Studio quality cel-shading, dynamic composition.',
        // 艺术风格 - 强调创意、独特性
        artistic: 'Artistic interpretation with creative visual expression. Unique stylistic approach blending traditional and digital techniques. Thoughtful composition with intentional color harmony, gallery-quality aesthetic.',
        // 专业摄影 - 强调商业级质量
        photo: 'Professional studio photography with three-point lighting setup: key light from 45° above-left, fill light opposite, subtle rim light for subject separation. Shot on full-frame sensor with prime lens, tack-sharp focus, color-graded for commercial use.',
        // 新增：电影感
        cinematic: 'Cinematic wide-angle shot with dramatic film lighting. Anamorphic lens flare, teal and orange color grading, atmospheric haze. 2.39:1 aspect ratio feel, movie poster quality, IMAX-worthy visual impact.',
        // 新增：赛博朋克
        cyberpunk: 'Cyberpunk aesthetic with neon-drenched atmosphere. Holographic elements, rain-slicked surfaces reflecting pink and cyan lights. Blade Runner meets Ghost in the Shell visual language, futuristic dystopian mood.',
        // 新增：水彩画
        watercolor: 'Delicate watercolor painting style with visible paper texture. Soft color bleeds and wet-on-wet techniques, organic brush strokes. Artistic imperfection in edges, traditional medium authenticity.',
        // 新增：3D渲染
        '3d': 'High-quality 3D rendered scene with global illumination. Smooth subsurface scattering on organic materials, physically-based rendering (PBR). Clean geometry, Pixar-quality attention to detail.',
        // 新增：极简主义
        minimalist: 'Minimalist composition with abundant negative space. Single focal point, restrained color palette (2-3 colors maximum). Swiss design influence, clean typography if text present, zen-like simplicity.',
      };
      enhancedPrompt = `${prompt}. ${styleMap[style] || ''}`;
    }

    // 确定参考图（优先使用参数，否则使用上下文中的第一张图）
    const refImage = referenceImageUrl || context.attachedImages[0];

    try {
      callbacks.onProgress('调用图片生成 API...');

      // 创建生图任务
      const createResponse = await fetch(getImageGenApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          model: 'nano-banana-pro', // Gemini 3 pro 模型
          referenceImages: refImage ? [refImage] : [],
          aspectRatio: aspectRatio === 'auto' ? undefined : aspectRatio,
          resolution,
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
