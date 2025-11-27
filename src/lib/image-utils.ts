// 图片处理工具 - 压缩、格式转换等

import { createCanvas, loadImage, Image } from 'canvas';

// 压缩配置
export interface ImageCompressOptions {
  maxWidth?: number;       // 最大宽度，默认 2048
  maxHeight?: number;      // 最大高度，默认 2048
  maxSizeBytes?: number;   // 最大文件大小（字节），默认 1MB
  quality?: number;        // JPEG 质量，0-1，默认 0.85
  format?: 'jpeg' | 'png'; // 输出格式，默认 jpeg
}

// 压缩结果
export interface CompressResult {
  buffer: Buffer;
  base64: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  wasCompressed: boolean;
}

// 默认配置 - 确保所有图片都在 1MB 以下
const DEFAULT_OPTIONS: Required<ImageCompressOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  maxSizeBytes: 800 * 1024, // 800KB，留一些余量确保不超 1MB
  quality: 0.8,
  format: 'jpeg'
};

/**
 * 压缩图片
 * 支持 URL 或 Buffer 输入
 */
export async function compressImage(
  input: string | Buffer,
  options: ImageCompressOptions = {}
): Promise<CompressResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 获取原始图片数据
  let originalBuffer: Buffer;
  let originalMimeType: string = 'image/jpeg';

  if (typeof input === 'string') {
    // URL 输入
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    originalBuffer = Buffer.from(arrayBuffer);
    originalMimeType = response.headers.get('content-type') || 'image/jpeg';
  } else {
    // Buffer 输入
    originalBuffer = input;
  }

  const originalSize = originalBuffer.length;

  // 判断是否需要压缩
  // 如果图片小于阈值且格式兼容，直接返回
  if (originalSize <= opts.maxSizeBytes && opts.format === 'jpeg' && originalMimeType.includes('jpeg')) {
    return {
      buffer: originalBuffer,
      base64: originalBuffer.toString('base64'),
      mimeType: originalMimeType,
      originalSize,
      compressedSize: originalSize,
      width: 0, // 未加载，不知道尺寸
      height: 0,
      wasCompressed: false
    };
  }

  // 加载图片
  const img = await loadImage(originalBuffer);
  const originalWidth = img.width;
  const originalHeight = img.height;

  // 计算缩放后的尺寸
  let { width, height } = calculateResizedDimensions(
    originalWidth,
    originalHeight,
    opts.maxWidth,
    opts.maxHeight
  );

  // 创建 canvas 并绘制
  let quality = opts.quality;
  let compressedBuffer: Buffer;
  let attempts = 0;
  const maxAttempts = 5;

  do {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 白色背景（对于 JPEG）
    if (opts.format === 'jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    // 绘制图片
    ctx.drawImage(img, 0, 0, width, height);

    // 输出为指定格式
    if (opts.format === 'jpeg') {
      compressedBuffer = canvas.toBuffer('image/jpeg', { quality });
    } else {
      compressedBuffer = canvas.toBuffer('image/png');
    }

    attempts++;

    // 如果仍然超过大小限制，降低质量或尺寸
    if (compressedBuffer.length > opts.maxSizeBytes && attempts < maxAttempts) {
      if (quality > 0.5) {
        // 先降低质量
        quality -= 0.1;
      } else {
        // 质量已经很低，缩小尺寸
        width = Math.floor(width * 0.8);
        height = Math.floor(height * 0.8);
        quality = opts.quality; // 重置质量
      }
    }
  } while (compressedBuffer.length > opts.maxSizeBytes && attempts < maxAttempts);

  const mimeType = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';

  console.log(
    `[ImageUtils] Compressed: ${(originalSize / 1024).toFixed(1)}KB -> ${(compressedBuffer.length / 1024).toFixed(1)}KB ` +
    `(${originalWidth}x${originalHeight} -> ${width}x${height}, quality: ${quality.toFixed(2)})`
  );

  return {
    buffer: compressedBuffer,
    base64: compressedBuffer.toString('base64'),
    mimeType,
    originalSize,
    compressedSize: compressedBuffer.length,
    width,
    height,
    wasCompressed: true
  };
}

/**
 * 批量压缩图片
 */
export async function compressImages(
  inputs: (string | Buffer)[],
  options: ImageCompressOptions = {}
): Promise<CompressResult[]> {
  const results: CompressResult[] = [];

  for (const input of inputs) {
    try {
      const result = await compressImage(input, options);
      results.push(result);
    } catch (error) {
      console.error('[ImageUtils] Failed to compress image:', error);
      // 跳过失败的图片，继续处理其他图片
    }
  }

  return results;
}

/**
 * 计算保持宽高比的缩放尺寸
 */
function calculateResizedDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  // 如果图片已经在限制内，不需要缩放
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  // 计算缩放比例
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const ratio = Math.min(widthRatio, heightRatio);

  width = Math.floor(width * ratio);
  height = Math.floor(height * ratio);

  return { width, height };
}

/**
 * 检查图片是否需要压缩
 */
export function shouldCompress(
  sizeBytes: number,
  options: ImageCompressOptions = {}
): boolean {
  const maxSize = options.maxSizeBytes || DEFAULT_OPTIONS.maxSizeBytes;
  return sizeBytes > maxSize;
}

/**
 * 从 URL 获取图片并压缩，返回 base64
 * 这是一个便捷函数，用于替换直接 fetch 图片的场景
 */
export async function fetchAndCompressImage(
  imageUrl: string,
  options: ImageCompressOptions = {}
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const result = await compressImage(imageUrl, options);
    return {
      base64: result.base64,
      mimeType: result.mimeType
    };
  } catch (error) {
    console.error(`[ImageUtils] Failed to fetch and compress image: ${imageUrl}`, error);
    return null;
  }
}
