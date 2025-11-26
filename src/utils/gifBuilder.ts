import type { SpriteConfig, ImageDimensions } from "@/types/sprite";

// 定义 GIF 类型（通过 CDN 加载）
declare class GIF {
  constructor(options: any);
  addFrame(element: any, options?: any): void;
  on(event: string, callback: (data: any) => void): void;
  render(): void;
}

// 洋红色作为透明背景的 Key Color
const KEY_COLOR_RGB = [255, 0, 255];
const KEY_COLOR_HEX = 0xff00ff;

/**
 * 获取 gif.worker.js 的 Blob URL
 */
const getWorkerBlobUrl = async () => {
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
  const text = await response.text();
  const blob = new Blob([text], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
};

/**
 * 将检测到的背景色替换为 Key Color (洋红色)
 * 这允许 gif.js 将洋红色视为透明
 */
const applyChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const frameData = ctx.getImageData(0, 0, width, height);
  const data = frameData.data;

  // 采样左上角像素作为背景参考
  const rBg = data[0];
  const gBg = data[1];
  const bBg = data[2];

  // 压缩噪点的容差
  const tolerance = 20;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // 如果像素匹配背景色或已经透明
    if (
      (Math.abs(r - rBg) < tolerance &&
        Math.abs(g - gBg) < tolerance &&
        Math.abs(b - bBg) < tolerance) ||
      a < 10
    ) {
      // 设置为 Key Color（洋红色）并完全不透明
      data[i] = KEY_COLOR_RGB[0];
      data[i + 1] = KEY_COLOR_RGB[1];
      data[i + 2] = KEY_COLOR_RGB[2];
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(frameData, 0, 0);
};

/**
 * 生成 GIF
 */
export const generateGif = async (
  image: HTMLImageElement,
  config: SpriteConfig,
  dimensions: ImageDimensions,
  onProgress: (pct: number) => void
): Promise<Blob> => {
  // 动态加载 gif.js
  if (!(window as any).GIF) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load gif.js'));
      document.head.appendChild(script);
    });
  }

  const workerUrl = await getWorkerBlobUrl();

  return new Promise((resolve, reject) => {
    const GIF = (window as any).GIF;

    const gifOptions: any = {
      workers: 2,
      quality: 1,
      dither: false,
      width: (dimensions.width / config.cols) * config.scale,
      height: (dimensions.height / config.rows) * config.scale,
      workerScript: workerUrl,
    };

    // 如果需要透明背景，设置透明 key color
    if (config.autoTransparent) {
      gifOptions.transparent = KEY_COLOR_HEX;
    }

    const gif = new GIF(gifOptions);

    const frameWidth = dimensions.width / config.cols;
    const frameHeight = dimensions.height / config.rows;
    const delay = 1000 / config.fps;

    const canvas = document.createElement('canvas');
    canvas.width = frameWidth * config.scale;
    canvas.height = frameHeight * config.scale;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      reject(new Error("Could not create canvas context"));
      return;
    }

    ctx.imageSmoothingEnabled = false;

    // 按配置的方向遍历帧
    for (let i = 0; i < config.totalFrames; i++) {
      // 根据方向计算行列
      let row, col;
      if (config.direction === 'column') {
        // 列优先: i=0 是 (0,0), i=1 是 (1,0)
        row = i % config.rows;
        col = Math.floor(i / config.rows);
      } else {
        // 行优先 (标准): i=0 是 (0,0), i=1 是 (0,1)
        col = i % config.cols;
        row = Math.floor(i / config.cols);
      }

      // 安全检查
      if (row >= config.rows || col >= config.cols) continue;

      // 1. 准备 Canvas
      if (config.autoTransparent) {
        // 填充 Key Color（洋红色）确保空白区域透明
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        // 标准清除
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // 2. 绘制缩放后的图片切片
      ctx.drawImage(
        image,
        col * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // 3. 如果需要，应用 Chroma Key（将图片背景替换为洋红色）
      if (config.autoTransparent) {
        applyChromaKey(ctx, canvas.width, canvas.height);
      }

      gif.addFrame(ctx, { copy: true, delay: delay });
    }

    gif.on('progress', (p: number) => {
      onProgress(Math.round(p * 100));
    });

    gif.on('finished', (blob: Blob) => {
      resolve(blob);
      URL.revokeObjectURL(workerUrl);
    });

    gif.render();
  });
};
