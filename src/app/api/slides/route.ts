import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 获取所有公开的幻灯片列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = (page - 1) * limit;

    // 获取幻灯片列表（按创建时间倒序）
    const [slideshows, total] = await Promise.all([
      prisma.slideshow.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          images: true,
          cover: true,
          createdAt: true,
        },
      }),
      prisma.slideshow.count(),
    ]);

    // 解析 images JSON，优先使用 cover 字段，否则使用第一张图
    const items = slideshows.map((s) => {
      const images = JSON.parse(s.images) as string[];
      return {
        id: s.id,
        title: s.title,
        cover: s.cover || images[0] || null, // 优先使用专属封面
        imageCount: images.length,
        createdAt: s.createdAt,
        needsCover: !s.cover && !images[0], // 标记需要生成封面
      };
    });

    // 找出需要生成封面的 slides（后台异步处理）
    const needsCoverIds = items
      .filter((item) => item.needsCover)
      .map((item) => item.id);

    if (needsCoverIds.length > 0) {
      // 异步触发封面生成（不阻塞响应）
      triggerCoverGeneration(needsCoverIds).catch((err) => {
        console.error("[Slides API] Failed to trigger cover generation:", err);
      });
    }

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[Slides API] List error:", error);
    return NextResponse.json(
      { error: "获取幻灯片列表失败" },
      { status: 500 }
    );
  }
}

// 异步触发封面生成
async function triggerCoverGeneration(slideIds: string[]) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3004";

  for (const slideId of slideIds) {
    try {
      // 使用 fetch 调用封面生成 API（异步，不等待）
      fetch(`${baseUrl}/api/slides/generate-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId }),
      }).catch(() => {
        // 忽略错误，后台静默处理
      });

      // 避免同时触发太多请求
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // 忽略错误
    }
  }
}
