import { NextRequest, NextResponse } from "next/server";
import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";
import { uploadBufferToR2 } from "@/lib/r2";

interface ImageMark {
  id: string;
  number: number;
  x: number;  // 0-1 相对坐标
  y: number;  // 0-1 相对坐标
}

interface MarkerStyle {
  size: number;
  fontSize: number;
  bgColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  shadow: boolean;
}

const DEFAULT_STYLE: MarkerStyle = {
  size: 48,
  fontSize: 24,
  bgColor: "#EF4444",
  textColor: "#FFFFFF",
  borderColor: "#FFFFFF",
  borderWidth: 3,
  shadow: true,
};

/**
 * 在 Canvas 上绘制标记
 */
function drawMarks(
  ctx: CanvasRenderingContext2D,
  marks: ImageMark[],
  width: number,
  height: number,
  style: MarkerStyle
) {
  marks.forEach((mark) => {
    const x = mark.x * width;
    const y = mark.y * height;

    // 绘制阴影
    if (style.shadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    // 绘制圆形背景
    ctx.beginPath();
    ctx.arc(x, y, style.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = style.bgColor;
    ctx.fill();

    // 绘制边框
    if (style.borderWidth > 0) {
      ctx.strokeStyle = style.borderColor;
      ctx.lineWidth = style.borderWidth;
      ctx.stroke();
    }

    // 重置阴影
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 绘制数字
    ctx.fillStyle = style.textColor;
    ctx.font = `bold ${style.fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(mark.number), x, y);
  });
}

/**
 * 获取原始图片 URL（去掉 Cloudflare Image Resizing 前缀）
 */
function getOriginalImageUrl(url: string): string {
  // 如果是 Cloudflare CDN 转换过的 URL，提取原始路径
  // 例如: https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=1200/uploads/xxx.png
  // 转换为: https://doubao.luzhipeng.com/uploads/xxx.png
  const cdnPattern = /\/cdn-cgi\/image\/[^/]+(\/.+)$/;
  const match = url.match(cdnPattern);
  if (match) {
    const origin = new URL(url).origin;
    return origin + match[1];
  }
  return url;
}

/**
 * 服务端生成带标记的图片并上传到 R2
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, marks, style, maxWidth = 1200, maxHeight = 1200 } = body as {
      imageUrl: string;
      marks: ImageMark[];
      style?: Partial<MarkerStyle>;
      maxWidth?: number;
      maxHeight?: number;
    };

    if (!imageUrl || !marks || marks.length === 0) {
      return NextResponse.json(
        { error: "Missing imageUrl or marks" },
        { status: 400 }
      );
    }

    const mergedStyle = { ...DEFAULT_STYLE, ...style };

    // 获取原始图片 URL（避免 Cloudflare 返回 WebP 格式）
    const originalUrl = getOriginalImageUrl(imageUrl);
    console.log(`[image-marker] Processing image: ${originalUrl} with ${marks.length} marks`);

    // 先下载图片为 Buffer，再加载（避免 URL 直接加载的兼容性问题）
    const response = await fetch(originalUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // 从 Buffer 加载图片
    const image = await loadImage(imageBuffer);

    // 计算尺寸（保持比例）
    let width = image.width;
    let height = image.height;

    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    // 创建 Canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 绘制原图
    ctx.drawImage(image, 0, 0, width, height);

    // 绘制标记
    drawMarks(ctx, marks, width, height, mergedStyle);

    // 导出为 PNG Buffer
    const buffer = canvas.toBuffer("image/png");

    // 上传到 R2
    const url = await uploadBufferToR2(buffer, "image/png", "markers");

    console.log(`[image-marker] Uploaded marked image: ${url}`);

    return NextResponse.json({
      success: true,
      url,
      width,
      height,
      marksCount: marks.length,
    });
  } catch (error) {
    console.error("[image-marker API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
