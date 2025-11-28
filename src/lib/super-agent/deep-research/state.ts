// DeepResearch 状态管理

import {
  ResearchState,
  ExplorationStep,
  InfoCategory,
  CategorizedInfo,
  SearchResultItem,
  DeepResearchConfig
} from './types';
import { DEEP_RESEARCH_MAX_ROUNDS } from '@/lib/claude-config';

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: DeepResearchConfig = {
  maxRounds: DEEP_RESEARCH_MAX_ROUNDS, // 从配置文件读取，默认 10 轮
  minCoverageScore: 60,   // 降低最低覆盖分数要求
  minQualityScore: 65,    // 降低最低质量分数要求
  earlyStopThreshold: 75, // 降低早停阈值，更容易早停
  parallelSearches: true,
  includeRawData: false,
  includeTrace: false,
  outputMode: 'adaptive'
};

/**
 * 信息分类列表
 */
export const INFO_CATEGORIES: InfoCategory[] = [
  'background',
  'key_facts',
  'latest_updates',
  'opinions',
  'statistics',
  'examples',
  'references',
  'other'
];

/**
 * 信息分类中文描述
 */
export const CATEGORY_LABELS: Record<InfoCategory, string> = {
  background: '背景信息',
  key_facts: '关键事实',
  latest_updates: '最新动态',
  opinions: '观点/争议',
  statistics: '数据/统计',
  examples: '案例/示例',
  references: '参考资料',
  other: '其他信息'
};

/**
 * 研究状态管理器
 */
export class ResearchStateManager {
  private state: ResearchState;
  private config: DeepResearchConfig;

  constructor(
    topic: string,
    originalQuery: string,
    requiredInfo: string[] = [],
    config: Partial<DeepResearchConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 防御性处理：确保 requiredInfo 是数组
    const safeRequiredInfo = Array.isArray(requiredInfo) ? requiredInfo : [];

    // 初始化状态
    this.state = {
      topic,
      originalQuery,
      requiredInfo: safeRequiredInfo,
      currentRound: 0,
      maxRounds: this.config.maxRounds,
      startTime: Date.now(),
      queriesExecuted: [],
      totalResultsCount: 0,
      rawResults: [],
      categorizedInfo: new Map(),
      coverageScore: 0,
      qualityScore: 0,
      missingAspects: [...safeRequiredInfo],
      isComplete: false,
      explorationHistory: []
    };

    // 初始化分类 Map
    for (const category of INFO_CATEGORIES) {
      this.state.categorizedInfo.set(category, []);
    }
  }

  /**
   * 获取当前状态（只读）
   */
  getState(): Readonly<ResearchState> {
    return this.state;
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<DeepResearchConfig> {
    return this.config;
  }

  /**
   * 开始新一轮探索
   */
  startNewRound(): number {
    this.state.currentRound++;
    return this.state.currentRound;
  }

  /**
   * 记录执行的查询
   */
  addExecutedQueries(queries: string[]): void {
    this.state.queriesExecuted.push(...queries);
  }

  /**
   * 检查查询是否已执行过
   */
  hasExecutedQuery(query: string): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    return this.state.queriesExecuted.some(
      q => q.toLowerCase().trim() === normalizedQuery
    );
  }

  /**
   * 添加原始搜索结果
   */
  addRawResults(results: SearchResultItem[]): void {
    // 去重添加
    const existingUrls = new Set(this.state.rawResults.map(r => r.url));
    const newResults = results.filter(r => !existingUrls.has(r.url));
    this.state.rawResults.push(...newResults);
    this.state.totalResultsCount = this.state.rawResults.length;
  }

  /**
   * 添加分类信息
   */
  addCategorizedInfo(category: InfoCategory, info: CategorizedInfo): void {
    const existing = this.state.categorizedInfo.get(category) || [];

    // 检查重复（基于内容相似度）
    const isDuplicate = existing.some(
      e => this.calculateSimilarity(e.content, info.content) > 0.8
    );

    if (!isDuplicate) {
      existing.push(info);
      this.state.categorizedInfo.set(category, existing);
    }
  }

  /**
   * 批量添加分类信息
   */
  addCategorizedInfoBatch(infoList: CategorizedInfo[]): void {
    for (const info of infoList) {
      this.addCategorizedInfo(info.category, info);
    }
  }

  /**
   * 更新评估分数
   */
  updateScores(coverage: number, quality: number): void {
    this.state.coverageScore = coverage;
    this.state.qualityScore = quality;
  }

  /**
   * 更新缺失方面
   */
  updateMissingAspects(aspects: string[]): void {
    this.state.missingAspects = aspects;
  }

  /**
   * 记录探索步骤
   */
  recordExplorationStep(step: Omit<ExplorationStep, 'timestamp'>): void {
    this.state.explorationHistory.push({
      ...step,
      timestamp: Date.now()
    });
  }

  /**
   * 标记完成
   */
  markComplete(reason?: string): void {
    this.state.isComplete = true;
    if (reason) {
      this.state.earlyStopReason = reason;
    }
  }

  /**
   * 检查是否应该停止
   */
  shouldStop(): { stop: boolean; reason: string } {
    // 已标记完成
    if (this.state.isComplete) {
      return { stop: true, reason: this.state.earlyStopReason || '研究完成' };
    }

    // 达到最大轮数
    if (this.state.currentRound >= this.state.maxRounds) {
      return { stop: true, reason: '达到最大探索轮数' };
    }

    // 达到提前停止阈值
    const avgScore = (this.state.coverageScore + this.state.qualityScore) / 2;
    if (avgScore >= this.config.earlyStopThreshold) {
      return { stop: true, reason: `信息质量达到阈值 (${avgScore.toFixed(1)}%)` };
    }

    // 连续两轮没有新信息
    const history = this.state.explorationHistory;
    if (history.length >= 2) {
      const lastTwo = history.slice(-2);
      if (lastTwo.every(h => h.newInfoCount === 0)) {
        return { stop: true, reason: '连续两轮未获取新信息' };
      }
    }

    return { stop: false, reason: '' };
  }

  /**
   * 获取统计信息
   */
  getStats(): ResearchStats {
    const infoCount: Record<InfoCategory, number> = {} as Record<InfoCategory, number>;
    let totalInfoCount = 0;

    for (const [category, items] of this.state.categorizedInfo) {
      infoCount[category] = items.length;
      totalInfoCount += items.length;
    }

    return {
      currentRound: this.state.currentRound,
      maxRounds: this.state.maxRounds,
      queriesCount: this.state.queriesExecuted.length,
      rawResultsCount: this.state.rawResults.length,
      categorizedInfoCount: totalInfoCount,
      infoByCategory: infoCount,
      coverageScore: this.state.coverageScore,
      qualityScore: this.state.qualityScore,
      elapsedTime: Date.now() - this.state.startTime
    };
  }

  /**
   * 获取已收集的所有 URL
   */
  getCollectedUrls(): string[] {
    return this.state.rawResults.map(r => r.url);
  }

  /**
   * 获取按分类整理的信息摘要
   */
  getCategorizedSummary(): Record<InfoCategory, string[]> {
    const summary: Record<InfoCategory, string[]> = {} as Record<InfoCategory, string[]>;

    for (const [category, items] of this.state.categorizedInfo) {
      summary[category] = items
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 5)
        .map(item => item.content);
    }

    return summary;
  }

  /**
   * 简单的文本相似度计算（Jaccard）
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * 研究统计信息
 */
export interface ResearchStats {
  currentRound: number;
  maxRounds: number;
  queriesCount: number;
  rawResultsCount: number;
  categorizedInfoCount: number;
  infoByCategory: Record<InfoCategory, number>;
  coverageScore: number;
  qualityScore: number;
  elapsedTime: number;
}
