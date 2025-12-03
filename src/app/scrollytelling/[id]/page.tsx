import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ScrollytellingViewer from "./ScrollytellingViewer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ScrollytellingPage({ params }: PageProps) {
  const { id } = await params;

  const scrollytelling = await prisma.scrollytelling.findUnique({
    where: { id },
  });

  if (!scrollytelling) {
    notFound();
  }

  return (
    <ScrollytellingViewer
      scrollytellingId={scrollytelling.id}
      title={scrollytelling.title}
      htmlUrl={scrollytelling.htmlUrl}
      cover={scrollytelling.cover}
      createdAt={scrollytelling.createdAt.toISOString()}
      views={scrollytelling.views}
      likes={scrollytelling.likes}
    />
  );
}

// 生成静态元数据
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;

  const scrollytelling = await prisma.scrollytelling.findUnique({
    where: { id },
    select: { title: true, cover: true },
  });

  if (!scrollytelling) {
    return { title: "页面不存在" };
  }

  return {
    title: `${scrollytelling.title} - 一镜到底`,
    openGraph: {
      title: scrollytelling.title,
      images: scrollytelling.cover ? [scrollytelling.cover] : [],
    },
  };
}
