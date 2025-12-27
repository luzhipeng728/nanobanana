/**
 * 分段操作
 * PATCH /api/research-video/segment/[segmentId] - 更新分段
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  try {
    const { segmentId } = await params;
    const body = await request.json();

    const allowedFields = [
      "text",
      "audioUrl",
      "audioDuration",
      "ttsStatus",
      "ttsParams",
      "imageUrl",
      "imagePrompt",
      "imageStatus",
      "cameraMove",
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if ((field === "ttsParams" || field === "cameraMove") && typeof body[field] === "object") {
          updateData[field] = JSON.stringify(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const segment = await prisma.researchVideoSegment.update({
      where: { id: segmentId },
      data: updateData,
    });

    return NextResponse.json({ success: true, segment });
  } catch (error) {
    console.error("[ResearchVideo] Segment update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新分段失败" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  try {
    const { segmentId } = await params;

    const segment = await prisma.researchVideoSegment.findUnique({
      where: { id: segmentId },
      include: { project: true },
    });

    if (!segment) {
      return NextResponse.json(
        { error: "分段不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, segment });
  } catch (error) {
    console.error("[ResearchVideo] Segment get error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取分段失败" },
      { status: 500 }
    );
  }
}
