import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentPrompt, AgentStreamEvent } from "@/types/agent";

// 参考图数据类型
interface ReferenceImages {
  urls: string[];
  useForClaude: boolean;
  useForImageGen: boolean;
}

// 使用 Claude 分析图片（流式版本）
async function analyzeImagesWithClaudeStream(
  imageUrls: string[],
  userRequest: string,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 未配置");
  }

  const anthropic = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  // 构建图片内容
  const imageContent: Anthropic.ImageBlockParam[] = await Promise.all(
    imageUrls.slice(0, 4).map(async (url) => {
      // 如果是 base64 或 data URL
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: match[2],
            },
          };
        }
      }
      // 普通 URL
      return {
        type: "image" as const,
        source: {
          type: "url" as const,
          url: url,
        },
      };
    })
  );

  // 使用流式 API
  let fullText = "";
  
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `请仔细分析这些参考图片，然后结合用户的需求来理解他们想要生成什么样的图片。

用户需求：${userRequest}

请详细描述：
1. 图片中的主要元素、风格、色调、构图
2. 图片的整体氛围和情感
3. 如果用户想要类似风格的图片，你会建议怎样的描述

请用中文回答，描述要详细具体，这将帮助后续生成更精准的图像。`,
          },
        ],
      },
    ],
  });

  // 处理流式响应
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const chunk = event.delta.text;
      fullText += chunk;
      await onChunk(chunk);
    }
  }

  return fullText;
}

// Tavily 搜索函数
async function tavilySearch(query: string, apiKey: string): Promise<string> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        max_results: 3,
        search_depth: "basic",
        include_answer: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.statusText}`);
    }

    const data = await response.json();

    // 格式化搜索结果
    const results = data.results?.map((r: any) => ({
      title: r.title,
      content: r.content,
      url: r.url,
    })) || [];

    return JSON.stringify({
      answer: data.answer || "",
      results: results.slice(0, 3),
    }, null, 2);
  } catch (error) {
    console.error("Search error:", error);
    return JSON.stringify({ error: "搜索失败" });
  }
}

// ReAct Agent 系统提示词
const AGENT_SYSTEM_PROMPT = `你是 Nano Banana Pro（Gemini 3 Pro Image）的专业 AI Agent。你会使用 ReAct（Reasoning + Acting）模式来规划和生成高质量的图像生成 prompt。

## 你的工作流程（ReAct 模式）

### 第1步：思考与规划 (Thought & Planning)
分析用户需求，思考：
- 用户想要什么类型的图片？
- 是否需要搜索最新信息？（例如：最新产品、流行趋势、实时数据、热点事件等）
- 应该生成几个场景？每个场景的主题是什么？
- 🚨【关键】用户需求中是否包含需要显示的中文文字？必须原样保留！
- 🚨【关键】如果有文字内容，绝对不能翻译成英文，必须保留中文原文并用引号包裹！

### 第2步：决定行动 (Action)
如果需要最新信息，使用 tavily_search 工具搜索。
搜索场景示例：
- "2024年最流行的UI设计趋势"
- "赛博朋克风格的视觉特点"
- "现代简约咖啡店设计案例"
- "最新iPhone产品特性"
- "当前热门的短视频趋势"

### 第3步：生成 Prompts (Final Answer)
基于你的思考和搜索结果，生成专业的图像 prompts。

## Nano Banana Pro 核心能力
1. 文字渲染：在图像中生成清晰可读的多语言文字
2. 信息图生成：专业的信息图、流程图、架构图
3. 多语言本地化：翻译图像中的文字
4. 多图融合：最多14张图片输入，人物换背景、虚拟换装
5. 风格迁移：油画、动漫、素描、3D手办等
6. 实时数据可视化：天气图、股票图、体育比分
7. 产品摄影：电商级产品主图
8. UI/UX设计：App界面原型、网页设计
9. 漫画分镜：多格漫画、电影故事板
10. 建筑可视化：室内效果图、建筑外观渲染图

## Prompt 生成规则

### 结构公式
[主体Subject] + [构图Composition] + [场景Location] + [风格Style] + [文字内容Text Integration] + [技术参数Constraints]

### 关键规则
- 使用英文描述场景和风格
- 产品摄影描述材质质感和灯光
- UI设计指定配色和设计系统

### 🚨【强制要求】中文文字配字规则（必须严格遵守）
**这是最重要的规则，绝对不能违反：**

1. **当用户需求中包含任何需要显示的中文文字时，MUST 在 prompt 中保留中文原文**
2. **中文文字必须用英文引号 "" 包裹，并在前面加上 with text / featuring text / displaying text 等描述**
3. **绝对禁止将中文文字翻译成英文或其他语言**
4. **即使用户没有明确要求，只要涉及文字内容，默认使用中文**

### 文字渲染标准格式
- ... with text "中文原文" displayed prominently ...
- ... featuring Chinese text "中文内容" in the center ...
- ... displaying bold text "中文字" at the top ...

### ✅ 正确示例（必须参考）

**示例1 - 海报文字**
用户需求：生成一张海报，上面写着"新年快乐"
✓ 正确：A vibrant festive poster with bold red and gold colors, featuring Chinese calligraphy text "新年快乐" displayed prominently in the center
✗ 错误：A vibrant festive poster with Happy New Year text （❌ 翻译成了英文）
✗ 错误：A vibrant festive poster with Chinese New Year greetings （❌ 没有保留原文）

**示例2 - 产品包装**
用户需求：奶茶杯子上写着"冰糖雪梨"
✓ 正确：A modern milk tea cup with minimalist design, featuring elegant text "冰糖雪梨" on the label in cursive font
✗ 错误：A modern milk tea cup with rock sugar pear text （❌ 翻译了）

**示例3 - 店铺招牌**
用户需求：咖啡店门口，招牌写着"云朵咖啡"
✓ 正确：Modern cafe storefront with large wooden signboard displaying text "云朵咖啡" in artistic calligraphy, warm lighting
✗ 错误：Modern cafe storefront with Cloud Coffee signboard （❌ 翻译了）

**示例4 - 广告标语**
用户需求：手机广告，标语是"科技改变生活"
✓ 正确：Sleek smartphone advertisement with futuristic background, bold white text "科技改变生活" at the bottom
✗ 错误：Sleek smartphone advertisement with technology changes life slogan （❌ 翻译了）

### 🔍 生成前必须检查
在输出最终 prompts 之前，必须执行以下检查：
1. ✅ 用户需求中是否提到需要显示文字？
2. ✅ 如果有文字需求，是否保留了中文原文？
3. ✅ 中文文字是否用 "" 引号包裹？
4. ✅ 是否有任何中文被错误地翻译成英文？

**如果以上任何一项检查未通过，必须修正 prompt！**

## 最终输出格式（必须严格遵守）

### 🚨【强制要求】输出格式规则
1. **当你完成所有思考和搜索后，必须直接输出 JSON 格式**
2. **不要输出任何中文解释、说明或过渡性语言**
3. **不要说"基于搜索结果..."、"我将为您生成..."等解释性文字**
4. **直接输出纯 JSON，以 \`\`\`json 开头，以 \`\`\` 结尾**
5. **JSON 必须完整且格式正确，可以被直接解析**

### 正确的最终输出（仅此格式）：

\`\`\`json
{
  "prompts": [
    {
      "scene": "场景1简短描述",
      "prompt": "A photorealistic close-up shot of steaming milk tea..."
    },
    {
      "scene": "场景2简短描述",
      "prompt": "Wide angle view of modern cafe interior..."
    }
  ]
}
\`\`\`

### ❌ 错误示例（不要这样做）
❌ "基于搜索结果了解手账风格特点后，我将为您生成..."
❌ "好的，我现在生成 prompts: ..."
✅ 直接输出 JSON，不要有任何解释性文字`;

// Claude 工具定义
const claudeTools: Anthropic.Tool[] = [
  {
    name: "tavily_search",
    description: "A search engine for finding up-to-date information. Use this when you need current information about trends, products, events, or any time-sensitive content.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query string",
        },
      },
      required: ["query"],
    },
  },
];

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // 创建流式响应
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // 发送事件的辅助函数
  const sendEvent = async (event: AgentStreamEvent) => {
    await writer.write(
      encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
    );
  };

  // 异步处理
  (async () => {
    try {
      const body = await request.json();
      const { userRequest, promptCount, referenceImages } = body as {
        userRequest: string;
        promptCount?: number;
        referenceImages?: ReferenceImages;
      };

      if (!userRequest) {
        await sendEvent({ type: "error", error: "用户需求不能为空" });
        await writer.close();
        return;
      }

      // 检查必需的 API Keys
      if (!process.env.ANTHROPIC_API_KEY) {
        await sendEvent({ type: "error", error: "Anthropic API Key 未配置" });
        await writer.close();
        return;
      }

      if (!process.env.TAVILY_API_KEY) {
        await sendEvent({ type: "error", error: "Tavily API Key 未配置" });
        await writer.close();
        return;
      }

      await sendEvent({
        type: "status",
        status: "searching",
        step: "🧠 Agent 开始分析需求...",
        progress: 10,
      });

      // 如果有参考图且需要 Claude 分析
      let imageAnalysis = "";
      if (referenceImages?.useForClaude && referenceImages.urls.length > 0) {
        await sendEvent({
          type: "status",
          status: "searching",
          step: "👁️ Claude 正在分析参考图片...",
          progress: 15,
        });

        // 开始流式分析
        await sendEvent({ type: "claude_analysis_start" });

        try {
          imageAnalysis = await analyzeImagesWithClaudeStream(
            referenceImages.urls,
            userRequest,
            async (chunk) => {
              // 每收到一个 chunk 就发送给前端
              await sendEvent({ type: "claude_analysis_chunk", chunk });
            }
          );
          console.log("Claude image analysis completed");

          // 分析完成
          await sendEvent({ type: "claude_analysis_end" });

          await sendEvent({
            type: "status",
            status: "planning",
            step: "✅ 图片分析完成，继续规划...",
            progress: 25,
          });
        } catch (err) {
          console.error("Claude analysis error:", err);
          await sendEvent({ type: "claude_analysis_end" });
          await sendEvent({
            type: "status",
            status: "planning",
            step: "⚠️ 图片分析失败，继续使用文字描述...",
            progress: 25,
          });
        }
      }

      // 初始化 Claude 客户端
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
      });

      let userInput = userRequest;
      
      // 如果有图片分析结果，添加到用户输入中
      if (imageAnalysis) {
        userInput = `用户需求：${userRequest}

【参考图片分析】（由 Claude 视觉模型分析）
${imageAnalysis}

请结合用户需求和参考图片的风格特点来生成图像 prompts。`;
      }
      
      if (promptCount && promptCount > 0) {
        userInput += `\n\n请生成 ${promptCount} 个连贯的场景 prompt。`;
      }

      await sendEvent({
        type: "status",
        status: "planning",
        step: "🔍 Agent 正在思考和规划...",
        progress: 30,
      });

      // ReAct 循环 - 使用 Claude
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userInput },
      ];

      let iteration = 0;
      const maxIterations = 5;
      let finalOutput = "";

      while (iteration < maxIterations) {
        iteration++;

        const result = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          system: AGENT_SYSTEM_PROMPT,
          tools: claudeTools,
          messages,
        });

        console.log(`Iteration ${iteration}:`, result.stop_reason);

        // 检查是否有工具调用
        if (result.stop_reason === "tool_use") {
          const toolUseBlock = result.content.find(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
          );

          if (toolUseBlock && toolUseBlock.name === "tavily_search") {
            const toolArgs = toolUseBlock.input as { query: string };
            console.log(`Tool call: tavily_search`, toolArgs);

            await sendEvent({
              type: "status",
              status: "searching",
              step: `🔎 正在搜索：${toolArgs.query.slice(0, 50)}...`,
              progress: 40 + iteration * 10,
            });

            // 执行搜索
            const searchResult = await tavilySearch(toolArgs.query, process.env.TAVILY_API_KEY!);

            await sendEvent({
              type: "status",
              status: "planning",
              step: "📊 已获取搜索结果，继续规划...",
              progress: 50 + iteration * 10,
            });

            // 将助手响应和工具结果添加到消息历史
            messages.push({
              role: "assistant",
              content: result.content,
            });
            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUseBlock.id,
                  content: `搜索结果：\n${searchResult}\n\n请根据搜索结果，直接输出 JSON 格式的图像 prompts，不要有任何解释性文字，直接以 \`\`\`json 开头输出。`,
                } as Anthropic.ToolResultBlockParam,
              ],
            });
          }
        } else {
          // 没有工具调用，说明Agent完成了思考
          const textBlock = result.content.find(
            (block): block is Anthropic.TextBlock => block.type === "text"
          );
          finalOutput = textBlock?.text || "";
          break;
        }
      }

      console.log("Final output:", finalOutput);

      await sendEvent({
        type: "status",
        status: "generating",
        step: "✍️ 生成专业图像 prompts...",
        progress: 70,
      });

      // 解析 Agent 输出
      let prompts: AgentPrompt[] = [];
      let jsonString = "";

      // 方法1: 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = finalOutput.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
        console.log("Found JSON in markdown block");
      }
      // 方法2: 尝试从 ``` 代码块中提取（不管有没有 json 标记）
      else {
        const codeBlockMatch = finalOutput.match(/```\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1].trim();
          console.log("Found content in code block");
        }
      }

      // 方法3: 如果没有代码块，尝试找到 { 开头的 JSON
      if (!jsonString) {
        const jsonObjectMatch = finalOutput.match(/\{[\s\S]*"prompts"[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonString = jsonObjectMatch[0].trim();
          console.log("Found JSON object in plain text");
        }
      }

      // 方法4: 尝试找到任何 JSON 对象
      if (!jsonString) {
        const anyJsonMatch = finalOutput.match(/\{[\s\S]*\}/);
        if (anyJsonMatch) {
          jsonString = anyJsonMatch[0].trim();
          console.log("Found any JSON object");
        }
      }

      // 尝试解析提取的 JSON 字符串
      const tryParseJson = (str: string): any => {
        try {
          return JSON.parse(str);
        } catch {
          // 尝试修复常见的 JSON 格式错误
          try {
            // 移除可能的注释
            const cleaned = str
              .replace(/\/\/.*$/gm, '')  // 移除单行注释
              .replace(/\/\*[\s\S]*?\*\//g, '')  // 移除多行注释
              .replace(/,\s*}/g, '}')  // 移除尾随逗号
              .replace(/,\s*]/g, ']')  // 移除数组尾随逗号
              .trim();
            return JSON.parse(cleaned);
          } catch {
            return null;
          }
        }
      };

      if (jsonString) {
        const parsed = tryParseJson(jsonString);
        if (parsed) {
          if (parsed.prompts && Array.isArray(parsed.prompts)) {
            prompts = parsed.prompts.map((p: any) => ({
              id: uuidv4(),
              scene: p.scene || "场景",
              prompt: p.prompt,
              status: "pending" as const,
            }));
            console.log(`Successfully parsed ${prompts.length} prompts`);
          } else if (Array.isArray(parsed)) {
            // 可能直接返回了数组
            prompts = parsed.map((p: any) => ({
              id: uuidv4(),
              scene: p.scene || "场景",
              prompt: p.prompt || p.description || String(p),
              status: "pending" as const,
            }));
            console.log(`Successfully parsed ${prompts.length} prompts from array`);
          } else {
            console.error("Parsed JSON but no valid prompts array found");
          }
        } else {
          console.error("Failed to parse JSON");
          console.error("JSON string was:", jsonString.substring(0, 500));
        }
      }

      // 方法5: 如果所有 JSON 解析都失败了，尝试从文本中提取 prompts
      if (prompts.length === 0) {
        console.log("Trying to extract prompts from plain text...");
        
        // 尝试找到类似 "prompt": "..." 的模式
        const promptMatches = finalOutput.matchAll(/"prompt"\s*:\s*"([^"]+)"/g);
        const sceneMatches = finalOutput.matchAll(/"scene"\s*:\s*"([^"]+)"/g);
        
        const promptTexts = [...promptMatches].map(m => m[1]);
        const sceneTexts = [...sceneMatches].map(m => m[1]);
        
        if (promptTexts.length > 0) {
          prompts = promptTexts.map((promptText, i) => ({
            id: uuidv4(),
            scene: sceneTexts[i] || `场景 ${i + 1}`,
            prompt: promptText,
            status: "pending" as const,
          }));
          console.log(`Extracted ${prompts.length} prompts from text patterns`);
        }
      }

      // 方法6: 如果还是失败，用原始请求生成一个默认 prompt
      if (prompts.length === 0 && imageAnalysis) {
        console.log("Fallback: Creating default prompt from image analysis");
        prompts = [{
          id: uuidv4(),
          scene: "基于参考图的创作",
          prompt: `Based on the reference image style: ${userRequest}. Style reference: ${imageAnalysis.substring(0, 200)}`,
          status: "pending" as const,
        }];
      }

      // 如果所有方法都失败了，返回错误
      if (prompts.length === 0) {
        console.error("Failed to extract prompts from agent output");
        console.error("Full output:", finalOutput);
        await sendEvent({
          type: "error",
          error: "Agent 输出格式错误，无法解析 prompts。请重试。",
        });
        await writer.close();
        return;
      }

      await sendEvent({
        type: "progress",
        progress: 80,
      });

      await sendEvent({
        type: "prompts",
        prompts,
      });

      await sendEvent({
        type: "status",
        status: "creating",
        step: "🎨 准备生成图片...",
        progress: 90,
      });

      await sendEvent({
        type: "complete",
        status: "completed",
        progress: 100,
      });
    } catch (error) {
      console.error("Agent error:", error);
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
