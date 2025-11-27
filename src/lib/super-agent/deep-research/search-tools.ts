// DeepResearch 搜索工具封装 - Google Custom Search

import { SearchResultItem, SearchQuery } from './types';

// API 配置
const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_ENGINE_ID;

/**
 * Google Custom Search 客户端
 */
export class GoogleSearchClient {
  private apiKey: string;
  private cx: string;
  private baseUrl = 'https://www.googleapis.com/customsearch/v1';

  constructor(apiKey?: string, cx?: string) {
    this.apiKey = apiKey || GOOGLE_API_KEY || '';
    this.cx = cx || GOOGLE_CX || '';
  }

  /**
   * 检查是否配置完整
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.cx);
  }

  /**
   * 执行搜索
   */
  async search(
    query: string,
    options: {
      num?: number;        // 结果数量 (1-10)
      start?: number;      // 起始位置
      dateRestrict?: string; // 日期限制，如 'd7' (7天), 'm1' (1个月), 'y1' (1年)
      lr?: string;         // 语言限制，如 'lang_zh-CN'
      safe?: 'off' | 'active';
    } = {}
  ): Promise<SearchResultItem[]> {
    if (!this.isConfigured()) {
      console.warn('[Google] API key or Search Engine ID not configured');
      return [];
    }

    const {
      num = 10,
      start = 1,
      dateRestrict,
      lr,
      safe = 'off'
    } = options;

    try {
      console.log(`[Google] Searching: "${query}"`);

      // 构建 URL 参数
      const params = new URLSearchParams({
        key: this.apiKey,
        cx: this.cx,
        q: query,
        num: Math.min(num, 10).toString(), // Google 限制每次最多 10 条
        start: start.toString(),
        safe
      });

      if (dateRestrict) {
        params.append('dateRestrict', dateRestrict);
      }

      if (lr) {
        params.append('lr', lr);
      }

      const response = await fetch(`${this.baseUrl}?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[Google] API error: ${response.status}`, errorData);

        // 处理配额超限
        if (response.status === 429) {
          console.error('[Google] Daily quota exceeded');
        }
        return [];
      }

      const data = await response.json();

      // 检查是否有结果
      if (!data.items || data.items.length === 0) {
        console.log(`[Google] No results for "${query}"`);
        return [];
      }

      const results: SearchResultItem[] = data.items.map((item: any, index: number) => ({
        id: item.cacheId || `google-${Date.now()}-${index}`,
        url: item.link,
        title: item.title || '',
        content: item.snippet || '',
        snippet: item.snippet || '',
        publishedDate: item.pagemap?.metatags?.[0]?.['article:published_time'] || undefined,
        source: 'google' as const,
        score: 1 - (index * 0.05), // 按排名递减分数
        highlights: item.snippet ? [item.snippet] : []
      }));

      console.log(`[Google] Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error('[Google] Search error:', error);
      return [];
    }
  }

  /**
   * 批量搜索（多个查询）
   */
  async batchSearch(
    queries: string[],
    options: {
      num?: number;
      dateRestrict?: string;
    } = {}
  ): Promise<Map<string, SearchResultItem[]>> {
    const results = new Map<string, SearchResultItem[]>();

    // 串行执行以避免 API 限流
    for (const query of queries) {
      const items = await this.search(query, options);
      results.set(query, items);

      // 添加小延迟避免触发限流
      if (queries.indexOf(query) < queries.length - 1) {
        await this.delay(200);
      }
    }

    return results;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 统一搜索管理器 - 使用 Google 搜索
 */
export class UnifiedSearchManager {
  private googleClient: GoogleSearchClient;

  constructor() {
    this.googleClient = new GoogleSearchClient();
  }

  /**
   * 检查是否配置完整
   */
  isConfigured(): boolean {
    return this.googleClient.isConfigured();
  }

  /**
   * 并行执行搜索（实际上是批量搜索，因为 Google 有限流）
   */
  async parallelSearch(
    queries: SearchQuery[]
  ): Promise<{ results: SearchResultItem[]; stats: SearchStats }> {
    const startTime = Date.now();
    const allResults: SearchResultItem[] = [];
    const stats: SearchStats = {
      totalQueries: queries.length,
      googleQueries: 0,
      googleResults: 0,
      duration: 0
    };

    if (!this.isConfigured()) {
      console.warn('[UnifiedSearch] Google Search not configured, returning empty results');
      stats.duration = Date.now() - startTime;
      return { results: [], stats };
    }

    // 执行所有查询
    for (const q of queries) {
      stats.googleQueries++;

      const results = await this.googleClient.search(q.query, {
        num: 10,
        // 如果搜索最新内容，限制日期
        dateRestrict: q.targetInfo?.includes('latest_updates') ? 'm1' : undefined
      });

      for (const r of results) {
        stats.googleResults++;
        allResults.push(r);
      }

      // 添加延迟避免限流
      if (queries.indexOf(q) < queries.length - 1) {
        await this.delay(300);
      }
    }

    stats.duration = Date.now() - startTime;

    console.log(
      `[UnifiedSearch] Completed ${queries.length} queries in ${stats.duration}ms, ` +
      `got ${allResults.length} results`
    );

    return { results: allResults, stats };
  }

  /**
   * 单次快速搜索
   */
  async quickSearch(query: string): Promise<SearchResultItem[]> {
    const { results } = await this.parallelSearch([
      { query, searchType: 'auto', targetInfo: [], source: 'both', priority: 3 }
    ]);
    return results;
  }

  /**
   * 深度搜索 - 多角度查询
   */
  async deepSearch(
    query: string,
    existingUrls: string[] = []
  ): Promise<SearchResultItem[]> {
    // 生成多个搜索角度
    const queries = [
      query,
      `${query} 详细介绍`,
      `${query} 最新消息`
    ];

    const allResults: SearchResultItem[] = [];

    for (const q of queries) {
      const results = await this.googleClient.search(q, { num: 10 });
      allResults.push(...results);
      await this.delay(300);
    }

    // 去重
    return this.deduplicateResults(allResults, existingUrls);
  }

  /**
   * 结果去重
   */
  private deduplicateResults(
    results: SearchResultItem[],
    existingUrls: string[] = []
  ): SearchResultItem[] {
    const seenUrls = new Set(existingUrls);
    const unique: SearchResultItem[] = [];

    for (const r of results) {
      const normalizedUrl = this.normalizeUrl(r.url);

      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        unique.push(r);
      }
    }

    return unique;
  }

  /**
   * URL 规范化
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`;
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 搜索统计
 */
export interface SearchStats {
  totalQueries: number;
  googleQueries: number;
  googleResults: number;
  duration: number;
}

// 导出单例实例
export const searchManager = new UnifiedSearchManager();

// 向后兼容：导出旧的类名（已废弃）
/** @deprecated Use GoogleSearchClient instead */
export class ExaSearchClient extends GoogleSearchClient {}
/** @deprecated Use GoogleSearchClient instead */
export class TavilySearchClient extends GoogleSearchClient {}
