/**
 * 脚本分段器 v3
 * 支持内容筛选智能体 + 脚本生成
 * 生成长篇解说脚本（6-15分钟），按章节分段，每章节配一张信息图
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ScriptSegment, ScriptGeneratorConfig, ScriptResult, CHARS_PER_SECOND, ResearchVideoEvent } from "./types";
import { getGeminiKeys } from "@/lib/api-keys";

const anthropic = new Anthropic();

// Gemini 模型配置
const GEMINI_FILTER_MODEL = 'gemini-3-flash-preview';

/**
 * 内容筛选智能体
 * 根据用户主题从研究结果中提取有用信息
 * 注意：不要过度精简，目标是保留 70-90% 的内容
 */
const CONTENT_FILTER_PROMPT = `你是一个内容整理专家，负责整理和优化深度研究结果。

## 核心原则
**保留尽可能多的内容！目标是保留原始内容的 70-90%。**
你的任务不是"筛选"，而是"整理和去重"。

## 任务
1. 去除完全重复的段落（同一信息出现多次）
2. 去除明显无关的广告、导航等杂项内容
3. 保留所有与主题相关的信息、数据、观点、分析
4. 整理成清晰的 Markdown 格式

## 禁止事项
- **禁止过度精简**：不要删除"看起来不重要"的内容
- **禁止总结概括**：保留原文的详细描述，不要用一句话概括多段内容
- **禁止删除数据**：所有数字、百分比、日期都要保留
- **禁止删除引用**：保留所有来源和引用信息

## 输出
直接输出整理后的完整内容，使用 Markdown 格式。
内容长度应该接近原始输入的 70-90%。`;

const SCRIPT_GENERATION_PROMPT = `你是一位专业的深度研究视频脚本撰写者，擅长将复杂主题转化为引人入胜的视频解说。

## 任务
根据提供的研究资料，撰写一份**完整、深入**的视频解说脚本。不要遗漏任何重要信息。

## 脚本结构要求
1. **开篇引入**：用引人入胜的方式引入主题，可以是问题、数据或故事
2. **核心章节**：根据研究内容的维度和深度，分成多个章节深入讲解
3. **总结展望**：总结要点，展望未来或给出建议

## 内容要求
- 语言口语化、自然流畅，适合朗读
- **完整覆盖研究资料中的所有重要信息**，不要遗漏
- 每个章节聚焦一个主题，提炼2-5个关键要点
- 适当使用数据、案例增强说服力
- 转场自然，前后呼应
- 章节数量由内容决定，通常6-12个章节

## 输出格式
返回 JSON 格式（不要包含其他内容）：
{
  "title": "视频标题（简短有吸引力，8-15字）",
  "segments": [
    {
      "chapterTitle": "章节标题（简短，用于信息图显示）",
      "text": "该章节的完整解说词（每章节200-400字）",
      "keyPoints": ["要点1", "要点2", "要点3"],
      "emotion": "neutral|happy|excited|serious|calm",
      "visualStyle": "infographic|news|data|story|comparison"
    }
  ]
}

## emotion 说明
- neutral: 正常叙述、过渡内容
- excited: 重大突破、惊人发现
- serious: 警示、风险、重要信息
- happy: 积极成果、好消息
- calm: 总结、展望、深思

## visualStyle 说明（指导图片生成风格）
- infographic: 信息图，适合展示多个要点
- news: 新闻速报风格，适合热点事件
- data: 数据可视化，适合数据分析
- story: 故事场景，适合案例讲解
- comparison: 对比图表，适合比较分析`;

/**
 * 内容筛选：从研究结果中提取与主题相关的有用信息
 * 使用 Gemini Flash 模型，支持流式返回
 */
export async function filterResearchContent(
  researchResult: string,
  topic: string,
  sendEvent?: (event: ResearchVideoEvent) => void
): Promise<string> {
  console.log(`[ContentFilter] 开始筛选内容，研究结果长度: ${researchResult.length}`);

  sendEvent?.({
    type: "content_filter_start",
    message: `正在使用 AI 筛选有用信息...（原始内容 ${Math.round(researchResult.length / 1000)}K 字符）`,
  });

  const systemPrompt = CONTENT_FILTER_PROMPT;
  const userPrompt = `## 用户研究主题
${topic}

## 原始研究结果（${researchResult.length} 字符）
${researchResult}

请根据用户主题，从研究结果中筛选出最相关、最有价值的信息。
**重要：保留尽可能多的有用信息，不要过度精简！目标是保留 60-80% 的核心内容。**`;

  // 从数据库获取 Gemini API Key（支持轮询容错）
  const geminiKeys = await getGeminiKeys();
  if (geminiKeys.length === 0) {
    console.warn('[ContentFilter] 没有 Gemini Key，直接使用 Claude');
  }

  console.log(`[ContentFilter] 共 ${geminiKeys.length} 个 Gemini Key 可用`);

  // 尝试每个 Key，直到成功或全部失败
  let lastError: Error | null = null;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  for (let keyIndex = 0; keyIndex < geminiKeys.length; keyIndex++) {
    const apiKey = geminiKeys[keyIndex];
    console.log(`[ContentFilter] 尝试 Key ${keyIndex + 1}/${geminiKeys.length}`);

    try {
      // 使用 Google 官方 SDK
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: GEMINI_FILTER_MODEL,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 32000,
        },
      });

      const startTime = Date.now();
      let result = '';
      let chunkCount = 0;

      // 流式生成
      const streamResult = await model.generateContentStream(fullPrompt);

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) {
          result += text;
          chunkCount++;

          // 实时返回每个 chunk 到前端
          sendEvent?.({
            type: "content_filter_chunk",
            data: { text, totalLength: result.length },
            message: text,
          });

          // 每 20 个 chunk 发送一次进度统计
          if (chunkCount % 20 === 0) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            sendEvent?.({
              type: "content_filter_progress",
              message: `筛选中... 已生成 ${result.length} 字符（${elapsed}s）`,
              progress: Math.min(30, Math.round(result.length / researchResult.length * 100)),
            });
          }
        }
      }

      // 成功！
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const ratio = Math.round(result.length / researchResult.length * 100);
      console.log(`[ContentFilter] 筛选完成 (Key ${keyIndex + 1}): ${researchResult.length} -> ${result.length} 字符 (${ratio}%)，耗时 ${elapsed}s`);

      sendEvent?.({
        type: "content_filter_complete",
        message: `内容筛选完成：${Math.round(researchResult.length / 1000)}K → ${Math.round(result.length / 1000)}K 字符（保留 ${ratio}%）`,
        data: { originalLength: researchResult.length, filteredLength: result.length, ratio },
      });

      return result;
    } catch (error) {
      console.error(`[ContentFilter] Key ${keyIndex + 1} 异常:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));

      // 通知前端正在切换 Key
      if (keyIndex < geminiKeys.length - 1) {
        sendEvent?.({
          type: "content_filter_start",
          message: `Key ${keyIndex + 1} 出错，尝试下一个...`,
        });
      }
      // 继续尝试下一个 Key
    }
  }

  // 所有 Gemini Key 都失败了，回退到 Claude
  console.error('[ContentFilter] 所有 Gemini Key 都失败，回退到 Claude:', lastError);

  // 回退到 Claude（但增大 max_tokens）
  sendEvent?.({
    type: "content_filter_complete",
    message: "Gemini 筛选失败，使用 Claude 重试...",
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 32000,
    messages: [
      {
        role: "user",
        content: `${CONTENT_FILTER_PROMPT}

## 用户研究主题
${topic}

## 原始研究结果
${researchResult}

请根据用户主题，从研究结果中筛选出最相关、最有价值的信息。
**重要：保留尽可能多的有用信息，目标是保留 60-80% 的核心内容。**`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from content filter");
  }

  console.log(`[ContentFilter] Claude 筛选完成，输出长度: ${content.text.length}`);
  return content.text;
}

/**
 * 生成分段脚本
 * 根据研究内容自然分段，不限制时长
 * 支持内容筛选（v3 新增）
 */
export async function generateSegmentedScript(
  config: ScriptGeneratorConfig & {
    enableContentFilter?: boolean;
    sendEvent?: (event: ResearchVideoEvent) => void;
  }
): Promise<ScriptResult> {
  const { researchResult, topic, enableContentFilter = true, sendEvent } = config;

  // v3: 内容筛选步骤（使用 Gemini Flash，流式返回）
  let filteredContent = researchResult;
  if (enableContentFilter && researchResult.length > 2000) {
    console.log(`[ScriptGenerator] 启用内容筛选智能体...`);
    filteredContent = await filterResearchContent(researchResult, topic, sendEvent);
    console.log(`[ScriptGenerator] 内容筛选完成: ${researchResult.length} -> ${filteredContent.length} 字符`);
  }

  // 使用流式生成脚本
  sendEvent?.({
    type: "script_start",
    message: "正在生成解说脚本...",
  });

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: `${SCRIPT_GENERATION_PROMPT}

## 主题
${topic}

## 研究资料
${filteredContent}

## 生成要求
- 根据研究资料的内容深度，生成足够多的章节（通常6-12个）
- 完整覆盖所有重要信息，不要遗漏
- 每个章节200-400字，聚焦一个主题
- 确保内容深度和专业性`,
      },
    ],
  });

  // 收集流式内容
  let fullText = '';
  let chunkCount = 0;
  const startTime = Date.now();

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      fullText += text;
      chunkCount++;

      // 每 10 个 chunk 发送一次进度
      if (chunkCount % 10 === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        sendEvent?.({
          type: "script_progress",
          message: `生成中... ${fullText.length} 字符（${elapsed}s）`,
          data: { text, totalLength: fullText.length },
        });
      }
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[ScriptGenerator] 脚本生成完成: ${fullText.length} 字符，耗时 ${elapsed}s`);

  // 提取文本内容
  const contentText = fullText;
  if (!contentText) {
    throw new Error("Unexpected response type");
  }

  // 解析 JSON
  let parsed: {
    title: string;
    segments: Array<{
      chapterTitle?: string;
      text: string;
      keyPoints?: string[];
      emotion?: string;
      visualStyle?: string;
      imageHint?: string;
    }>
  };

  try {
    parsed = JSON.parse(contentText);
  } catch {
    // 尝试从代码块中提取
    const jsonMatch = contentText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      const rawJson = contentText.match(/\{[\s\S]*\}/);
      if (!rawJson) {
        throw new Error("Failed to parse script JSON");
      }
      parsed = JSON.parse(rawJson[0]);
    }
  }

  // 转换为 ScriptSegment 格式
  const segments: ScriptSegment[] = parsed.segments.map((s, index) => ({
    order: index,
    text: s.text,
    estimatedDuration: s.text.length / CHARS_PER_SECOND,
    emotion: s.emotion as ScriptSegment["emotion"] || "neutral",
    chapterTitle: s.chapterTitle,
    keyPoints: s.keyPoints || [],
    visualStyle: (s.visualStyle || "infographic") as ScriptSegment["visualStyle"],
    imageHint: s.imageHint,
  }));

  // 计算全文和总时长
  const fullScript = segments.map(s => s.text).join("\n\n");
  const estimatedDuration = segments.reduce((sum, s) => sum + s.estimatedDuration, 0);

  return {
    title: parsed.title,
    fullScript,
    segments,
    estimatedDuration,
  };
}

/**
 * 流式生成脚本（带 SSE 事件）
 */
export async function* generateSegmentedScriptStream(
  config: ScriptGeneratorConfig
): AsyncGenerator<ResearchVideoEvent> {
  yield {
    type: "script_start",
    message: "开始生成解说脚本",
  };

  try {
    const result = await generateSegmentedScript(config);

    // 逐段发送
    for (const segment of result.segments) {
      yield {
        type: "script_chunk",
        data: { segment },
        message: `生成章节 ${segment.order + 1}/${result.segments.length}: ${(segment as any).chapterTitle || ""}`,
      };
    }

    yield {
      type: "script_complete",
      data: result,
      message: `脚本生成完成，共 ${result.segments.length} 个章节，预计时长 ${Math.round(result.estimatedDuration / 60)} 分钟`,
    };
  } catch (error) {
    yield {
      type: "error",
      message: `脚本生成失败: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * 智能分段算法
 * 将长文本按照语义和长度智能分段
 */
export function smartSegmentText(
  text: string,
  options: { minChars?: number; maxChars?: number } = {}
): string[] {
  const { minChars = 150, maxChars = 400 } = options;
  const targetChars = (minChars + maxChars) / 2;

  // 按段落分割
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  const segments: string[] = [];
  let currentSegment = "";

  for (const para of paragraphs) {
    if (currentSegment.length + para.length <= maxChars) {
      currentSegment += (currentSegment ? "\n\n" : "") + para;
    } else {
      if (currentSegment.length >= minChars) {
        segments.push(currentSegment.trim());
        currentSegment = para;
      } else {
        currentSegment += "\n\n" + para;
      }
    }
  }

  // 处理最后一段
  if (currentSegment.trim()) {
    if (currentSegment.length < minChars && segments.length > 0) {
      segments[segments.length - 1] += "\n\n" + currentSegment;
    } else {
      segments.push(currentSegment.trim());
    }
  }

  return segments;
}
