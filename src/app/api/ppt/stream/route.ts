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

      // 心跳定时器（每 30 秒发送一次，防止 Cloudflare 100s 超时）
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let heartbeatCount = 0;

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

      // 启动心跳定时器
      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          if (!isClosed) {
            heartbeatCount++;
            sendEvent("heartbeat", {
              count: heartbeatCount,
              elapsed: heartbeatCount * 30,
              message: `⏳ 正在处理中... (已运行 ${heartbeatCount * 30}s)`
            });
          }
        }, 30000); // 每 30 秒发送一次心跳
      };

      // 停止心跳定时器
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      // 安全关闭控制器
      const safeClose = () => {
        stopHeartbeat(); // 先停止心跳
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

        // 启动心跳定时器（防止 Cloudflare 超时）
        startHeartbeat();

        // 构建 prompt
        const isFollowUp = !!existingSessionId;
        const projectDir = process.cwd();
        const pptDir = `${projectDir}/public/ppt/${task.id}`;
        const outputPath = `${pptDir}/presentation.pptx`;

        const userPrompt = isFollowUp
          ? `用户追加需求：${topic}

**重要：修改后的 PPT 必须保存到新路径！**

1. 先创建目录：\`mkdir -p "${pptDir}"\`
2. 修改后的 PPT 保存到：\`${outputPath}\`

请根据之前的 PPT 内容进行修改，并将最终结果保存到上述新路径。`
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
          // 使用 Claude Opus 4.5 模型（最强大的模型）
          model: "claude-opus-4-5-20251101",
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
          // 不限制轮数，让 Agent 完成任务（设置一个很大的数）
          maxTurns: 200,
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
        // projectDir, pptDir, outputPath 已在前面定义
        const expectedPath = outputPath;

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

**❌ 绝对禁止（AI 感太重的表现）：**
- 只有标题 + 3-5 个简单要点（这是最典型的 AI 垃圾输出！）
- 要点只有一句话，没有展开说明
- 空洞的描述："提升效率"、"降低成本"（没有具体数据）
- 大片空白，内容稀疏
- **内容超出幻灯片边界**

**✅ 必须做到（麦肯锡/BCG 咨询风格）：**
- **每页信息密度高**：一页 PPT 的内容量 = 普通人做的 2-3 页
- **数据具体化**：不说"提升效率"，要说"效率从 8h 降至 2h，提升 300%"
- **要点要展开**：每个要点 2-3 句话说明，不是一个词
- **多层次信息**：大标题 → 小标题 → 正文 → 补充说明 → 数据来源

**🔥 内容丰富度对比示例：**

❌ **AI 垃圾输出（太空洞）：**
\`\`\`
标题：我们的优势
• 技术领先
• 成本更低
• 服务更好
\`\`\`

✅ **专业咨询输出（内容丰富）：**
\`\`\`
[Takeaway] 三大核心优势构建竞争壁垒，客户留存率达 95%

┌─────────────────┬─────────────────┬─────────────────┐
│ 🔬 技术领先       │ 💰 成本优势       │ 🤝 服务保障       │
│                 │                 │                 │
│ 自研 AI 引擎      │ 综合成本降低 40%  │ 7×24 专属支持    │
│ 处理速度提升 10x  │                 │                 │
│ 准确率 99.5%     │ • 硬件成本 ↓30%  │ • 平均响应 < 5min │
│                 │ • 人力成本 ↓50%  │ • 问题解决率 98%  │
│ 已获 12 项专利    │ • 运维成本 ↓60%  │ • 满意度 4.9/5   │
│ 服务 500+ 企业    │                 │                 │
│                 │ ROI 6个月回本    │ NPS 值 72       │
└─────────────────┴─────────────────┴─────────────────┘

数据来源：2024年Q3客户调研报告，样本量 n=326
\`\`\`

**每个内容区块必须包含：**
| 层级 | 内容 | 示例 |
|-----|------|-----|
| 标题 | 简短有力的概括 | "技术领先" |
| 核心数据 | 一个震撼的数字 | "处理速度提升 10x" |
| 详细说明 | 2-3 个具体要点 | "准确率 99.5%"、"已获 12 项专利" |
| 佐证/来源 | 增加可信度 | "服务 500+ 企业" |

## 📊 麦肯锡风格页面设计（每页必须包含 3-5 个元素）

**页面结构（从上到下）：**
\`\`\`
┌─────────────────────────────────────────┐
│ [Takeaway] 一句话核心观点（粗体，16-18pt）  │ ← 必须有！
├─────────────────────────────────────────┤
│                                         │
│   [主体内容区]                            │
│   - 左侧：图表/数据可视化                  │
│   - 右侧：关键要点/解读                    │
│   或：2-3 列卡片式布局                     │
│   或：流程图/时间线                        │
│                                         │
├─────────────────────────────────────────┤
│ [Source] 数据来源/注释（8-9pt，灰色）      │ ← 专业感
└─────────────────────────────────────────┘
\`\`\`

**每页必须包含的元素（至少 3 个）：**
| 元素 | 说明 | 示例 |
|-----|------|-----|
| 📌 Takeaway | 页面顶部的核心观点 | "销售额同比增长 45%，超额完成目标" |
| 📊 数据/图表 | 柱状图、折线图、饼图等 | 季度对比图、市场份额图 |
| 🔢 关键数字 | 突出显示的大号数字 | "3.2亿" "↑127%" "+45%" |
| 📝 要点列表 | 3-5 个具体要点 | 带图标的项目符号列表 |
| 💬 引用/案例 | 客户证言、行业案例 | "—— 某 500 强 CEO" |
| 📷 配图 | 概念图、产品图、团队照 | 背景图或内容配图 |
| 📋 表格 | 对比表、数据表 | 竞品对比、功能矩阵 |
| 🔄 流程图 | 步骤、流程、架构 | 项目里程碑、技术架构 |
| 📍 来源注释 | 页面底部的数据来源 | "数据来源：艾瑞咨询 2024" |

**页面类型多样化（10 页 PPT 应包含 5+ 种类型）：**

**📄 类型1：封面页**
\`\`\`
[全屏背景图]
├── 主标题（大号，居中或左对齐）
├── 副标题/Slogan
├── 公司Logo（右下角）
└── 日期/作者信息
\`\`\`

**📄 类型2：目录页**
\`\`\`
标题：目录 / Agenda
├── 01 市场分析 ──────────── 03
├── 02 产品方案 ──────────── 08
├── 03 实施计划 ──────────── 15
└── 04 投资回报 ──────────── 20
（每项带页码，可点击跳转感）
\`\`\`

**📄 类型3：数据分析页（最重要！）**
\`\`\`
[Takeaway] 核心发现：市场规模年增长 25%
├─ 左侧60%：柱状图/折线图
│   └─ 图表标题 + 数据标签
├─ 右侧40%：3个数据卡片
│   ├─ ¥35亿 总收入 ↑58%
│   ├─ 28.5% 市场份额 ↑12%
│   └─ 1.2万 客户数 ↑34%
├─ 底部：3列关键洞察
└─ 来源：数据来源说明
\`\`\`

**📄 类型4：对比页**
\`\`\`
[Takeaway] 新方案效率提升 3 倍
├─ 左侧：❌ 传统方案（红色调）
│   ├─ 痛点1：手动处理 8h/天
│   ├─ 痛点2：错误率 15%
│   ├─ 痛点3：成本 ¥50万/年
│   └─ 痛点4：无法监控
├─ 中间：→ 箭头
├─ 右侧：✅ 智能方案（绿色调）
│   ├─ 优势1：自动处理 2h/天
│   ├─ 优势2：错误率 0.5%
│   ├─ 优势3：成本 ¥10万/年
│   └─ 优势4：实时监控
└─ 底部：效率↑300% 成本↓80%
\`\`\`

**📄 类型5：特性/功能页（3列卡片）**
\`\`\`
[Takeaway] 三大核心优势助力业务增长
├─ 卡片1        卡片2        卡片3
│  [图标]       [图标]       [图标]
│  智能分析     自动化       实时监控
│  描述文字     描述文字     描述文字
│  ·要点1      ·要点1      ·要点1
│  ·要点2      ·要点2      ·要点2
└─ 底部CTA：立即体验 →
\`\`\`

**📄 类型6：流程/时间线页**
\`\`\`
[Takeaway] 四步实现数字化转型
├─ Step1 ──→ Step2 ──→ Step3 ──→ Step4
│  需求分析    方案设计    开发实施    上线运营
│  2周        4周        8周        持续
│  [描述]     [描述]     [描述]     [描述]
└─ 底部：总周期 14 周 | 预算 ¥XX万
\`\`\`

**📄 类型7：案例/证言页**
\`\`\`
[背景图：客户logo或场景]
├─ 大号引号 "
├─ 引用内容（2-3句话）
├─ —— 客户姓名，职位，公司
├─ 关键成果卡片：
│   ROI +150% | 效率 ↑3x | 成本 ↓40%
└─ 客户logo
\`\`\`

**📄 类型8：总结页**
\`\`\`
[Takeaway] 关键要点回顾
├─ ✓ 要点1：市场机会巨大
├─ ✓ 要点2：方案成熟可靠
├─ ✓ 要点3：投资回报显著
├─ 下一步行动：
│   1. 签署合作协议
│   2. 启动项目调研
│   3. 制定实施计划
└─ 联系方式 / CTA按钮
\`\`\`

## 📐 布局边界（绝对不能超出！）

**🔥 16:9 幻灯片实际尺寸：10 × 5.625 英寸（这是 pptxgenjs 的标准尺寸！）**

| 区域 | 范围 | 说明 |
|-----|------|-----|
| 幻灯片 | 宽 10", 高 5.625" | LAYOUT_16x9 标准尺寸 |
| 安全区域 | x: 0.5~9.5, y: 0.4~5.2 | 所有内容必须在此范围内 |
| 边界检查 | **x + w ≤ 9.5**, **y + h ≤ 5.2** | 元素右边/下边不能超出 |

**多卡片布局计算公式（基于 10 英寸宽度）：**
\`\`\`
可用宽度 = 10 - 0.5 - 0.5 = 9 英寸
2列卡片宽度 = (9 - 0.3) / 2 = 4.35 英寸
3列卡片宽度 = (9 - 0.6) / 3 = 2.8 英寸
4列卡片宽度 = (9 - 0.9) / 4 = 2.025 英寸
\`\`\`

**⚠️ 内容溢出处理（pptxgenjs 自动缩放功能）：**

\`\`\`javascript
// 🔥 关键：使用 fit 属性自动缩放文字！
slide.addText('很长的文字内容...', {
  x: 0.5, y: 1, w: 6, h: 2,
  fit: 'shrink',      // ⚠️ 自动缩小字号以适应容器（最重要！）
  // fit: 'resize',   // 或：自动调整容器大小
  wrap: true,         // 自动换行
  valign: 'top'       // 顶部对齐
});

// 表格自动适应
slide.addTable(tableData, {
  x: 0.5, y: 1.5, w: 12.33,  // 不设置 h，让高度自适应
  autoPage: true,            // 内容太多时自动分页
  autoPageRepeatHeader: true // 分页时重复表头
});
\`\`\`

**处理策略：**
- 文字太长 → \`fit: 'shrink'\` 自动缩小字号
- 需要换行 → \`wrap: true\`
- 卡片太多 → 分成多页，每页最多 4-6 个卡片
- 表格太长 → \`autoPage: true\` 自动分页

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

4. **💎 制作 PPT（每页必须丰富！）**

   **🚨 每页最少元素数量（强制要求）：**
   | 页面类型 | 最少元素数 | 必须包含 |
   |---------|----------|---------|
   | 封面页 | 4+ | 背景图、主标题、副标题、装饰元素 |
   | 内容页 | 6+ | Takeaway、2+个内容区块、图表/配图、要点列表、数据来源 |
   | 数据页 | 7+ | Takeaway、图表、3+个数据卡片、底部要点、来源 |
   | 对比页 | 8+ | Takeaway、左右两个对比区块（各含标题+4要点）、总结 |

   **🚨 绝对禁止的简陋布局：**
   \`\`\`
   ❌ 只有标题 + 3-4 个要点（这是最 AI 的表现！）
   ❌ 大片空白 + 一个小图表
   ❌ 只有文字没有任何视觉元素
   ❌ 每页布局都一样（复制粘贴感）
   \`\`\`

   **✅ 正确的丰富布局：**
   \`\`\`
   ✅ Takeaway + 左侧图表 + 右侧数据卡片 + 底部要点 + 来源
   ✅ 标题 + 3列特性卡片（每卡片含图标+标题+描述）+ 底部CTA
   ✅ 左右对比布局 + 中间箭头 + 底部总结数据
   ✅ 时间线/流程图 + 每节点详细说明 + 关键里程碑高亮
   \`\`\`

   **代码规范：**
   - **所有文本必须使用 \`fit: 'shrink', wrap: true\`**
   - 每个 slide 至少调用 6+ 次 addText/addShape/addChart

5. **🔍 自检验证（必做！）**
   - PPT 生成后，用 Read 工具读取 .pptx 文件验证是否成功
   - 检查每页布局（基于 10×5.625 英寸）：
     - 所有元素 **x + w ≤ 9.5**（不超出右边界）
     - 所有元素 **y + h ≤ 5.2**（不超出下边界）
   - **如果发现布局问题，立即修复并重新生成**

⚠️ **布局自检清单（基于 10×5.625 英寸）：**
\`\`\`
□ 2列布局：每列宽度 ≤ 4.4 英寸
□ 3列布局：每列宽度 ≤ 2.9 英寸
□ 4列布局：每列宽度 ≤ 2.1 英寸
□ 所有文本框都有 fit: 'shrink'
□ 卡片内文字宽度 = 卡片宽度 - 内边距
□ 右侧元素：x + w ≤ 9.5（不是 13！）
□ 底部元素：y + h ≤ 5.2（不是 7！）
\`\`\`

## 📌 环境说明（必读）
- pptxgenjs、sharp 已全局安装，**禁止运行 npm install**
- **运行脚本时必须设置 NODE_PATH**：
  \`NODE_PATH=/root/.nvm/versions/node/v22.19.0/lib/node_modules node create-ppt.js\`
- 使用纯 pptxgenjs API 构建 PPT（不要使用 html2pptx）

## 🎨 AI 图片生成能力
你可以调用 API 生成高质量配图，让 PPT 更加精美！

**⚠️ 重要：模型选择规则（必须遵守，控制成本）**

| 场景 | 模型 | imageSize | 说明 |
|------|------|-----------|------|
| **默认** | \`nano-banana\` | ❌ 不传 | 封面背景、装饰图、氛围图、抽象纹理（快速、低成本） |
| **特殊** | \`nano-banana-pro\` | \`4K\` | 见下方详细列表 |

**🔥 必须使用 \`nano-banana-pro\` + \`4K\` 的场景：**
- 📝 **中文文字图片**：任何包含中文标签、标题、说明的图片
- 📊 **信息图表**：数据可视化、统计图表、KPI 仪表盘
- 🔄 **流程图**：步骤说明、工作流程、架构图、时间线
- 📈 **折线图/柱状图**：趋势图、对比图、数据分析图
- 🗂️ **组织架构图**：层级结构、团队结构、关系图
- 🎯 **对比图**：Before/After、优劣对比、方案对比
- 📋 **表格式图片**：带数据的表格、矩阵图、清单图
- 🏷️ **带标注的图**：产品功能标注、地图标注、技术架构标注
- 🎨 **自定义图标**：品牌图标、功能图标、Logo 风格图形

**绝大多数纯装饰图都应使用 \`nano-banana\`，只要涉及文字或复杂图表就用 \`nano-banana-pro\`！**

**API 调用示例：**

1️⃣ **普通配图（默认）—— 不传 imageSize：**
\`\`\`bash
curl -X POST "${apiBaseUrl}/api/ppt/generate-image" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "描述图片内容", "model": "nano-banana", "aspectRatio": "16:9"}'
\`\`\`

2️⃣ **带文字/图表（用 pro + 4K）：**
\`\`\`bash
curl -X POST "${apiBaseUrl}/api/ppt/generate-image" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "描述图表或带文字内容", "model": "nano-banana-pro", "aspectRatio": "16:9", "imageSize": "4K"}'
\`\`\`

**图片使用场景（不只是背景！）：**

| 类型 | 模型 | 用途示例 |
|------|------|----------|
| 🖼️ 封面背景 | \`nano-banana\` | 大气的主题视觉图、渐变背景、抽象纹理 |
| 🎨 装饰配图 | \`nano-banana\` | 氛围图、插画风格配图、无文字概念图 |
| 📝 中文文字图 | \`nano-banana-pro\` + 4K | 带中文标签的任何图片 |
| 📊 信息图表 | \`nano-banana-pro\` + 4K | 数据可视化、统计图、KPI 面板 |
| 🔄 流程图 | \`nano-banana-pro\` + 4K | 步骤说明、工作流程、架构图 |
| 📈 数据图表 | \`nano-banana-pro\` + 4K | 折线图、柱状图、饼图、趋势图 |
| 🗂️ 结构图 | \`nano-banana-pro\` + 4K | 组织架构、层级结构、关系图 |
| 🎯 对比图 | \`nano-banana-pro\` + 4K | Before/After、方案对比 |

**图片在 PPT 中的位置：**
- **全屏背景**：封面、章节过渡页
- **内容配图**：放在文字旁边，辅助解释内容（占幻灯片 1/3 - 1/2）
- **小型插图**：嵌入文字段落中，增强视觉效果
- **图标组**：用于要点列表前的视觉标识

## 🎯 Prompt 最佳实践（来自 Gemini 官方）

**基础原则：**
1. 用完整句子描述场景，而非堆砌关键词
2. 描述光线、材质、氛围等细节
3. 使用摄影术语控制画面效果
4. 修图时明确说明"保持其它不变"

**📊 信息图表 Prompt 模板（中文）：**
\`\`\`
创建一个专业的信息图表，展示[主题]的[N]个关键要素。
要求：
- 清晰的层级结构和视觉流向
- 使用图标配合中文标签
- 配色方案：[主色调]为主，[辅助色]点缀
- 风格：现代简约/商务专业/科技感
- 白色或浅灰色背景
- 每个要素配有简短中文说明
\`\`\`

**🔄 流程图 Prompt 模板（中文）：**
\`\`\`
创建一个[水平/垂直/环形]流程图，展示[流程名称]的[N]个步骤。
要求：
- 步骤用数字标注（1, 2, 3...）
- 每个步骤有中文标题和简短描述
- 用箭头清晰连接各步骤
- 配色：主色[颜色]，渐变效果
- 现代扁平化设计风格
- 图标辅助说明每个步骤
\`\`\`

**📈 数据图表 Prompt 模板：**
\`\`\`
创建一个[折线图/柱状图/饼图]，展示[数据主题]。
数据：[X轴标签] 对应 [Y轴数值]
要求：
- 清晰的中文数据标签
- 图例说明（如有多系列）
- 标注关键数据点
- 配色专业，数据可读性强
- 包含标题和数据来源
\`\`\`

**🎨 风格关键词（可组合使用）：**
- 光线：soft golden hour lighting, dramatic side lighting, ambient glow
- 材质：glass and chrome, matte finish, glossy surface
- 氛围：corporate professional, tech startup vibe, elegant luxury
- 摄影：shallow depth of field, wide-angle shot, overhead view, macro shot
- 风格：minimalist, futuristic, retro vintage, hand-drawn illustration

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

⚠️ **关键：16:9 幻灯片尺寸常量（必须严格遵守！）**
- 宽度：13.33 英寸（可用区域：12.33 英寸，两边各 0.5 英寸边距）
- 高度：7.5 英寸（可用区域：6.5 英寸，上下各 0.5 英寸边距）
- **所有元素必须在可用区域内，x + w ≤ 12.83，y + h ≤ 7**

**单卡片示例：**
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

**🔥 多卡片网格布局（2x2、3x1 等）：**
\`\`\`javascript
// ⚠️ 网格布局必须用函数计算位置，避免超出边界！
const SLIDE_WIDTH = 10;     // 🔥 幻灯片实际宽度是 10 英寸！
const SLIDE_HEIGHT = 5.625; // 🔥 幻灯片实际高度是 5.625 英寸！
const MARGIN = 0.5;         // 边距
const GAP = 0.2;            // 卡片间隙

// 2x2 网格布局
function create2x2Grid(slide, cards, startY = 1.2) {
  const cols = 2, rows = 2;
  const cardW = (SLIDE_WIDTH - MARGIN * 2 - GAP * (cols - 1)) / cols;  // = 4.4 英寸
  const cardH = 1.8;  // 高度也要适应 5.625 英寸的幻灯片

  cards.forEach((card, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + GAP);  // 第1列: 0.5, 第2列: 5.1
    const y = startY + row * (cardH + GAP);

    // 卡片背景
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH,
      fill: { color: '1E293B' },
      line: { color: card.borderColor, width: 2 },
      radius: 0.15
    });

    // 序号圆圈（在卡片内部左侧）
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.3, y: y + 0.4, w: 0.8, h: 0.8,
      fill: { color: card.circleColor }
    });
    slide.addText(String(i + 1), {
      x: x + 0.3, y: y + 0.5, w: 0.8, h: 0.6,
      fontSize: 20, bold: true, color: 'FFFFFF', align: 'center'
    });

    // 标题和描述（在圆圈右侧）
    slide.addText(card.title, {
      x: x + 1.3, y: y + 0.4, w: cardW - 1.6, h: 0.5,  // ⚠️ 宽度 = 卡片宽度 - 左边距 - 右边距
      fontSize: 18, bold: true, color: 'FFFFFF',
      fit: 'shrink', wrap: true  // 🔥 自动缩放 + 换行
    });
    slide.addText(card.description, {
      x: x + 1.3, y: y + 1.1, w: cardW - 1.6, h: 1,
      fontSize: 12, color: 'A0AEC0', valign: 'top',
      fit: 'shrink', wrap: true  // 🔥 自动缩放 + 换行
    });
  });
}

// 使用示例
create2x2Grid(slide, [
  { title: '销量恢复增长', description: '马斯克承诺2025年销量将恢复正增长', circleColor: '6366F1', borderColor: '6366F1' },
  { title: 'Robotaxi 商业化', description: '6月奥斯丁试点，Q3湾区扩展', circleColor: 'A855F7', borderColor: 'A855F7' },
  { title: 'Optimus 量产', description: '年内生产1万台，用于工厂自动化', circleColor: '10B981', borderColor: '10B981' },
  { title: '新车型发布', description: '更低价位车型，扩大市场覆盖', circleColor: 'F59E0B', borderColor: 'F59E0B' }
]);
\`\`\`

**3列网格布局（适合 3 个要点）：**
\`\`\`javascript
const cols = 3;
const cardW = (SLIDE_WIDTH - MARGIN * 2 - GAP * (cols - 1)) / cols;  // = 2.87 英寸
// 同样的计算逻辑...
\`\`\`

**⚠️ 常见错误布局 vs 正确布局：**
\`\`\`
❌ 错误：x=7, w=4 → 超出边界（7+4=11 > 10）
✅ 正确：x=5.1, w=4.4 → 在边界内（5.1+4.4=9.5 ≤ 10）

❌ 错误：y=4, h=2 → 超出边界（4+2=6 > 5.625）
✅ 正确：y=3.2, h=2 → 在边界内（3.2+2=5.2 ≤ 5.625）
\`\`\`

**🔥 麦肯锡风格数据页示例（信息密集型）：**
\`\`\`javascript
// 这是一个完整的数据分析页面，包含 6 个元素
const slide = pptx.addSlide();

// 1️⃣ Takeaway（页面顶部核心观点）
slide.addText('市场份额同比增长 12%，首次超越竞争对手成为行业第一', {
  x: 0.5, y: 0.3, w: 9, h: 0.4,
  fontSize: 14, bold: true, color: '1E293B',
  fit: 'shrink', wrap: true
});

// 2️⃣ 左侧：柱状图（占 60% 宽度）
slide.addChart(pptx.charts.BAR, [
  { name: '2023', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [12, 15, 18, 22] },
  { name: '2024', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [18, 24, 28, 35] }
], {
  x: 0.5, y: 0.9, w: 5.5, h: 3.2,
  showTitle: true, title: '季度销售对比（亿元）',
  chartColors: ['94A3B8', '${primaryColor.replace('#', '')}'],
  showValue: true
});

// 3️⃣ 右侧：关键数字卡片
const metrics = [
  { label: '总收入', value: '¥35亿', change: '+58%', color: '10B981' },
  { label: '市场份额', value: '28.5%', change: '+12%', color: '10B981' },
  { label: '客户数', value: '1.2万', change: '+34%', color: '10B981' }
];
metrics.forEach((m, i) => {
  const y = 0.9 + i * 1.1;
  // 数字卡片背景
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.2, y, w: 3.2, h: 1, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1 }
  });
  // 大号数字
  slide.addText(m.value, { x: 6.4, y: y + 0.1, w: 2, h: 0.5, fontSize: 24, bold: true, color: '1E293B' });
  // 标签和变化
  slide.addText(m.label, { x: 6.4, y: y + 0.55, w: 1.5, h: 0.3, fontSize: 10, color: '64748B' });
  slide.addText(m.change, { x: 8.2, y: y + 0.35, w: 1, h: 0.3, fontSize: 12, bold: true, color: m.color });
});

// 4️⃣ 底部要点（3 列）
const insights = ['华东地区贡献 45% 收入', '新产品线增速最快', '客单价提升 23%'];
insights.forEach((text, i) => {
  slide.addText('• ' + text, {
    x: 0.5 + i * 3.1, y: 4.3, w: 3, h: 0.4,
    fontSize: 10, color: '475569', fit: 'shrink'
  });
});

// 5️⃣ 数据来源（页面底部）
slide.addText('数据来源：公司财报、艾瑞咨询 2024Q4', {
  x: 0.5, y: 5.1, w: 9, h: 0.3,
  fontSize: 8, color: '94A3B8', italic: true
});
\`\`\`

**🔥 左右对比页示例：**
\`\`\`javascript
// Takeaway
slide.addText('新方案相比旧方案，效率提升 3 倍，成本降低 40%', {
  x: 0.5, y: 0.3, w: 9, h: 0.4, fontSize: 14, bold: true, color: '1E293B'
});

// 左侧：Before
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 0.9, w: 4.3, h: 3.8, fill: { color: 'FEF2F2' }, line: { color: 'FECACA', width: 1 }
});
slide.addText('❌ 传统方案', { x: 0.7, y: 1.0, w: 4, h: 0.4, fontSize: 14, bold: true, color: 'DC2626' });
slide.addText([
  { text: '• 手动处理，耗时 8 小时/天\\n', options: { bullet: false } },
  { text: '• 错误率高达 15%\\n', options: { bullet: false } },
  { text: '• 人力成本 ¥50万/年\\n', options: { bullet: false } },
  { text: '• 无法实时监控', options: { bullet: false } }
], { x: 0.7, y: 1.5, w: 4, h: 3, fontSize: 11, color: '7F1D1D', fit: 'shrink' });

// 右侧：After
slide.addShape(pptx.ShapeType.roundRect, {
  x: 5.2, y: 0.9, w: 4.3, h: 3.8, fill: { color: 'F0FDF4' }, line: { color: 'BBF7D0', width: 1 }
});
slide.addText('✅ 智能方案', { x: 5.4, y: 1.0, w: 4, h: 0.4, fontSize: 14, bold: true, color: '16A34A' });
slide.addText([
  { text: '• 自动化处理，仅需 2 小时/天\\n', options: { bullet: false } },
  { text: '• 错误率降至 0.5%\\n', options: { bullet: false } },
  { text: '• 人力成本 ¥10万/年\\n', options: { bullet: false } },
  { text: '• 实时仪表盘监控', options: { bullet: false } }
], { x: 5.4, y: 1.5, w: 4, h: 3, fontSize: 11, color: '14532D', fit: 'shrink' });

// 底部数据来源
slide.addText('基于 2024 年 Q3 实施数据', { x: 0.5, y: 5.0, w: 9, h: 0.3, fontSize: 8, color: '94A3B8' });
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
