import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerationMode, ImageResolution } from "@/types/sprite";

// 初始化 Gemini 客户端
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY 未配置");
  }
  return new GoogleGenerativeAI(apiKey);
}

// 重试机制
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isOverloaded =
      error.status === 503 ||
      error.code === 503 ||
      (error.message && error.message.includes("overloaded"));

    if (retries > 0 && isOverloaded) {
      console.warn(`Model overloaded. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// 根据图片计算最接近的宽高比
async function determineAspectRatio(base64Image: string): Promise<string> {
  // 服务端无法直接加载图片，返回默认值
  // 前端会传入实际的宽高比
  return "1:1";
}

// Replica 模式：模板 + 角色 → 生成新角色的相同动作
async function generateSpriteReplica(
  templateBase64: string,
  characterBase64: string,
  prompt: string,
  size: ImageResolution,
  aspectRatio: string = "1:1"
): Promise<string> {
  const genAI = getGeminiClient();

  return withRetry(async () => {
    const cleanTemplate = templateBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const cleanCharacter = characterBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const textPrompt = `
Create a high-quality pixel art sprite sheet based on the visual style of the character provided in the second image.

CRITICAL INSTRUCTIONS:
1. The layout, grid structure, and poses MUST EXACTLY match the first image (the template sprite sheet).
2. DO NOT STRETCH the sprites. Maintain the original internal aspect ratio of the characters.
3. If the output aspect ratio (${aspectRatio}) differs from the template, add padding (empty space) rather than stretching the content.
4. Apply the character's appearance (colors, clothing, features) to the poses in the template.
5. Keep consistent lighting, shadows, and rendering style across all frames.
6. Background should be a solid uniform color (easy to remove) - preferably white or light gray.
${prompt ? `Additional instructions: ${prompt}` : ""}
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
      generationConfig: {
        // @ts-ignore - image generation config
        responseModalities: ["image", "text"],
      }
    });

    const result = await model.generateContent([
      { text: textPrompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: cleanTemplate
        }
      },
      {
        inlineData: {
          mimeType: "image/png",
          data: cleanCharacter
        }
      }
    ]);

    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts;

    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated in response");
  });
}

// Creative 模式：角色 + 动作描述 → 生成新动作 Sprite Sheet
async function generateSpriteCreative(
  characterBase64: string,
  actionPrompt: string,
  stylePrompt: string,
  size: ImageResolution
): Promise<string> {
  const genAI = getGeminiClient();

  return withRetry(async () => {
    const cleanCharacter = characterBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const textPrompt = `
Create a high-quality sprite sheet for animation.

REFERENCE CHARACTER:
See the attached image. You MUST maintain the exact identity, colors, and design of this character.

ACTION TO ANIMATE:
${actionPrompt}

REQUIREMENTS:
1. Generate a sequence of animation frames showing the character performing the action.
2. Arrange the frames in a clean, regular GRID (e.g., 3x3, 4x4, 5x5, or a horizontal strip) so they can be easily sliced.
3. Ensure consistent sizing and positioning for each frame.
4. The animation should be smooth and loopable if possible.
5. Visual Style: ${stylePrompt || "Match the reference character's style"}.
6. Background: Solid uniform color (white or light gray, easy to remove for transparency).
7. Each frame should be clearly separated with consistent spacing.

OUTPUT FORMAT:
A single image file containing the sprite sheet with all animation frames arranged in a grid.
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
      generationConfig: {
        // @ts-ignore - image generation config
        responseModalities: ["image", "text"],
      }
    });

    const result = await model.generateContent([
      { text: textPrompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: cleanCharacter
        }
      }
    ]);

    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts;

    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated in response");
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mode,
      templateImage,
      characterImage,
      prompt,
      actionPrompt,
      size,
      aspectRatio
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
      return NextResponse.json({ error: "缺少角色图片" }, { status: 400 });
    }

    let resultBase64: string;

    if (mode === "replica") {
      if (!templateImage) {
        return NextResponse.json({ error: "Replica 模式需要模板图片" }, { status: 400 });
      }

      console.log("[Sprite Generate] Replica mode - generating...");
      resultBase64 = await generateSpriteReplica(
        templateImage,
        characterImage,
        prompt || "",
        size,
        aspectRatio || "1:1"
      );
    } else {
      // Creative 模式
      if (!actionPrompt) {
        return NextResponse.json({ error: "Creative 模式需要动作描述" }, { status: 400 });
      }

      console.log("[Sprite Generate] Creative mode - generating...");
      resultBase64 = await generateSpriteCreative(
        characterImage,
        actionPrompt,
        prompt || "",
        size
      );
    }

    console.log("[Sprite Generate] Success!");

    return NextResponse.json({
      success: true,
      imageUrl: resultBase64
    });

  } catch (error) {
    console.error("[Sprite Generate] Error:", error);

    let errorMessage = "生成失败，请重试";
    const errorString = String(error);

    if (errorString.includes("503") || errorString.includes("overloaded")) {
      errorMessage = "AI 模型当前负载过高，请稍后重试";
    } else if (errorString.includes("403") || errorString.includes("PERMISSION_DENIED")) {
      errorMessage = "API 权限不足，请检查配置";
    }

    return NextResponse.json({
      error: errorMessage,
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
