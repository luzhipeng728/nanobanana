/**
 * 创建研究视频项目
 * POST /api/research-video/create
 */

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

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();

    const {
      topic,
      speaker = "zh_female_vivi",
      speed = 1.0,
      emotion = "",
      imageModel = "gemini-2.0-flash-exp",
      aspectRatio = "16:9",
      documentContent,  // 可选的文档内容
    } = body;

    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json(
        { error: "请输入主题" },
        { status: 400 }
      );
    }

    // 创建项目
    const project = await prisma.researchVideoProject.create({
      data: {
        topic: topic.trim(),
        status: "draft",
        speaker,
        speed,
        imageModel,
        aspectRatio,
        userId: userId,
        // 如果提供了文档内容，直接设置为研究结果（跳过深度研究）
        ...(documentContent ? {
          researchResults: `# ${topic}\n\n> 来源：用户上传文档\n\n${documentContent}`,
        } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      projectId: project.id,
      project,
    });
  } catch (error) {
    console.error("[ResearchVideo] Create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建项目失败" },
      { status: 500 }
    );
  }
}
