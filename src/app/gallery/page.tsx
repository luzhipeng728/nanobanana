import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { triggerCoverGenerationBatch } from "@/lib/cover-generator";
import GalleryClient from "./GalleryClient";

// 强制动态渲染，每次请求都执行服务端代码
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "作品画廊 | NanoBanana",
  description: "探索用户创作的精彩幻灯片作品",
};

// 服务端获取初始数据
async function getInitialSlides() {
  console.log("[Gallery] Fetching slides...");
  try {
    const slideshows = await prisma.slideshow.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
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
    });

    console.log(`[Gallery] Found ${slideshows.length} slides`);

    const items = slideshows.map((s) => {
      const images = JSON.parse(s.images) as string[];
      return {
        id: s.id,
        title: s.title,
        cover: s.cover || images[0] || null, // 优先使用专属封面
        imageCount: images.length,
        createdAt: s.createdAt.toISOString(),
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

    console.log(`[Gallery] Slides needing cover: ${needsCoverIds.length}`);

    if (needsCoverIds.length > 0) {
      triggerCoverGenerationBatch(needsCoverIds);
    }

    return items;
  } catch (error) {
    console.error("[Gallery] Failed to fetch slides:", error);
    return [];
  }
}

export default async function GalleryPage() {
  const initialSlides = await getInitialSlides();

  return <GalleryClient initialSlides={initialSlides} />;
}
