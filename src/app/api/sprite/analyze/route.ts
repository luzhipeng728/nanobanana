import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 初始化 Gemini 客户端
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY 未配置");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
    }

    // 清理 base64 前缀
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            rows: { type: SchemaType.INTEGER, description: "Number of rows in the grid" },
            cols: { type: SchemaType.INTEGER, description: "Number of columns in the grid" },
            totalFrames: { type: SchemaType.INTEGER, description: "Total actual frames (sprites) in the image" },
          },
          required: ["rows", "cols", "totalFrames"],
        }
      }
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/png",
          data: cleanBase64
        }
      },
      {
        text: `Analyze this sprite sheet image. It contains a sequence of animation frames arranged in a grid.
Count the number of rows and columns.
Also estimate the total number of valid frames (sometimes the last row is not full).
Return the result in JSON format.`
      }
    ]);

    const response = result.response;
    const text = response.text();

    if (text) {
      try {
        const data = JSON.parse(text);
        return NextResponse.json({
          success: true,
          rows: data.rows,
          cols: data.cols,
          totalFrames: data.totalFrames
        });
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        return NextResponse.json({
          error: "无法解析分析结果",
          rawText: text
        }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "分析失败，无响应" }, { status: 500 });

  } catch (error) {
    console.error("[Sprite Analyze] Error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "分析失败",
    }, { status: 500 });
  }
}
