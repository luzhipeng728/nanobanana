import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerCoverGenerationBatch } from "@/lib/cover-generator";

// 获取所有公开的幻灯片列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const sort = searchParams.get("sort") || "latest"; // latest, popular, featured
    const skip = (page - 1) * limit;

    let orderBy: any = { createdAt: "desc" };

    if (sort === "popular") {
      orderBy = { views: "desc" };
    } else if (sort === "featured") {
      orderBy = { likes: "desc" };
    }

    // 获取幻灯片列表
    const [slideshows, total] = await Promise.all([
      prisma.slideshow.findMany({
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          images: true,
          cover: true,
          createdAt: true,
          videoUrl: true,
          views: true,
          likes: true,
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
        needsCover: !s.cover, // 没有专属封面就需要生成
        videoUrl: s.videoUrl, // 视频 URL
        views: s.views,
        likes: s.likes,
      };
    });

    // 触发没有封面的幻灯片生成封面（后台异步执行）
    const needsCoverIds = items
      .filter((item) => item.needsCover)
      .map((item) => item.id);

    if (needsCoverIds.length > 0) {
      triggerCoverGenerationBatch(needsCoverIds);
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
