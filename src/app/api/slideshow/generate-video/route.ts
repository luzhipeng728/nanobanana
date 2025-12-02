/**
 * 幻灯片讲解视频生成 API
 * 使用 SSE 推送进度
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNarrations } from "@/lib/video/generate-narration";
import { composeVideo, checkFFmpeg } from "@/lib/video/compose-video";
import { BytedanceTTSClient, textToSpeech } from "@/lib/tts/bytedance-tts";
import { uploadBufferToR2 } from "@/lib/r2";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟超时

interface VideoGenerationRequest {
  slideshowId: string;
  speaker: string;
  transition: string;
  style?: string;
}

/**
 * SSE 进度推送
 */
function createSSEResponse(
  generator: AsyncGenerator<string, void, unknown>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const data of generator) {
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        }
      } catch (error) {
        console.error("[Video API] Stream error:", error);
        const errorMsg = JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
        controller.enqueue(new TextEncoder().encode(`data: ${errorMsg}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * 视频生成流程
 */
async function* videoGenerationProcess(
  request: VideoGenerationRequest
): AsyncGenerator<string, void, unknown> {
  const { slideshowId, speaker, transition, style } = request;

  // 发送进度
  const sendProgress = (
    percent: number,
    stage: string,
    message: string,
    details?: Record<string, unknown>
  ) => {
    return JSON.stringify({ type: "progress", percent, stage, message, ...details });
  };

  try {
    // 1. 检查 FFmpeg
    yield sendProgress(5, "init", "正在检查环境...");
    if (!checkFFmpeg()) {
      throw new Error("FFmpeg 未安装或不可用");
    }

    // 2. 获取幻灯片信息
    yield sendProgress(10, "init", "正在获取幻灯片信息...");
    const slideshow = await prisma.slideshow.findUnique({
      where: { id: slideshowId },
    });

    if (!slideshow) {
      throw new Error("幻灯片不存在");
    }

    const images: string[] = JSON.parse(slideshow.images);
    const prompts: string[] = slideshow.prompts
      ? JSON.parse(slideshow.prompts)
      : images.map(() => "");

    if (images.length === 0) {
      throw new Error("幻灯片没有图片");
    }

    // 更新状态为生成中
    await prisma.slideshow.update({
      where: { id: slideshowId },
      data: { videoStatus: "generating" },
    });

    // 3. 生成讲解文案
    yield sendProgress(15, "narration", "正在生成讲解文案...");
    const narrationResult = await generateNarrations({
      prompts,
      style,
      title: slideshow.title,
    });

    const narrations = narrationResult.narrations;
    console.log(`[Video API] Generated ${narrations.length} narrations`);

    // 4. 生成 TTS 音频
    yield sendProgress(30, "tts", "正在生成语音...");

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-tts-"));
    const audioPaths: string[] = [];
    const speakerId = BytedanceTTSClient.getSpeakerId(speaker as keyof typeof import("@/lib/tts/bytedance-tts").TTS_SPEAKERS);

    for (let i = 0; i < narrations.length; i++) {
      yield sendProgress(
        30 + (i / narrations.length) * 30,
        "tts",
        `正在生成语音 ${i + 1}/${narrations.length}...`,
        { current: i + 1, total: narrations.length }
      );

      const ttsResult = await textToSpeech(narrations[i], {
        speaker: speakerId,
        format: "mp3",
        speed: 1.0,
      });

      if (!ttsResult.success || !ttsResult.audioBuffer) {
        throw new Error(`语音生成失败 (${i + 1}): ${ttsResult.error}`);
      }

      const audioPath = path.join(tempDir, `audio_${i}.mp3`);
      fs.writeFileSync(audioPath, ttsResult.audioBuffer);
      audioPaths.push(audioPath);
    }

    console.log(`[Video API] Generated ${audioPaths.length} audio files`);

    // 5. 合成视频
    yield sendProgress(60, "compose", "正在合成视频...");

    const outputPath = path.join(tempDir, "output.mp4");
    const composeResult = await composeVideo(
      {
        imageUrls: images,
        audioPaths,
        transition,
        outputPath,
      },
      (percent, message) => {
        // FFmpeg 内部进度（60-90%）
        const overallPercent = 60 + (percent / 100) * 30;
        // 这里无法 yield，所以只打印日志
        console.log(`[Video API] Compose progress: ${percent}% - ${message}`);
      }
    );

    if (!composeResult.success) {
      throw new Error(`视频合成失败: ${composeResult.error}`);
    }

    yield sendProgress(90, "upload", "正在上传视频...");

    // 6. 上传到 R2
    const videoBuffer = fs.readFileSync(outputPath);
    const videoUrl = await uploadBufferToR2(videoBuffer, "video/mp4", "videos");

    console.log(`[Video API] Video uploaded: ${videoUrl}`);

    // 7. 更新数据库
    await prisma.slideshow.update({
      where: { id: slideshowId },
      data: {
        videoUrl,
        narrations: JSON.stringify(narrations),
        speaker,
        transition,
        videoStatus: "completed",
      },
    });

    // 8. 清理临时文件
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    yield sendProgress(100, "complete", "视频生成完成！");

    // 发送完成事件
    yield JSON.stringify({
      type: "complete",
      videoUrl,
      duration: composeResult.duration,
    });
  } catch (error) {
    console.error("[Video API] Generation error:", error);

    // 更新状态为失败
    try {
      await prisma.slideshow.update({
        where: { id: slideshowId },
        data: { videoStatus: "failed" },
      });
    } catch {}

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slideshowId, speaker, transition, style } = body;

    // 验证参数
    if (!slideshowId) {
      return new Response(
        JSON.stringify({ error: "缺少幻灯片 ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 检查幻灯片是否存在
    const slideshow = await prisma.slideshow.findUnique({
      where: { id: slideshowId },
    });

    if (!slideshow) {
      return new Response(
        JSON.stringify({ error: "幻灯片不存在" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 检查是否正在生成
    if (slideshow.videoStatus === "generating") {
      return new Response(
        JSON.stringify({ error: "视频正在生成中，请稍候" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // 启动视频生成流程
    const generator = videoGenerationProcess({
      slideshowId,
      speaker: speaker || "zh_female_vivi",
      transition: transition || "fade",
      style,
    });

    return createSSEResponse(generator);
  } catch (error) {
    console.error("[Video API] Request error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "请求处理失败",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
