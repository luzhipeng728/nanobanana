import { NextRequest, NextResponse } from "next/server";
import { getPPTTaskStatus } from "@/app/actions/ppt-task";
import { readFile, access } from "fs/promises";
import { constants } from "fs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "Task ID is required" },
        { status: 400 }
      );
    }

    // 获取任务信息
    const task = await getPPTTaskStatus(taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.status !== "completed") {
      return NextResponse.json(
        { success: false, error: "PPT not ready yet" },
        { status: 400 }
      );
    }

    if (!task.pptUrl) {
      return NextResponse.json(
        { success: false, error: "PPT file not available" },
        { status: 404 }
      );
    }

    // 检查是否是完整 URL（R2 存储）还是本地文件路径
    const isUrl = task.pptUrl.startsWith("http://") || task.pptUrl.startsWith("https://");

    if (isUrl) {
      // 如果是完整 URL，直接重定向
      return NextResponse.redirect(task.pptUrl);
    }

    // 本地文件路径处理
    let filePath = task.pptUrl;

    // 如果路径不是绝对路径，尝试在 public/ppt 目录下查找
    if (!filePath.startsWith("/")) {
      filePath = `${process.cwd()}/public/ppt/${taskId}/presentation.pptx`;
    }

    // 检查文件是否存在
    try {
      await access(filePath, constants.R_OK);
    } catch {
      return NextResponse.json(
        { success: false, error: "PPT file not found on server" },
        { status: 404 }
      );
    }

    // 读取文件并返回下载流
    const fileBuffer = await readFile(filePath);

    // 生成下载文件名
    const fileName = `${task.topic || "presentation"}-${taskId.slice(0, 8)}.pptx`;
    const safeFileName = encodeURIComponent(fileName);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeFileName}"; filename*=UTF-8''${safeFileName}`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("API ppt/export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
