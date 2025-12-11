import { NextRequest, NextResponse } from "next/server";
import { createPPTTask } from "@/app/actions/ppt-task";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, template, primaryColor, description, materials } = body;

    if (!topic) {
      return NextResponse.json(
        { success: false, error: "Topic is required" },
        { status: 400 }
      );
    }

    // 创建异步任务
    const { taskId } = await createPPTTask(
      topic,
      template || "business",
      primaryColor || "#3B82F6",
      description,
      materials || []
    );

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      taskId,
    });
  } catch (error) {
    console.error("API ppt/generate error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
