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
          // 允许的工具（包含 WebSearch 用于搜索丰富内容）
          allowedTools: ["Skill", "Write", "Read", "Bash", "Edit", "Glob", "Grep", "WebSearch", "WebFetch"],
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
 * 集成图片生成能力和设计指南
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

  // 从环境变量获取 API 基础 URL
  const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://canvas.luzhipeng.com";

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
1. 封面页 - 震撼的视觉封面，标题和副标题
2-6. 内容页 - 每页包含标题、3-5个要点，配合精美配图
7. 结束页 - 感谢语 + 联系方式`;

  if (description) {
    contentSpec += `\n\n补充说明：${description}`;
  }

  if (materials.length > 0) {
    const imageUrls = materials.filter((m) => m.type === "image" && m.url).map((m) => m.url);
    if (imageUrls.length > 0) {
      contentSpec += `\n\n用户提供的图片素材：\n${imageUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")}`;
    }

    const textContents = materials.filter((m) => m.type === "text" && m.content).map((m) => m.content);
    if (textContents.length > 0) {
      contentSpec += `\n\n参考内容：\n${textContents.join("\n\n")}`;
    }
  }

  // 设计指南和图片生成能力
  const prompt = `请帮我创建一个**视觉震撼、内容丰富、设计精美**的 PowerPoint 演示文稿。

## 🚨 核心要求（必须遵守！）

**❌ 绝对禁止：**
- 普通的纯文字页面
- 只有标题和几个要点的空洞页面
- 缺乏视觉元素的单调设计

**✅ 必须做到：**
- **每一页都要有精美配图**（背景图、内容配图、图表、图标等）
- **内容要丰富详实**：先用 WebSearch 搜索主题相关信息，获取真实数据和案例
- **视觉要震撼**：使用渐变、阴影、圆角卡片、图形装饰等现代设计元素
- **布局要专业**：合理分配图文比例，大量留白，视觉层次分明

## 📋 制作流程（按顺序执行）

1. **🔍 内容研究**（必做！）
   - 使用 WebSearch 搜索主题相关的最新数据、行业趋势、案例
   - 收集 3-5 个关键统计数据或事实
   - 找到 2-3 个具体案例或引用

2. **📝 内容规划**
   - 基于搜索结果，规划每页的详细内容
   - 确定每页需要什么类型的配图

3. **🎨 生成配图**
   - 为封面生成震撼的背景图
   - 为内容页生成解释性配图或图表
   - 每个 PPT 至少生成 3-5 张配图

4. **💎 制作 PPT**
   - 使用 pptxgenjs 制作高质量 PPT
   - 确保每页都有视觉亮点

## 📌 环境说明（必读）
- pptxgenjs、sharp 已全局安装，**禁止运行 npm install**
- **运行脚本时必须设置 NODE_PATH**：
  \`NODE_PATH=/root/.nvm/versions/node/v22.19.0/lib/node_modules node create-ppt.js\`
- 使用纯 pptxgenjs API 构建 PPT（不要使用 html2pptx）

## 🎨 AI 图片生成能力
你可以调用 API 生成高质量配图，让 PPT 更加精美！

**⚠️ 重要：模型选择规则（必须遵守，控制成本）**

| 场景 | 模型 | imageSize 参数 | 说明 |
|------|------|----------------|------|
| **默认** | \`nano-banana\` | ❌ 不支持 | 封面背景、装饰图、氛围图、抽象图案（快速、低成本） |
| **特殊** | \`nano-banana-pro\` | \`4K\` | **仅用于**：数据可视化、图表、流程图、带文字的图片 |

**绝大多数配图都应使用 \`nano-banana\`，只有需要精确文字或复杂图表时才用 \`nano-banana-pro\`！**

**API 调用示例：**

1️⃣ **普通配图（默认，大多数情况）—— 不传 imageSize：**
\`\`\`bash
curl -X POST "${apiBaseUrl}/api/ppt/generate-image" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "描述图片内容", "model": "nano-banana", "aspectRatio": "16:9"}'
\`\`\`

2️⃣ **图表/带文字的图片（仅在需要时）—— 用 pro 模型 + 4K：**
\`\`\`bash
curl -X POST "${apiBaseUrl}/api/ppt/generate-image" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "描述图表或带文字内容", "model": "nano-banana-pro", "aspectRatio": "16:9", "imageSize": "4K"}'
\`\`\`

**图片使用场景（不只是背景！）：**

| 类型 | 模型 | 用途示例 |
|------|------|----------|
| 🖼️ 封面背景 | \`nano-banana\` | 大气的主题视觉图、渐变背景、抽象纹理 |
| 🎨 装饰配图 | \`nano-banana\` | 氛围图、插画风格配图、概念图 |
| 📊 信息图表 | \`nano-banana-pro\` + 4K | 带文字的数据可视化、统计图表 |
| 🔄 流程图 | \`nano-banana-pro\` + 4K | 步骤说明、工作流程、架构图 |
| 📝 解释性图 | \`nano-banana-pro\` + 4K | 概念解释图、对比图、带标注的图 |
| 🎯 图标/符号 | \`nano-banana-pro\` + 4K | 自定义图标、Logo 风格图形 |

**图片在 PPT 中的位置：**
- **全屏背景**：封面、章节过渡页
- **内容配图**：放在文字旁边，辅助解释内容（占幻灯片 1/3 - 1/2）
- **小型插图**：嵌入文字段落中，增强视觉效果
- **图标组**：用于要点列表前的视觉标识

**Prompt 最佳实践：**
1. 用完整句子描述场景，不要堆砌关键词
2. 描述光线、材质、氛围：如 "soft golden hour lighting", "glass and chrome materials"
3. 使用摄影术语：shallow depth of field, wide-angle shot, overhead view
4. 风格提示：minimalist, corporate, futuristic, elegant, professional
5. **信息图表 Prompt 示例**：
   - "A professional infographic showing 4 steps of customer journey, with icons and connecting arrows, clean white background, corporate blue color scheme"
   - "Circular diagram showing 5 key pillars of digital transformation, with text labels, modern flat design style"

## 🔍 网络搜索能力
你可以使用 **WebSearch 工具**搜索网络，获取最新数据和信息来丰富 PPT 内容！

**搜索场景：**
- 获取行业最新数据和统计
- 查找权威来源和引用
- 了解主题的最新趋势
- 补充具体案例和实例

**使用建议：**
1. 在规划 PPT 内容前，先搜索主题相关的最新信息
2. 为数据页面搜索真实统计数据
3. 引用数据时标注来源，增加可信度
4. 搜索竞品或行业案例作为参考

## 🎯 设计原则

**配色方案（基于主色 ${primaryColor}）：**
- 主色：${primaryColor}（用于标题、重点元素）
- 辅助色：计算互补色或邻近色
- 背景色：浅色系 #F8FAFC 或深色系 #1E293B
- 强调色：用于按钮、高亮

**排版规范：**
- 标题：32-44pt，加粗，主色调
- 正文：18-24pt，深灰色 #334155
- 副标题：20-28pt，浅一级的颜色
- 行间距：1.4-1.6 倍
- 边距：至少 0.5 英寸

**布局建议：**
- 黄金比例：主内容区占 2/3，配图占 1/3
- 留白：大量留白让设计呼吸
- 对齐：所有元素严格对齐
- 层次：通过大小、颜色、位置建立视觉层次

**视觉元素：**
- 使用圆角（8-16px）让设计更现代
- 添加微妙阴影增加层次感
- 图标使用线性或填充风格保持一致
- 渐变背景（subtile）比纯色更高级

## 📐 专业演示设计原则

**🔺 金字塔原则 (Pyramid Principle)：**
每个 PPT 都应遵循：**结论 → 原因 → 证据**
1. 第一页：直接给出核心结论/观点
2. 中间页：支撑结论的 3-5 个理由
3. 每个理由：配以数据、案例、图表作为证据

**📊 Assertion-Evidence 框架：**
每页幻灯片 = **一个断言标题** + **视觉证据**
- 标题必须是完整的句子（不是关键词）
- 例如：❌ "销售数据" → ✅ "Q3 销售额同比增长 47%"
- 视觉区域用图表、图片、图标来证明标题的断言

## 💎 PptxGenJS 高级技巧

**1. 多个 Slide Master（不同页面类型）：**
\`\`\`javascript
// 封面 Master
pptx.defineSlideMaster({
  title: 'TITLE_SLIDE',
  background: { path: 'cover-bg.png' }, // AI 生成的封面背景
  objects: [
    { rect: { x: 0, y: 5, w: '100%', h: 2.5, fill: { color: '000000', transparency: 50 } } }
  ]
});

// 内容页 Master（带 Logo 和页脚）
pptx.defineSlideMaster({
  title: 'CONTENT_SLIDE',
  margin: [0.5, 0.25, 1.0, 0.25],
  background: { color: 'FFFFFF' },
  objects: [
    { image: { x: 11.5, y: 0.2, w: 1.2, h: 0.5, path: 'logo.png' } },
    { rect: { x: 0, y: 6.9, w: '100%', h: 0.6, fill: { color: '${primaryColor.replace('#', '')}' } } },
    { text: { text: '${topic}', options: { x: 0.5, y: 6.95, w: 8, h: 0.5, fontSize: 10, color: 'FFFFFF' } } }
  ],
  slideNumber: { x: 12, y: 6.95, fontFace: 'Arial', fontSize: 10, color: 'FFFFFF' }
});

// 数据页 Master
pptx.defineSlideMaster({
  title: 'DATA_SLIDE',
  background: { color: 'F8FAFC' },
  objects: [
    { rect: { x: 0, y: 0, w: '100%', h: 1.2, fill: { color: '${primaryColor.replace('#', '')}' } } }
  ]
});
\`\`\`

**2. Placeholder 占位符系统（灵活布局）：**
\`\`\`javascript
pptx.defineSlideMaster({
  title: 'TWO_COLUMN',
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.5, w: 12, h: 1 } } },
    { placeholder: { options: { name: 'left', type: 'body', x: 0.5, y: 1.8, w: 5.5, h: 4.5 } } },
    { placeholder: { options: { name: 'right', type: 'body', x: 6.5, y: 1.8, w: 5.5, h: 4.5 } } }
  ]
});
let slide = pptx.addSlide({ masterName: 'TWO_COLUMN' });
slide.addText('标题内容', { placeholder: 'title' });
slide.addText('左侧内容', { placeholder: 'left' });
slide.addImage({ path: 'image.png', placeholder: 'right' });
\`\`\`

**3. 设置主题和元数据：**
\`\`\`javascript
pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei' };
pptx.layout = 'LAYOUT_16x9';
pptx.author = '演示作者';
pptx.title = '${topic}';
pptx.subject = '由 AI 生成的专业演示文稿';
pptx.company = 'NanoBanana AI';
\`\`\`

**4. 多样式富文本（混合样式）：**
\`\`\`javascript
slide.addText([
  { text: '47%', options: { fontSize: 72, bold: true, color: '${primaryColor.replace('#', '')}' } },
  { text: '\\n同比增长', options: { fontSize: 24, color: '64748B', breakLine: true } },
  { text: '\\nQ3 销售额创历史新高', options: { fontSize: 16, color: '94A3B8' } }
], { x: 1, y: 2, w: 4, h: 3, valign: 'middle' });
\`\`\`

**5. 卡片式布局（现代设计）：**
\`\`\`javascript
// 创建卡片背景
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 1.5, w: 3.5, h: 4,
  fill: { color: 'FFFFFF' },
  shadow: { type: 'outer', blur: 15, offset: 5, angle: 45, opacity: 0.15, color: '000000' },
  line: { color: 'E2E8F0', width: 1 }
});
// 卡片内容
slide.addImage({ path: 'icon.png', x: 1.5, y: 2, w: 1.5, h: 1.5 });
slide.addText('功能特点', { x: 0.7, y: 3.8, w: 3, h: 0.5, fontSize: 18, bold: true, color: '1E293B' });
slide.addText('详细描述内容...', { x: 0.7, y: 4.4, w: 3, h: 1, fontSize: 12, color: '64748B' });
\`\`\`

**6. 专业表格样式：**
\`\`\`javascript
slide.addTable([
  [{ text: '指标', options: { fill: { color: '${primaryColor.replace('#', '')}' }, color: 'FFFFFF', bold: true } },
   { text: 'Q2', options: { fill: { color: '${primaryColor.replace('#', '')}' }, color: 'FFFFFF', bold: true } },
   { text: 'Q3', options: { fill: { color: '${primaryColor.replace('#', '')}' }, color: 'FFFFFF', bold: true } }],
  ['收入', '$2.4M', '$3.1M'],
  ['增长率', '12%', '29%'],
  ['用户数', '45K', '67K']
], {
  x: 1, y: 2, w: 10, h: 3,
  fontSize: 14,
  border: { type: 'solid', color: 'E2E8F0', pt: 1 },
  align: 'center',
  valign: 'middle'
});
\`\`\`

**7. 图表（多种类型）：**
\`\`\`javascript
// 柱状图
slide.addChart(pptx.charts.BAR, chartData, {
  x: 1, y: 1.5, w: 6, h: 4,
  showValue: true,
  showTitle: true,
  title: '季度销售对比',
  chartColors: ['${primaryColor.replace('#', '')}', '64748B', '94A3B8']
});

// 饼图
slide.addChart(pptx.charts.PIE, pieData, {
  x: 7, y: 1.5, w: 5, h: 4,
  showPercent: true,
  showLegend: true
});

// 折线图
slide.addChart(pptx.charts.LINE, lineData, {
  x: 1, y: 1, w: 11, h: 5,
  showMarker: true,
  lineSmooth: true
});
\`\`\`

**8. 图片高级用法：**
\`\`\`javascript
// 圆角图片
slide.addImage({ path: imageUrl, x: 5, y: 1, w: 4, h: 3, rounding: true });

// 带阴影的图片
slide.addImage({
  path: imageUrl, x: 1, y: 1, w: 6, h: 4,
  shadow: { type: 'outer', blur: 10, offset: 3, angle: 45, opacity: 0.3 }
});

// 全屏背景图
slide.background = { path: imageUrl };
\`\`\`

## 📋 PPT 需求规范
${contentSpec}

## 🔧 执行步骤（严格按顺序！）

### 第一步：内容研究（必做！）
\`\`\`
使用 WebSearch 搜索：
- "${topic} 最新数据 统计"
- "${topic} 行业趋势 2024"
- "${topic} 案例 实例"
\`\`\`
记录搜索到的关键数据、统计、案例，后续用于丰富内容。

### 第二步：创建工作目录
\`mkdir -p ${pptDir}\`

### 第三步：生成配图（至少 3-5 张！）
为以下页面生成配图：
- 🖼️ 封面：震撼的主题背景图（nano-banana）
- 📊 数据页：信息图表或统计图（如需文字用 nano-banana-pro + 4K）
- 🎨 内容页：解释性配图、流程图（根据需要选择模型）
- 🏁 结尾：总结性视觉图

### 第四步：编写 PPT 脚本
使用 Skill 工具调用 pptx 技能，编写 create-ppt.js：
- 应用搜索到的真实数据
- 嵌入生成的配图 URL
- 使用高级设计技巧（Slide Master、渐变、阴影等）

### 第五步：生成 PPT
\`cd ${pptDir} && NODE_PATH=/root/.nvm/versions/node/v22.19.0/lib/node_modules node create-ppt.js\`

### 第六步：验证
确认 ${outputPath} 已生成，检查文件大小是否合理。

---
**立即开始执行！记住：先搜索、再规划、再生成配图、最后制作 PPT。创建一份让人眼前一亮的专业演示文稿！**`;

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
