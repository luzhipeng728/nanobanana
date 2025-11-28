import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import GalleryClient from "./GalleryClient";

export const metadata: Metadata = {
  title: "作品画廊 | NanoBanana",
  description: "探索用户创作的精彩幻灯片作品",
};

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

    return slideshows.map((s) => {
      const images = JSON.parse(s.images) as string[];
      return {
        id: s.id,
        title: s.title,
        cover: s.cover || images[0] || null, // 优先使用专属封面
        imageCount: images.length,
        createdAt: s.createdAt.toISOString(),
        needsCover: !s.cover && !images[0], // 标记需要生成封面
      };
    });
  } catch (error) {
    console.error("[Gallery] Failed to fetch slides:", error);
    return [];
  }
}

export default async function GalleryPage() {
  const initialSlides = await getInitialSlides();

  return <GalleryClient initialSlides={initialSlides} />;
}
