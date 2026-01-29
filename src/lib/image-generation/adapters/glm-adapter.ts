/**
 * GLM Image 图片生成适配器
 *
 * 智谱 AI GLM-Image 图片生成模型
 * API 文档：https://open.bigmodel.cn/dev/api/image/cogview
 *
 * 特点：中文文字渲染能力强，适合生成包含中文文字的图片
 */

import { ImageGenerationAdapter, type AdapterCapabilitiesConfig } from '../base-adapter';
import type {
  ImageGenerationParams,
  ImageGenerationResult,
} from '../types';
import { uploadBufferToR2 } from '@/lib/r2';

// GLM API 配置
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/images/generations';

// 默认超时时间（毫秒）- HD 模式约需 20 秒
const DEFAULT_TIMEOUT = 60000; // 1 分钟

// 重试配置
const MAX_RETRIES = 3;
const INITIAL_DELAY = 2000;

// 判断是否可重试的错误
const isRetryableError = (status: number, errorMessage: string): boolean => {
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  if (retryableStatuses.includes(status)) return true;

  const retryableMessages = [
    'timeout', 'overloaded', 'unavailable', 'temporarily',
    'try again', 'aborted', 'fetch failed', 'too many requests',
  ];
  return retryableMessages.some(msg => errorMessage.toLowerCase().includes(msg));
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GLM API 响应类型
 */
interface GLMResponse {
  created: number;
  data: Array<{
    url: string;
  }>;
  id: string;
  request_id: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 根据分辨率和比例计算 GLM 支持的尺寸
 * glm-image 推荐尺寸：1280x1280, 1568×1056, 1056×1568, 1472×1088, 1088×1472, 1728×960, 960×1728
 */
function getGLMSize(resolution: string, aspectRatio: string): string {
  // GLM 推荐尺寸映射
  const sizeMap: Record<string, Record<string, string>> = {
    '1K': {
      '1:1': '1024x1024',
      '16:9': '1344x768',
      '9:16': '768x1344',
      '4:3': '1152x864',
      '3:4': '864x1152',
    },
    '2K': {
      '1:1': '1280x1280',
      '16:9': '1568x1056',
      '9:16': '1056x1568',
      '4:3': '1472x1088',
      '3:4': '1088x1472',
    },
    '4K': {
      '1:1': '1280x1280', // GLM 最大支持 2^22 像素，1280x1280 是最大正方形
      '16:9': '1728x960',
      '9:16': '960x1728',
      '4:3': '1472x1088',
      '3:4': '1088x1472',
    },
  };

  return sizeMap[resolution]?.[aspectRatio] || sizeMap['2K']['1:1'];
}

/**
 * GLM Image 适配器
 */
export class GLMAdapter extends ImageGenerationAdapter {
  readonly name = 'glm';
  readonly models = ['glm-image'];

  readonly capabilities: AdapterCapabilitiesConfig = {
    supportedResolutions: ['1K', '2K'],  // GLM 最大像素限制，不支持真正的 4K
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportsReferenceImages: false,  // GLM 图片生成不支持参考图
    maxReferenceImages: 0,
  };

  /**
   * 生成图片
   */
  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    // 从环境变量获取 API Key
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: 'GLM API Key 未配置（请设置 GLM_API_KEY 环境变量）',
      };
    }

    // 计算实际尺寸
    const size = getGLMSize(params.resolution || '2K', params.aspectRatio || '1:1');

    console.log(`[GLM] 开始生成图片`);
    console.log(`[GLM] 分辨率: ${params.resolution || '2K'}, 比例: ${params.aspectRatio || '1:1'}, 实际尺寸: ${size}`);
    console.log(`[GLM] 提示词: ${params.prompt.substring(0, 100)}...`);

    // 构建请求体
    const requestBody = {
      model: 'glm-image',
      prompt: params.prompt,
      size,
      quality: 'hd',  // 使用高清模式，文字渲染效果更好
      watermark_enabled: false,  // 关闭水印
    };

    // 带重试的 API 调用
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[GLM] 调用 API${attempt > 0 ? ` (重试 ${attempt}/${MAX_RETRIES})` : ''}`);

      try {
        // 设置超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

        const response = await fetch(GLM_API_URL, {
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
        const data: GLMResponse = await response.json();

        // 检查 HTTP 错误
        if (!response.ok) {
          const errorMsg = data.error?.message || `HTTP ${response.status}`;
          console.error(`[GLM] HTTP 错误: ${response.status} - ${errorMsg}`);

          if (attempt < MAX_RETRIES && isRetryableError(response.status, errorMsg)) {
            const delay = INITIAL_DELAY * Math.pow(2, attempt);
            console.log(`[GLM] 可重试错误，等待 ${delay}ms 后重试...`);
            await sleep(delay);
            continue;
          }

          return {
            success: false,
            error: `GLM API 错误 (${response.status}): ${errorMsg}`,
          };
        }

        // 检查 API 错误
        if (data.error) {
          console.error(`[GLM] API 错误:`, data.error);

          if (attempt < MAX_RETRIES && isRetryableError(0, data.error.message)) {
            const delay = INITIAL_DELAY * Math.pow(2, attempt);
            console.log(`[GLM] 可重试错误，等待 ${delay}ms 后重试...`);
            await sleep(delay);
            continue;
          }

          return {
            success: false,
            error: `GLM API 错误: ${data.error.message}`,
          };
        }

        // 检查数据
        if (!data.data || data.data.length === 0) {
          console.error(`[GLM] 响应中没有图片数据`);
          return {
            success: false,
            error: 'GLM API 返回空数据',
          };
        }

        console.log(`[GLM] API 返回图片 URL`);

        // 下载图片并上传到 R2
        const imageUrl = data.data[0].url;

        try {
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            console.error(`[GLM] 下载图片失败: ${imageResponse.status}`);
            return {
              success: false,
              error: `下载图片失败: ${imageResponse.status}`,
            };
          }

          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

          console.log(`[GLM] 图片大小: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

          // 上传到 R2
          const r2Url = await uploadBufferToR2(imageBuffer, mimeType);
          console.log(`[GLM] 图片上传成功: ${r2Url}`);

          return {
            success: true,
            imageUrl: r2Url,
            meta: {
              model: 'glm/glm-image',
              actualResolution: size,
              usage: {
                generatedImages: 1,
              },
            },
          };
        } catch (uploadError) {
          console.error(`[GLM] 上传图片失败:`, uploadError);
          return {
            success: false,
            error: `上传图片失败: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : '';

        // 超时错误
        if (errorName === 'AbortError') {
          console.error(`[GLM] 请求超时`);
          if (attempt < MAX_RETRIES) {
            const delay = INITIAL_DELAY * Math.pow(2, attempt);
            console.log(`[GLM] 超时，等待 ${delay}ms 后重试...`);
            await sleep(delay);
            continue;
          }
          return {
            success: false,
            error: 'GLM API 请求超时（已重试多次）',
          };
        }

        // 其他网络错误
        if (attempt < MAX_RETRIES && isRetryableError(0, errorMessage)) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt);
          console.log(`[GLM] 网络错误: ${errorMessage}，等待 ${delay}ms 后重试...`);
          await sleep(delay);
          continue;
        }

        console.error(`[GLM] 生成失败:`, errorMessage);
        return {
          success: false,
          error: `GLM 生成失败: ${errorMessage}`,
        };
      }
    }

    return {
      success: false,
      error: 'GLM 生成失败（已达最大重试次数）',
    };
  }

  /**
   * 获取模型显示标签
   */
  override getModelLabel(modelId: string): string {
    if (modelId === 'glm-image') {
      return 'GLM 智谱';
    }
    return modelId;
  }
}
