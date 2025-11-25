import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json(
      { error: "taskId is required" },
      { status: 400 }
    );
  }

  try {
    const task = await prisma.stickerTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // 解析 JSON 字段
    const frames = task.frames ? JSON.parse(task.frames) : [];
    const frameStatuses = task.frameStatuses ? JSON.parse(task.frameStatuses) : [];

    return NextResponse.json({
      id: task.id,
      status: task.status,
      animationType: task.animationType,
      totalFrames: task.totalFrames,
      completedFrames: task.completedFrames,
      frames,
      frameStatuses,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    });
  } catch (error) {
    console.error("Error fetching sticker task status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

