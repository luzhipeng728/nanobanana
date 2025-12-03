/**
 * HyprLab Sonar Deep Research API 客户端
 *
 * 使用 sonar-deep-research 模型进行深度研究
 * 支持 low/medium/high 三种 reasoning_effort 级别
 */

// 研究强度配置
export type ReasoningEffort = 'low' | 'medium' | 'high';

// 预估时间（分钟）
export const REASONING_EFFORT_TIME: Record<ReasoningEffort, { min: number; max: number }> = {
  low: { min: 1, max: 3 },
  medium: { min: 3, max: 7 },
  high: { min: 7, max: 15 }
};

// API 响应类型
export interface HyprLabSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface HyprLabUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  citation_tokens: number;
  num_search_queries: number;
  reasoning_tokens: number;
  cost?: {
    input_tokens_cost: number;
    output_tokens_cost: number;
    citation_tokens_cost: number;
    reasoning_tokens_cost: number;
    search_queries_cost: number;
    total_cost: number;
  };
}

export interface HyprLabResponse {
  id: string;
  model: string;
  created: number;
  usage: HyprLabUsage;
  citations: string[];
  search_results: HyprLabSearchResult[];
  object: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

// 进度事件类型
export interface ResearchProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  elapsedSeconds: number;
  estimatedMinutes: { min: number; max: number };
  message: string;
  data?: HyprLabResponse;
  error?: string;
}

// 进度回调类型
export type ProgressCallback = (event: ResearchProgressEvent) => Promise<void>;

// 深度研究选项
export interface DeepResearchOptions {
  /** 研究强度 (low/medium/high)，默认 'low' */
  reasoningEffort?: ReasoningEffort;
  /** 进度回调，每5秒调用一次 */
  onProgress?: ProgressCallback;
  /** 可选的系统提示词 */
  systemPrompt?: string;
  /** 是否返回完整的原始响应（包括 search_results 等），默认 false */
  includeRawResponse?: boolean;
}

// 完整研究结果（包含原始响应）
export interface FullResearchResult {
  response: HyprLabResponse;
  parsed: ParsedResearchResult;
}

/**
 * 调用 HyprLab sonar-deep-research API
 *
 * @param topic 研究主题
 * @param optionsOrEffort 研究选项对象 或 研究强度字符串（向后兼容）
 * @param onProgressLegacy 进度回调（向后兼容）
 * @param systemPromptLegacy 系统提示词（向后兼容）
 * @returns HyprLabResponse 或 FullResearchResult（取决于 includeRawResponse）
 */
export async function callHyprLabDeepResearch(
  topic: string,
  optionsOrEffort?: DeepResearchOptions | ReasoningEffort,
  onProgressLegacy?: ProgressCallback,
  systemPromptLegacy?: string
): Promise<HyprLabResponse | FullResearchResult> {
  // 处理向后兼容：支持旧的调用方式
  let reasoningEffort: ReasoningEffort = 'low';
  let onProgress: ProgressCallback | undefined;
  let systemPrompt: string | undefined;
  let includeRawResponse = false;

  if (typeof optionsOrEffort === 'string') {
    // 旧调用方式：callHyprLabDeepResearch(topic, 'low', callback, prompt)
    reasoningEffort = optionsOrEffort;
    onProgress = onProgressLegacy;
    systemPrompt = systemPromptLegacy;
  } else if (optionsOrEffort && typeof optionsOrEffort === 'object') {
    // 新调用方式：callHyprLabDeepResearch(topic, { reasoningEffort, onProgress, ... })
    reasoningEffort = optionsOrEffort.reasoningEffort || 'low';
    onProgress = optionsOrEffort.onProgress;
    systemPrompt = optionsOrEffort.systemPrompt;
    includeRawResponse = optionsOrEffort.includeRawResponse || false;
  }

  const apiKey = process.env.HYPRLAB_API_KEY;

  if (!apiKey) {
    throw new Error('HYPRLAB_API_KEY 未配置，请在 .env 中设置');
  }

  const startTime = Date.now();
  const estimatedTime = REASONING_EFFORT_TIME[reasoningEffort];

  // 发送开始事件
  if (onProgress) {
    await onProgress({
      type: 'start',
      elapsedSeconds: 0,
      estimatedMinutes: estimatedTime,
      message: `🔬 开始深度研究: "${topic}" (预计 ${estimatedTime.min}-${estimatedTime.max} 分钟)`
    });
  }

  // 构建请求体
  const requestBody = {
    model: 'sonar-deep-research',
    messages: [
      ...(systemPrompt ? [{
        role: 'system',
        content: systemPrompt
      }] : [{
        role: 'system',
        content: 'You are a helpful research assistant. Provide comprehensive, well-structured research reports in the same language as the user query.'
      }]),
      {
        role: 'user',
        content: topic
      }
    ],
    reasoning_effort: reasoningEffort
  };

  console.log(`[HyprLab] Starting deep research: "${topic}" with effort: ${reasoningEffort}`);

  // 标记是否完成（用于停止心跳）
  let isCompleted = false;

  // 心跳函数 - 在单独的异步任务中运行，保持 SSE 连接活跃
  // 注意：不要 await 这个 Promise，让它在后台运行
  const runHeartbeat = async () => {
    while (!isCompleted) {
      // 等待 5 秒
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 再次检查是否已完成（避免最后一次多余的进度事件）
      if (isCompleted) break;

      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const elapsedMinutes = (elapsedSeconds / 60).toFixed(1);

      console.log(`[HyprLab] Heartbeat: ${elapsedSeconds}s elapsed`);

      if (onProgress) {
        try {
          await onProgress({
            type: 'progress',
            elapsedSeconds,
            estimatedMinutes: estimatedTime,
            message: `⏳ 正在深度研究中... 已用时 ${elapsedMinutes} 分钟 (预计 ${estimatedTime.min}-${estimatedTime.max} 分钟)`
          });
        } catch (e) {
          // 如果进度回调失败（如连接已断开），继续运行但记录错误
          console.warn('[HyprLab] Heartbeat progress callback failed:', e);
        }
      }
    }
    console.log('[HyprLab] Heartbeat stopped');
  };

  // 启动心跳（不等待）
  const heartbeatPromise = runHeartbeat();

  try {
    // 调用 API（这是阻塞操作，可能需要几分钟）
    const response = await fetch('https://api.hyprlab.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HyprLab API 错误 (${response.status}): ${errorText}`);
    }

    const data: HyprLabResponse = await response.json();

    // 标记完成，停止心跳
    isCompleted = true;

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[HyprLab] Research complete in ${elapsedSeconds}s, citations: ${data.citations?.length || 0}`);

    // 发送完成事件
    if (onProgress) {
      await onProgress({
        type: 'complete',
        elapsedSeconds,
        estimatedMinutes: estimatedTime,
        message: `✅ 深度研究完成！用时 ${(elapsedSeconds / 60).toFixed(1)} 分钟，获得 ${data.citations?.length || 0} 个引用来源`,
        data
      });
    }

    // 根据 includeRawResponse 决定返回格式
    if (includeRawResponse) {
      return {
        response: data,
        parsed: parseHyprLabResponse(data)
      } as FullResearchResult;
    }

    return data;
  } catch (error) {
    // 标记完成，停止心跳
    isCompleted = true;

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const errorMessage = error instanceof Error ? error.message : '未知错误';

    console.error(`[HyprLab] Research failed after ${elapsedSeconds}s:`, errorMessage);

    // 发送错误事件
    if (onProgress) {
      await onProgress({
        type: 'error',
        elapsedSeconds,
        estimatedMinutes: estimatedTime,
        message: `❌ 深度研究失败: ${errorMessage}`,
        error: errorMessage
      });
    }

    throw error;
  }
}

/**
 * 解析 HyprLab 研究结果，提取结构化信息
 */
export interface ParsedResearchResult {
  // 主要内容
  content: string;

  // 引用来源
  citations: string[];

  // 搜索结果摘要
  searchResults: HyprLabSearchResult[];

  // 使用统计
  usage: HyprLabUsage;

  // 元信息
  meta: {
    model: string;
    created: number;
    totalCost?: number;
    searchQueriesCount: number;
  };
}

export function parseHyprLabResponse(response: HyprLabResponse): ParsedResearchResult {
  const content = response.choices?.[0]?.message?.content || '';

  return {
    content,
    citations: response.citations || [],
    searchResults: response.search_results || [],
    usage: response.usage,
    meta: {
      model: response.model,
      created: response.created,
      totalCost: response.usage?.cost?.total_cost,
      searchQueriesCount: response.usage?.num_search_queries || 0
    }
  };
}

/**
 * 从研究结果生成图片提示词的上下文
 * 将研究内容和引用来源整合成便于 AI 使用的格式
 */
export function formatResearchForImagePrompt(parsed: ParsedResearchResult): string {
  const sections: string[] = [];

  // 1. 研究内容摘要
  sections.push('【深度研究报告】');
  sections.push(parsed.content);

  // 2. 主要来源（前10个）
  if (parsed.citations.length > 0) {
    sections.push('\n【参考来源】');
    const topCitations = parsed.citations.slice(0, 10);
    topCitations.forEach((url, i) => {
      sections.push(`${i + 1}. ${url}`);
    });
    if (parsed.citations.length > 10) {
      sections.push(`... 共 ${parsed.citations.length} 个来源`);
    }
  }

  // 3. 关键搜索结果（前5个）
  if (parsed.searchResults.length > 0) {
    sections.push('\n【关键信息摘要】');
    const topResults = parsed.searchResults.slice(0, 5);
    topResults.forEach((result, i) => {
      sections.push(`${i + 1}. ${result.title}`);
      if (result.snippet) {
        sections.push(`   ${result.snippet.substring(0, 200)}...`);
      }
    });
  }

  // 4. 研究统计
  sections.push('\n【研究统计】');
  sections.push(`- 搜索查询数: ${parsed.meta.searchQueriesCount}`);
  sections.push(`- 引用来源数: ${parsed.citations.length}`);
  if (parsed.meta.totalCost !== undefined) {
    sections.push(`- 研究成本: $${parsed.meta.totalCost.toFixed(3)}`);
  }

  return sections.join('\n');
}
