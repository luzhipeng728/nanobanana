import { NextRequest, NextResponse } from "next/server";
import { createVideoTask, SoraDuration } from "@/app/actions/video-task";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, orientation, inputImage, durationSeconds } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    // 验证时长参数（Sora2 API 支持 10s 和 15s）
    const validDurations: SoraDuration[] = ["10", "15"];
    const duration: SoraDuration = validDurations.includes(durationSeconds)
      ? durationSeconds
      : "10"; // 默认 10 秒

    // 创建异步任务
    const { taskId } = await createVideoTask(
      prompt,
      orientation || "portrait",
      inputImage,
      duration
    );

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      taskId,
    });
  } catch (error) {
    console.error("API generate-video error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
