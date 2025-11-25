import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // 获取已完成的图片任务
    const [images, total] = await Promise.all([
      prisma.imageTask.findMany({
        where: {
          status: "completed",
          imageUrl: { not: null },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          prompt: true,
          model: true,
          imageUrl: true,
          createdAt: true,
        },
      }),
      prisma.imageTask.count({
        where: {
          status: "completed",
          imageUrl: { not: null },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        images,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Gallery API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch gallery" },
      { status: 500 }
    );
  }
}

