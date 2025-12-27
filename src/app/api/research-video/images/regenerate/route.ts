/**
 * 重新生成单个分段的配图
 * POST /api/research-video/images/regenerate
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { regenerateSegmentImage, ScriptSegment } from "@/lib/research-video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { segmentId, customPrompt } = body;

    if (!segmentId) {
      return NextResponse.json(
        { error: "缺少分段ID" },
        { status: 400 }
      );
    }

    // 获取分段
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

    // 更新分段状态
    await prisma.researchVideoSegment.update({
      where: { id: segmentId },
      data: { imageStatus: "generating" },
    });

    try {
      // 重新生成图片
      const scriptSegment: ScriptSegment = {
        order: segment.order,
        text: segment.text,
        estimatedDuration: segment.audioDuration || segment.text.length / 4.5,
        imageHint: segment.imagePrompt || undefined,
      };

      const result = await regenerateSegmentImage(
        scriptSegment,
        segment.project.imageModel,
        segment.project.aspectRatio,
        customPrompt
      );

      // 更新分段记录
      await prisma.researchVideoSegment.update({
        where: { id: segmentId },
        data: {
          imageUrl: result.imageUrl,
          imagePrompt: result.prompt,
          imageStatus: "completed",
        },
      });

      return NextResponse.json({
        success: true,
        imageUrl: result.imageUrl,
        prompt: result.prompt,
      });
    } catch (error) {
      await prisma.researchVideoSegment.update({
        where: { id: segmentId },
        data: { imageStatus: "failed" },
      });

      throw error;
    }
  } catch (error) {
    console.error("[ResearchVideo] Image regenerate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片重新生成失败" },
      { status: 500 }
    );
  }
}
