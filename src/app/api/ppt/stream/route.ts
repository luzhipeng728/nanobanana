import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFile, access, constants } from "fs/promises";
import { uploadBufferToR2 } from "@/lib/r2";

const prisma = new PrismaClient();

// PPT 素材类型
interface PPTMaterial {
  type: "image" | "text";
  url?: string;
  content?: string;
}

// 幻灯片数据类型
interface SlideData {
  id: string;
  layout: string;
  title: string;
  subtitle?: string;
  content?: string[];
  imageUrl?: string;
}

/**
 * SSE 流式 PPT 生成 API
 * 使用 Claude Agent SDK 调用 Claude Code CLI + pptx skill
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    topic,
    template = "business",
    primaryColor = "#3B82F6",
    description,
    materials = [],
    sessionId: existingSessionId,  // 支持继续对话
  } = body;

  if (!topic) {
    return new Response(JSON.stringify({ error: "Topic is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 标志：控制器是否已关闭
      let isClosed = false;

      // 发送 SSE 消息的辅助函数（带关闭检查）
      const sendEvent = (type: string, data: any) => {
        if (isClosed) return; // 如果已关闭，忽略发送
        try {
          const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
          controller.enqueue(encoder.encode(event));
        } catch (e) {
          // 忽略已关闭的控制器错误
          console.warn("[PPT Stream] sendEvent skipped (controller closed)");
        }
      };

      // 安全关闭控制器
      const safeClose = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // 忽略
          }
        }
      };

      try {
        // 创建任务记录
        const task = await prisma.pPTTask.create({
          data: {
            status: "processing",
            topic,
            description,
            template,
            primaryColor,
            materials: materials.length > 0 ? JSON.stringify(materials) : null,
          },
        });

        sendEvent("task_created", { taskId: task.id });
        sendEvent("status", { message: "🚀 启动 Claude Agent..." });

        // 构建 prompt
        const isFollowUp = !!existingSessionId;
        const userPrompt = isFollowUp
          ? `用户追加需求：${topic}\n\n请根据之前的 PPT 进行修改。`
          : buildPPTPrompt(topic, description, template, primaryColor, materials, task.id);

        console.log(`[PPT Task ${task.id}] ${isFollowUp ? "Continuing" : "Starting"} with Claude Agent SDK...`);

        // 使用 Claude Agent SDK 调用 Claude Code CLI
        const slides: SlideData[] = [];
        let pptFilePath: string | undefined;
        let sessionId: string | undefined;

        // 获取用户 home 目录
        const homeDir = process.env.HOME || "/Users/luzhipeng";
        const pluginPath = `${homeDir}/.claude/plugins/marketplaces/anthropic-agent-skills`;

        // 构建查询选项
        const queryOptions: any = {
          // 加载项目和用户设置（包括 skills）
          settingSources: ["project", "user"],
          // 显式加载 document-skills 插件
          plugins: [
            { type: "local", path: pluginPath },
          ],
          // 允许的工具
          allowedTools: ["Skill", "Write", "Read", "Bash", "Edit", "Glob", "Grep"],
          // 权限模式：自动接受编辑
          permissionMode: "acceptEdits",
          // 最大轮数
          maxTurns: 30,
          // 包含流式消息
          includePartialMessages: true,
          // 工作目录
          cwd: process.cwd(),
        };

        // 如果有现有会话，使用 resume 继续
        if (existingSessionId) {
          queryOptions.resume = existingSessionId;
        }

        for await (const message of query({
          prompt: userPrompt,
          options: queryOptions,
        })) {
          // 处理系统消息
          if (message.type === "system") {
            const sysMsg = message as any;
            if (sysMsg.subtype === "init") {
              sessionId = sysMsg.session_id;
              console.log(`[PPT Task ${task.id}] Init - Skills: ${sysMsg.skills?.join(", ") || "none"}`);

              sendEvent("system_init", {
                role: "system",
                content: "🚀 Agent 会话已初始化",
                sessionId,
                skills: sysMsg.skills || [],
                tools: sysMsg.tools || [],
                model: sysMsg.model,
              });
            }
          }

          // 处理流式事件 - 实时文本 chunk
          if (message.type === "stream_event") {
            const streamMsg = message as any;
            const event = streamMsg.event;

            // content_block_start - 开始新的内容块
            if (event?.type === "content_block_start") {
              const block = event.content_block;
              if (block?.type === "text") {
                sendEvent("stream_start", {
                  role: "assistant",
                  blockType: "text",
                  index: event.index,
                });
              } else if (block?.type === "tool_use") {
                sendEvent("stream_start", {
                  role: "assistant",
                  blockType: "tool_use",
                  toolName: block.name,
                  toolId: block.id,
                  index: event.index,
                });
              }
            }

            // content_block_delta - 文本增量
            if (event?.type === "content_block_delta") {
              const delta = event.delta;
              if (delta?.type === "text_delta" && delta.text) {
                sendEvent("stream_delta", {
                  role: "assistant",
                  content: delta.text,
                  index: event.index,
                });
              } else if (delta?.type === "input_json_delta" && delta.partial_json) {
                sendEvent("stream_delta", {
                  role: "assistant",
                  content: delta.partial_json,
                  index: event.index,
                  isToolInput: true,
                });
              }
            }

            // content_block_stop - 内容块结束
            if (event?.type === "content_block_stop") {
              sendEvent("stream_stop", {
                role: "assistant",
                index: event.index,
              });
            }

            // message_start - 消息开始
            if (event?.type === "message_start") {
              sendEvent("message_start", {
                role: "assistant",
                model: event.message?.model,
              });
            }

            // message_stop - 消息结束
            if (event?.type === "message_stop") {
              sendEvent("message_stop", {
                role: "assistant",
              });
            }
          }

          // 处理完整的助手消息
          if (message.type === "assistant") {
            const assistantMsg = message as any;

            if (assistantMsg.message?.content) {
              for (const block of assistantMsg.message.content) {
                // 完整文本内容
                if (block.type === "text" && block.text) {
                  sendEvent("assistant_message", {
                    role: "assistant",
                    content: block.text,
                    blockType: "text",
                  });

                  // 解析幻灯片信息
                  const parsedSlides = parseSlideText(block.text);
                  if (parsedSlides.length > 0) {
                    slides.push(...parsedSlides);
                  }

                  // 检测文件路径
                  const fileMatch = block.text.match(/(?:saved|created|generated|写入|保存|生成).+?([\/\w\-\.]+\.pptx)/i);
                  if (fileMatch) {
                    pptFilePath = fileMatch[1];
                  }
                }

                // 工具调用
                if (block.type === "tool_use") {
                  sendEvent("tool_call", {
                    role: "assistant",
                    toolName: block.name,
                    toolId: block.id,
                    input: block.input,
                  });
                }
              }
            }
          }

          // 处理用户消息（工具结果）
          if (message.type === "user") {
            const userMsg = message as any;
            if (userMsg.message?.content) {
              for (const block of userMsg.message.content) {
                if (block.type === "tool_result") {
                  // 截取工具结果内容（可能很长）
                  let resultContent = "";
                  if (typeof block.content === "string") {
                    resultContent = block.content.length > 500
                      ? block.content.substring(0, 500) + "..."
                      : block.content;
                  } else if (Array.isArray(block.content)) {
                    resultContent = JSON.stringify(block.content).substring(0, 500);
                  }

                  sendEvent("tool_result", {
                    role: "tool",
                    toolId: block.tool_use_id,
                    content: resultContent,
                    isError: block.is_error,
                  });
                }
              }
            }
          }

          // 处理最终结果
          if (message.type === "result") {
            const resultMsg = message as any;

            // 从结果中提取文件路径
            if (resultMsg.result && typeof resultMsg.result === "string") {
              const fileMatch = resultMsg.result.match(/([\/\w\-\.]+\.pptx)/i);
              if (fileMatch) {
                pptFilePath = fileMatch[1];
              }
            }

            sendEvent("result", {
              role: "system",
              content: resultMsg.result || "执行完成",
              duration: resultMsg.duration_ms,
              cost: resultMsg.total_cost_usd,
              turns: resultMsg.num_turns,
              isError: resultMsg.is_error,
            });
          }
        }

        console.log(`[PPT Task ${task.id}] Agent completed. File: ${pptFilePath}, Slides: ${slides.length}`);

        // 如果没有解析到幻灯片，创建默认预览
        if (slides.length === 0) {
          slides.push({
            id: "slide-1",
            layout: "title",
            title: topic,
            subtitle: "由 AI 生成",
            content: ["PPT 文件已生成"],
          });
        }

        // 尝试找到并上传 PPTX 文件到 R2
        let r2Url: string | undefined;
        let previewUrl: string | undefined;
        const projectDir = process.cwd();
        const expectedPath = `${projectDir}/public/ppt/${task.id}/presentation.pptx`;

        // 如果没有解析到路径，使用预期路径
        const localPath = pptFilePath || expectedPath;

        try {
          await access(localPath, constants.R_OK);
          sendEvent("status", { message: "📤 上传 PPT 到云存储..." });

          const fileBuffer = await readFile(localPath);
          r2Url = await uploadBufferToR2(
            fileBuffer,
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "ppt"
          );

          // 生成 Office Online 预览链接
          if (r2Url) {
            previewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(r2Url)}`;
            console.log(`[PPT Task ${task.id}] Uploaded to R2: ${r2Url}`);
          }
        } catch (e) {
          console.warn(`[PPT Task ${task.id}] Failed to upload to R2:`, e);
        }

        // 更新数据库
        await prisma.pPTTask.update({
          where: { id: task.id },
          data: {
            status: "completed",
            pptUrl: r2Url || pptFilePath || expectedPath,
            slides: JSON.stringify(slides),
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // 发送完成消息
        sendEvent("completed", {
          taskId: task.id,
          slides,
          pptUrl: r2Url || pptFilePath,
          previewUrl,
          downloadUrl: r2Url,
          message: `🎉 PPT 生成完成！共 ${slides.length} 张幻灯片`,
        });

      } catch (error) {
        console.error("[PPT Stream] Error:", error);
        sendEvent("error", {
          message: error instanceof Error ? error.message : "生成失败",
        });
      } finally {
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * 构建 PPT 生成 prompt
 * 明确指示使用 Skill 工具调用 pptx 技能
 */
function buildPPTPrompt(
  topic: string,
  description: string | null,
  template: string,
  primaryColor: string,
  materials: PPTMaterial[],
  taskId: string
): string {
  const templateNames: Record<string, string> = {
    business: "商务专业风格",
    tech: "科技现代风格",
    minimal: "简约清新风格",
    creative: "创意活泼风格",
  };

  // 输出到项目目录下的 public/ppt/{taskId}/ 文件夹
  const projectDir = process.cwd();
  const pptDir = `${projectDir}/public/ppt/${taskId}`;
  const outputPath = `${pptDir}/presentation.pptx`;

  // 构建详细的 PPT 内容规范
  let contentSpec = `主题：${topic}
风格：${templateNames[template] || template}
主色调：${primaryColor}
页数：5-8 页

幻灯片结构：
1. 封面页 - 标题和副标题
2-6. 内容页 - 每页包含标题和3-5个要点
7. 结束页 - 感谢语`;

  if (description) {
    contentSpec += `\n\n补充说明：${description}`;
  }

  if (materials.length > 0) {
    const imageUrls = materials.filter((m) => m.type === "image" && m.url).map((m) => m.url);
    if (imageUrls.length > 0) {
      contentSpec += `\n\n图片素材：\n${imageUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")}`;
    }

    const textContents = materials.filter((m) => m.type === "text" && m.content).map((m) => m.content);
    if (textContents.length > 0) {
      contentSpec += `\n\n参考内容：\n${textContents.join("\n\n")}`;
    }
  }

  // 明确指示使用 Skill 工具调用 pptx 技能
  const prompt = `请帮我创建一个专业的 PowerPoint 演示文稿。

**⚠️ 关键环境说明（必读）：**
- pptxgenjs、sharp 已全局安装，**禁止运行 npm install**
- **运行脚本时必须设置 NODE_PATH**：
  \`NODE_PATH=/root/.nvm/versions/node/v22.19.0/lib/node_modules node create-ppt.js\`
- 使用纯 pptxgenjs API 构建 PPT（不要使用 html2pptx，它需要 playwright 浏览器环境）

**执行步骤：**
1. mkdir -p ${pptDir}
2. 使用 Skill 工具调用 pptx 技能
3. 编写 create-ppt.js（直接用 pptxgenjs API，不要 html2pptx）
4. **运行脚本**: \`cd ${pptDir} && NODE_PATH=/root/.nvm/versions/node/v22.19.0/lib/node_modules node create-ppt.js\`
5. 确认 presentation.pptx 已生成

**PPT 需求规范：**
${contentSpec}

**输出路径：** ${outputPath}

请开始执行。`;

  return prompt;
}

/**
 * 从文本中解析幻灯片信息
 */
function parseSlideText(text: string): SlideData[] {
  const slides: SlideData[] = [];
  const lines = text.split("\n");
  let currentSlide: Partial<SlideData> | null = null;
  let slideCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测幻灯片标题
    const slideMatch = trimmed.match(/^(##?\s*)?(?:幻灯片|Slide|页面?)\s*(\d+)[:\s：]?\s*(.+)?/i);
    if (slideMatch) {
      if (currentSlide && currentSlide.title) {
        slides.push({
          id: `slide-${slideCounter++}`,
          layout: slideCounter === 1 ? "title" : "content",
          ...currentSlide,
        } as SlideData);
      }

      currentSlide = {
        title: slideMatch[3]?.trim() || `第 ${slideMatch[2]} 页`,
        content: [],
      };
    } else if (currentSlide && (trimmed.startsWith("-") || trimmed.startsWith("•") || trimmed.startsWith("*"))) {
      if (!currentSlide.content) currentSlide.content = [];
      currentSlide.content.push(trimmed.replace(/^[-•*]\s*/, ""));
    }
  }

  // 添加最后一张幻灯片
  if (currentSlide && currentSlide.title) {
    slides.push({
      id: `slide-${slideCounter++}`,
      layout: slideCounter === 1 ? "title" : "content",
      ...currentSlide,
    } as SlideData);
  }

  return slides;
}
