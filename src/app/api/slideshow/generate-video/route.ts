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
import { generateVideo as generateLoopVideoWithSeedance } from "@/lib/volcano/seedance";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟超时

interface VideoGenerationRequest {
  slideshowId: string;
  speaker: string;
  transition: string;
  style?: string;
  speed?: number;
  enableLoopVideo?: boolean;
}

/**
 * 计算循环视频的时长和循环次数
 * 目标：让视频能整除循环，实现无缝衔接
 */
function calculateLoopDuration(audioDuration: number): { videoDuration: number; loopCount: number } {
  // 语音 ≤ 12s：用最接近的整数秒（Seedance 支持 2-12s）
  if (audioDuration <= 12) {
    const videoDuration = Math.max(2, Math.min(12, Math.round(audioDuration)));
    return { videoDuration, loopCount: 1 };
  }

  // 语音 > 12s：找能整除的秒数 (2-12秒范围)
  // 优先找能完美整除的
  for (let d = 12; d >= 2; d--) {
    if (Math.abs(audioDuration - Math.round(audioDuration / d) * d) < 0.5) {
      return { videoDuration: d, loopCount: Math.round(audioDuration / d) };
    }
  }

  // 找最接近能整除的
  let bestDuration = 8;
  let minRemainder = audioDuration % 8;
  for (let d = 2; d <= 12; d++) {
    const remainder = audioDuration % d;
    const adjustedRemainder = Math.min(remainder, d - remainder);
    if (adjustedRemainder < minRemainder) {
      minRemainder = adjustedRemainder;
      bestDuration = d;
    }
  }

  return {
    videoDuration: bestDuration,
    loopCount: Math.ceil(audioDuration / bestDuration)
  };
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
  const { slideshowId, speaker, transition, style, speed = 1.0, enableLoopVideo = false } = request;

  console.log(`[Video API] Request params: speaker=${speaker}, speed=${speed}, transition=${transition}`);

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
    let prompts: string[] = slideshow.prompts
      ? JSON.parse(slideshow.prompts)
      : [];

    // 如果 prompts 为空或全是空字符串，通过 imageUrl 去 ImageTask 表匹配
    const hasValidPrompts = prompts.some(p => p && p.trim().length > 0);
    if (!hasValidPrompts && images.length > 0) {
      const imageTasks = await prisma.imageTask.findMany({
        where: {
          imageUrl: { in: images },
        },
        select: {
          imageUrl: true,
          prompt: true,
        },
      });

      // 构建 URL -> prompt 映射
      const urlToPrompt = new Map<string, string>();
      for (const task of imageTasks) {
        if (task.imageUrl) {
          urlToPrompt.set(task.imageUrl, task.prompt);
        }
      }

      // 按图片顺序获取 prompts
      prompts = images.map(url => urlToPrompt.get(url) || "");
      console.log(`[Video API] Matched ${imageTasks.length} prompts from ImageTask table`);
    }

    if (images.length === 0) {
      throw new Error("幻灯片没有图片");
    }

    // 更新状态为生成中
    await prisma.slideshow.update({
      where: { id: slideshowId },
      data: { videoStatus: "generating" },
    });

    // 3. 生成讲解文案（带心跳，防止超时）
    yield sendProgress(15, "narration", "正在生成讲解文案...");

    const narrationPromise = generateNarrations({
      prompts,
      style,
      title: slideshow.title,
    });

    // 使用心跳机制防止 SSE 超时
    let narrationResult: Awaited<ReturnType<typeof generateNarrations>> | null = null;
    let elapsed = 0;
    const heartbeatInterval = 5000; // 每5秒发送心跳

    while (!narrationResult) {
      const result = await Promise.race([
        narrationPromise.then(r => ({ type: 'done' as const, data: r })),
        new Promise<{ type: 'heartbeat' }>(resolve =>
          setTimeout(() => resolve({ type: 'heartbeat' }), heartbeatInterval)
        ),
      ]);

      if (result.type === 'heartbeat') {
        elapsed += heartbeatInterval / 1000;
        yield sendProgress(15, "narration", `正在生成讲解文案... ${elapsed}秒`);
      } else {
        narrationResult = result.data;
      }
    }

    const narrations = narrationResult.narrations;
    const narrationItems = narrationResult.items;
    console.log(`[Video API] Generated ${narrations.length} narrations in ${elapsed}s`);

    // 4. 并发生成 TTS 音频
    yield sendProgress(30, "tts", "正在并发生成语音...");

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-tts-"));
    const speakerKey = speaker as keyof typeof import("@/lib/tts/bytedance-tts").TTS_SPEAKERS;
    const speakerId = BytedanceTTSClient.getSpeakerId(speakerKey);

    console.log(`[Video API] Starting ${narrations.length} TTS tasks in parallel (speaker=${speakerId})...`);
    const ttsStartTime = Date.now();

    // 所有 TTS 请求并发执行
    let completedCount = 0;
    const ttsPromises = narrations.map(async (text, i) => {
      const ttsParams = narrationItems[i]?.ttsParams;
      const startTime = Date.now();

      const ttsResult = await textToSpeech(text, {
        speaker: speakerId,
        format: "mp3",
        speed,
        // 使用大模型生成的参数保持一致性
        emotion: ttsParams?.emotion,
        pitch: ttsParams?.pitch,
        volume: ttsParams?.volume,
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!ttsResult.success || !ttsResult.audioBuffer) {
        throw new Error(`语音生成失败 (${i + 1}): ${ttsResult.error}`);
      }

      const audioPath = path.join(tempDir, `audio_${i}.mp3`);
      fs.writeFileSync(audioPath, ttsResult.audioBuffer);

      completedCount++;
      console.log(`[Video API] TTS ${i + 1} done in ${elapsedTime}s (${completedCount}/${narrations.length})`);
      return audioPath;
    });

    // TTS 带心跳
    const ttsAllPromise = Promise.all(ttsPromises);
    let audioPaths: string[] | null = null;
    let ttsHeartbeatElapsed = 0;

    while (!audioPaths) {
      const result = await Promise.race([
        ttsAllPromise.then(r => ({ type: 'done' as const, data: r })),
        new Promise<{ type: 'heartbeat' }>(resolve =>
          setTimeout(() => resolve({ type: 'heartbeat' }), 3000)
        ),
      ]);

      if (result.type === 'heartbeat') {
        ttsHeartbeatElapsed += 3;
        yield sendProgress(30, "tts", `正在生成语音... ${completedCount}/${narrations.length} (${ttsHeartbeatElapsed}秒)`);
      } else {
        audioPaths = result.data;
      }
    }

    const ttsElapsed = ((Date.now() - ttsStartTime) / 1000).toFixed(1);
    console.log(`[Video API] All ${audioPaths.length} TTS completed in ${ttsElapsed}s`);

    // 5. 如果启用循环微动视频，生成 Seedance 视频（并发）
    let loopVideoUrls: string[] | undefined;
    if (enableLoopVideo) {
      yield sendProgress(45, "loop_video", "正在生成循环微动视频...");

      console.log(`[Video API] Starting ${images.length} Seedance loop video tasks in parallel...`);
      const seedanceStartTime = Date.now();

      let seedanceCompletedCount = 0;
      const seedancePromises = images.map(async (imageUrl, i) => {
        const startTime = Date.now();

        // 使用 Seedance 1.5 Pro 生成循环视频
        // 首帧和尾帧使用同一张图片，实现无缝循环
        const loopVideoUrl = await generateLoopVideoWithSeedance({
          startFrame: imageUrl,
          endFrame: imageUrl, // 首尾帧相同
          duration: 5, // 默认生成 5 秒视频，后续会循环拼接
          aspectRatio: '16:9',
          model: 'doubao-seedance-1-5-pro-251215',
          prompt: '保持文字和主要内容静止不动，只让背景中的小元素、装饰物、光影有轻微的动态效果，形成平滑的循环动画',
        });

        seedanceCompletedCount++;
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Video API] Seedance ${i + 1} done in ${elapsedTime}s (${seedanceCompletedCount}/${images.length})`);

        return loopVideoUrl;
      });

      // Seedance 带心跳
      const seedanceAllPromise = Promise.all(seedancePromises);
      let seedanceHeartbeatElapsed = 0;

      while (!loopVideoUrls) {
        const result = await Promise.race([
          seedanceAllPromise.then(r => ({ type: 'done' as const, data: r })),
          new Promise<{ type: 'heartbeat' }>(resolve =>
            setTimeout(() => resolve({ type: 'heartbeat' }), 5000)
          ),
        ]);

        if (result.type === 'heartbeat') {
          seedanceHeartbeatElapsed += 5;
          yield sendProgress(45, "loop_video", `正在生成循环微动视频... ${seedanceCompletedCount}/${images.length} (${seedanceHeartbeatElapsed}秒)`);
        } else {
          loopVideoUrls = result.data;
        }
      }

      const seedanceElapsed = ((Date.now() - seedanceStartTime) / 1000).toFixed(1);
      console.log(`[Video API] All ${loopVideoUrls.length} Seedance videos completed in ${seedanceElapsed}s`);
    }

    // 6. 合成视频（带心跳）
    yield sendProgress(60, "compose", "正在合成视频...");

    const outputPath = path.join(tempDir, "output.mp4");
    let lastComposeMessage = "正在合成视频...";

    const composePromise = composeVideo(
      {
        imageUrls: images,
        audioPaths,
        transition,
        outputPath,
        loopVideoUrls, // 传入循环视频 URL（如果有）
      },
      (percent, message) => {
        lastComposeMessage = message;
        console.log(`[Video API] Compose progress: ${percent}% - ${message}`);
      }
    );

    // 视频合成带心跳
    let composeResult: Awaited<ReturnType<typeof composeVideo>> | null = null;
    let composeHeartbeatElapsed = 0;

    while (!composeResult) {
      const result = await Promise.race([
        composePromise.then(r => ({ type: 'done' as const, data: r })),
        new Promise<{ type: 'heartbeat' }>(resolve =>
          setTimeout(() => resolve({ type: 'heartbeat' }), 3000)
        ),
      ]);

      if (result.type === 'heartbeat') {
        composeHeartbeatElapsed += 3;
        yield sendProgress(60, "compose", `${lastComposeMessage} (${composeHeartbeatElapsed}秒)`);
      } else {
        composeResult = result.data;
      }
    }

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
    const { slideshowId, speaker, transition, style, speed, enableLoopVideo } = body;

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
      speed: speed || 1.0,
      enableLoopVideo: enableLoopVideo || false,
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
