import { NextRequest, NextResponse } from "next/server";
import { generateLyrics } from "@/app/actions/lyrics";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    const result = await generateLyrics(prompt);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("API generate-lyrics error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
