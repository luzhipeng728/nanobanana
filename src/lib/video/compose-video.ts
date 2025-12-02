/**
 * 使用 FFmpeg 合成讲解视频
 */

import { execSync, spawn } from "child_process";
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
 * 检测图片尺寸并确定视频分辨率
 */
async function detectVideoSize(imagePath: string): Promise<{ width: number; height: number }> {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${imagePath}"`,
      { encoding: "utf-8" }
    );
    const [width, height] = result.trim().split("x").map(Number);
    const ratio = width / height;

    // 根据比例决定输出尺寸
    if (ratio > 1.2) {
      // 横屏
      return { width: 1920, height: 1080 };
    } else if (ratio < 0.8) {
      // 竖屏
      return { width: 1080, height: 1920 };
    } else {
      // 方形
      return { width: 1080, height: 1080 };
    }
  } catch (e) {
    console.error("[Video] Failed to detect image size:", e);
    return { width: 1920, height: 1080 }; // 默认横屏
  }
}

/**
 * 合成视频
 */
export async function composeVideo(
  request: VideoCompositionRequest,
  onProgress?: (percent: number, message: string) => void
): Promise<VideoCompositionResult> {
  const { imageUrls, audioPaths, transition, outputPath } = request;

  if (imageUrls.length !== audioPaths.length) {
    return { success: false, error: "图片和音频数量不匹配" };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideshow-video-"));
  const transitionDuration = transition === "none" ? 0 : 0.5;

  try {
    onProgress?.(10, "正在下载图片...");

    // 下载所有图片
    const localImagePaths: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const ext = imageUrls[i].includes(".png") ? "png" : "jpg";
      const localPath = path.join(tempDir, `image_${i}.${ext}`);
      await downloadImage(imageUrls[i], localPath);
      localImagePaths.push(localPath);
      onProgress?.(10 + (i / imageUrls.length) * 20, `下载图片 ${i + 1}/${imageUrls.length}`);
    }

    // 检测视频尺寸
    const { width, height } = await detectVideoSize(localImagePaths[0]);
    console.log(`[Video] Output size: ${width}x${height}`);

    onProgress?.(35, "正在分析音频时长...");

    // 获取每个音频的时长
    const durations: number[] = [];
    for (const audioPath of audioPaths) {
      const duration = await getAudioDuration(audioPath);
      durations.push(duration + 0.5); // 额外 0.5 秒缓冲
    }

    console.log(`[Video] Audio durations:`, durations);

    onProgress?.(40, "正在合成视频...");

    // 为每张图片生成带时长的视频片段
    const segmentPaths: string[] = [];
    for (let i = 0; i < localImagePaths.length; i++) {
      const segmentPath = path.join(tempDir, `segment_${i}.mp4`);
      const imagePath = localImagePaths[i];
      const audioPath = audioPaths[i];
      const duration = durations[i];

      // 使用 FFmpeg 生成单个片段（图片 + 音频）
      // 注意：-vf 参数需要用引号包裹，因为包含括号
      const vfFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
      const cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", `"${imagePath}"`,
        "-i", `"${audioPath}"`,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-vf", `"${vfFilter}"`,
        "-t", duration.toFixed(2),
        "-shortest",
        `"${segmentPath}"`,
      ];

      console.log(`[Video] Creating segment ${i + 1}...`);
      execSync(cmd.join(" "), { stdio: "pipe", shell: "/bin/bash" });
      segmentPaths.push(segmentPath);

      onProgress?.(40 + (i / localImagePaths.length) * 40, `合成片段 ${i + 1}/${localImagePaths.length}`);
    }

    onProgress?.(80, "正在拼接视频...");

    // 创建拼接文件列表
    const concatListPath = path.join(tempDir, "concat_list.txt");
    const concatContent = segmentPaths.map(p => `file '${p}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    // 如果有转场效果，使用 xfade 滤镜
    if (transition !== "none" && segmentPaths.length > 1) {
      // 复杂滤镜链方式实现转场
      // 由于 xfade 复杂度较高，这里使用简单的 concat 方式
      // 后续可以优化为真正的 xfade
      const finalCmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", `"${concatListPath}"`,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        `"${outputPath}"`,
      ];

      console.log(`[Video] Concatenating segments...`);
      execSync(finalCmd.join(" "), { stdio: "pipe", shell: "/bin/bash" });
    } else {
      // 无转场，直接拼接
      const finalCmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", `"${concatListPath}"`,
        "-c", "copy",
        "-movflags", "+faststart",
        `"${outputPath}"`,
      ];

      execSync(finalCmd.join(" "), { stdio: "pipe", shell: "/bin/bash" });
    }

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
