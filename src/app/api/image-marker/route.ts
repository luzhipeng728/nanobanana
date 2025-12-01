import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
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
 * 生成单个标记的 SVG
 */
function generateMarkerSvg(
  mark: ImageMark,
  width: number,
  height: number,
  style: MarkerStyle
): string {
  const x = Math.round(mark.x * width);
  const y = Math.round(mark.y * height);
  const r = style.size / 2;

  // 阴影滤镜
  const shadowFilter = style.shadow
    ? `<filter id="shadow-${mark.id}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
       </filter>`
    : "";

  const filterAttr = style.shadow ? `filter="url(#shadow-${mark.id})"` : "";

  return `
    ${shadowFilter}
    <circle cx="${x}" cy="${y}" r="${r}" fill="${style.bgColor}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}" ${filterAttr}/>
    <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${style.textColor}" font-size="${style.fontSize}" font-weight="bold" font-family="Arial, sans-serif">${mark.number}</text>
  `;
}

/**
 * 生成包含所有标记的 SVG overlay
 */
function generateMarkersSvg(
  marks: ImageMark[],
  width: number,
  height: number,
  style: MarkerStyle
): Buffer {
  const markersContent = marks
    .map((mark) => generateMarkerSvg(mark, width, height, style))
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${markersContent}
  </svg>`;

  return Buffer.from(svg);
}

/**
 * 获取原始图片 URL（去掉 Cloudflare Image Resizing 前缀）
 */
function getOriginalImageUrl(url: string): string {
  // 如果是 Cloudflare CDN 转换过的 URL，提取原始路径
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

    // 获取原始图片 URL
    const originalUrl = getOriginalImageUrl(imageUrl);
    console.log(`[image-marker] Processing image: ${originalUrl} with ${marks.length} marks`);

    // 下载图片
    const response = await fetch(originalUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // 使用 sharp 获取图片信息
    const metadata = await sharp(imageBuffer).metadata();
    let width = metadata.width || 800;
    let height = metadata.height || 600;

    console.log(`[image-marker] Original size: ${width}x${height}`);

    // 计算缩放后的尺寸
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = Math.round((width * maxHeight) / height);
      height = maxHeight;
    }

    // 生成标记 SVG overlay
    const markersSvg = generateMarkersSvg(marks, width, height, mergedStyle);

    // 使用 sharp 合成图片：调整尺寸 + 叠加 SVG 标记
    const resultBuffer = await sharp(imageBuffer)
      .resize(width, height, { fit: "inside" })
      .composite([
        {
          input: markersSvg,
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    // 上传到 R2
    const url = await uploadBufferToR2(resultBuffer, "image/png", "markers");

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
