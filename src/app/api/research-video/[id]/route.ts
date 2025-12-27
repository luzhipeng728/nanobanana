/**
 * 研究视频项目详情
 * GET /api/research-video/[id] - 获取项目详情
 * DELETE /api/research-video/[id] - 删除项目
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.researchVideoProject.findUnique({
      where: { id },
      include: {
        segments: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    // 解析 JSON 字段
    const researchDimensions = project.researchDimensions
      ? JSON.parse(project.researchDimensions)
      : null;

    return NextResponse.json({
      success: true,
      project: {
        ...project,
        researchDimensions,
      },
    });
  } catch (error) {
    console.error("[ResearchVideo] Get error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取项目失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 软删除
    await prisma.researchVideoProject.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ResearchVideo] Delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除项目失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      "title",
      "status",
      "speaker",
      "speed",
      "imageModel",
      "aspectRatio",
      "researchDimensions",
      "researchResults",
      "fullScript",
      "videoUrl",
      "coverUrl",
      "duration",
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "researchDimensions" && typeof body[field] === "object") {
          updateData[field] = JSON.stringify(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const project = await prisma.researchVideoProject.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("[ResearchVideo] Patch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新项目失败" },
      { status: 500 }
    );
  }
}
