/**
 * 批量生成 TTS 音频
 * POST /api/research-video/tts/generate
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBatchTTS, ScriptSegment, ResearchVideoEvent } from "@/lib/research-video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "缺少项目ID" },
        { status: 400 }
      );
    }

    // 获取项目和分段
    const project = await prisma.researchVideoProject.findUnique({
      where: { id: projectId },
      include: {
        segments: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    console.log(`[TTS] Project ${projectId} has ${project.segments.length} segments`);
    if (project.segments.length === 0) {
      console.error(`[TTS] No segments found for project ${projectId}`);
      return NextResponse.json(
        { error: "请先生成脚本" },
        { status: 400 }
      );
    }

    // 更新状态
    await prisma.researchVideoProject.update({
      where: { id: projectId },
      data: { status: "generating_tts" },
    });

    // 转换为 ScriptSegment 格式
    const segments: ScriptSegment[] = project.segments.map((seg) => ({
      order: seg.order,
      text: seg.text,
      estimatedDuration: seg.text.length / 4.5,
      emotion: seg.ttsParams
        ? JSON.parse(seg.ttsParams).emotion
        : undefined,
    }));

    // 使用 SSE 流式返回
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ResearchVideoEvent) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        // 心跳
        const heartbeatInterval = setInterval(() => {
          send({ type: "heartbeat", timestamp: Date.now() });
        }, 5000);

        try {
          // 批量生成 TTS
          const results = await generateBatchTTS(
            {
              segments,
              speaker: project.speaker,
              speed: project.speed,
              normalizeVolume: true,
            },
            send
          );

          // 更新分段记录
          for (const result of results) {
            await prisma.researchVideoSegment.updateMany({
              where: {
                projectId,
                order: result.segmentOrder,
              },
              data: {
                audioUrl: result.audioUrl,
                audioDuration: result.duration,
                ttsStatus: "completed",
              },
            });
          }

          // 更新项目状态
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: { status: "draft" },
          });

          send({
            type: "complete",
            data: { resultsCount: results.length },
          });
        } catch (error) {
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: { status: "failed" },
          });

          send({
            type: "error",
            message: error instanceof Error ? error.message : "TTS生成失败",
          });
        } finally {
          clearInterval(heartbeatInterval);
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ResearchVideo] TTS generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS生成失败" },
      { status: 500 }
    );
  }
}
