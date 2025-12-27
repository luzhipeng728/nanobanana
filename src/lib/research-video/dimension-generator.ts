/**
 * 研究维度生成器
 * 使用 Claude 分析用户主题，生成 3-4 个互补的研究维度
 */

import Anthropic from "@anthropic-ai/sdk";
import { ResearchDimension, DimensionGeneratorConfig } from "./types";
import { v4 as uuidv4 } from "uuid";

const anthropic = new Anthropic();

/**
 * 获取当前日期信息（中文格式）
 */
function getCurrentDateInfo(): {
  today: string;
  year: number;
  month: number;
  day: number;
  weekStart: string;
  weekEnd: string;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const today = `${year}年${month}月${day}日`;

  // 计算本周起止日期
  const dayOfWeek = now.getDay() || 7; // 周日为7
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - dayOfWeek + 1);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  const weekStart = `${weekStartDate.getFullYear()}年${weekStartDate.getMonth() + 1}月${weekStartDate.getDate()}日`;
  const weekEnd = `${weekEndDate.getFullYear()}年${weekEndDate.getMonth() + 1}月${weekEndDate.getDate()}日`;

  return { today, year, month, day, weekStart, weekEnd };
}

/**
 * 生成带日期上下文的提示词
 */
function buildDimensionPrompt(): string {
  const dateInfo = getCurrentDateInfo();

  return `你是一位专业的研究策划师。用户想要制作一个关于特定主题的视频。

## 重要：当前时间上下文
- **今天是：${dateInfo.today}**
- **本周是：${dateInfo.weekStart} 至 ${dateInfo.weekEnd}**
- **当前年份：${dateInfo.year}年**

当用户主题包含时间相关词语时，必须将其转换为具体日期：
- "今日/今天" → "${dateInfo.today}"
- "本周/这周" → "${dateInfo.weekStart}至${dateInfo.weekEnd}"
- "本月/这个月" → "${dateInfo.year}年${dateInfo.month}月"
- "最近/近期" → "最近7天（${dateInfo.today}前后）"
- "昨天" → 前一天的具体日期

请分析用户的主题，生成 3-4 个互补的研究维度，确保：
1. 维度之间互补，覆盖主题的不同方面
2. 每个维度都能产生有价值的内容
3. 维度的组合能够形成完整的叙事
4. **搜索查询必须包含具体日期，确保研究结果的时效性**

对于每个维度，提供：
- dimension: 维度名称（简短，2-6个字）
- query: 深度研究的搜索查询（详细、可执行，**必须包含具体日期**）
- priority: 重要性 (1-5，5最重要)

必须以 JSON 数组格式返回，不要包含任何其他内容：
[
  {"dimension": "维度名", "query": "搜索查询（包含具体日期）", "priority": 5},
  ...
]

示例主题："今日AI大新闻速报"
示例输出（假设今天是${dateInfo.today}）：
[
  {"dimension": "技术突破", "query": "${dateInfo.today} AI技术 最新突破 重大发布", "priority": 5},
  {"dimension": "行业动态", "query": "${dateInfo.year}年${dateInfo.month}月 AI人工智能 行业应用 最新进展", "priority": 4},
  {"dimension": "政策监管", "query": "${dateInfo.year}年 人工智能 政策法规 监管动态 最新", "priority": 3},
  {"dimension": "市场资本", "query": "${dateInfo.today} AI公司 融资 收购 市场动态", "priority": 4}
]`;
}

/**
 * 生成研究维度
 */
export async function generateResearchDimensions(
  config: DimensionGeneratorConfig
): Promise<ResearchDimension[]> {
  const { topic, maxDimensions = 4 } = config;

  // 动态生成带当前日期的提示词
  const prompt = buildDimensionPrompt();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\n用户主题：${topic}\n\n请生成 ${maxDimensions} 个研究维度。`,
      },
    ],
  });

  // 提取文本内容
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  // 解析 JSON
  let dimensions: Array<{ dimension: string; query: string; priority: number }>;
  try {
    // 尝试直接解析
    dimensions = JSON.parse(content.text);
  } catch {
    // 尝试从代码块中提取
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Failed to parse dimensions JSON");
    }
    dimensions = JSON.parse(jsonMatch[0]);
  }

  // 转换为 ResearchDimension 格式
  return dimensions.map((d) => ({
    id: uuidv4(),
    dimension: d.dimension,
    query: d.query,
    priority: d.priority,
    status: "pending" as const,
  }));
}

/**
 * 流式生成研究维度（用于 SSE）
 */
export async function* generateResearchDimensionsStream(
  config: DimensionGeneratorConfig
): AsyncGenerator<{ type: string; data?: any }> {
  yield { type: "dimensions_generating" };

  try {
    const dimensions = await generateResearchDimensions(config);
    yield {
      type: "dimensions_generated",
      data: { dimensions },
    };
  } catch (error) {
    yield {
      type: "error",
      data: {
        message: `生成研究维度失败: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    };
  }
}
