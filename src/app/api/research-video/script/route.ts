/**
 * 生成分段脚本
 * POST /api/research-video/script
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSegmentedScript, ScriptResult, ResearchVideoEvent } from "@/lib/research-video";

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

    // 获取项目
    const project = await prisma.researchVideoProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    if (!project.researchResults) {
      return NextResponse.json(
        { error: "请先完成研究" },
        { status: 400 }
      );
    }

    // 更新状态
    await prisma.researchVideoProject.update({
      where: { id: projectId },
      data: { status: "scripting" },
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

        try {
          // v3: 先进行内容筛选（流式返回进度到前端）
          send({ type: "script_start", message: "正在筛选有用信息..." });

          // 生成脚本（内置内容筛选，传递 sendEvent 以便流式返回筛选进度）
          const result = await generateSegmentedScript({
            researchResult: project.researchResults!,
            topic: project.topic,
            enableContentFilter: true,  // v3: 启用内容筛选智能体
            sendEvent: send,  // 传递事件发送函数，前端可以看到筛选进度
          });

          send({ type: "script_progress", message: "正在生成解说脚本..." });

          // 保存脚本到数据库
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: {
              title: result.title,
              fullScript: result.fullScript,
              status: "draft",
            },
          });

          // 创建分段记录
          console.log(`[Script] Deleting existing segments for project ${projectId}`);
          await prisma.researchVideoSegment.deleteMany({
            where: { projectId },
          });

          console.log(`[Script] Creating ${result.segments.length} segments`);
          const segmentData = result.segments.map((segment) => ({
            projectId,
            order: segment.order,
            text: segment.text,
            // v2: 保存章节信息
            chapterTitle: segment.chapterTitle || null,
            keyPoints: segment.keyPoints && segment.keyPoints.length > 0
              ? JSON.stringify(segment.keyPoints)
              : null,
            visualStyle: segment.visualStyle || 'infographic',
            // 原有字段
            ttsParams: segment.emotion
              ? JSON.stringify({ emotion: segment.emotion })
              : null,
            imagePrompt: segment.imageHint || null,
          }));

          console.log(`[Script] Sample segment data:`, JSON.stringify(segmentData[0], null, 2));

          const createResult = await prisma.researchVideoSegment.createMany({
            data: segmentData,
          });

          console.log(`[Script] Created ${createResult.count} segments`);

          // 发送每个分段
          for (const segment of result.segments) {
            send({
              type: "script_chunk",
              data: { segment },
            });
          }

          send({
            type: "script_complete",
            data: {
              title: result.title,
              segmentCount: result.segments.length,
              estimatedDuration: result.estimatedDuration,
            },
            message: `脚本生成完成，共 ${result.segments.length} 段`,
          });

          send({ type: "complete" });
        } catch (error) {
          console.error(`[Script] Error:`, error);
          await prisma.researchVideoProject.update({
            where: { id: projectId },
            data: { status: "failed" },
          });

          send({
            type: "error",
            message: error instanceof Error ? error.message : "脚本生成失败",
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
    console.error("[ResearchVideo] Script error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "脚本生成失败" },
      { status: 500 }
    );
  }
}
