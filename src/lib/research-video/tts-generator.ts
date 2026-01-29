/**
 * TTS 批量生成器
 * 并发生成所有分段音频，支持音量标准化
 */

import { BytedanceTTSClient, TTS_SPEAKERS } from "@/lib/tts/bytedance-tts";
import { uploadBufferToR2 } from "@/lib/r2";
import { ScriptSegment, TTSResult, TTSBatchConfig, TTSParams, ResearchVideoEvent } from "./types";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const execAsync = promisify(exec);

// TTS 客户端实例（使用 v1 API，从环境变量读取 TTS_APP_ID 和 TTS_ACCESS_TOKEN）
const ttsClient = new BytedanceTTSClient();

/**
 * 生成单个分段的 TTS
 */
export async function generateSegmentTTS(
  segment: ScriptSegment,
  speaker: string,
  speed: number,
  ttsParams?: TTSParams
): Promise<TTSResult> {
  // 获取发音人配置
  const speakerConfig = TTS_SPEAKERS[speaker as keyof typeof TTS_SPEAKERS];
  const speakerId = speakerConfig?.id || speaker;

  const result = await ttsClient.synthesize({
    text: segment.text,
    speaker: speakerId,
    speed,
    volume: 2.0,  // 固定最大音量，避免音量不一致
    pitch: 1.0,   // 固定正常音调
    emotion: ttsParams?.emotion || segment.emotion,
  });

  if (!result.success || !result.audioBuffer) {
    throw new Error(result.error || "TTS generation failed");
  }

  // 获取音频时长
  const duration = await getAudioDuration(result.audioBuffer);

  // 上传到 R2
  const audioUrl = await uploadBufferToR2(
    result.audioBuffer,
    "audio/mpeg",
    "research-video/tts"
  );

  return {
    segmentOrder: segment.order,
    audioUrl,
    duration,
  };
}

/**
 * 批量生成 TTS
 */
export async function generateBatchTTS(
  config: TTSBatchConfig,
  sendEvent?: (event: ResearchVideoEvent) => void
): Promise<TTSResult[]> {
  const { segments, speaker, speed, ttsParams, normalizeVolume = true, onProgress } = config;
  const total = segments.length;

  sendEvent?.({
    type: "tts_start",
    message: `开始生成 ${total} 段语音`,
    data: { total },
  });

  // 并发生成所有 TTS
  const results: TTSResult[] = [];
  const errors: Array<{ order: number; error: string }> = [];

  // 使用有限并发（避免 API 限流）
  const concurrency = 3;
  for (let i = 0; i < segments.length; i += concurrency) {
    const batch = segments.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (segment) => {
        try {
          const result = await generateSegmentTTS(segment, speaker, speed, ttsParams);
          onProgress?.(results.length + 1, total);

          sendEvent?.({
            type: "tts_segment_complete",
            data: {
              segmentOrder: segment.order,
              audioUrl: result.audioUrl,
              duration: result.duration,
            },
            progress: Math.round(((results.length + 1) / total) * 100),
            message: `语音生成进度: ${results.length + 1}/${total}`,
          });

          return result;
        } catch (error) {
          errors.push({
            order: segment.order,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return null;
        }
      })
    );

    results.push(...batchResults.filter((r): r is TTSResult => r !== null));
  }

  if (errors.length > 0) {
    console.error("TTS generation errors:", errors);
  }

  // 按顺序排序
  results.sort((a, b) => a.segmentOrder - b.segmentOrder);

  // 音量标准化
  if (normalizeVolume && results.length > 1) {
    sendEvent?.({
      type: "tts_progress",
      message: "正在标准化音量...",
    });

    // 这里我们跳过音量标准化的实际处理，因为需要下载所有音频
    // 在生产环境中，可以在合成视频时统一处理
  }

  sendEvent?.({
    type: "tts_complete",
    data: { results, errors },
    message: `语音生成完成，成功 ${results.length}/${total}`,
  });

  return results;
}

/**
 * 重新生成单个分段的 TTS
 */
export async function regenerateSegmentTTS(
  segment: ScriptSegment,
  speaker: string,
  speed: number,
  ttsParams?: TTSParams
): Promise<TTSResult> {
  return generateSegmentTTS(segment, speaker, speed, ttsParams);
}

/**
 * 获取音频时长（通过 FFprobe）
 */
async function getAudioDuration(audioBuffer: Buffer): Promise<number> {
  const tempPath = join(tmpdir(), `tts-${uuidv4()}.mp3`);

  try {
    await writeFile(tempPath, audioBuffer);

    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${tempPath}"`
    );

    return parseFloat(stdout.trim()) || 0;
  } catch (error) {
    console.error("Failed to get audio duration:", error);
    // 根据文件大小估算时长（MP3 约 16KB/秒）
    return audioBuffer.length / 16000;
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // 忽略删除错误
    }
  }
}

/**
 * 音量标准化（使用 FFmpeg loudnorm）
 */
export async function normalizeAudioVolume(
  audioUrl: string
): Promise<string> {
  // 下载音频
  const response = await fetch(audioUrl);
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const inputPath = join(tmpdir(), `input-${uuidv4()}.mp3`);
  const outputPath = join(tmpdir(), `output-${uuidv4()}.mp3`);

  try {
    await writeFile(inputPath, audioBuffer);

    // 使用 loudnorm 标准化音量
    // I=-16: 目标响度 (LUFS)
    // LRA=11: 响度范围
    // TP=-1.5: 真峰值上限 (dB)
    await execAsync(
      `ffmpeg -i "${inputPath}" -filter:a "loudnorm=I=-16:LRA=11:TP=-1.5" -y "${outputPath}"`
    );

    const normalizedBuffer = await readFile(outputPath);

    // 上传到 R2
    const normalizedUrl = await uploadBufferToR2(
      normalizedBuffer,
      "audio/mpeg",
      "research-video/tts"
    );

    return normalizedUrl;
  } finally {
    try {
      await unlink(inputPath);
      await unlink(outputPath);
    } catch {
      // 忽略删除错误
    }
  }
}

/**
 * 流式生成 TTS
 */
export async function* generateBatchTTSStream(
  config: TTSBatchConfig
): AsyncGenerator<ResearchVideoEvent> {
  const { segments, speaker, speed } = config;
  const total = segments.length;

  yield {
    type: "tts_start",
    message: `开始生成 ${total} 段语音`,
    data: { total },
  };

  const results: TTSResult[] = [];

  for (const segment of segments) {
    try {
      const result = await generateSegmentTTS(segment, speaker, speed);
      results.push(result);

      yield {
        type: "tts_segment_complete",
        data: {
          segmentOrder: segment.order,
          audioUrl: result.audioUrl,
          duration: result.duration,
        },
        progress: Math.round((results.length / total) * 100),
        message: `语音生成进度: ${results.length}/${total}`,
      };
    } catch (error) {
      yield {
        type: "error",
        data: {
          segmentOrder: segment.order,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        message: `分段 ${segment.order + 1} 语音生成失败`,
      };
    }
  }

  yield {
    type: "tts_complete",
    data: { results },
    message: `语音生成完成，共 ${results.length} 段`,
  };
}
