import { useState, useCallback } from 'react';
import { ImageMark, UseImageMarkerReturn, MarkerStyle, DEFAULT_MARKER_STYLE, getCircleNumber } from './types';

/**
 * 图片标记管理 Hook
 */
export function useImageMarker(initialMarks: ImageMark[] = []): UseImageMarkerReturn {
  const [marks, setMarks] = useState<ImageMark[]>(initialMarks);

  // 添加标记
  const addMark = useCallback((x: number, y: number, description?: string) => {
    setMarks((prev) => {
      const newNumber = prev.length + 1;
      const newMark: ImageMark = {
        id: `mark-${Date.now()}-${newNumber}`,
        number: newNumber,
        x,
        y,
        description,
      };
      return [...prev, newMark];
    });
  }, []);

  // 移除标记
  const removeMark = useCallback((id: string) => {
    setMarks((prev) => {
      const filtered = prev.filter((m) => m.id !== id);
      // 重新编号
      return filtered.map((m, index) => ({
        ...m,
        number: index + 1,
      }));
    });
  }, []);

  // 更新标记
  const updateMark = useCallback((id: string, updates: Partial<ImageMark>) => {
    setMarks((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  // 清除所有标记
  const clearMarks = useCallback(() => {
    setMarks([]);
  }, []);

  // 重新排序（根据位置从上到下、从左到右）
  const reorderMarks = useCallback(() => {
    setMarks((prev) => {
      const sorted = [...prev].sort((a, b) => {
        // 先按 y 坐标排序，再按 x 坐标排序
        if (Math.abs(a.y - b.y) > 0.1) {
          return a.y - b.y;
        }
        return a.x - b.x;
      });
      return sorted.map((m, index) => ({
        ...m,
        number: index + 1,
      }));
    });
  }, []);

  // 生成带标记的图片
  const generateMarkedImage = useCallback(
    (canvas: HTMLCanvasElement): string => {
      return canvas.toDataURL('image/png');
    },
    []
  );

  return {
    marks,
    addMark,
    removeMark,
    updateMark,
    clearMarks,
    reorderMarks,
    generateMarkedImage,
  };
}

/**
 * 在 Canvas 上绘制标记
 */
export function drawMarksOnCanvas(
  ctx: CanvasRenderingContext2D,
  marks: ImageMark[],
  canvasWidth: number,
  canvasHeight: number,
  style: MarkerStyle = DEFAULT_MARKER_STYLE
): void {
  marks.forEach((mark) => {
    const x = mark.x * canvasWidth;
    const y = mark.y * canvasHeight;
    const { size, fontSize, bgColor, textColor, borderColor, borderWidth, shadow } = style;

    // 绘制阴影
    if (shadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    // 绘制圆形背景
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // 绘制边框
    if (borderWidth > 0) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    }

    // 重置阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 绘制数字
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(mark.number), x, y);
  });
}

/**
 * 通过服务端代理获取图片（绕过 CORS）
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  // 先尝试通过 API 代理获取图片
  try {
    const response = await fetch('/api/image-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.base64) {
        return data.base64;
      }
    }
  } catch (e) {
    console.log('[ImageMarker] Proxy fetch failed, trying direct fetch');
  }

  // 如果代理失败，返回原 URL（让 Canvas 尝试直接加载）
  return imageUrl;
}

/**
 * 加载图片到 Canvas
 */
export function loadImageToCanvas(
  imageUrl: string,
  maxWidth?: number,
  maxHeight?: number
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 如果是 base64，不需要设置 crossOrigin
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;

      // 限制最大尺寸
      if (maxWidth && width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (maxHeight && height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve({ canvas, ctx, width, height });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}

/**
 * 生成带标记的图片 DataURL
 * 优先使用服务端代理绕过 CORS
 */
export async function generateMarkedImageDataUrl(
  imageUrl: string,
  marks: ImageMark[],
  style: MarkerStyle = DEFAULT_MARKER_STYLE,
  maxWidth?: number,
  maxHeight?: number
): Promise<string> {
  // 尝试通过代理获取图片的 base64
  const imageSource = await fetchImageAsBase64(imageUrl);

  try {
    const { canvas, ctx, width, height } = await loadImageToCanvas(imageSource, maxWidth, maxHeight);
    drawMarksOnCanvas(ctx, marks, width, height, style);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('[ImageMarker] Failed to generate marked image:', error);
    // 如果 Canvas 方式失败，返回原图 URL
    throw error;
  }
}
