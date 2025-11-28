import { NextRequest, NextResponse } from "next/server";
import { generateCoverForSlide } from "@/lib/cover-generator";

// 为指定 slide 生成封面图
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slideId } = body;

    if (!slideId) {
      return NextResponse.json(
        { error: "缺少 slideId" },
        { status: 400 }
      );
    }

    const result = await generateCoverForSlide(slideId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "生成封面失败" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Cover Generator API] Error:", error);
    return NextResponse.json(
      { error: "生成封面失败" },
      { status: 500 }
    );
  }
}
