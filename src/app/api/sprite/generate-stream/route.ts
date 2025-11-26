import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createCanvas, loadImage } from "canvas";
import { uploadBufferToR2 } from "@/lib/r2";
import type {
  GenerationMode,
  ImageResolution,
  SpriteConfig,
  SpriteStreamEvent,
  SpriteAnalysisResult,
} from "@/types/sprite";

// 获取 Gemini API Key
function getGeminiApiKey(): string {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY 未配置");
  }
  return apiKey;
}

// 初始化 Claude 客户端
function getClaudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
}

// 重试机制
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isRetryable =
      error.status === 503 ||
      error.status === 500 ||
      error.code === 503 ||
      error.code === 500 ||
      (error.message && (
        error.message.includes("overloaded") ||
        error.message.includes("INTERNAL") ||
        error.message.includes("internal error")
      ));

    if (retries > 0 && isRetryable) {
      console.warn(
        `[Sprite Stream] API error (${error.status || 'unknown'}). Retrying in ${delay}ms... (${retries} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * 将图片 URL 或 base64 统一转换为纯 base64 数据
 */
async function toBase64(imageSource: string): Promise<string> {
  if (imageSource.startsWith("data:image/")) {
    return imageSource.replace(
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,/,
      ""
    );
  }

  if (
    imageSource.startsWith("http://") ||
    imageSource.startsWith("https://")
  ) {
    console.log(
      "[Sprite Stream] Downloading image from URL:",
      imageSource.substring(0, 50) + "..."
    );

    const response = await fetch(imageSource);
    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    console.log(
      "[Sprite Stream] Image downloaded, size:",
      Math.round(arrayBuffer.byteLength / 1024),
      "KB"
    );
    return base64;
  }

  return imageSource;
}

/**
 * 检测 base64 图片的媒体类型
 */
function detectImageMediaType(
  base64: string
): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  // PNG: 89 50 4E 47
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  // JPEG: FF D8 FF
  if (base64.startsWith("/9j/")) return "image/jpeg";
  // GIF: 47 49 46 38
  if (base64.startsWith("R0lGOD")) return "image/gif";
  // WebP: 52 49 46 46
  if (base64.startsWith("UklGR")) return "image/webp";
  // 默认返回 PNG
  return "image/png";
}

// Replica 模式：模板 + 角色 → 生成新角色的相同动作
async function generateSpriteReplica(
  templateSource: string,
  characterSource: string,
  prompt: string,
  size: ImageResolution,
  aspectRatio: string = "1:1"
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const cleanTemplate = await toBase64(templateSource);
  const cleanCharacter = await toBase64(characterSource);

  return withRetry(async () => {
    const textPrompt = `
        Create a high-quality pixel art sprite sheet based on the visual style of the character provided in the second image.
        CRITICAL INSTRUCTIONS:
        1. The layout, grid structure, and poses MUST EXACTLY match the first image (the template sprite sheet).
        2. DO NOT STRETCH the sprites. Maintain the original internal aspect ratio of the characters.
        3. If the output aspect ratio (${aspectRatio}) differs from the template, add padding (empty space) rather than stretching the content.
        4. Apply the character's appearance (colors, clothing, features) to the poses in the template.
        ${prompt ? `Additional instructions: ${prompt}` : ""}
      `;

    // 使用原生 fetch 调用 REST API（和 Generator 一致）
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: textPrompt },
            {
              inline_data: {
                mime_type: "image/png",
                data: cleanTemplate,
              },
            },
            {
              inline_data: {
                mime_type: "image/png",
                data: cleanCharacter,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          aspectRatio: aspectRatio,
          image_size: size,
        },
      },
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.candidates?.[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data as string;
        }
        // REST API 返回的是 inline_data
        if (part.inline_data?.data) {
          return part.inline_data.data as string;
        }
      }
    }

    throw new Error("No image generated in response");
  });
}

// Creative 模式：角色 + 动作描述 → 生成新动作 Sprite Sheet
async function generateSpriteCreative(
  characterSource: string,
  actionPrompt: string,
  stylePrompt: string,
  size: ImageResolution
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const cleanCharacter = await toBase64(characterSource);

  return withRetry(async () => {
    const textPrompt = `
        Create a high-quality pixel art sprite sheet for game animation.

        REFERENCE CHARACTER:
        See the attached image. You MUST maintain the exact identity, colors, and design of this character.

        ACTION:
        ${actionPrompt}

        REQUIREMENTS:
        1. Generate a sequence of animation frames showing the character performing the action.
        2. Arrange the frames in a clean, regular GRID (e.g., 3x3, 4x4, 5x5, or a horizontal strip) so they can be easily sliced.
        3. Ensure consistent sizing and positioning for each frame.
        4. Visual Style: ${stylePrompt || "Match the reference character's style"}.
        5. Background: Solid uniform color (easy to remove) or transparent.

        OUTPUT FORMAT:
        A single image file containing the sprite sheet.
      `;

    // 使用原生 fetch 调用 REST API（和 Generator 一致）
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: textPrompt },
            {
              inline_data: {
                mime_type: "image/png",
                data: cleanCharacter,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          aspectRatio: "1:1",
          image_size: size,
        },
      },
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.candidates?.[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data as string;
        }
        // REST API 返回的是 inline_data
        if (part.inline_data?.data) {
          return part.inline_data.data as string;
        }
      }
    }

    throw new Error("No image generated in response");
  });
}

/**
 * 使用 Claude 流式分析精灵图布局
 */
async function analyzeSpriteWithClaudeStream(
  imageBase64: string,
  onChunk: (chunk: string) => Promise<void>
): Promise<SpriteAnalysisResult> {
  const anthropic = getClaudeClient();

  console.log("[Sprite Stream] Using Claude to analyze sprite sheet...");

  // 检测图片的真实媒体类型
  const mediaType = detectImageMediaType(imageBase64);
  console.log(`[Sprite Stream] Detected media type: ${mediaType}`);

  let fullText = "";

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `分析这张精灵图（sprite sheet），确定其网格布局。

请仔细观察：
1. 图片被分成几行几列的网格？
2. 总共有多少个动画帧？（注意：有些格子可能是空白的）
3. 动画的阅读顺序是行优先（从左到右，然后下一行）还是列优先（从上到下，然后下一列）？
4. 哪些格子是空白的？（列出它们的索引，从0开始）

请先用中文描述你的分析过程，然后最后返回 JSON 格式：
{
  "rows": 数字,
  "cols": 数字,
  "totalFrames": 实际有内容的帧数,
  "direction": "row" 或 "column",
  "blankFrames": [空白帧的索引数组，如果没有空白帧就是空数组]
}`,
          },
        ],
      },
    ],
  });

  // 处理流式响应
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const chunk = event.delta.text;
      fullText += chunk;
      await onChunk(chunk);
    }
  }

  // 解析 JSON
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Claude response:", fullText);
    throw new Error("无法从 Claude 响应中解析 JSON");
  }

  const analysis = JSON.parse(jsonMatch[0]) as SpriteAnalysisResult;
  console.log("[Sprite Stream] Claude analysis result:", analysis);

  return analysis;
}

/**
 * 在后端切割精灵图并上传每一帧到 R2
 */
async function splitAndUploadFrames(
  imageBase64: string,
  analysis: SpriteAnalysisResult,
  onProgress: (current: number, total: number) => Promise<void>
): Promise<string[]> {
  console.log("[Sprite Stream] Splitting sprite sheet into frames...");

  // 加载图片
  const buffer = Buffer.from(imageBase64, "base64");
  const image = await loadImage(buffer);

  const frameWidth = image.width / analysis.cols;
  const frameHeight = image.height / analysis.rows;
  const frameUrls: string[] = [];

  console.log(
    `[Sprite Stream] Frame size: ${frameWidth}x${frameHeight}, Total cells: ${analysis.rows * analysis.cols}`
  );

  // 计算要切割的帧数
  const totalCells = analysis.rows * analysis.cols;
  const validFrames = totalCells - analysis.blankFrames.length;
  let uploadedCount = 0;

  for (let i = 0; i < totalCells; i++) {
    // 跳过空白帧
    if (analysis.blankFrames.includes(i)) {
      console.log(`[Sprite Stream] Skipping blank frame ${i}`);
      continue;
    }

    // 计算帧的位置
    let col: number, row: number;
    if (analysis.direction === "column") {
      row = i % analysis.rows;
      col = Math.floor(i / analysis.rows);
    } else {
      col = i % analysis.cols;
      row = Math.floor(i / analysis.cols);
    }

    // 创建 canvas 切割帧
    const canvas = createCanvas(frameWidth, frameHeight);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      image,
      col * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      0,
      0,
      frameWidth,
      frameHeight
    );

    // 转换为 Buffer
    const frameBuffer = canvas.toBuffer("image/png");

    // 上传到 R2
    const frameUrl = await uploadBufferToR2(frameBuffer, "image/png", "sprites");
    frameUrls.push(frameUrl);
    uploadedCount++;

    // 发送进度
    await onProgress(uploadedCount, validFrames);

    console.log(
      `[Sprite Stream] Uploaded frame ${i} (${uploadedCount}/${validFrames}) -> ${frameUrl.substring(0, 50)}...`
    );
  }

  console.log(`[Sprite Stream] Total ${frameUrls.length} frames uploaded to R2`);
  return frameUrls;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // 创建流式响应
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // 发送事件的辅助函数
  const sendEvent = async (event: SpriteStreamEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  // 异步处理
  (async () => {
    try {
      const body = await request.json();
      const {
        mode,
        templateImage,
        characterImage,
        prompt,
        actionPrompt,
        size,
        aspectRatio,
      } = body as {
        mode: GenerationMode;
        templateImage?: string;
        characterImage: string;
        prompt?: string;
        actionPrompt?: string;
        size: ImageResolution;
        aspectRatio?: string;
      };

      if (!characterImage) {
        await sendEvent({ type: "error", error: "缺少角色图片" });
        await writer.close();
        return;
      }

      // Step 1: 生成精灵图
      await sendEvent({
        type: "status",
        step: "🎨 AI 正在生成精灵图...",
        progress: 10,
      });

      let spriteBase64: string;

      if (mode === "replica") {
        if (!templateImage) {
          await sendEvent({ type: "error", error: "Replica 模式需要模板图片" });
          await writer.close();
          return;
        }

        console.log("[Sprite Stream] Replica mode - generating...");
        spriteBase64 = await generateSpriteReplica(
          templateImage,
          characterImage,
          prompt || "",
          size,
          aspectRatio || "1:1"
        );
      } else {
        if (!actionPrompt) {
          await sendEvent({
            type: "error",
            error: "Creative 模式需要动作描述",
          });
          await writer.close();
          return;
        }

        console.log("[Sprite Stream] Creative mode - generating...");
        spriteBase64 = await generateSpriteCreative(
          characterImage,
          actionPrompt,
          prompt || "",
          size
        );
      }

      console.log("[Sprite Stream] Sprite generated, uploading to R2...");

      await sendEvent({
        type: "status",
        step: "📤 上传精灵图到云端...",
        progress: 30,
      });

      // Step 2: 上传原始精灵图到 R2
      const spriteBuffer = Buffer.from(spriteBase64, "base64");
      const spriteSheetUrl = await uploadBufferToR2(
        spriteBuffer,
        "image/png",
        "sprites"
      );
      console.log(
        `[Sprite Stream] Sprite sheet uploaded: ${spriteSheetUrl.substring(0, 50)}...`
      );

      // 发送精灵图生成完成事件
      await sendEvent({
        type: "sprite_generated",
        spriteSheetUrl,
      });

      // Step 3: 使用 Claude 流式分析精灵图布局
      await sendEvent({
        type: "status",
        step: "🧠 Claude 正在分析精灵图布局...",
        progress: 40,
      });

      await sendEvent({ type: "claude_analysis_start" });

      let analysis: SpriteAnalysisResult;
      try {
        analysis = await analyzeSpriteWithClaudeStream(
          spriteBase64,
          async (chunk) => {
            await sendEvent({ type: "claude_analysis_chunk", chunk });
          }
        );
      } catch (err) {
        console.error("[Sprite Stream] Claude analysis error:", err);
        await sendEvent({
          type: "error",
          error: `Claude 分析失败: ${err instanceof Error ? err.message : "未知错误"}`,
        });
        await writer.close();
        return;
      }

      await sendEvent({ type: "claude_analysis_end", analysis });

      // Step 4: 切割帧并上传到 R2
      await sendEvent({
        type: "status",
        step: "✂️ 切割并上传动画帧...",
        progress: 60,
      });

      let frameUrls: string[];
      try {
        frameUrls = await splitAndUploadFrames(
          spriteBase64,
          analysis,
          async (current, total) => {
            await sendEvent({
              type: "frame_split_progress",
              current,
              total,
            });
          }
        );
      } catch (err) {
        console.error("[Sprite Stream] Frame split error:", err);
        await sendEvent({
          type: "error",
          error: `帧切割失败: ${err instanceof Error ? err.message : "未知错误"}`,
        });
        await writer.close();
        return;
      }

      // 构建 spriteConfig
      const spriteConfig: SpriteConfig & { blankFrames?: number[] } = {
        rows: analysis.rows,
        cols: analysis.cols,
        totalFrames: frameUrls.length,
        fps: 6,
        scale: 1,
        autoTransparent: true,
        direction: analysis.direction,
        blankFrames: analysis.blankFrames,
      };

      // 发送完成事件
      await sendEvent({
        type: "complete",
        frameUrls,
        spriteConfig,
      });

      console.log(
        `[Sprite Stream] ✅ Completed! ${frameUrls.length} frames, ${analysis.blankFrames.length} blank`
      );
    } catch (error) {
      console.error("[Sprite Stream] Error:", error);
      await sendEvent({
        type: "error",
        error: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
