import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userIdentifier, action } = await request.json();

    if (!userIdentifier) {
      return NextResponse.json({ error: "Missing user identifier" }, { status: 400 });
    }

    if (action === 'like') {
      // 检查是否已经点赞
      const existingLike = await prisma.slideshowLike.findUnique({
        where: {
          slideshowId_userIdentifier: {
            slideshowId: id,
            userIdentifier,
          },
        },
      });

      if (existingLike) {
        return NextResponse.json({ success: true, liked: true, message: "Already liked" });
      }

      // 创建点赞记录并更新计数
      // 使用事务保证一致性
      const [_, slide] = await prisma.$transaction([
        prisma.slideshowLike.create({
          data: {
            slideshowId: id,
            userIdentifier,
          },
        }),
        prisma.slideshow.update({
          where: { id },
          data: {
            likes: {
              increment: 1,
            },
          },
          select: { likes: true },
        }),
      ]);

      return NextResponse.json({ success: true, liked: true, likes: slide.likes });
    } else if (action === 'unlike') {
      // 取消点赞
      const existingLike = await prisma.slideshowLike.findUnique({
        where: {
          slideshowId_userIdentifier: {
            slideshowId: id,
            userIdentifier,
          },
        },
      });

      if (!existingLike) {
        return NextResponse.json({ success: true, liked: false, message: "Not liked yet" });
      }

      const [_, slide] = await prisma.$transaction([
        prisma.slideshowLike.delete({
          where: {
            slideshowId_userIdentifier: {
              slideshowId: id,
              userIdentifier,
            },
          },
        }),
        prisma.slideshow.update({
          where: { id },
          data: {
            likes: {
              decrement: 1,
            },
          },
          select: { likes: true },
        }),
      ]);

      return NextResponse.json({ success: true, liked: false, likes: slide.likes });
    } else if (action === 'check') {
        // 仅检查状态
        const existingLike = await prisma.slideshowLike.findUnique({
            where: {
              slideshowId_userIdentifier: {
                slideshowId: id,
                userIdentifier,
              },
            },
          });
        
        // 获取当前点赞数
        const slide = await prisma.slideshow.findUnique({
            where: { id },
            select: { likes: true }
        });

        return NextResponse.json({ 
            success: true, 
            liked: !!existingLike, 
            likes: slide?.likes || 0 
        });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[API] Failed to toggle like:", error);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}

