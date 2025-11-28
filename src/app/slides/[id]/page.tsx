import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SlideshowViewer from "./SlideshowViewer";

interface PageProps {
  params: Promise<{ id: string }>;
}

// 获取幻灯片数据
async function getSlideshow(id: string) {
  try {
    const slideshow = await prisma.slideshow.findUnique({
      where: { id },
    });
    return slideshow;
  } catch {
    return null;
  }
}

// 生成页面元数据
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const slideshow = await getSlideshow(id);

  if (!slideshow) {
    return {
      title: "幻灯片不存在",
    };
  }

  const images = JSON.parse(slideshow.images) as string[];

  return {
    title: slideshow.title,
    description: `${slideshow.title} - 包含 ${images.length} 张图片`,
    openGraph: {
      title: slideshow.title,
      description: `包含 ${images.length} 张图片的幻灯片`,
      images: images.length > 0 ? [images[0]] : [],
    },
  };
}

export default async function SlideshowPage({ params }: PageProps) {
  const { id } = await params;
  const slideshow = await getSlideshow(id);

  if (!slideshow) {
    notFound();
  }

  const images = JSON.parse(slideshow.images) as string[];

  return (
    <SlideshowViewer
      title={slideshow.title}
      images={images}
      createdAt={slideshow.createdAt.toISOString()}
    />
  );
}
