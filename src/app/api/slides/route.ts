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
          createdAt: true,
        },
      }),
      prisma.slideshow.count(),
    ]);

    // 解析 images JSON 并只取第一张作为封面
    const items = slideshows.map((s) => {
      const images = JSON.parse(s.images) as string[];
      return {
        id: s.id,
        title: s.title,
        cover: images[0] || null,
        imageCount: images.length,
        createdAt: s.createdAt,
      };
    });

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
