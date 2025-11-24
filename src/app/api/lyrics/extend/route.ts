import { NextRequest, NextResponse } from "next/server";
import { extendLyrics } from "@/app/actions/lyrics";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lyrics } = body;

    if (!lyrics) {
      return NextResponse.json(
        { success: false, error: "Lyrics is required" },
        { status: 400 }
      );
    }

    const result = await extendLyrics(lyrics);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("API extend-lyrics error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
