/**
 * 并行研究执行器
 * 使用 HyprLab Deep Research API 并行执行多个研究维度
 */

import { callHyprLabDeepResearch, HyprLabResponse } from "@/lib/super-agent/hyprlab-research";
import { ResearchDimension, ParallelResearchConfig, ResearchResult, ResearchVideoEvent } from "./types";

/**
 * 并行执行多个深度研究
 */
export async function executeParallelResearch(
  config: ParallelResearchConfig,
  sendEvent?: (event: ResearchVideoEvent) => void
): Promise<ResearchResult> {
  const { dimensions, topic, reasoningEffort = "low" } = config;
  const startTime = Date.now();

  sendEvent?.({
    type: "research_start",
    message: `开始并行研究 ${dimensions.length} 个维度`,
    data: { dimensions: dimensions.map(d => d.dimension) },
  });

  // 并行执行所有研究
  const researchPromises = dimensions.map(async (dimension, index) => {
    // 更新维度状态为研究中
    dimension.status = "researching";
    sendEvent?.({
      type: "research_dimension_start",
      data: { dimensionId: dimension.id, dimension: dimension.dimension },
      message: `开始研究: ${dimension.dimension}`,
    });

    try {
      const response = await callHyprLabDeepResearch(dimension.query, {
        reasoningEffort,
        onProgress: async (event) => {
          sendEvent?.({
            type: "research_dimension_progress",
            data: {
              dimensionId: dimension.id,
              dimension: dimension.dimension,
              elapsed: event.elapsedSeconds,
            },
            message: event.message,
          });
        },
      }) as HyprLabResponse;

      // 提取研究结果
      const content = response.choices?.[0]?.message?.content || "";
      dimension.result = content;
      dimension.status = "completed";

      sendEvent?.({
        type: "research_dimension_complete",
        data: {
          dimensionId: dimension.id,
          dimension: dimension.dimension,
          resultLength: content.length,
        },
        message: `完成研究: ${dimension.dimension}`,
      });

      return { dimension, content, success: true };
    } catch (error) {
      dimension.status = "failed";
      dimension.error = error instanceof Error ? error.message : "Unknown error";

      sendEvent?.({
        type: "error",
        data: {
          dimensionId: dimension.id,
          dimension: dimension.dimension,
          error: dimension.error,
        },
        message: `研究失败: ${dimension.dimension}`,
      });

      return { dimension, content: "", success: false };
    }
  });

  // 等待所有研究完成
  const results = await Promise.all(researchPromises);

  // 合并研究结果
  const mergedResult = mergeResearchResults(topic, results);

  const totalTime = Date.now() - startTime;

  sendEvent?.({
    type: "research_complete",
    data: {
      dimensions,
      mergedResultLength: mergedResult.length,
      totalTime,
    },
    message: `研究完成，共耗时 ${Math.round(totalTime / 1000)} 秒`,
  });

  return {
    dimensions,
    mergedResult,
    totalTime,
  };
}

/**
 * 获取当前日期（中文格式）
 */
function getCurrentDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

/**
 * 合并多个研究结果
 */
function mergeResearchResults(
  topic: string,
  results: Array<{ dimension: ResearchDimension; content: string; success: boolean }>
): string {
  const successfulResults = results.filter(r => r.success && r.content);

  if (successfulResults.length === 0) {
    throw new Error("所有研究维度都失败了");
  }

  // 按优先级排序
  successfulResults.sort((a, b) => b.dimension.priority - a.dimension.priority);

  // 构建合并后的研究报告，包含研究日期
  const sections = successfulResults.map(r => {
    return `## ${r.dimension.dimension}\n\n${r.content}`;
  });

  const dateString = getCurrentDateString();
  return `# ${topic}\n\n> 研究日期：${dateString}\n\n${sections.join("\n\n---\n\n")}`;
}

/**
 * 流式执行并行研究（生成器版本）
 */
export async function* executeParallelResearchStream(
  config: ParallelResearchConfig
): AsyncGenerator<ResearchVideoEvent> {
  const { dimensions, topic, reasoningEffort = "low" } = config;
  const startTime = Date.now();

  yield {
    type: "research_start",
    message: `开始并行研究 ${dimensions.length} 个维度`,
    data: { dimensions: dimensions.map(d => d.dimension) },
  };

  // 创建进度追踪
  const completedCount = { value: 0 };
  const total = dimensions.length;

  // 并行执行但收集事件
  const researchPromises = dimensions.map(async (dimension) => {
    dimension.status = "researching";

    try {
      const response = await callHyprLabDeepResearch(dimension.query, {
        reasoningEffort,
      }) as HyprLabResponse;

      const content = response.choices?.[0]?.message?.content || "";
      dimension.result = content;
      dimension.status = "completed";
      completedCount.value++;

      return { dimension, content, success: true };
    } catch (error) {
      dimension.status = "failed";
      dimension.error = error instanceof Error ? error.message : "Unknown error";
      completedCount.value++;

      return { dimension, content: "", success: false };
    }
  });

  // 等待所有完成
  const results = await Promise.all(researchPromises);

  // 合并结果
  const mergedResult = mergeResearchResults(topic, results);
  const totalTime = Date.now() - startTime;

  yield {
    type: "research_complete",
    data: {
      dimensions,
      mergedResult,
      totalTime,
    },
    progress: 100,
    message: `研究完成，共耗时 ${Math.round(totalTime / 1000)} 秒`,
  };
}
