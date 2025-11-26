import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// 获取当前用户 ID
async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("userId")?.value || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;
    const myOnly = searchParams.get("my") === "true";  // 是否只看自己的

    const currentUserId = await getCurrentUserId();

    // 构建查询条件
    const where: any = {
      status: "completed",
      imageUrl: { not: null },
    };

    // 如果只看自己的，添加 userId 过滤
    if (myOnly && currentUserId) {
      where.userId = currentUserId;
    }

    // 获取已完成的图片任务，包含用户信息
    const [images, total] = await Promise.all([
      prisma.imageTask.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          prompt: true,
          model: true,
          imageUrl: true,
          createdAt: true,
          userId: true,
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
      prisma.imageTask.count({ where }),
    ]);

    // 格式化返回数据
    const formattedImages = images.map((img) => ({
      id: img.id,
      prompt: img.prompt,
      model: img.model,
      imageUrl: img.imageUrl,
      createdAt: img.createdAt,
      userId: img.userId,
      username: img.user?.username || "匿名用户",
      isOwner: currentUserId ? img.userId === currentUserId : false,
    }));

    return NextResponse.json({
      success: true,
      data: {
        images: formattedImages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        currentUserId,  // 返回当前用户 ID，前端可以用来判断
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
