// DeepResearch 结果处理器 - 去重、分类、摘要

import Anthropic from '@anthropic-ai/sdk';
import {
  SearchResultItem,
  InfoCategory,
  CategorizedInfo,
  ResearchReport,
  ResearchState
} from './types';
import { CATEGORY_LABELS, INFO_CATEGORIES } from './state';
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS } from '@/lib/claude-config';

// Anthropic 客户端
const anthropic = new Anthropic();

/**
 * 结果处理器
 */
export class ResultProcessor {
  private topic: string;

  constructor(topic: string) {
    this.topic = topic;
  }

  /**
   * 处理搜索结果：去重 + 分类
   */
  async processResults(
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

    // 2. 使用 LLM 进行智能分类
    const categorized = await this.categorizeWithLLM(uniqueResults);

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

    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const batchCategorized = await this.categorizeBatch(batch);
      categorized.push(...batchCategorized);
    }

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

    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_LIGHT_MODEL,
        max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return this.fallbackCategorize(results);
      }

      // 尝试多种方式提取和解析 JSON
      const parsed = this.safeParseJSON(content.text);
      if (!parsed) {
        console.warn('[ResultProcessor] Failed to parse LLM response, using fallback. Response:', content.text.substring(0, 200));
        return this.fallbackCategorize(results);
      }

      const categorized: CategorizedInfo[] = [];

      for (const item of parsed.classifications || []) {
        const result = results[item.index];
        if (result && INFO_CATEGORIES.includes(item.category)) {
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
    } catch (error) {
      console.error('[ResultProcessor] LLM categorization error:', error);
      return this.fallbackCategorize(results);
    }
  }

  /**
   * 安全解析 JSON，支持多种容错方式
   */
  private safeParseJSON(text: string): any {
    // 1. 尝试直接提取 JSON 对象
    const jsonMatches = text.match(/\{[\s\S]*\}/g);
    if (!jsonMatches) return null;

    for (const jsonStr of jsonMatches) {
      // 尝试直接解析
      try {
        return JSON.parse(jsonStr);
      } catch {
        // 继续尝试修复
      }

      // 2. 尝试修复常见问题
      let fixed = jsonStr
        // 移除尾部多余的逗号
        .replace(/,\s*([}\]])/g, '$1')
        // 修复缺失的引号
        .replace(/:\s*([^"\d\[\]{},\s][^,}\]]*)/g, ': "$1"')
        // 修复单引号
        .replace(/'/g, '"');

      try {
        return JSON.parse(fixed);
      } catch {
        // 继续尝试
      }

      // 3. 尝试只提取 classifications 数组
      const arrayMatch = jsonStr.match(/"classifications"\s*:\s*\[([\s\S]*?)\]/);
      if (arrayMatch) {
        try {
          const arrayStr = `[${arrayMatch[1]}]`
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/,\s*$/g, '');
          const arr = JSON.parse(arrayStr);
          return { classifications: arr };
        } catch {
          // 放弃
        }
      }
    }

    return null;
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

    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_LIGHT_MODEL,
        max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            overview: parsed.overview || '',
            keyFindings: parsed.keyFindings || [],
            categories
          };
        }
      }
    } catch (error) {
      console.error('[ResultProcessor] Summary generation error:', error);
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
