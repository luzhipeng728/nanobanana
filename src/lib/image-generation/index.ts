/**
 * 图片生成服务 - 统一入口
 *
 * 使用方法：
 * ```typescript
 * import { generateImage, getAvailableModels } from '@/lib/image-generation';
 *
 * // 获取可用模型列表
 * const models = getAvailableModels();
 *
 * // 生成图片
 * const result = await generateImage({
 *   prompt: '一只可爱的猫',
 *   model: 'nano-banana-pro',
 *   resolution: '2K',
 *   aspectRatio: '1:1',
 * });
 * ```
 */

import { ImageGenerationAdapter } from './base-adapter';
import { GeminiAdapter } from './adapters/gemini-adapter';
import { SeedreamAdapter } from './adapters/seedream-adapter';
import type {
  ImageGenerationParams,
  ImageGenerationResult,
  AdapterCapabilities,
  ImageModel,
  IMAGE_MODELS,
} from './types';
import { getAvailableModelsForUser, isBaseModel } from './types';

// ============================================================================
// 适配器注册
// ============================================================================

/** 所有已注册的适配器 */
const adapters: ImageGenerationAdapter[] = [
  new GeminiAdapter(),
  new SeedreamAdapter(),
];

/** 模型 ID 到适配器的映射 */
const modelToAdapter = new Map<string, ImageGenerationAdapter>();

// 初始化映射
for (const adapter of adapters) {
  for (const modelId of adapter.models) {
    modelToAdapter.set(modelId, adapter);
  }
}

// ============================================================================
// 对外接口
// ============================================================================

/**
 * 生成图片 - 统一入口
 *
 * 根据 model 参数自动路由到对应的适配器
 */
export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const adapter = modelToAdapter.get(params.model);

  if (!adapter) {
    const availableModels = Array.from(modelToAdapter.keys()).join(', ');
    return {
      success: false,
      error: `不支持的模型: ${params.model}，可用模型: ${availableModels}`,
    };
  }

  // 参数验证
  const validation = adapter.validateParams(params);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // 调用适配器生成
  console.log(`[ImageGeneration] 使用适配器: ${adapter.name}, 模型: ${params.model}`);
  return adapter.generate(params);
}

/**
 * 获取所有可用模型及其能力
 *
 * 返回的数据结构可直接用于前端渲染模型选择器
 */
export function getAvailableModels(): AdapterCapabilities[] {
  return adapters.map(adapter => ({
    name: adapter.name,
    models: adapter.models.map(modelId => ({
      id: modelId,
      label: adapter.getModelLabel(modelId),
      description: getModelDescription(modelId),
    })),
    supportedResolutions: adapter.capabilities.supportedResolutions,
    supportedAspectRatios: adapter.capabilities.supportedAspectRatios,
    supportsReferenceImages: adapter.capabilities.supportsReferenceImages,
    maxReferenceImages: adapter.capabilities.maxReferenceImages,
    extraOptions: adapter.capabilities.extraOptions,
  }));
}

/**
 * 获取扁平化的模型列表（简化版，常用于下拉选择）
 */
export function getModelList(): Array<{
  id: string;
  label: string;
  adapter: string;
  supportsReferenceImages: boolean;
}> {
  const list: Array<{
    id: string;
    label: string;
    adapter: string;
    supportsReferenceImages: boolean;
  }> = [];

  for (const adapter of adapters) {
    for (const modelId of adapter.models) {
      list.push({
        id: modelId,
        label: adapter.getModelLabel(modelId),
        adapter: adapter.name,
        supportsReferenceImages: adapter.capabilities.supportsReferenceImages,
      });
    }
  }

  return list;
}

/**
 * 获取扁平化的模型列表（根据用户授权过滤）
 * @param grantedModels 用户被授权的高级模型 ID 列表（从 UserModelPermission 表查询）
 */
export function getModelListForUser(grantedModels: string[]): Array<{
  id: string;
  label: string;
  adapter: string;
  supportsReferenceImages: boolean;
}> {
  const availableModels = getAvailableModelsForUser(grantedModels);
  return getModelList().filter(model =>
    availableModels.includes(model.id as ImageModel)
  );
}

/**
 * 获取所有可用模型及其能力（根据用户授权过滤）
 * @param grantedModels 用户被授权的高级模型 ID 列表（从 UserModelPermission 表查询）
 */
export function getAvailableModelsForUserWithCapabilities(grantedModels: string[]): AdapterCapabilities[] {
  const availableModels = getAvailableModelsForUser(grantedModels);

  return adapters.map(adapter => {
    // 过滤该适配器下用户有权限使用的模型
    const allowedModels = adapter.models.filter(modelId =>
      availableModels.includes(modelId as ImageModel)
    );

    return {
      name: adapter.name,
      models: allowedModels.map(modelId => ({
        id: modelId,
        label: adapter.getModelLabel(modelId),
        description: getModelDescription(modelId),
      })),
      supportedResolutions: adapter.capabilities.supportedResolutions,
      supportedAspectRatios: adapter.capabilities.supportedAspectRatios,
      supportsReferenceImages: adapter.capabilities.supportsReferenceImages,
      maxReferenceImages: adapter.capabilities.maxReferenceImages,
      extraOptions: adapter.capabilities.extraOptions,
    };
  }).filter(cap => cap.models.length > 0);  // 过滤掉没有可用模型的适配器
}

/**
 * 检查模型是否支持参考图片
 */
export function modelSupportsReferenceImages(modelId: string): boolean {
  const adapter = modelToAdapter.get(modelId);
  return adapter?.capabilities.supportsReferenceImages ?? false;
}

/**
 * 获取模型的能力信息
 */
export function getModelCapabilities(modelId: string): AdapterCapabilities | null {
  const adapter = modelToAdapter.get(modelId);
  if (!adapter) return null;

  return {
    name: adapter.name,
    models: [{ id: modelId, label: adapter.getModelLabel(modelId) }],
    supportedResolutions: adapter.capabilities.supportedResolutions,
    supportedAspectRatios: adapter.capabilities.supportedAspectRatios,
    supportsReferenceImages: adapter.capabilities.supportsReferenceImages,
    maxReferenceImages: adapter.capabilities.maxReferenceImages,
    extraOptions: adapter.capabilities.extraOptions,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取模型描述
 */
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'nano-banana': '快速生成，适合日常使用',
    'nano-banana-pro': '高质量生成，支持 Google Search 增强',
    'seedream-4.5': '字节跳动 Seedream，支持组图功能',
  };
  return descriptions[modelId] || '';
}

// ============================================================================
// 类型导出
// ============================================================================

export type {
  ImageGenerationParams,
  ImageGenerationResult,
  AdapterCapabilities,
  ImageModel,
  ImageResolution,
  AspectRatio,
  ValidationResult,
  ExtraOptionConfig,
} from './types';

export {
  IMAGE_MODELS,
  BASE_MODELS,
  PREMIUM_MODELS,
  isBaseModel,
  isPremiumModel,
  getAvailableModelsForUser,
} from './types';
