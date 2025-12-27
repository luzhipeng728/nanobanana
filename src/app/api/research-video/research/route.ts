/**
 * 并行执行深度研究
 * POST /api/research-video/research
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeParallelResearch, ResearchDimension, ResearchVideoEvent } from "@/lib/research-video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, reasoningEffort = "low" } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "缺少项目ID" },
        { status: 400 }
      );
    }

    // 获取项目和研究维度
    const project = await prisma.researchVideoProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    if (!project.researchDimensions) {
      return NextResponse.json(
        { error: "请先生成研究维度" },
        { status: 400 }
      );
    }

    const dimensions: ResearchDimension[] = JSON.parse(project.researchDimensions);

    // 更新状态为研究中
    await prisma.researchVideoProject.update({
      where: { id: projectId },
      data: { status: "researching" },
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

        // 心跳保持连接
        const heartbeatInterval = setInterval(() => {
          send({ type: "heartbeat", timestamp: Date.now() });
        }, 10000);

        try {
          // 执行并行研究
          const result = await executeParallelResearch(
            {
              dimensions,
              topic: project.topic,
              reasoningEffort: reasoningEffort as 'low' | 'medium' | 'high',
            },
            send
          );

          // 保存研究结果
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: {
              researchDimensions: JSON.stringify(result.dimensions),
              researchResults: result.mergedResult,
              status: "draft",
            },
          });

          send({
            type: "complete",
            data: {
              mergedResultLength: result.mergedResult.length,
              totalTime: result.totalTime,
            },
          });
        } catch (error) {
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: { status: "failed" },
          });

          send({
            type: "error",
            message: error instanceof Error ? error.message : "研究执行失败",
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
    console.error("[ResearchVideo] Research error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "研究执行失败" },
      { status: 500 }
    );
  }
}
