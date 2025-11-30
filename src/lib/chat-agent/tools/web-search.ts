// 网络搜索工具

import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult, SearchResult } from '../types';
import { webSearchSchema } from '../tool-registry';

// Exa API 配置
const EXA_API_KEY = process.env.EXA_API_KEY;
const EXA_API_URL = 'https://api.exa.ai/search';

interface ExaSearchResult {
  title: string;
  url: string;
  text?: string;
  highlights?: string[];
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
}

/**
 * 执行 Exa 搜索
 */
async function searchWithExa(
  query: string,
  maxResults: number,
  abortSignal: AbortSignal
): Promise<SearchResult[]> {
  if (!EXA_API_KEY) {
    throw new Error('EXA_API_KEY 未配置');
  }

  const response = await fetch(EXA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: maxResults,
      useAutoprompt: true,
      type: 'auto',
      contents: {
        text: { maxCharacters: 500 },
        highlights: { numSentences: 2 },
      },
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Exa API 错误: ${response.status}`);
  }

  const data: ExaSearchResponse = await response.json();

  return data.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.highlights?.[0] || r.text?.slice(0, 200) || '',
  }));
}

/**
 * 备用：使用 DuckDuckGo 搜索
 */
async function searchWithDuckDuckGo(
  query: string,
  maxResults: number,
  abortSignal: AbortSignal
): Promise<SearchResult[]> {
  // 使用 DuckDuckGo HTML 页面抓取（简化实现）
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ChatAgent/1.0)',
    },
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo 搜索失败: ${response.status}`);
  }

  const html = await response.text();

  // 简单解析结果（实际使用时应该用更健壮的解析器）
  const results: SearchResult[] = [];
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/g;

  let match;
  const urls: string[] = [];
  const titles: string[] = [];
  const snippets: string[] = [];

  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    urls.push(match[1]);
    titles.push(match[2]);
  }

  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1]);
  }

  for (let i = 0; i < Math.min(urls.length, maxResults); i++) {
    results.push({
      title: titles[i] || '',
      url: urls[i] || '',
      snippet: snippets[i] || '',
    });
  }

  return results;
}

/**
 * 网络搜索工具
 */
export const webSearchTool: ChatAgentTool = {
  name: 'web_search',
  description: '搜索互联网获取最新信息。适用于查询新闻、事实、技术文档等。',
  schema: webSearchSchema,

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ): Promise<ToolResult> {
    const { query, maxResults = 5 } = input as { query: string; maxResults?: number };

    callbacks.onProgress(`正在搜索: "${query}"`);

    try {
      let results: SearchResult[];

      // 优先使用 Exa，失败则回退到 DuckDuckGo
      if (EXA_API_KEY) {
        try {
          results = await searchWithExa(query, maxResults, context.abortSignal);
          callbacks.onProgress(`Exa 搜索完成，找到 ${results.length} 条结果`);
        } catch (error) {
          callbacks.onProgress('Exa 搜索失败，切换到 DuckDuckGo...');
          results = await searchWithDuckDuckGo(query, maxResults, context.abortSignal);
        }
      } else {
        results = await searchWithDuckDuckGo(query, maxResults, context.abortSignal);
      }

      callbacks.onProgress(`搜索完成，共 ${results.length} 条结果`);

      return {
        success: true,
        searchResults: results,
        data: {
          query,
          totalResults: results.length,
          results,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '搜索失败';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

export default webSearchTool;
