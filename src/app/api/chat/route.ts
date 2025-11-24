import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const { messages, systemPrompt } = await request.json();

    const openaiBaseUrl = process.env.OPENAI_BASE_URL;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiModel = process.env.OPENAI_MODEL || "gpt-4";

    if (!openaiBaseUrl || !openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI configuration missing" }),
        { status: 500 }
      );
    }

    // Build messages array with system prompt
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Call OpenAI API with streaming
    const response = await fetch(`${openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: openaiModel,
        messages: apiMessages,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return new Response(JSON.stringify({ error: "OpenAI API error" }), {
        status: response.status,
      });
    }

    // Create a TransformStream to process the OpenAI SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Process the stream
    (async () => {
      try {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;

            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  await writer.write(encoder.encode(content));
                }
              } catch (e) {
                console.error("Parse error:", e);
              }
            }
          }
        }
      } catch (error) {
        console.error("Stream processing error:", error);
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
    });
  }
}
