import { NextRequest, NextResponse } from "next/server";
import { createVideoTask } from "@/app/actions/video-task";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, orientation, inputImage } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    // 创建异步任务
    const { taskId } = await createVideoTask(
      prompt,
      orientation || "portrait",
      inputImage
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
