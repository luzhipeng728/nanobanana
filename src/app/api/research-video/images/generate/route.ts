/**
 * 批量生成配图
 * POST /api/research-video/images/generate
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBatchImages, ScriptSegment, TTSResult, ResearchVideoEvent } from "@/lib/research-video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, style } = body;

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

    if (project.segments.length === 0) {
      return NextResponse.json(
        { error: "请先生成脚本" },
        { status: 400 }
      );
    }

    // 检查是否所有分段都有音频
    const segmentsWithoutAudio = project.segments.filter(s => !s.audioUrl);
    if (segmentsWithoutAudio.length > 0) {
      return NextResponse.json(
        { error: "请先完成所有TTS生成" },
        { status: 400 }
      );
    }

    // 更新状态
    await prisma.researchVideoProject.update({
      where: { id: projectId },
      data: { status: "generating_images" },
    });

    // 转换数据 - 包含 v2 章节信息
    const segments: ScriptSegment[] = project.segments.map((seg) => ({
      order: seg.order,
      text: seg.text,
      estimatedDuration: seg.audioDuration || seg.text.length / 4.5,
      // v2: 章节信息
      chapterTitle: seg.chapterTitle || undefined,
      keyPoints: seg.keyPoints ? JSON.parse(seg.keyPoints) : [],
      visualStyle: (seg.visualStyle as ScriptSegment['visualStyle']) || 'infographic',
      // 原有字段
      imageHint: seg.imagePrompt || undefined,
    }));

    const ttsResults: TTSResult[] = project.segments.map((seg) => ({
      segmentOrder: seg.order,
      audioUrl: seg.audioUrl!,
      duration: seg.audioDuration || 0,
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
          // 批量生成图片
          const results = await generateBatchImages(
            {
              segments,
              ttsResults,
              imageModel: project.imageModel,
              aspectRatio: project.aspectRatio,
              style,
              topic: project.topic, // v2: 传递主题用于生成更好的提示词
            },
            send
          );

          // 更新分段记录（支持多图模式）
          for (const result of results) {
            const updateData: Record<string, unknown> = {
              imageUrl: result.imageUrl,      // 主图（兼容旧模式）
              imagePrompt: result.prompt,
              imageStatus: "completed",
            };

            // 如果有多图数据，保存到 images 字段
            if (result.images && result.images.length > 0) {
              updateData.images = JSON.stringify(result.images);
            }

            await prisma.researchVideoSegment.updateMany({
              where: {
                projectId,
                order: result.segmentOrder,
              },
              data: updateData,
            });
          }

          // 更新项目状态
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: { status: "ready_for_edit" },
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
            message: error instanceof Error ? error.message : "图片生成失败",
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
    console.error("[ResearchVideo] Images generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片生成失败" },
      { status: 500 }
    );
  }
}
