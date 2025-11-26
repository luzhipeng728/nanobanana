import { NextRequest, NextResponse } from "next/server";
import { createVeoTask } from "@/app/actions/veo-task";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userRequest, aspectRatio, resolution, durationSeconds, inputImage } = body;

    if (!userRequest) {
      return NextResponse.json(
        { success: false, error: "userRequest is required" },
        { status: 400 }
      );
    }

    // 创建异步任务（AI 会自动分析并生成详细提示词）
    const { taskId } = await createVeoTask({
      userRequest,
      aspectRatio: aspectRatio || "16:9",
      resolution: resolution || "720p",
      durationSeconds: durationSeconds || 8,
      inputImage,
    });

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      taskId,
    });
  } catch (error) {
    console.error("API generate-veo error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
