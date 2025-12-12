/**
 * 分辨率映射工具
 *
 * 将统一的分辨率（1K/2K/4K）和比例（1:1/16:9 等）映射到具体的像素尺寸
 */

import type { ImageResolution, AspectRatio } from '../types';

/**
 * Seedream 4.5 分辨率映射表
 *
 * 注意：Seedream 最小像素限制为 3,686,400
 * 所以 1K 的实际尺寸需要调整以满足最小限制
 */
export const SEEDREAM_RESOLUTION_MAP: Record<ImageResolution, Record<Exclude<AspectRatio, 'auto'>, string>> = {
  '1K': {
    '1:1': '1920x1920',   // 3,686,400 像素（最小限制）
    '16:9': '2560x1440',  // 3,686,400 像素
    '9:16': '1440x2560',  // 3,686,400 像素
    '4:3': '2220x1665',   // 3,696,300 像素
    '3:4': '1665x2220',   // 3,696,300 像素
  },
  '2K': {
    '1:1': '2048x2048',   // 4,194,304 像素
    '16:9': '2880x1620',  // 4,665,600 像素
    '9:16': '1620x2880',  // 4,665,600 像素
    '4:3': '2560x1920',   // 4,915,200 像素
    '3:4': '1920x2560',   // 4,915,200 像素
  },
  '4K': {
    '1:1': '4096x4096',   // 16,777,216 像素
    '16:9': '4096x2304',  // 9,437,184 像素
    '9:16': '2304x4096',  // 9,437,184 像素
    '4:3': '4096x3072',   // 12,582,912 像素
    '3:4': '3072x4096',   // 12,582,912 像素
  },
};

/**
 * Gemini 分辨率映射表
 * Gemini 使用 image_size 参数（1K/2K/4K）和 aspectRatio 参数分开传
 * 所以这里主要用于计算实际像素尺寸
 */
export const GEMINI_RESOLUTION_MAP: Record<ImageResolution, Record<Exclude<AspectRatio, 'auto'>, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '16:9': '1024x576',
    '9:16': '576x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
  },
  '4K': {
    '1:1': '4096x4096',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
    '4:3': '4096x3072',
    '3:4': '3072x4096',
  },
};

/**
 * 获取 Seedream 的实际尺寸字符串
 */
export function getSeedreamSize(
  resolution: ImageResolution = '2K',
  aspectRatio: AspectRatio = '1:1'
): string {
  // auto 比例默认使用 1:1
  const ratio = aspectRatio === 'auto' ? '1:1' : aspectRatio;
  return SEEDREAM_RESOLUTION_MAP[resolution][ratio];
}

/**
 * 获取 Gemini 的实际尺寸字符串
 */
export function getGeminiSize(
  resolution: ImageResolution = '2K',
  aspectRatio: AspectRatio = '1:1'
): string {
  const ratio = aspectRatio === 'auto' ? '1:1' : aspectRatio;
  return GEMINI_RESOLUTION_MAP[resolution][ratio];
}

/**
 * 解析尺寸字符串为宽高
 */
export function parseSize(size: string): { width: number; height: number } {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

/**
 * 计算像素总数
 */
export function calculatePixels(size: string): number {
  const { width, height } = parseSize(size);
  return width * height;
}
