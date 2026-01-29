/**
 * 使用 FFmpeg 合成讲解视频
 */

import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
import fs from "fs";
import path from "path";
import os from "os";

export interface VideoCompositionRequest {
  /** 图片 URL 列表 */
  imageUrls: string[];
  /** 音频文件路径列表 */
  audioPaths: string[];
  /** 转场效果 */
  transition: string;
  /** 输出路径 */
  outputPath: string;
  /** 循环视频 URL 列表（如果提供，则使用视频而非图片） */
  loopVideoUrls?: string[];
}

export interface VideoCompositionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
}

// 转场效果映射
const TRANSITION_MAP: Record<string, string> = {
  fade: "fade",
  slideleft: "slideleft",
  slideright: "slideright",
  dissolve: "dissolve",
  none: "", // 无转场
};

/**
 * 获取音频时长（秒）
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(result.trim()) || 3;
  } catch (e) {
    console.error(`[Video] Failed to get audio duration for ${audioPath}:`, e);
    return 3; // 默认 3 秒
  }
}

/**
 * 下载图片到临时目录
 */
async function downloadImage(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

/**
 * 下载视频到临时目录
 */
async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

/**
 * 获取视频时长（秒）
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(result.trim()) || 5;
  } catch (e) {
    console.error(`[Video] Failed to get video duration for ${videoPath}:`, e);
    return 5; // 默认 5 秒
  }
}

/**
 * 检测图片尺寸并确定视频分辨率
 * 使用 720p 分辨率以提升编码速度
 */
async function detectVideoSize(imagePath: string): Promise<{ width: number; height: number }> {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imagePath}"`,
      { encoding: "utf-8" }
    );
    const [width, height] = result.trim().split("x").map(Number);
    const ratio = width / height;

    // 根据比例决定输出尺寸（使用 720p 分辨率提升速度）
    if (ratio > 1.2) {
      // 横屏 720p
      return { width: 1280, height: 720 };
    } else if (ratio < 0.8) {
      // 竖屏 720p
      return { width: 720, height: 1280 };
    } else {
      // 方形
      return { width: 720, height: 720 };
    }
  } catch (e) {
    console.error("[Video] Failed to detect image size:", e);
    return { width: 1280, height: 720 }; // 默认横屏 720p
  }
}

/**
 * 合成视频
 */
export async function composeVideo(
  request: VideoCompositionRequest,
  onProgress?: (percent: number, message: string) => void
): Promise<VideoCompositionResult> {
  const { imageUrls, audioPaths, transition, outputPath, loopVideoUrls } = request;

  // 使用循环视频还是图片
  const useLoopVideos = loopVideoUrls && loopVideoUrls.length === audioPaths.length;
  const sourceCount = useLoopVideos ? loopVideoUrls!.length : imageUrls.length;

  if (sourceCount !== audioPaths.length) {
    return { success: false, error: "图片/视频和音频数量不匹配" };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-video-"));
  const transitionDuration = transition === "none" ? 0 : 0.5;

  try {
    let localImagePaths: string[] = [];
    let localVideoPaths: string[] = [];
    let width = 1280;
    let height = 720;

    if (useLoopVideos) {
      // 下载所有循环视频
      onProgress?.(10, "正在下载循环视频...");
      for (let i = 0; i < loopVideoUrls!.length; i++) {
        const localPath = path.join(tempDir, `loop_video_${i}.mp4`);
        await downloadVideo(loopVideoUrls![i], localPath);
        localVideoPaths.push(localPath);
        onProgress?.(10 + (i / loopVideoUrls!.length) * 20, `下载视频 ${i + 1}/${loopVideoUrls!.length}`);
      }
      // 从第一个视频获取尺寸
      const sizeResult = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${localVideoPaths[0]}"`,
        { encoding: "utf-8" }
      );
      const [w, h] = sizeResult.trim().split("x").map(Number);
      if (w && h) {
        width = w;
        height = h;
      }
      console.log(`[Video] Loop video size: ${width}x${height}`);
    } else {
      onProgress?.(10, "正在下载图片...");

      // 下载所有图片
      for (let i = 0; i < imageUrls.length; i++) {
        const ext = imageUrls[i].includes(".png") ? "png" : "jpg";
        const localPath = path.join(tempDir, `image_${i}.${ext}`);
        await downloadImage(imageUrls[i], localPath);
        localImagePaths.push(localPath);
        onProgress?.(10 + (i / imageUrls.length) * 20, `下载图片 ${i + 1}/${imageUrls.length}`);
      }

      // 检测视频尺寸
      const size = await detectVideoSize(localImagePaths[0]);
      width = size.width;
      height = size.height;
      console.log(`[Video] Output size: ${width}x${height}`);
    }

    onProgress?.(35, "正在分析音频时长...");

    // 获取每个音频的时长
    const durations: number[] = [];
    for (const audioPath of audioPaths) {
      const duration = await getAudioDuration(audioPath);
      durations.push(duration + 0.5); // 额外 0.5 秒缓冲
    }

    console.log(`[Video] Audio durations:`, durations);

    onProgress?.(40, "正在合成视频...");

    // 并发生成所有视频片段（真正的并行处理）
    const vfFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;

    const sourceCount2 = useLoopVideos ? localVideoPaths.length : localImagePaths.length;
    console.log(`[Video] Processing ${sourceCount2} segments in parallel (useLoopVideos=${useLoopVideos})...`);
    const startTimeAll = Date.now();

    let segmentPromises: Promise<string>[];

    if (useLoopVideos) {
      // 使用循环视频：需要 loop + 添加音频
      segmentPromises = localVideoPaths.map(async (videoPath, i) => {
        const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
        const audioPath = audioPaths[i];
        const audioDuration = durations[i];

        // 获取源视频时长
        const videoDuration = await getVideoDuration(videoPath);
        // 计算需要循环多少次
        const loopCount = Math.ceil(audioDuration / videoDuration);

        const startTime = Date.now();
        console.log(`[Video] Starting segment ${i + 1} (loop ${loopCount}x, video=${videoDuration.toFixed(1)}s, audio=${audioDuration.toFixed(1)}s)...`);

        // 使用 stream_loop 循环视频，然后与音频合并
        const cmd = [
          "ffmpeg", "-y",
          "-stream_loop", String(loopCount - 1), // -stream_loop 0 表示不循环，1 表示循环一次
          "-i", `"${videoPath}"`,
          "-i", `"${audioPath}"`,
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "23",
          "-c:a", "aac",
          "-b:a", "128k",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-t", audioDuration.toFixed(2),
          "-shortest",
          `"${segmentPath}"`,
        ].join(" ");

        await execAsync(cmd, { shell: "/bin/bash" });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Video] Segment ${i + 1} done in ${elapsed}s`);

        return segmentPath;
      });
    } else {
      // 使用图片：原有逻辑
      segmentPromises = localImagePaths.map(async (imagePath, i) => {
        const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
        const audioPath = audioPaths[i];
        const duration = durations[i];

        const cmd = [
          "ffmpeg", "-y",
          "-loop", "1",
          "-framerate", "1",
          "-i", `"${imagePath}"`,
          "-i", `"${audioPath}"`,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-tune", "stillimage",
          "-crf", "28",
          "-r", "24",
          "-c:a", "aac",
          "-b:a", "128k",
          "-pix_fmt", "yuv420p",
          "-vf", `"${vfFilter}"`,
          "-t", duration.toFixed(2),
          "-shortest",
          `"${segmentPath}"`,
        ].join(" ");

        const startTime = Date.now();
        console.log(`[Video] Starting segment ${i + 1}...`);

        await execAsync(cmd, { shell: "/bin/bash" });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Video] Segment ${i + 1} done in ${elapsed}s`);

        return segmentPath;
      });
    }

    const segmentPaths = await Promise.all(segmentPromises);

    const totalElapsed = ((Date.now() - startTimeAll) / 1000).toFixed(1);
    console.log(`[Video] All ${segmentPaths.length} segments completed in ${totalElapsed}s`);

    onProgress?.(80, `已完成 ${segmentPaths.length} 个片段`);

    onProgress?.(80, "正在拼接视频...");

    // 创建拼接文件列表
    const concatListPath = path.join(tempDir, "concat_list.txt");
    const concatContent = segmentPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    // 拼接所有片段（直接复制流，不重新编码）
    // 注：转场效果暂时不实现，因为 xfade 需要重新编码，太慢
    const finalCmd = [
      "ffmpeg", "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", `"${concatListPath}"`,
      "-c", "copy",  // 直接复制，不重新编码
      "-movflags", "+faststart",
      `"${outputPath}"`,
    ];

    console.log(`[Video] Concatenating segments...`);
    execSync(finalCmd.join(" "), { stdio: "pipe", shell: "/bin/bash" });

    onProgress?.(95, "视频生成完成");

    // 获取最终视频时长
    const finalDuration = await getAudioDuration(outputPath);

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`[Video] Composition complete: ${outputPath}`);
    return {
      success: true,
      outputPath,
      duration: finalDuration,
    };
  } catch (error) {
    // 清理临时文件
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    console.error("[Video] Composition error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
