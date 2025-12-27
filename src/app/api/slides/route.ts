import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerCoverGenerationBatch } from "@/lib/cover-generator";
import { triggerScrollytellingCoverBatch } from "@/lib/scrollytelling-cover-generator";

// 统一的画廊项目类型
interface GalleryItem {
  id: string;
  title: string;
  cover: string | null;
  type: 'slideshow' | 'scrollytelling' | 'ppt' | 'research-video';
  imageCount?: number;
  createdAt: Date;
  views: number;
  likes: number;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  pptUrl?: string | null;
  previewUrl?: string | null;
  duration?: number | null;
  needsCover?: boolean;
}

// 获取所有公开的幻灯片和一镜到底列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const sort = searchParams.get("sort") || "latest"; // latest, popular, featured
    const typeFilter = searchParams.get("type") || "all"; // all, slideshow, scrollytelling, ppt, research-video
    const skip = (page - 1) * limit;

    let slideshowOrderBy: any = { createdAt: "desc" };
    let scrollytellingOrderBy: any = { createdAt: "desc" };
    let pptOrderBy: any = { createdAt: "desc" };

    if (sort === "popular") {
      slideshowOrderBy = { views: "desc" };
      scrollytellingOrderBy = { views: "desc" };
      // PPT 暂无 views 字段，用 createdAt 代替
      pptOrderBy = { createdAt: "desc" };
    } else if (sort === "featured") {
      slideshowOrderBy = { likes: "desc" };
      scrollytellingOrderBy = { likes: "desc" };
      // PPT 暂无 likes 字段，用 createdAt 代替
      pptOrderBy = { createdAt: "desc" };
    }

    let allItems: GalleryItem[] = [];
    let totalSlideshow = 0;
    let totalScrollytelling = 0;
    let totalPPT = 0;
    let totalResearchVideo = 0;

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

    // 获取 PPT 列表
    if (typeFilter === "all" || typeFilter === "ppt") {
      const [ppts, count] = await Promise.all([
        prisma.pPTTask.findMany({
          where: {
            status: "completed",
            deletedAt: null,
            pptUrl: { not: null },
          },
          orderBy: pptOrderBy,
          select: {
            id: true,
            topic: true,
            description: true,
            slides: true,
            pptUrl: true,
            primaryColor: true,
            createdAt: true,
          },
        }),
        prisma.pPTTask.count({
          where: {
            status: "completed",
            deletedAt: null,
            pptUrl: { not: null },
          },
        }),
      ]);

      totalPPT = count;

      const pptItems: GalleryItem[] = ppts.map((p) => {
        // 尝试解析 slides 获取第一张幻灯片作为封面
        let slideCount = 0;
        let coverImage: string | null = null;
        if (p.slides) {
          try {
            const slidesData = JSON.parse(p.slides);
            slideCount = Array.isArray(slidesData) ? slidesData.length : 0;
            // 尝试获取第一张幻灯片的图片
            if (Array.isArray(slidesData) && slidesData[0]?.imageUrl) {
              coverImage = slidesData[0].imageUrl;
            }
          } catch {
            // ignore
          }
        }

        // 生成 Office Online 预览链接
        const previewUrl = p.pptUrl
          ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(p.pptUrl)}`
          : null;

        return {
          id: p.id,
          title: p.topic,
          cover: coverImage,
          type: 'ppt' as const,
          imageCount: slideCount,
          createdAt: p.createdAt,
          pptUrl: p.pptUrl,
          previewUrl,
          views: 0, // PPT 暂无统计
          likes: 0, // PPT 暂无统计
        };
      });

      allItems = [...allItems, ...pptItems];
    }

    // 获取研究视频列表
    if (typeFilter === "all" || typeFilter === "research-video") {
      const [researchVideos, count] = await Promise.all([
        prisma.researchVideoProject.findMany({
          where: {
            status: "completed",
            videoUrl: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            topic: true,
            coverUrl: true,
            videoUrl: true,
            duration: true,
            createdAt: true,
          },
        }),
        prisma.researchVideoProject.count({
          where: {
            status: "completed",
            videoUrl: { not: null },
          },
        }),
      ]);

      totalResearchVideo = count;

      const researchVideoItems: GalleryItem[] = researchVideos.map((v) => ({
        id: v.id,
        title: v.title || v.topic,
        cover: v.coverUrl,
        type: 'research-video' as const,
        createdAt: v.createdAt,
        videoUrl: v.videoUrl,
        duration: v.duration,
        views: 0,
        likes: 0,
      }));

      allItems = [...allItems, ...researchVideoItems];
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
        ppt: totalPPT,
        'research-video': totalResearchVideo,
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
