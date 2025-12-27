/**
 * 重新生成单个分段的 TTS
 * POST /api/research-video/tts/regenerate
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { regenerateSegmentTTS, ScriptSegment, TTSParams } from "@/lib/research-video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { segmentId, text, ttsParams } = body;

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
      data: {
        ttsStatus: "generating",
        text: text || segment.text,
      },
    });

    try {
      // 重新生成 TTS
      const scriptSegment: ScriptSegment = {
        order: segment.order,
        text: text || segment.text,
        estimatedDuration: (text || segment.text).length / 4.5,
      };

      const result = await regenerateSegmentTTS(
        scriptSegment,
        segment.project.speaker,
        segment.project.speed,
        ttsParams as TTSParams
      );

      // 更新分段记录
      await prisma.researchVideoSegment.update({
        where: { id: segmentId },
        data: {
          audioUrl: result.audioUrl,
          audioDuration: result.duration,
          ttsStatus: "completed",
          ttsParams: ttsParams ? JSON.stringify(ttsParams) : segment.ttsParams,
        },
      });

      return NextResponse.json({
        success: true,
        audioUrl: result.audioUrl,
        duration: result.duration,
      });
    } catch (error) {
      await prisma.researchVideoSegment.update({
        where: { id: segmentId },
        data: { ttsStatus: "failed" },
      });

      throw error;
    }
  } catch (error) {
    console.error("[ResearchVideo] TTS regenerate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS重新生成失败" },
      { status: 500 }
    );
  }
}
