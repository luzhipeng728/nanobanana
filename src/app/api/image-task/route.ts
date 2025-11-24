import { NextRequest, NextResponse } from "next/server";
import { getImageTaskStatus } from "@/app/actions/image-task";

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
    const task = await getImageTaskStatus(taskId);

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error fetching task status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
