import { NextRequest, NextResponse } from "next/server";
import { generateImageAction } from "@/app/actions/generate";
import type { GeminiImageModel, ImageGenerationConfig } from "@/types/image-gen";

/**
 * PPT 专用同步图片生成 API
 * Agent 可以通过 curl 调用此 API 生成图片
 *
 * 模型选择规则：
 * - nano-banana (默认): 快速模型，不支持 imageSize 参数
 * - nano-banana-pro: 高质量模型，支持 imageSize 参数（推荐 4K）
 *
 * 使用方式：
 * 1. 普通配图（默认）：
 *    curl -X POST http://localhost:3000/api/ppt/generate-image \
 *      -H "Content-Type: application/json" \
 *      -d '{"prompt": "描述", "model": "nano-banana", "aspectRatio": "16:9"}'
 *
 * 2. 图表/带文字（高质量）：
 *    curl -X POST http://localhost:3000/api/ppt/generate-image \
 *      -H "Content-Type: application/json" \
 *      -d '{"prompt": "描述", "model": "nano-banana-pro", "aspectRatio": "16:9", "imageSize": "4K"}'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      model = "nano-banana", // 默认使用快速模型
      aspectRatio = "16:9", // PPT 默认 16:9
      imageSize, // 仅 nano-banana-pro 支持，nano-banana 不传此参数
    } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    console.log(`[PPT Image] Generating: ${prompt.substring(0, 50)}... (model: ${model})`);

    // 构建配置：nano-banana 不支持 imageSize，仅 nano-banana-pro 需要
    const config: ImageGenerationConfig = {
      aspectRatio,
    };

    // 只有 nano-banana-pro 支持 imageSize 参数
    if (model === "nano-banana-pro" && imageSize) {
      config.imageSize = imageSize;
    }

    // 同步执行图片生成
    const result = await generateImageAction(
      prompt,
      model as GeminiImageModel,
      config,
      []
    );

    if (result.success && result.imageUrl) {
      console.log(`[PPT Image] ✅ Generated: ${result.imageUrl}`);
      return NextResponse.json({
        success: true,
        imageUrl: result.imageUrl,
      });
    } else {
      console.error(`[PPT Image] ❌ Failed: ${result.error}`);
      return NextResponse.json(
        { success: false, error: result.error || "Generation failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[PPT Image] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
