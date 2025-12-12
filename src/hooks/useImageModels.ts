/**
 * 图片生成模型列表 Hook
 *
 * 从 /api/image-models 获取可用模型列表
 * 支持缓存和自动刷新
 */

import { useState, useEffect, useCallback } from 'react';

export interface ImageModelInfo {
  id: string;
  label: string;
  adapter: string;
  supportsReferenceImages: boolean;
}

export interface ImageModelCapabilities {
  name: string;
  models: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  supportsReferenceImages: boolean;
  maxReferenceImages: number;
  extraOptions?: Array<{
    key: string;
    label: string;
    type: 'boolean' | 'select' | 'number';
    options?: Array<{ value: string; label: string }>;
    default?: unknown;
    description?: string;
  }>;
}

interface UseImageModelsResult {
  /** 模型列表（简化版） */
  models: ImageModelInfo[];

  /** 完整能力信息 */
  capabilities: ImageModelCapabilities[];

  /** 是否正在加载 */
  isLoading: boolean;

  /** 错误信息 */
  error: string | null;

  /** 手动刷新 */
  refresh: () => void;

  /** 根据模型 ID 获取能力信息 */
  getModelCapabilities: (modelId: string) => ImageModelCapabilities | null;

  /** 检查模型是否支持参考图片 */
  supportsReferenceImages: (modelId: string) => boolean;

  /** 获取模型支持的分辨率列表 */
  getSupportedResolutions: (modelId: string) => string[];

  /** 获取模型支持的比例列表 */
  getSupportedAspectRatios: (modelId: string) => string[];

  /** 获取模型的额外选项配置 */
  getExtraOptions: (modelId: string) => ImageModelCapabilities['extraOptions'];
}

// 缓存数据
let cachedModels: ImageModelInfo[] | null = null;
let cachedCapabilities: ImageModelCapabilities[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

export function useImageModels(): UseImageModelsResult {
  const [models, setModels] = useState<ImageModelInfo[]>(cachedModels || []);
  const [capabilities, setCapabilities] = useState<ImageModelCapabilities[]>(cachedCapabilities || []);
  const [isLoading, setIsLoading] = useState(!cachedModels);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async (forceRefresh = false) => {
    // 检查缓存是否有效
    if (!forceRefresh && cachedModels && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setModels(cachedModels);
      setCapabilities(cachedCapabilities || []);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/image-models');
      const data = await response.json();

      if (data.success) {
        cachedModels = data.models;
        cachedCapabilities = data.capabilities;
        cacheTimestamp = Date.now();

        setModels(data.models);
        setCapabilities(data.capabilities);
      } else {
        setError(data.error || '获取模型列表失败');
      }
    } catch (err) {
      console.error('[useImageModels] 获取模型列表失败:', err);
      setError('网络错误，无法获取模型列表');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const refresh = useCallback(() => {
    fetchModels(true);
  }, [fetchModels]);

  const getModelCapabilities = useCallback((modelId: string): ImageModelCapabilities | null => {
    for (const cap of capabilities) {
      if (cap.models.some(m => m.id === modelId)) {
        return cap;
      }
    }
    return null;
  }, [capabilities]);

  const supportsReferenceImages = useCallback((modelId: string): boolean => {
    const cap = getModelCapabilities(modelId);
    return cap?.supportsReferenceImages ?? false;
  }, [getModelCapabilities]);

  const getSupportedResolutions = useCallback((modelId: string): string[] => {
    const cap = getModelCapabilities(modelId);
    return cap?.supportedResolutions ?? ['1K', '2K', '4K'];
  }, [getModelCapabilities]);

  const getSupportedAspectRatios = useCallback((modelId: string): string[] => {
    const cap = getModelCapabilities(modelId);
    return cap?.supportedAspectRatios ?? ['1:1', '16:9', '9:16', '4:3', '3:4'];
  }, [getModelCapabilities]);

  const getExtraOptions = useCallback((modelId: string): ImageModelCapabilities['extraOptions'] => {
    const cap = getModelCapabilities(modelId);
    return cap?.extraOptions;
  }, [getModelCapabilities]);

  return {
    models,
    capabilities,
    isLoading,
    error,
    refresh,
    getModelCapabilities,
    supportsReferenceImages,
    getSupportedResolutions,
    getSupportedAspectRatios,
    getExtraOptions,
  };
}

/**
 * 获取默认模型 ID
 */
export function getDefaultModelId(models: ImageModelInfo[]): string {
  // 优先使用 nano-banana-pro
  const pro = models.find(m => m.id === 'nano-banana-pro');
  if (pro) return pro.id;

  // 其次使用第一个模型
  return models[0]?.id || 'nano-banana-pro';
}
