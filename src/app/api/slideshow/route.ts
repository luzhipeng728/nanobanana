import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

// 创建幻灯片
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, images, prompts } = body;

    // 验证参数
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "标题不能为空" },
        { status: 400 }
      );
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "至少需要选择一张图片" },
        { status: 400 }
      );
    }

    // 验证所有图片 URL 有效
    const validImages = images.filter(
      (url) => typeof url === "string" && url.startsWith("http")
    );

    if (validImages.length === 0) {
      return NextResponse.json(
        { error: "没有有效的图片" },
        { status: 400 }
      );
    }

    // 获取当前用户 ID（可选）
    let userId: string | null = null;
    try {
      const cookieStore = await cookies();
      userId = cookieStore.get("userId")?.value || null;
    } catch {
      // 忽略 cookie 读取错误
    }

    // 创建幻灯片
    const slideshow = await prisma.slideshow.create({
      data: {
        title: title.trim(),
        images: JSON.stringify(validImages),
        prompts: prompts ? JSON.stringify(prompts) : null,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      id: slideshow.id,
      url: `/slides/${slideshow.id}`,
    });
  } catch (error) {
    console.error("[Slideshow API] Create error:", error);
    return NextResponse.json(
      { error: "创建幻灯片失败" },
      { status: 500 }
    );
  }
}

// 获取幻灯片详情
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "缺少幻灯片 ID" },
        { status: 400 }
      );
    }

    const slideshow = await prisma.slideshow.findUnique({
      where: { id },
    });

    if (!slideshow) {
      return NextResponse.json(
        { error: "幻灯片不存在" },
        { status: 404 }
      );
    }

    const images: string[] = JSON.parse(slideshow.images);
    let prompts: string[] = slideshow.prompts ? JSON.parse(slideshow.prompts) : [];

    // 如果 prompts 为空或全是空字符串，通过 imageUrl 去 ImageTask 表匹配
    const hasValidPrompts = prompts.some(p => p && p.trim().length > 0);
    if (!hasValidPrompts && images.length > 0) {
      const imageTasks = await prisma.imageTask.findMany({
        where: {
          imageUrl: { in: images },
        },
        select: {
          imageUrl: true,
          prompt: true,
        },
      });

      // 构建 URL -> prompt 映射
      const urlToPrompt = new Map<string, string>();
      for (const task of imageTasks) {
        if (task.imageUrl) {
          urlToPrompt.set(task.imageUrl, task.prompt);
        }
      }

      // 按图片顺序获取 prompts
      prompts = images.map(url => urlToPrompt.get(url) || "");
      console.log(`[Slideshow API] Matched ${imageTasks.length} prompts from ImageTask table`);
    }

    return NextResponse.json({
      id: slideshow.id,
      title: slideshow.title,
      images,
      prompts,
      createdAt: slideshow.createdAt,
    });
  } catch (error) {
    console.error("[Slideshow API] Get error:", error);
    return NextResponse.json(
      { error: "获取幻灯片失败" },
      { status: 500 }
    );
  }
}
