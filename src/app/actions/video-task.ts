"use server";

import { PrismaClient } from "@prisma/client";
import { uploadVideoFromUrl } from "./storage";

const prisma = new PrismaClient();

export type VideoTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface VideoTaskResult {
  id: string;
  status: VideoTaskStatus;
  prompt: string;
  orientation: "portrait" | "landscape";
  inputImage?: string;
  videoUrl?: string;
  progress: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 创建视频生成任务
 */
export async function createVideoTask(
  prompt: string,
  orientation: "portrait" | "landscape" = "portrait",
  inputImage?: string
): Promise<{ taskId: string }> {
  const task = await prisma.videoTask.create({
    data: {
      status: "pending",
      prompt,
      orientation,
      inputImage: inputImage || null,
    },
  });

  // 异步处理任务（不等待）
  processVideoTask(task.id).catch((error) => {
    console.error(`Error processing video task ${task.id}:`, error);
  });

  return { taskId: task.id };
}

/**
 * 查询任务状态
 */
export async function getVideoTaskStatus(taskId: string): Promise<VideoTaskResult | null> {
  const task = await prisma.videoTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as VideoTaskStatus,
    prompt: task.prompt,
    orientation: task.orientation as "portrait" | "landscape",
    inputImage: task.inputImage || undefined,
    videoUrl: task.videoUrl || undefined,
    progress: task.progress || 0,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}

/**
 * 处理视频生成任务（后台执行）
 */
async function processVideoTask(taskId: string): Promise<void> {
  try {
    // 更新状态为 processing
    await prisma.videoTask.update({
      where: { id: taskId },
      data: { status: "processing", progress: 10, updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.videoTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    console.log(`[VideoTask ${taskId}] Starting video generation...`);
    console.log(`[VideoTask ${taskId}] Prompt: ${task.prompt.substring(0, 50)}...`);
    console.log(`[VideoTask ${taskId}] Orientation: ${task.orientation}`);
    if (task.inputImage) {
      console.log(`[VideoTask ${taskId}] Input image: ${task.inputImage}`);
    }

    // 调用 Sora API 生成视频
    const soraApiUrl = process.env.SORA_API_URL;
    const soraApiToken = process.env.SORA_API_TOKEN;

    if (!soraApiUrl || !soraApiToken) {
      throw new Error("Sora API credentials not configured");
    }

    // 选择模型
    const model = task.orientation === "portrait"
      ? "sora_video2-portrait"
      : "sora_video2-landscape";

    // 构建消息 - 完全按照原项目格式
    let messages: any[];
    if (task.inputImage) {
      // 图生视频模式
      console.log(`[VideoTask ${taskId}] image-to-video mode`);
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: task.prompt },
            { type: "image_url", image_url: { url: task.inputImage } },
          ],
        },
      ];
    } else {
      // 文生视频模式
      console.log(`[VideoTask ${taskId}] text-to-video mode`);
      messages = [{ role: "user", content: task.prompt }];
    }

    // 调用 Sora API，带重试逻辑
    const maxRetries = 5;
    let retries = 0;
    let response: Response | null = null;
    let videoUrl: string | null = null;
    let videoCreated = false;

    // 重试循环 - 完全按照原项目逻辑
    while (retries < maxRetries) {
      try {
        console.log(`[VideoTask ${taskId}] API attempt ${retries + 1}/${maxRetries}...`);

        response = await fetch(soraApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${soraApiToken}`,
          },
          body: JSON.stringify({
            messages,
            model,
            stream: true,
          }),
        });

        console.log(`[VideoTask ${taskId}] API response status: ${response.status}`);

        // Retry on non-200 responses
        if (!response.ok && retries < maxRetries - 1) {
          retries++;
          console.log(`[VideoTask ${taskId}] API returned ${response.status}, retrying... (${retries}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          continue;
        }

        // Exit retry loop (either success or max retries reached)
        break;
      } catch (fetchError: any) {
        console.error(`[VideoTask ${taskId}] Fetch error:`, fetchError.message);
        if (retries < maxRetries - 1) {
          retries++;
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        throw fetchError;
      }
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : "No response";
      throw new Error(`Sora API error: ${response?.status || "unknown"} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body from API");
    }

    // Process streaming response - 使用 ReadableStream 的标准 API
    console.log(`[VideoTask ${taskId}] Starting to read stream...`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(`[VideoTask ${taskId}] Stream ended`);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.trim() === "data: [DONE]") {
            continue;
          }

          if (line.startsWith("data: ")) {
            try {
              const jsonData = line.slice(6);
              const data = JSON.parse(jsonData);

              if (data.choices && data.choices[0]?.delta?.content) {
                const content = data.choices[0].delta.content;

                // Log all content for debugging
                console.log(`[VideoTask ${taskId}] Content chunk:`, content);
                console.log(`[VideoTask ${taskId}] Content length: ${content.length}, has ✅: ${content.includes("✅")}, has 视频生成成功: ${content.includes("视频生成成功")}`);

                // Extract progress from content
                const progressMatch = content.match(/进度[：:]\s*(\d+(?:\.\d+)?)\s*%/);
                if (progressMatch) {
                  const progress = Math.round(parseFloat(progressMatch[1]));
                  console.log(`[VideoTask ${taskId}] Progress: ${progress}%`);
                  await prisma.videoTask.update({
                    where: { id: taskId },
                    data: { progress, updatedAt: new Date() },
                  });
                }

                // Extract video URL from completion message - try multiple patterns
                console.log(`[VideoTask ${taskId}] Attempting URL extraction...`);
                const urlMatch1 = content.match(/\[点击这里\]\((https?:\/\/[^\)]+)\)/);
                const urlMatch2 = content.match(/https?:\/\/[^\s\)]+\.mp4/);
                console.log(`[VideoTask ${taskId}] URL Match 1 (Markdown link):`, urlMatch1 ? `Found - [1]=${urlMatch1[1]}` : "Not found");
                console.log(`[VideoTask ${taskId}] URL Match 2 (.mp4):`, urlMatch2 ? `Found - [0]=${urlMatch2[0]}` : "Not found");

                const urlMatch = urlMatch1 || urlMatch2;
                if (urlMatch) {
                  videoUrl = urlMatch[1] || urlMatch[0];
                  console.log(`[VideoTask ${taskId}] ✅ Video URL extracted: ${videoUrl}`);
                } else {
                  console.log(`[VideoTask ${taskId}] ❌ No URL found in this chunk`);
                }

                // Check for success message
                if (content.includes("✅") && content.includes("视频生成成功")) {
                  console.log(`[VideoTask ${taskId}] Success message detected! videoUrl=${videoUrl}, videoCreated=${videoCreated}`);
                  if (videoUrl && !videoCreated) {
                    console.log(`[VideoTask ${taskId}] ✅ Video generation successful, uploading to R2...`);

                    // 上传视频到 R2
                    let finalVideoUrl = videoUrl;
                    try {
                      finalVideoUrl = await uploadVideoFromUrl(videoUrl);
                      console.log(`[VideoTask ${taskId}] ✅ Video uploaded to R2: ${finalVideoUrl}`);
                    } catch (uploadError) {
                      console.error(`[VideoTask ${taskId}] ⚠️ Failed to upload to R2, using original URL:`, uploadError);
                      // 如果上传失败，使用原始 URL（会过期）
                    }

                    // 更新任务状态为完成
                    await prisma.videoTask.update({
                      where: { id: taskId },
                      data: {
                        status: "completed",
                        videoUrl: finalVideoUrl,
                        progress: 100,
                        completedAt: new Date(),
                        updatedAt: new Date(),
                      },
                    });

                    videoCreated = true;
                    console.log(`[VideoTask ${taskId}] ✅ Completed successfully`);
                  }
                }
              }

              // Check for finish_reason
              if (data.choices && data.choices[0]?.finish_reason === "stop") {
                console.log(`[VideoTask ${taskId}] Stream finished (finish_reason: stop)`);
                break;
              }
            } catch (parseError: any) {
              console.error(`[VideoTask ${taskId}] Parse error:`, parseError.message);
              // Continue processing other lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 如果流结束但没有创建视频，检查是否有videoUrl
    if (!videoCreated && videoUrl) {
      console.log(`[VideoTask ${taskId}] Stream ended with videoUrl but not marked completed, uploading to R2...`);

      // 上传视频到 R2
      let finalVideoUrl = videoUrl;
      try {
        finalVideoUrl = await uploadVideoFromUrl(videoUrl);
        console.log(`[VideoTask ${taskId}] ✅ Video uploaded to R2: ${finalVideoUrl}`);
      } catch (uploadError) {
        console.error(`[VideoTask ${taskId}] ⚠️ Failed to upload to R2, using original URL:`, uploadError);
      }

      await prisma.videoTask.update({
        where: { id: taskId },
        data: {
          status: "completed",
          videoUrl: finalVideoUrl,
          progress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log(`[VideoTask ${taskId}] ✅ Completed successfully`);
    } else if (!videoCreated) {
      throw new Error("Failed to extract video URL from response");
    }
  } catch (error) {
    // 异常：更新状态为 failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.error(`[VideoTask ${taskId}] ❌ Exception: ${errorMessage}`);
  }
}

/**
 * 清理旧任务（可选，用于定期清理数据库）
 */
export async function cleanupOldVideoTasks(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.videoTask.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}
