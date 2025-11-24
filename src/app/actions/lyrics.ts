"use server";

export interface GenerateLyricsResult {
  title: string;
  lyrics: string;
}

export interface ExtendLyricsResult {
  lyrics: string;
}

/**
 * 根据 prompt 生成歌词
 */
export async function generateLyrics(prompt: string): Promise<GenerateLyricsResult> {
  try {
    const murekaApiUrl = process.env.MUREKA_API_URL;
    const murekaApiToken = process.env.MUREKA_API_TOKEN;

    if (!murekaApiUrl || !murekaApiToken) {
      throw new Error("Mureka API credentials not configured");
    }

    console.log(`[Lyrics] Generating lyrics for prompt: "${prompt}"`);

    const response = await fetch(`${murekaApiUrl}/v1/lyrics/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${murekaApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mureka API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Lyrics] Generated lyrics - Title: "${result.title}"`);

    return {
      title: result.title || "",
      lyrics: result.lyrics || "",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Lyrics] Generation failed:`, errorMessage);
    throw new Error(`Failed to generate lyrics: ${errorMessage}`);
  }
}

/**
 * 扩展现有歌词
 */
export async function extendLyrics(lyrics: string): Promise<ExtendLyricsResult> {
  try {
    const murekaApiUrl = process.env.MUREKA_API_URL;
    const murekaApiToken = process.env.MUREKA_API_TOKEN;

    if (!murekaApiUrl || !murekaApiToken) {
      throw new Error("Mureka API credentials not configured");
    }

    console.log(`[Lyrics] Extending lyrics`);

    const response = await fetch(`${murekaApiUrl}/v1/lyrics/extend`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${murekaApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lyrics }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mureka API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`[Lyrics] Extended lyrics successfully`);

    return {
      lyrics: result.lyrics || "",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Lyrics] Extension failed:`, errorMessage);
    throw new Error(`Failed to extend lyrics: ${errorMessage}`);
  }
}
