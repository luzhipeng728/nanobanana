import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 简单的浏览量+1
    const slide = await prisma.slideshow.update({
      where: { id },
      data: {
        views: {
          increment: 1,
        },
      },
      select: {
        views: true,
      },
    });

    return NextResponse.json({ success: true, views: slide.views });
  } catch (error) {
    console.error("[API] Failed to increment view count:", error);
    return NextResponse.json({ error: "Failed to increment view count" }, { status: 500 });
  }
}

