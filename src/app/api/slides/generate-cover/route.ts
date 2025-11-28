import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";

// 为指定 slide 生成封面图
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slideId } = body;

    if (!slideId) {
      return NextResponse.json(
        { error: "缺少 slideId" },
        { status: 400 }
      );
    }

    // 获取 slide 信息
    const slide = await prisma.slideshow.findUnique({
      where: { id: slideId },
    });

    if (!slide) {
      return NextResponse.json(
        { error: "Slide 不存在" },
        { status: 404 }
      );
    }

    // 如果已有封面，直接返回
    if (slide.cover) {
      return NextResponse.json({
        success: true,
        cover: slide.cover,
        cached: true,
      });
    }

    // 生成封面图的 prompt
    const coverPrompt = `Create a stylish cover image for a slideshow titled "${slide.title}".
Design requirements:
- Square format (1:1 aspect ratio)
- Modern, clean, minimalist design
- The title "${slide.title}" should be prominently displayed in the center
- Use elegant typography
- Soft gradient background with harmonious colors
- Professional and artistic look
- No complex illustrations, focus on typography and abstract elements`;

    console.log(`[Cover Generator] Generating cover for slide: ${slide.title}`);

    // 调用 Gemini 生成图片
    const result = await generateImageAction(
      coverPrompt,
      "nano-banana-pro", // 使用 pro 模型
      {
        aspectRatio: "1:1", // 正方形
        imageSize: "2K",    // 2K 分辨率
      }
    );

    if (!result.success || !result.imageUrl) {
      console.error(`[Cover Generator] Failed to generate cover:`, result.error);
      return NextResponse.json(
        { error: result.error || "生成封面失败" },
        { status: 500 }
      );
    }

    // 更新 slide 的封面
    await prisma.slideshow.update({
      where: { id: slideId },
      data: { cover: result.imageUrl },
    });

    console.log(`[Cover Generator] Cover generated successfully: ${result.imageUrl}`);

    return NextResponse.json({
      success: true,
      cover: result.imageUrl,
      cached: false,
    });
  } catch (error) {
    console.error("[Cover Generator] Error:", error);
    return NextResponse.json(
      { error: "生成封面失败" },
      { status: 500 }
    );
  }
}
