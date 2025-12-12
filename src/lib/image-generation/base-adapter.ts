/**
 * 图片生成适配器 - 基类定义
 */

import type {
  ImageGenerationParams,
  ImageGenerationResult,
  ValidationResult,
  ImageResolution,
  AspectRatio,
  ExtraOptionConfig,
} from './types';

/**
 * 适配器能力配置
 */
export interface AdapterCapabilitiesConfig {
  /** 支持的分辨率列表 */
  supportedResolutions: ImageResolution[];

  /** 支持的比例列表 */
  supportedAspectRatios: AspectRatio[];

  /** 是否支持参考图片 */
  supportsReferenceImages: boolean;

  /** 最大参考图片数量 */
  maxReferenceImages: number;

  /** 额外选项配置 */
  extraOptions?: ExtraOptionConfig[];
}

/**
 * 图片生成适配器基类
 *
 * 所有图片生成服务都需要继承此基类，实现统一的接口
 */
export abstract class ImageGenerationAdapter {
  /** 适配器名称 */
  abstract readonly name: string;

  /** 支持的模型列表 */
  abstract readonly models: string[];

  /** 能力声明 */
  abstract readonly capabilities: AdapterCapabilitiesConfig;

  /**
   * 生成图片 - 核心方法，子类必须实现
   */
  abstract generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;

  /**
   * 验证参数是否在该适配器支持的范围内
   * 基类提供默认实现，子类可以覆盖以添加额外验证
   */
  validateParams(params: ImageGenerationParams): ValidationResult {
    const { resolution, aspectRatio, referenceImages } = params;

    // 验证分辨率
    if (resolution && !this.capabilities.supportedResolutions.includes(resolution)) {
      return {
        valid: false,
        error: `该模型不支持分辨率: ${resolution}，支持的分辨率: ${this.capabilities.supportedResolutions.join(', ')}`,
      };
    }

    // 验证比例
    if (aspectRatio && aspectRatio !== 'auto' && !this.capabilities.supportedAspectRatios.includes(aspectRatio)) {
      return {
        valid: false,
        error: `该模型不支持比例: ${aspectRatio}，支持的比例: ${this.capabilities.supportedAspectRatios.join(', ')}`,
      };
    }

    // 验证参考图片
    if (referenceImages && referenceImages.length > 0) {
      if (!this.capabilities.supportsReferenceImages) {
        return {
          valid: false,
          error: `该模型不支持参考图片`,
        };
      }
      if (referenceImages.length > this.capabilities.maxReferenceImages) {
        return {
          valid: false,
          error: `参考图片数量超出限制，最大支持 ${this.capabilities.maxReferenceImages} 张`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * 获取模型显示标签
   */
  getModelLabel(modelId: string): string {
    return modelId;
  }

  /**
   * 检查是否支持指定模型
   */
  supportsModel(modelId: string): boolean {
    return this.models.includes(modelId);
  }
}
