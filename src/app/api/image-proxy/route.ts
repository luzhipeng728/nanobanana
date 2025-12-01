import { NextRequest, NextResponse } from "next/server";

/**
 * 图片代理 API
 * 服务端获取图片并返回 base64，绕过浏览器 CORS 限制
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body as { url: string };

    if (!url) {
      return NextResponse.json(
        { error: "Missing url parameter" },
        { status: 400 }
      );
    }

    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // 获取图片
    const imageResponse = await fetch(url, {
      headers: {
        // 模拟浏览器请求
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${imageResponse.status}` },
        { status: 400 }
      );
    }

    const contentType = imageResponse.headers.get("content-type") || "image/png";

    // 检查是否是图片类型
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "URL does not point to an image" },
        { status: 400 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({
      success: true,
      base64: dataUrl,
      contentType,
      size: imageBuffer.byteLength,
    });
  } catch (error) {
    console.error("[image-proxy API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
