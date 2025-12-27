/**
 * 合成最终视频
 * POST /api/research-video/compose
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { composeResearchVideo, VideoSegmentData, ResearchVideoEvent, checkFFmpeg } from "@/lib/research-video";

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

    // 检查 FFmpeg
    if (!checkFFmpeg()) {
      return NextResponse.json(
        { error: "FFmpeg 未安装或不可用" },
        { status: 500 }
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

    // 检查所有分段是否完整
    const incompleteSegments = project.segments.filter(
      (s) => !s.audioUrl || !s.imageUrl
    );

    if (incompleteSegments.length > 0) {
      return NextResponse.json(
        { error: `${incompleteSegments.length} 个分段尚未完成` },
        { status: 400 }
      );
    }

    // 更新状态
    await prisma.researchVideoProject.update({
      where: { id: projectId },
      data: { status: "composing" },
    });

    // 准备分段数据（支持多图模式）
    const segments: VideoSegmentData[] = project.segments.map((seg) => {
      const baseData = {
        order: seg.order,
        text: seg.text,
        audioUrl: seg.audioUrl!,
        audioDuration: seg.audioDuration || 3,
        imageUrl: seg.imageUrl!,
      };

      // 解析多图数据
      if (seg.images) {
        try {
          const images = JSON.parse(seg.images);
          if (Array.isArray(images) && images.length > 0) {
            return {
              ...baseData,
              images: images.map((img: { imageUrl: string; durationRatio: number }) => ({
                imageUrl: img.imageUrl,
                durationRatio: img.durationRatio || 1 / images.length,
              })),
            };
          }
        } catch (e) {
          console.error(`[Compose] 解析章节 ${seg.order} 的多图数据失败:`, e);
        }
      }

      return baseData;
    });

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
          // 合成视频
          const result = await composeResearchVideo(
            {
              projectId,
              segments,
              aspectRatio: project.aspectRatio,
            },
            send
          );

          // 更新项目
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: {
              videoUrl: result.videoUrl,
              coverUrl: result.coverUrl,
              duration: result.duration,
              status: "completed",
              completedAt: new Date(),
            },
          });

          send({
            type: "complete",
            data: result,
          });
        } catch (error) {
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: { status: "failed" },
          });

          send({
            type: "error",
            message: error instanceof Error ? error.message : "视频合成失败",
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
    console.error("[ResearchVideo] Compose error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视频合成失败" },
      { status: 500 }
    );
  }
}
