import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 点赞/取消点赞/检查状态
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { userIdentifier, action } = body as {
      userIdentifier: string;
      action: 'like' | 'unlike' | 'check';
    };

    if (!userIdentifier) {
      return NextResponse.json(
        { success: false, error: "缺少用户标识" },
        { status: 400 }
      );
    }

    // 检查点赞状态
    const existingLike = await prisma.scrollytellingLike.findUnique({
      where: {
        scrollytellingId_userIdentifier: {
          scrollytellingId: id,
          userIdentifier,
        },
      },
    });

    if (action === 'check') {
      const scrollytelling = await prisma.scrollytelling.findUnique({
        where: { id },
        select: { likes: true },
      });

      return NextResponse.json({
        success: true,
        liked: !!existingLike,
        likes: scrollytelling?.likes || 0,
      });
    }

    if (action === 'like' && !existingLike) {
      // 添加点赞
      await prisma.$transaction([
        prisma.scrollytellingLike.create({
          data: {
            scrollytellingId: id,
            userIdentifier,
          },
        }),
        prisma.scrollytelling.update({
          where: { id },
          data: { likes: { increment: 1 } },
        }),
      ]);
    } else if (action === 'unlike' && existingLike) {
      // 取消点赞
      await prisma.$transaction([
        prisma.scrollytellingLike.delete({
          where: { id: existingLike.id },
        }),
        prisma.scrollytelling.update({
          where: { id },
          data: { likes: { decrement: 1 } },
        }),
      ]);
    }

    // 获取最新数据
    const scrollytelling = await prisma.scrollytelling.findUnique({
      where: { id },
      select: { likes: true },
    });

    const newLikeStatus = await prisma.scrollytellingLike.findUnique({
      where: {
        scrollytellingId_userIdentifier: {
          scrollytellingId: id,
          userIdentifier,
        },
      },
    });

    return NextResponse.json({
      success: true,
      liked: !!newLikeStatus,
      likes: scrollytelling?.likes || 0,
    });
  } catch (error) {
    console.error("[Scrollytelling Like API] Error:", error);
    return NextResponse.json(
      { success: false, error: "操作失败" },
      { status: 500 }
    );
  }
}
