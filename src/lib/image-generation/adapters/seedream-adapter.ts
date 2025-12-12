/**
 * Seedream 4.5 图片生成适配器
 *
 * 字节跳动豆包 Seedream 图片生成模型
 * API 文档：https://www.volcengine.com/docs/82379/1399664
 */

import { ImageGenerationAdapter, type AdapterCapabilitiesConfig } from '../base-adapter';
import type {
  ImageGenerationParams,
  ImageGenerationResult,
  ValidationResult,
} from '../types';
import { getSeedreamSize } from '../utils/resolution-mapper';
import { uploadBufferToR2 } from '@/lib/r2';

// Seedream API 配置
const SEEDREAM_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const SEEDREAM_MODEL_ID = 'doubao-seedream-4-5-251128';

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 180000; // 3 分钟

/**
 * Seedream API 响应类型
 */
interface SeedreamResponse {
  model: string;
  created: number;
  data: Array<{
    url: string;
    size: string;
  }>;
  usage: {
    generated_images: number;
    output_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
    param?: string;
    type?: string;
  };
}

/**
 * Seedream 4.5 适配器
 */
export class SeedreamAdapter extends ImageGenerationAdapter {
  readonly name = 'seedream';
  readonly models = ['seedream-4.5'];

  readonly capabilities: AdapterCapabilitiesConfig = {
    supportedResolutions: ['1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportsReferenceImages: false, // Seedream 不支持参考图
    maxReferenceImages: 0,
    extraOptions: [
      {
        key: 'sequentialImageGeneration',
        label: '组图功能',
        type: 'select',
        options: [
          { value: 'disabled', label: '关闭' },
          { value: 'auto', label: '自动' },
        ],
        default: 'disabled',
        description: '生成一组相关联的图片',
      },
    ],
  };

  /**
   * 参数验证 - 覆盖基类方法，添加 Seedream 特定验证
   */
  override validateParams(params: ImageGenerationParams): ValidationResult {
    // 先调用基类验证
    const baseResult = super.validateParams(params);
    if (!baseResult.valid) {
      return baseResult;
    }

    // Seedream 不支持参考图片
    if (params.referenceImages && params.referenceImages.length > 0) {
      return {
        valid: false,
        error: 'Seedream 模型不支持参考图片，请移除参考图片或选择其他模型',
      };
    }

    return { valid: true };
  }

  /**
   * 生成图片
   */
  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const apiKey = process.env.SEEDREAM_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: 'SEEDREAM_API_KEY 未配置',
      };
    }

    // 计算实际尺寸
    const size = getSeedreamSize(params.resolution || '2K', params.aspectRatio || '1:1');

    console.log(`[Seedream] 开始生成图片`);
    console.log(`[Seedream] 分辨率: ${params.resolution || '2K'}, 比例: ${params.aspectRatio || '1:1'}, 实际尺寸: ${size}`);
    console.log(`[Seedream] 提示词: ${params.prompt.substring(0, 100)}...`);

    try {
      // 构建请求体
      const requestBody: Record<string, unknown> = {
        model: SEEDREAM_MODEL_ID,
        prompt: params.prompt,
        size,
        response_format: 'url',
        stream: false,
        watermark: false,
      };

      // 组图功能
      const sequentialMode = params.extraOptions?.sequentialImageGeneration || 'disabled';
      requestBody.sequential_image_generation = sequentialMode;

      if (sequentialMode === 'auto' && params.extraOptions?.sequentialImageGenerationOptions) {
        requestBody.sequential_image_generation_options = params.extraOptions.sequentialImageGenerationOptions;
      }

      // 设置超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      const response = await fetch(SEEDREAM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 解析响应
      const data: SeedreamResponse = await response.json();

      // 检查错误
      if (data.error) {
        console.error(`[Seedream] API 错误:`, data.error);
        return {
          success: false,
          error: `Seedream API 错误: ${data.error.message}`,
        };
      }

      if (!response.ok) {
        console.error(`[Seedream] HTTP 错误: ${response.status}`);
        return {
          success: false,
          error: `Seedream API HTTP 错误: ${response.status}`,
        };
      }

      // 检查数据
      if (!data.data || data.data.length === 0) {
        console.error(`[Seedream] 响应中没有图片数据`);
        return {
          success: false,
          error: 'Seedream API 返回空数据',
        };
      }

      console.log(`[Seedream] API 返回 ${data.data.length} 张图片`);

      // 下载图片并上传到 R2
      const uploadedUrls: string[] = [];

      for (let i = 0; i < data.data.length; i++) {
        const imageData = data.data[i];
        console.log(`[Seedream] 处理图片 ${i + 1}/${data.data.length}, 原始尺寸: ${imageData.size}`);

        try {
          // 下载图片
          const imageResponse = await fetch(imageData.url);
          if (!imageResponse.ok) {
            console.error(`[Seedream] 下载图片失败: ${imageResponse.status}`);
            continue;
          }

          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

          console.log(`[Seedream] 图片大小: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);

          // 上传到 R2
          const r2Url = await uploadBufferToR2(imageBuffer, mimeType);
          uploadedUrls.push(r2Url);

          console.log(`[Seedream] 图片 ${i + 1} 上传成功: ${r2Url}`);
        } catch (uploadError) {
          console.error(`[Seedream] 上传图片 ${i + 1} 失败:`, uploadError);
        }
      }

      if (uploadedUrls.length === 0) {
        return {
          success: false,
          error: '所有图片上传失败',
        };
      }

      console.log(`[Seedream] 生成完成，共 ${uploadedUrls.length} 张图片`);

      return {
        success: true,
        imageUrl: uploadedUrls[0],
        imageUrls: uploadedUrls.length > 1 ? uploadedUrls : undefined,
        meta: {
          model: `seedream/${SEEDREAM_MODEL_ID}`,
          actualResolution: data.data[0]?.size,
          usage: {
            generatedImages: data.usage.generated_images,
            tokens: data.usage.total_tokens,
          },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';

      // 超时错误
      if (errorName === 'AbortError') {
        console.error(`[Seedream] 请求超时`);
        return {
          success: false,
          error: 'Seedream API 请求超时',
        };
      }

      console.error(`[Seedream] 生成失败:`, errorMessage);
      return {
        success: false,
        error: `Seedream 生成失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 获取模型显示标签
   */
  override getModelLabel(modelId: string): string {
    if (modelId === 'seedream-4.5') {
      return 'Seedream 4.5';
    }
    return modelId;
  }
}
