/**
 * 模型价格配置
 *
 * 所有价格单位：人民币（RMB）
 *
 * 价格来源：
 * - nano-banana: 0.039 USD × 7.2 ≈ 0.28 RMB
 * - nano-banana-pro: 0.24 USD × 7.2 ≈ 1.73 RMB
 * - seedream-4.5: 0.25 RMB
 */

export interface ModelPricing {
  /** 模型 ID */
  modelId: string;
  /** 价格（RMB） */
  price: number;
  /** 单位描述 */
  unit: string;
  /** 原始价格描述（用于显示） */
  originalPrice?: string;
}

/**
 * 图片生成模型价格表
 */
export const IMAGE_MODEL_PRICING: Record<string, ModelPricing> = {
  'nano-banana': {
    modelId: 'nano-banana',
    price: 0.28,
    unit: '张',
    originalPrice: '$0.039/张',
  },
  'nano-banana-pro': {
    modelId: 'nano-banana-pro',
    price: 1.73,
    unit: '张',
    originalPrice: '$0.24/张',
  },
  'seedream-4.5': {
    modelId: 'seedream-4.5',
    price: 0.25,
    unit: '张',
    originalPrice: '¥0.25/张',
  },
};

/**
 * 获取模型价格
 * @param modelId 模型 ID
 * @returns 价格（RMB），找不到返回 0
 */
export function getModelPrice(modelId: string): number {
  return IMAGE_MODEL_PRICING[modelId]?.price ?? 0;
}

/**
 * 获取模型价格信息
 * @param modelId 模型 ID
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  return IMAGE_MODEL_PRICING[modelId] ?? null;
}

/**
 * 格式化价格显示
 * @param amount 金额（RMB）
 * @returns 格式化的价格字符串
 */
export function formatPrice(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

/**
 * 消费类型
 */
export type ConsumptionType = 'image' | 'music' | 'video' | 'sticker' | 'veo' | 'sprite' | 'tts' | 'ppt';

/**
 * 消费类型显示名称
 */
export const CONSUMPTION_TYPE_LABELS: Record<ConsumptionType, string> = {
  image: '图片生成',
  music: '音乐生成',
  video: '视频生成',
  sticker: '贴纸生成',
  veo: 'Veo 视频',
  sprite: '精灵图',
  tts: '语音合成',
  ppt: 'PPT 生成',
};
