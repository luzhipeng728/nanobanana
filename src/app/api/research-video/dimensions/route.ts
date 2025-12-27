/**
 * 生成研究维度
 * POST /api/research-video/dimensions
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateResearchDimensions, ResearchDimension } from "@/lib/research-video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, topic, maxDimensions = 4 } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "缺少项目ID" },
        { status: 400 }
      );
    }

    // 检查项目存在
    const project = await prisma.researchVideoProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    const useTopic = topic || project.topic;

    // 使用 SSE 流式返回
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          send({ type: "dimensions_generating", message: "正在生成研究维度..." });

          // 生成研究维度
          const dimensions = await generateResearchDimensions({
            topic: useTopic,
            maxDimensions,
          });

          // 保存到数据库
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: {
              researchDimensions: JSON.stringify(dimensions),
              status: "draft",
            },
          });

          send({
            type: "dimensions_generated",
            data: { dimensions },
            message: `已生成 ${dimensions.length} 个研究维度`,
          });

          send({ type: "complete" });
        } catch (error) {
          send({
            type: "error",
            message: error instanceof Error ? error.message : "生成研究维度失败",
          });
        } finally {
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
    console.error("[ResearchVideo] Dimensions error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成研究维度失败" },
      { status: 500 }
    );
  }
}
