// DeepResearch 结果处理器 - 去重、分类、摘要

import {
  SearchResultItem,
  InfoCategory,
  CategorizedInfo,
  ResearchReport,
  ResearchState
} from './types';
import { CATEGORY_LABELS, INFO_CATEGORIES } from './state';
import { callLLMForJSON } from './llm-client';

/**
 * 结果处理器
 */
export class ResultProcessor {
  private topic: string;

  constructor(topic: string) {
    this.topic = topic;
  }

  /**
   * 处理搜索结果：去重 + 分类（使用 LLM，较慢）
   */
  async processResults(
    results: SearchResultItem[],
    existingUrls: Set<string>
  ): Promise<{
    uniqueResults: SearchResultItem[];
    categorized: CategorizedInfo[];
  }> {
    console.log(`[ResultProcessor] processResults called with ${results.length} results`);

    // 1. 去重
    const uniqueResults = this.deduplicateResults(results, existingUrls);
    console.log(`[ResultProcessor] After dedup: ${uniqueResults.length} unique results`);

    if (uniqueResults.length === 0) {
      return { uniqueResults: [], categorized: [] };
    }

    // 2. 使用 LLM 进行智能分类
    const categorized = await this.categorizeWithLLM(uniqueResults);

    return { uniqueResults, categorized };
  }

  /**
   * 快速处理搜索结果：去重 + 规则分类（不调用 LLM，更快）
   */
  async processResultsFast(
    results: SearchResultItem[],
    existingUrls: Set<string>
  ): Promise<{
    uniqueResults: SearchResultItem[];
    categorized: CategorizedInfo[];
  }> {
    // 1. 去重
    const uniqueResults = this.deduplicateResults(results, existingUrls);

    if (uniqueResults.length === 0) {
      return { uniqueResults: [], categorized: [] };
    }

    // 2. 使用规则快速分类（不调用 LLM）
    const categorized = this.fallbackCategorize(uniqueResults);

    return { uniqueResults, categorized };
  }

  /**
   * 去重结果
   */
  private deduplicateResults(
    results: SearchResultItem[],
    existingUrls: Set<string>
  ): SearchResultItem[] {
    const seen = new Set(existingUrls);
    const unique: SearchResultItem[] = [];

    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url);

      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);

        // 额外检查内容相似度
        const isDuplicateContent = unique.some(
          u => this.contentSimilarity(u.content, result.content) > 0.8
        );

        if (!isDuplicateContent) {
          unique.push(result);
        }
      }
    }

    return unique;
  }

  /**
   * 使用 LLM 进行智能分类
   */
  private async categorizeWithLLM(
    results: SearchResultItem[]
  ): Promise<CategorizedInfo[]> {
    // 批量处理，避免过多 API 调用
    const batchSize = 5;
    const categorized: CategorizedInfo[] = [];
    const totalBatches = Math.ceil(results.length / batchSize);

    console.log(`[ResultProcessor] Categorizing ${results.length} results in ${totalBatches} batches`);

    for (let i = 0; i < results.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = results.slice(i, i + batchSize);
      console.log(`[ResultProcessor] Processing batch ${batchNum}/${totalBatches}`);
      const batchCategorized = await this.categorizeBatch(batch);
      categorized.push(...batchCategorized);
    }

    console.log(`[ResultProcessor] Categorization complete: ${categorized.length} items`);
    return categorized;
  }

  /**
   * 批量分类
   */
  private async categorizeBatch(
    results: SearchResultItem[]
  ): Promise<CategorizedInfo[]> {
    const categoryDescriptions = INFO_CATEGORIES
      .map(c => `- ${c}: ${CATEGORY_LABELS[c]}`)
      .join('\n');

    const resultsText = results
      .map((r, i) => `[${i}] 标题: ${r.title}\n内容: ${r.content?.substring(0, 500) || r.snippet}`)
      .join('\n\n---\n\n');

    const prompt = `分类以下搜索结果。

主题: ${this.topic}

分类选项: ${INFO_CATEGORIES.join(', ')}

搜索结果:
${resultsText}

只返回JSON，格式:
{"classifications":[{"index":0,"category":"key_facts","relevance":0.8,"keyInfo":"摘要"}]}

注意:
- index 对应搜索结果编号
- category 必须是分类选项之一
- relevance 0-1 数值
- keyInfo 简短摘要`;

    // 使用新的 LLM 客户端（优先 GLM，失败回退 Haiku）
    interface ClassificationResponse {
      classifications?: Array<{
        index: number;
        category: string;
        relevance?: number;
        keyInfo?: string;
      }>;
    }

    const parsed = await callLLMForJSON<ClassificationResponse>(prompt);
    if (!parsed) {
      console.warn('[ResultProcessor] Failed to parse LLM response, using fallback');
      return this.fallbackCategorize(results);
    }

    const categorized: CategorizedInfo[] = [];

    for (const item of parsed.classifications || []) {
      const result = results[item.index];
      if (result && INFO_CATEGORIES.includes(item.category as InfoCategory)) {
        categorized.push({
          category: item.category as InfoCategory,
          content: item.keyInfo || result.content?.substring(0, 300) || result.snippet || '',
          source: result.title,
          url: result.url,
          relevanceScore: item.relevance || 0.5
        });
      }
    }

    return categorized.length > 0 ? categorized : this.fallbackCategorize(results);
  }

  /**
   * 降级分类（基于规则）
   */
  private fallbackCategorize(results: SearchResultItem[]): CategorizedInfo[] {
    const categorized: CategorizedInfo[] = [];

    const categoryKeywords: Record<InfoCategory, string[]> = {
      background: ['历史', '背景', '起源', 'history', 'background', 'origin', '介绍', 'introduction'],
      key_facts: ['事实', '发现', '研究表明', 'fact', 'found', 'study', 'research', '证明', '表明'],
      latest_updates: ['最新', '近日', '今日', 'latest', 'recent', 'new', 'update', '2024', '2025'],
      opinions: ['认为', '观点', '争议', 'opinion', 'believe', 'think', 'controversial', '批评'],
      statistics: ['数据', '统计', '百分比', '%', 'data', 'statistics', '数字', 'number', '增长'],
      examples: ['例如', '案例', '实例', 'example', 'case', 'instance', '比如'],
      references: ['参考', '引用', '来源', 'reference', 'source', 'cite'],
      other: []
    };

    for (const result of results) {
      const text = `${result.title} ${result.content || result.snippet}`.toLowerCase();
      let bestCategory: InfoCategory = 'other';
      let bestScore = 0;

      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (category === 'other') continue;

        const matchCount = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
        const score = matchCount / keywords.length;

        if (score > bestScore) {
          bestScore = score;
          bestCategory = category as InfoCategory;
        }
      }

      categorized.push({
        category: bestCategory,
        content: result.content?.substring(0, 300) || result.snippet || '',
        source: result.title,
        url: result.url,
        relevanceScore: bestScore > 0 ? bestScore : 0.3
      });
    }

    return categorized;
  }

  /**
   * 生成研究报告
   */
  async generateReport(state: ResearchState): Promise<ResearchReport> {
    const summary = await this.generateSummary(state);

    const report: ResearchReport = {
      topic: state.topic,
      totalRounds: state.currentRound,
      totalTime: Date.now() - state.startTime,
      sourcesCount: state.rawResults.length,
      summary,
      quality: {
        coverageScore: state.coverageScore,
        qualityScore: state.qualityScore,
        confidence: Math.min((state.coverageScore + state.qualityScore) / 200, 1),
        limitations: state.missingAspects.length > 0
          ? [`以下方面信息可能不足: ${state.missingAspects.join(', ')}`]
          : []
      }
    };

    // 根据配置添加原始数据
    if (state.rawResults.length > 0) {
      report.rawData = {
        sources: state.rawResults.slice(0, 20).map(r => ({
          url: r.url,
          title: r.title,
          snippet: r.snippet || r.content?.substring(0, 200) || ''
        })),
        fullContent: Array.from(state.categorizedInfo.values()).flat()
      };
    }

    // 添加探索轨迹
    if (state.explorationHistory.length > 0) {
      report.explorationTrace = state.explorationHistory;
    }

    return report;
  }

  /**
   * 使用 LLM 生成摘要
   */
  private async generateSummary(state: ResearchState): Promise<ResearchReport['summary']> {
    // 收集所有分类信息
    const allInfo: string[] = [];
    const categories: Record<InfoCategory, string[]> = {} as Record<InfoCategory, string[]>;

    for (const category of INFO_CATEGORIES) {
      const items = state.categorizedInfo.get(category) || [];
      categories[category] = items.map(i => i.content);
      allInfo.push(...items.map(i => `[${CATEGORY_LABELS[category]}] ${i.content}`));
    }

    if (allInfo.length === 0) {
      return {
        overview: `关于"${state.topic}"的研究未能收集到足够信息。`,
        keyFindings: [],
        categories
      };
    }

    // 使用 LLM 生成综合摘要
    const prompt = `你是一个研究分析专家。请根据以下收集到的信息，生成一份关于"${state.topic}"的研究摘要。

收集到的信息:
${allInfo.slice(0, 30).join('\n\n')}

请生成:
1. overview: 一段综合概述（100-200字）
2. keyFindings: 3-5个关键发现（每个1-2句话）

以 JSON 格式返回:
{
  "overview": "...",
  "keyFindings": ["...", "..."]
}

只返回 JSON，不要其他内容。`;

    // 使用新的 LLM 客户端（优先 GLM，失败回退 Haiku）
    interface SummaryResponse {
      overview?: string;
      keyFindings?: string[];
    }

    const parsed = await callLLMForJSON<SummaryResponse>(prompt);
    if (parsed) {
      return {
        overview: parsed.overview || '',
        keyFindings: parsed.keyFindings || [],
        categories
      };
    }

    // 降级：简单拼接
    return {
      overview: `关于"${state.topic}"的研究共收集了 ${state.rawResults.length} 个来源的信息，涵盖 ${Object.values(categories).filter(c => c.length > 0).length} 个方面。`,
      keyFindings: allInfo.slice(0, 5),
      categories
    };
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
   * 内容相似度计算（简单 Jaccard）
   */
  private contentSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
