/**
 * 研究视频合成器
 * 将音频和图片合成为完整视频
 */

import { execSync, exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuidv4 } from "uuid";
import { uploadBufferToR2 } from "@/lib/r2";
import { VideoSegmentData, VideoComposeConfig, VideoComposeResult, ResearchVideoEvent } from "./types";

const execAsync = promisify(exec);

/**
 * 获取媒体时长
 */
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(result.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * 下载文件到本地
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(buffer));
}

/**
 * 检测图片尺寸并确定视频分辨率
 */
function detectVideoSize(imagePath: string): { width: number; height: number } {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imagePath}"`,
      { encoding: "utf-8" }
    );
    const [width, height] = result.trim().split("x").map(Number);
    const ratio = width / height;

    // 根据比例决定输出尺寸（720p）
    if (ratio > 1.2) {
      return { width: 1280, height: 720 }; // 横屏
    } else if (ratio < 0.8) {
      return { width: 720, height: 1280 }; // 竖屏
    } else {
      return { width: 720, height: 720 }; // 方形
    }
  } catch {
    return { width: 1280, height: 720 }; // 默认横屏
  }
}

/**
 * 合成研究视频 v7（支持多图模式）
 *
 * 多图模式：
 * - 如果 segment.images 存在，按 durationRatio 分配音频时长
 * - 每张图片生成独立的视频片段
 */
export async function composeResearchVideo(
  config: VideoComposeConfig,
  sendEvent?: (event: ResearchVideoEvent) => void
): Promise<VideoComposeResult> {
  const { projectId, segments, aspectRatio, onProgress } = config;

  if (segments.length === 0) {
    throw new Error("No segments to compose");
  }

  // 按顺序排序
  const sortedSegments = [...segments].sort((a, b) => a.order - b.order);

  const tempDir = mkdtempSync(join(tmpdir(), "research-video-"));
  const outputPath = join(tempDir, `output-${projectId}.mp4`);

  // 统计总图片数
  let totalImageCount = 0;
  for (const seg of sortedSegments) {
    totalImageCount += seg.images ? seg.images.length : 1;
  }

  sendEvent?.({
    type: "compose_start",
    message: `开始合成视频，共 ${segments.length} 个章节，${totalImageCount} 张图片`,
    data: { segmentCount: segments.length, imageCount: totalImageCount },
  });

  try {
    // 1. 下载所有资源并构建任务列表
    sendEvent?.({
      type: "compose_progress",
      progress: 5,
      message: "正在下载资源...",
    });

    // 构建视频片段任务
    interface ClipTask {
      segmentIndex: number;
      imageIndex: number;
      imagePath: string;
      audioPath: string;
      startTime: number;   // 音频开始时间
      duration: number;    // 该图片的时长
    }

    const clipTasks: ClipTask[] = [];
    let downloadCount = 0;

    for (let i = 0; i < sortedSegments.length; i++) {
      const segment = sortedSegments[i];

      // 下载音频
      const audioPath = join(tempDir, `audio_${i}.mp3`);
      await downloadFile(segment.audioUrl, audioPath);

      // 处理图片（支持多图）
      if (segment.images && segment.images.length > 1) {
        // 多图模式：按 durationRatio 分配时间
        let currentTime = 0;
        for (let j = 0; j < segment.images.length; j++) {
          const img = segment.images[j];
          const imageExt = img.imageUrl.includes(".png") ? "png" : "jpg";
          const imagePath = join(tempDir, `image_${i}_${j}.${imageExt}`);
          await downloadFile(img.imageUrl, imagePath);

          const duration = segment.audioDuration * img.durationRatio;

          clipTasks.push({
            segmentIndex: i,
            imageIndex: j,
            imagePath,
            audioPath,
            startTime: currentTime,
            duration,
          });

          currentTime += duration;
          downloadCount++;
        }

        console.log(`[VideoComposer] 章节 ${i}: ${segment.images.length} 张图片，时长分配: ${segment.images.map(img => (img.durationRatio * 100).toFixed(0) + '%').join(', ')}`);
      } else {
        // 单图模式
        const imageExt = segment.imageUrl.includes(".png") ? "png" : "jpg";
        const imagePath = join(tempDir, `image_${i}_0.${imageExt}`);
        await downloadFile(segment.imageUrl, imagePath);

        clipTasks.push({
          segmentIndex: i,
          imageIndex: 0,
          imagePath,
          audioPath,
          startTime: 0,
          duration: segment.audioDuration,
        });

        downloadCount++;
      }

      onProgress?.(
        10 + (downloadCount / totalImageCount) * 20,
        `下载资源 ${downloadCount}/${totalImageCount}`
      );
    }

    // 2. 检测视频尺寸
    const { width, height } = detectVideoSize(clipTasks[0].imagePath);
    const vfFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;

    sendEvent?.({
      type: "compose_progress",
      progress: 30,
      message: `视频尺寸: ${width}x${height}，共 ${clipTasks.length} 个视频片段`,
    });

    // 3. 并发生成所有视频片段
    console.log(`[VideoComposer v7] 处理 ${clipTasks.length} 个视频片段...`);
    const startTime = Date.now();

    const clipPromises = clipTasks.map(async (task, taskIndex) => {
      const clipPath = join(tempDir, `clip_${task.segmentIndex}_${task.imageIndex}.mp4`);
      // 使用精确时长，不加缓冲避免音频重叠
      const duration = task.duration;

      let cmd: string;

      if (task.startTime > 0 || clipTasks.filter(t => t.segmentIndex === task.segmentIndex).length > 1) {
        // 多图模式：精确截取音频片段
        // 使用 -ss 在输入后面进行精确 seek，配合 -t 精确截取
        cmd = [
          "ffmpeg", "-y",
          "-loop", "1",
          "-framerate", "1",
          "-i", `"${task.imagePath}"`,
          "-i", `"${task.audioPath}"`,
          "-ss", task.startTime.toFixed(3),  // 放在输入后面，精确 seek
          "-t", duration.toFixed(3),          // 精确时长，不加缓冲
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-tune", "stillimage",
          "-crf", "28",
          "-r", "24",
          "-c:a", "aac",
          "-b:a", "128k",
          "-pix_fmt", "yuv420p",
          "-vf", `"${vfFilter}"`,
          "-shortest",
          `"${clipPath}"`,
        ].join(" ");
      } else {
        // 单图模式：使用完整音频
        cmd = [
          "ffmpeg", "-y",
          "-loop", "1",
          "-framerate", "1",
          "-i", `"${task.imagePath}"`,
          "-i", `"${task.audioPath}"`,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-tune", "stillimage",
          "-crf", "28",
          "-r", "24",
          "-c:a", "aac",
          "-b:a", "128k",
          "-pix_fmt", "yuv420p",
          "-vf", `"${vfFilter}"`,
          "-shortest",
          `"${clipPath}"`,
        ].join(" ");
      }

      await execAsync(cmd, { shell: "/bin/bash" });

      return clipPath;
    });

    const clipPaths = await Promise.all(clipPromises);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[VideoComposer v7] 所有片段生成完成，耗时 ${elapsed}s`);

    sendEvent?.({
      type: "compose_progress",
      progress: 70,
      message: `片段生成完成，耗时 ${elapsed} 秒`,
    });

    // 4. 拼接所有片段
    const concatListPath = join(tempDir, "concat_list.txt");
    const concatContent = clipPaths.map(p => `file '${p}'`).join("\n");
    writeFileSync(concatListPath, concatContent);

    const concatCmd = [
      "ffmpeg", "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", `"${concatListPath}"`,
      "-c", "copy",
      "-movflags", "+faststart",
      `"${outputPath}"`,
    ].join(" ");

    console.log(`[VideoComposer v7] 拼接 ${clipPaths.length} 个片段...`);
    execSync(concatCmd, { stdio: "pipe", shell: "/bin/bash" });

    sendEvent?.({
      type: "compose_progress",
      progress: 85,
      message: "视频拼接完成",
    });

    // 5. 获取最终视频时长
    const duration = await getMediaDuration(outputPath);

    // 6. 上传到 R2
    sendEvent?.({
      type: "compose_progress",
      progress: 90,
      message: "正在上传视频...",
    });

    const videoBuffer = await import("fs").then(fs =>
      fs.promises.readFile(outputPath)
    );

    const videoUrl = await uploadBufferToR2(
      videoBuffer,
      "video/mp4",
      `research-video/${projectId}`
    );

    // 7. 生成封面（取第一帧）
    let coverUrl: string | undefined;
    try {
      const coverPath = join(tempDir, "cover.jpg");
      execSync(
        `ffmpeg -y -i "${outputPath}" -vframes 1 -q:v 2 "${coverPath}"`,
        { stdio: "pipe", shell: "/bin/bash" }
      );

      if (existsSync(coverPath)) {
        const coverBuffer = await import("fs").then(fs =>
          fs.promises.readFile(coverPath)
        );
        coverUrl = await uploadBufferToR2(
          coverBuffer,
          "image/jpeg",
          `research-video/${projectId}`
        );
      }
    } catch (error) {
      console.error("[VideoComposer] Failed to generate cover:", error);
    }

    // 清理临时文件
    rmSync(tempDir, { recursive: true, force: true });

    sendEvent?.({
      type: "compose_complete",
      progress: 100,
      message: "视频合成完成",
      data: { videoUrl, duration, coverUrl },
    });

    return {
      videoUrl,
      duration,
      coverUrl,
    };
  } catch (error) {
    // 清理临时文件
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[VideoComposer] Composition error:", errorMessage);

    sendEvent?.({
      type: "error",
      message: `视频合成失败: ${errorMessage}`,
    });

    throw error;
  }
}

/**
 * 流式合成视频
 */
export async function* composeResearchVideoStream(
  config: VideoComposeConfig
): AsyncGenerator<ResearchVideoEvent> {
  yield {
    type: "compose_start",
    message: `开始合成视频，共 ${config.segments.length} 个片段`,
  };

  try {
    const result = await composeResearchVideo(config, (event) => {
      // 这里无法 yield，使用回调模式
    });

    yield {
      type: "compose_complete",
      progress: 100,
      message: "视频合成完成",
      data: result,
    };
  } catch (error) {
    yield {
      type: "error",
      message: `视频合成失败: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * 检查 FFmpeg 是否可用
 */
export function checkFFmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
