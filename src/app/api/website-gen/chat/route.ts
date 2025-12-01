import { NextRequest, NextResponse } from "next/server";
import {
  WEBSITE_GEN_SYSTEM_PROMPT,
  WEBSITE_GEN_TOOLS,
  type WebsiteGenSSEEvent,
  type ImagePlaceholder,
} from "@/types/website-gen";

// Gemini message type with support for function calls
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiMessage {
  role: string;
  parts: GeminiPart[];
}
import {
  getOrCreateProject,
  writeFile,
  readFile,
  updateFile,
  listFiles,
  updateMetadata,
  addImagePlaceholder,
  updateImagePlaceholder,
  replaceImagePlaceholder,
  getProjectFiles,
} from "@/lib/website-gen/project-store";
import { createImageTask, getImageTaskStatus } from "@/app/actions/image-task";
import {
  callHyprLabDeepResearch,
  parseHyprLabResponse,
  type ReasoningEffort,
} from "@/lib/super-agent/hyprlab-research";

// Gemini API Keys rotation
const GEMINI_API_KEYS: string[] = [];
const keyEnvNames = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_2',
  'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4',
  'GEMINI_API_KEY_5',
];
for (const envName of keyEnvNames) {
  const key = process.env[envName];
  if (key) GEMINI_API_KEYS.push(key);
}

let currentKeyIndex = 0;

function getNextApiKey(): string {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error("No Gemini API keys configured");
  }
  const key = GEMINI_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
  return key;
}

// Convert tools to Gemini format
function getGeminiTools() {
  return WEBSITE_GEN_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await request.json();
    const { projectId, message, history = [] } = body as {
      projectId: string;
      message: string;
      history: Array<{ role: string; content: string }>;
    };

    if (!projectId || !message) {
      return NextResponse.json({ error: "Missing projectId or message" }, { status: 400 });
    }

    // Ensure project exists
    await getOrCreateProject(projectId);

    // Build messages array with explicit type
    const messages: GeminiMessage[] = [
      { role: "user", parts: [{ text: WEBSITE_GEN_SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "我理解了。我是一个专业的网站生成器 AI 助手，会帮助用户创建精美的 React 网站。我会使用提供的工具来创建文件、生成图片和通知预览。请告诉我你想要什么样的网站。" }] },
      ...history.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: WebsiteGenSSEEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          let continueLoop = true;
          let loopCount = 0;
          const maxLoops = 20; // Prevent infinite loops

          while (continueLoop && loopCount < maxLoops) {
            loopCount++;
            continueLoop = false;

            const apiKey = getNextApiKey();
            // 使用 Gemini 3 Pro Preview 模型 + 流式 API
            const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:streamGenerateContent?alt=sse";
            console.log(`[WebsiteGen] Calling Gemini API: ${apiUrl}`);

            const requestBody = {
              contents: messages,
              tools: [{ functionDeclarations: getGeminiTools() }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
              },
            };

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
              console.error(`[WebsiteGen] Gemini API error: ${response.status}`, errorText);
              sendEvent({ type: "error", message: `API error: ${response.status} - ${errorText.substring(0, 200)}` });
              break;
            }

            console.log(`[WebsiteGen] Got response, starting to read stream...`);

            // 处理流式响应
            const reader = response.body?.getReader();
            if (!reader) {
              sendEvent({ type: "error", message: "No reader available" });
              break;
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let accumulatedText = "";
            let functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
            let chunkCount = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log(`[WebsiteGen] Stream finished, total chunks: ${chunkCount}`);
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              chunkCount++;

              // 每 10 个 chunk 打印一次进度
              if (chunkCount % 10 === 1) {
                console.log(`[WebsiteGen] Received chunk #${chunkCount}, buffer size: ${buffer.length}`);
              }

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") continue;

                  try {
                    const data = JSON.parse(jsonStr);
                    const candidate = data.candidates?.[0];

                    if (candidate?.content?.parts) {
                      for (const part of candidate.content.parts) {
                        // 流式文本内容
                        if (part.text) {
                          accumulatedText += part.text;
                          sendEvent({ type: "content_chunk", content: part.text });
                        }
                        // 函数调用（通常在流结束时）
                        if (part.functionCall) {
                          console.log(`[WebsiteGen] Got function call: ${part.functionCall.name}`);
                          functionCalls.push({
                            name: part.functionCall.name,
                            args: part.functionCall.args || {},
                          });
                        }
                      }
                    }
                  } catch (e) {
                    console.error(`[WebsiteGen] Parse error:`, e, jsonStr.substring(0, 100));
                  }
                }
              }
            }

            // 处理剩余的 buffer
            if (buffer.startsWith("data: ")) {
              const jsonStr = buffer.slice(6).trim();
              if (jsonStr && jsonStr !== "[DONE]") {
                try {
                  const data = JSON.parse(jsonStr);
                  const candidate = data.candidates?.[0];
                  if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text) {
                        accumulatedText += part.text;
                        sendEvent({ type: "content_chunk", content: part.text });
                      }
                      if (part.functionCall) {
                        functionCalls.push({
                          name: part.functionCall.name,
                          args: part.functionCall.args || {},
                        });
                      }
                    }
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }

            // 处理函数调用
            for (const fc of functionCalls) {
              const toolId = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

              sendEvent({ type: "tool_start", toolId, name: fc.name, args: fc.args });

              try {
                const result = await executeToolCall(projectId, fc.name, fc.args, sendEvent, toolId);
                sendEvent({ type: "tool_end", toolId, result: { success: true, data: result } });

                // Add function response to messages for next turn
                messages.push({
                  role: "model",
                  parts: [{ functionCall: { name: fc.name, args: fc.args } }],
                });
                messages.push({
                  role: "user",
                  parts: [{ functionResponse: { name: fc.name, response: { result } } }],
                });

                // Continue the loop for multi-turn tool use
                continueLoop = true;
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                sendEvent({ type: "tool_end", toolId, result: { success: false, error: errorMessage } });

                // Still add the error response
                messages.push({
                  role: "model",
                  parts: [{ functionCall: { name: fc.name, args: fc.args } }],
                });
                messages.push({
                  role: "user",
                  parts: [{ functionResponse: { name: fc.name, response: { error: errorMessage } } }],
                });

                continueLoop = true;
              }
            }
          }

          sendEvent({ type: "done" });
        } catch (error) {
          console.error("[WebsiteGen] Stream error:", error);
          sendEvent({
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[WebsiteGen] Request error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Execute a tool call
 */
async function executeToolCall(
  projectId: string,
  toolName: string,
  args: Record<string, any>,
  sendEvent: (event: WebsiteGenSSEEvent) => void,
  toolId: string
): Promise<any> {
  console.log(`[WebsiteGen] Executing tool: ${toolName}`, args);

  switch (toolName) {
    case "write_file": {
      const { path, content } = args;
      await writeFile(projectId, path, content);
      return { success: true, path, message: `文件 ${path} 已创建/更新` };
    }

    case "read_file": {
      const { path } = args;
      const content = await readFile(projectId, path);
      if (content === null) {
        return { success: false, error: `文件 ${path} 不存在` };
      }
      return { success: true, path, content };
    }

    case "update_file": {
      const { path, updates } = args;
      const success = await updateFile(projectId, path, updates);
      if (!success) {
        return { success: false, error: `更新文件 ${path} 失败，可能文件不存在或内容未找到` };
      }
      return { success: true, path, message: `文件 ${path} 已更新` };
    }

    case "list_files": {
      const files = await listFiles(projectId);
      return { success: true, files };
    }

    case "generate_image": {
      const { prompt, placeholderId, aspectRatio } = args;

      // Create placeholder
      const placeholder: ImagePlaceholder = {
        id: placeholderId,
        prompt,
        aspectRatio: aspectRatio || "16:9",
        status: "pending",
      };

      await addImagePlaceholder(projectId, placeholder);
      sendEvent({ type: "image_placeholder", placeholder });

      // Start async image generation
      generateImageAsync(projectId, placeholder, sendEvent).catch((error) => {
        console.error(`[WebsiteGen] Image generation failed for ${placeholderId}:`, error);
      });

      return {
        success: true,
        placeholderId,
        message: `图片占位符 {{placeholder:${placeholderId}}} 已创建，图片正在后台生成`,
      };
    }

    case "preview_ready": {
      const { title, description } = args;
      await updateMetadata(projectId, { title, description: description || "" });

      // Send preview ready event
      sendEvent({ type: "preview_ready", projectId });

      return { success: true, message: "预览已准备好" };
    }

    case "web_search": {
      const { query } = args;
      // Simple web search using Exa or fallback
      try {
        const searchResults = await performWebSearch(query);
        return { success: true, results: searchResults };
      } catch (error) {
        return { success: false, error: "搜索失败" };
      }
    }

    case "deep_research": {
      const { topic, reasoning_effort = "low" } = args;
      try {
        // Create progress callback to send heartbeat events
        const onProgress = (message: string, elapsed?: number) => {
          sendEvent({ type: "tool_progress", toolId, message, elapsed });
        };

        const result = await performDeepResearch(
          topic,
          reasoning_effort as "low" | "medium" | "high",
          onProgress
        );
        return {
          success: true,
          topic,
          researchReport: result.content,
          citations: result.citations,
          message: `深度研究完成，获得 ${result.citations.length} 个引用来源`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "深度研究失败",
        };
      }
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Generate image asynchronously
 */
async function generateImageAsync(
  projectId: string,
  placeholder: ImagePlaceholder,
  sendEvent: (event: WebsiteGenSSEEvent) => void
): Promise<void> {
  try {
    // Update status to generating
    await updateImagePlaceholder(projectId, placeholder.id, { status: "generating" });

    // Create image task
    const config: any = {};
    if (placeholder.aspectRatio) {
      config.aspectRatio = placeholder.aspectRatio;
    }

    const { taskId } = await createImageTask(
      placeholder.prompt,
      "nano-banana-pro",
      config,
      []
    );

    await updateImagePlaceholder(projectId, placeholder.id, { taskId });

    // Poll for completion (simplified - in production use webhooks or better polling)
    const pollInterval = 5000; // 5 seconds
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const checkStatus = async () => {
      attempts++;

      try {
        // 直接调用 getImageTaskStatus 而不是通过 HTTP，避免 ECONNREFUSED 错误
        const taskStatus = await getImageTaskStatus(taskId);

        if (taskStatus) {
          if (taskStatus.status === "completed" && taskStatus.imageUrl) {
            // Replace placeholder in all files
            await replaceImagePlaceholder(projectId, placeholder.id, taskStatus.imageUrl);
            sendEvent({
              type: "image_completed",
              placeholderId: placeholder.id,
              imageUrl: taskStatus.imageUrl,
            });
            return;
          }

          if (taskStatus.status === "failed") {
            await updateImagePlaceholder(projectId, placeholder.id, {
              status: "failed",
              error: taskStatus.error || "图片生成失败",
            });
            sendEvent({
              type: "image_failed",
              placeholderId: placeholder.id,
              error: taskStatus.error || "图片生成失败",
            });
            return;
          }
        }

        // Continue polling if not completed
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, pollInterval);
        } else {
          await updateImagePlaceholder(projectId, placeholder.id, {
            status: "failed",
            error: "图片生成超时",
          });
          sendEvent({
            type: "image_failed",
            placeholderId: placeholder.id,
            error: "图片生成超时",
          });
        }
      } catch (error) {
        console.error(`[WebsiteGen] Error checking image status:`, error);
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, pollInterval);
        }
      }
    };

    // Start polling
    setTimeout(checkStatus, pollInterval);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "图片生成失败";
    await updateImagePlaceholder(projectId, placeholder.id, {
      status: "failed",
      error: errorMessage,
    });
    sendEvent({
      type: "image_failed",
      placeholderId: placeholder.id,
      error: errorMessage,
    });
  }
}

/**
 * Simple web search
 */
async function performWebSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  // TODO: Integrate with actual search API
  // For now, return a placeholder response
  return [
    {
      title: `搜索结果: ${query}`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      snippet: "请访问搜索引擎获取更多信息",
    },
  ];
}

/**
 * Perform deep research using HyprLab
 */
async function performDeepResearch(
  topic: string,
  reasoningEffort: ReasoningEffort,
  onProgress?: (message: string, elapsed?: number) => void
): Promise<{ content: string; citations: string[] }> {
  console.log(`[WebsiteGen] Starting deep research: "${topic}" with effort: ${reasoningEffort}`);

  // Create progress callback for HyprLab
  const hyprLabProgress = onProgress
    ? async (event: { type: string; elapsedSeconds: number; message: string }) => {
        onProgress(event.message, event.elapsedSeconds);
      }
    : undefined;

  const response = await callHyprLabDeepResearch(topic, reasoningEffort, hyprLabProgress);
  const parsed = parseHyprLabResponse(response);

  console.log(`[WebsiteGen] Deep research completed, citations: ${parsed.citations.length}`);

  return {
    content: parsed.content,
    citations: parsed.citations,
  };
}
