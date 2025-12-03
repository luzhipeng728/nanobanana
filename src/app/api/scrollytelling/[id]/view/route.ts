import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 记录浏览量
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const scrollytelling = await prisma.scrollytelling.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });

    return NextResponse.json({
      success: true,
      views: scrollytelling.views,
    });
  } catch (error) {
    console.error("[Scrollytelling View API] Error:", error);
    return NextResponse.json(
      { success: false, error: "记录浏览量失败" },
      { status: 500 }
    );
  }
}
