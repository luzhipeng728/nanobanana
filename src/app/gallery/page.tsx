import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import GalleryClient from "./GalleryClient";

export const metadata: Metadata = {
  title: "作品画廊 | NanoBanana",
  description: "探索用户创作的精彩幻灯片作品",
};

// 触发封面生成
async function triggerCoverGeneration(slideIds: string[]) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3004";

  for (const slideId of slideIds) {
    try {
      fetch(`${baseUrl}/api/slides/generate-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId }),
      }).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // 忽略错误
    }
  }
}

// 服务端获取初始数据
async function getInitialSlides() {
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
      },
    });

    const items = slideshows.map((s) => {
      const images = JSON.parse(s.images) as string[];
      return {
        id: s.id,
        title: s.title,
        cover: s.cover || images[0] || null, // 优先使用专属封面
        imageCount: images.length,
        createdAt: s.createdAt.toISOString(),
        needsCover: !s.cover, // 没有专属封面就需要生成
      };
    });

    // 触发没有封面的幻灯片生成封面
    const needsCoverIds = items
      .filter((item) => item.needsCover)
      .map((item) => item.id);

    if (needsCoverIds.length > 0) {
      console.log(`[Gallery] Triggering cover generation for ${needsCoverIds.length} slides:`, needsCoverIds);
      triggerCoverGeneration(needsCoverIds).catch((err) => {
        console.error("[Gallery] Failed to trigger cover generation:", err);
      });
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
