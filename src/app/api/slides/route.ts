import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerCoverGenerationBatch } from "@/lib/cover-generator";
import { triggerScrollytellingCoverBatch } from "@/lib/scrollytelling-cover-generator";

// 统一的画廊项目类型
interface GalleryItem {
  id: string;
  title: string;
  cover: string | null;
  type: 'slideshow' | 'scrollytelling';
  imageCount?: number;
  createdAt: Date;
  views: number;
  likes: number;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  needsCover?: boolean;
}

// 获取所有公开的幻灯片和一镜到底列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const sort = searchParams.get("sort") || "latest"; // latest, popular, featured
    const typeFilter = searchParams.get("type") || "all"; // all, slideshow, scrollytelling
    const skip = (page - 1) * limit;

    let slideshowOrderBy: any = { createdAt: "desc" };
    let scrollytellingOrderBy: any = { createdAt: "desc" };

    if (sort === "popular") {
      slideshowOrderBy = { views: "desc" };
      scrollytellingOrderBy = { views: "desc" };
    } else if (sort === "featured") {
      slideshowOrderBy = { likes: "desc" };
      scrollytellingOrderBy = { likes: "desc" };
    }

    let allItems: GalleryItem[] = [];
    let totalSlideshow = 0;
    let totalScrollytelling = 0;

    // 获取幻灯片列表
    if (typeFilter === "all" || typeFilter === "slideshow") {
      const [slideshows, count] = await Promise.all([
        prisma.slideshow.findMany({
          orderBy: slideshowOrderBy,
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

      totalSlideshow = count;

      const slideshowItems: GalleryItem[] = slideshows.map((s) => {
        const images = JSON.parse(s.images) as string[];
        return {
          id: s.id,
          title: s.title,
          cover: s.cover || images[0] || null,
          type: 'slideshow' as const,
          imageCount: images.length,
          createdAt: s.createdAt,
          videoUrl: s.videoUrl,
          views: s.views,
          likes: s.likes,
          needsCover: !s.cover,
        };
      });

      allItems = [...allItems, ...slideshowItems];
    }

    // 获取一镜到底列表
    if (typeFilter === "all" || typeFilter === "scrollytelling") {
      const [scrollytellings, count] = await Promise.all([
        prisma.scrollytelling.findMany({
          orderBy: scrollytellingOrderBy,
          select: {
            id: true,
            title: true,
            cover: true,
            images: true,
            htmlUrl: true,
            createdAt: true,
            views: true,
            likes: true,
          },
        }),
        prisma.scrollytelling.count(),
      ]);

      totalScrollytelling = count;

      const scrollytellingItems: GalleryItem[] = scrollytellings.map((s) => {
        const images = JSON.parse(s.images) as string[];
        return {
          id: s.id,
          title: s.title,
          cover: s.cover || images[0] || null,
          type: 'scrollytelling' as const,
          imageCount: images.length,
          createdAt: s.createdAt,
          htmlUrl: s.htmlUrl,
          views: s.views,
          likes: s.likes,
          needsCover: !s.cover,
        };
      });

      allItems = [...allItems, ...scrollytellingItems];
    }

    // 排序混合列表
    if (sort === "latest") {
      allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === "popular") {
      allItems.sort((a, b) => b.views - a.views);
    } else if (sort === "featured") {
      allItems.sort((a, b) => b.likes - a.likes);
    }

    // 分页
    const total = allItems.length;
    const paginatedItems = allItems.slice(skip, skip + limit);

    // 触发没有封面的幻灯片生成封面（后台异步执行）
    const needsCoverSlideshowIds = paginatedItems
      .filter((item) => item.type === 'slideshow' && item.needsCover)
      .map((item) => item.id);

    if (needsCoverSlideshowIds.length > 0) {
      triggerCoverGenerationBatch(needsCoverSlideshowIds);
    }

    // 触发没有封面的一镜到底生成封面
    const needsCoverScrollytellingIds = paginatedItems
      .filter((item) => item.type === 'scrollytelling' && item.needsCover)
      .map((item) => item.id);

    if (needsCoverScrollytellingIds.length > 0) {
      triggerScrollytellingCoverBatch(needsCoverScrollytellingIds);
    }

    // 移除 needsCover 字段，不返回给前端
    const items = paginatedItems.map(({ needsCover, ...item }) => item);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      counts: {
        slideshow: totalSlideshow,
        scrollytelling: totalScrollytelling,
      },
    });
  } catch (error) {
    console.error("[Slides API] List error:", error);
    return NextResponse.json(
      { error: "获取列表失败" },
      { status: 500 }
    );
  }
}
