// DeepResearch 充足度评估器 - 规则 + LLM 混合判断

import Anthropic from '@anthropic-ai/sdk';
import {
  SufficiencyEvaluation,
  ResearchState,
  InfoCategory,
  SearchQuery,
  SearchPlan
} from './types';
import { INFO_CATEGORIES, CATEGORY_LABELS } from './state';

const anthropic = new Anthropic();

/**
 * 充足度评估器
 */
export class SufficiencyEvaluator {
  private topic: string;
  private requiredInfo: string[];
  private minCoverage: number;
  private minQuality: number;

  constructor(
    topic: string,
    requiredInfo: string[] = [],
    minCoverage: number = 70,
    minQuality: number = 75
  ) {
    this.topic = topic;
    this.requiredInfo = requiredInfo;
    this.minCoverage = minCoverage;
    this.minQuality = minQuality;
  }

  /**
   * 综合评估信息充足度
   */
  async evaluate(state: ResearchState): Promise<SufficiencyEvaluation> {
    // 1. 规则评估
    const ruleEval = this.ruleBasedEvaluation(state);

    // 2. LLM 评估
    const llmEval = await this.llmEvaluation(state);

    // 3. 综合判断
    const overallScore = this.combineScores(ruleEval.score, llmEval.score);
    const isSufficient = this.determineSufficiency(overallScore, ruleEval, llmEval);

    return {
      // 规则评估
      ruleBasedScore: ruleEval.score,
      coverageByCategory: ruleEval.coverageByCategory,
      minRequirementsMet: ruleEval.minRequirementsMet,

      // LLM 评估
      llmScore: llmEval.score,
      llmReasoning: llmEval.reasoning,
      missingCriticalInfo: llmEval.missingCriticalInfo,
      suggestedQueries: llmEval.suggestedQueries,

      // 综合判断
      overallScore,
      isSufficient,
      confidence: this.calculateConfidence(ruleEval, llmEval),
      recommendation: this.getRecommendation(overallScore, llmEval)
    };
  }

  /**
   * 规则评估
   */
  private ruleBasedEvaluation(state: ResearchState): {
    score: number;
    coverageByCategory: Record<InfoCategory, number>;
    minRequirementsMet: boolean;
  } {
    const coverageByCategory: Record<InfoCategory, number> = {} as Record<InfoCategory, number>;

    // 计算每个分类的覆盖率
    let totalCoverage = 0;
    let categoriesWithContent = 0;

    for (const category of INFO_CATEGORIES) {
      const items = state.categorizedInfo.get(category) || [];
      // 每个分类期望至少 2 条高质量信息
      const coverage = Math.min(items.length / 2, 1) * 100;
      coverageByCategory[category] = coverage;

      totalCoverage += coverage;
      if (items.length > 0) {
        categoriesWithContent++;
      }
    }

    // 计算总体分数
    const avgCoverage = totalCoverage / INFO_CATEGORIES.length;

    // 检查必需信息是否满足
    let requiredInfoMet = 0;
    for (const info of this.requiredInfo) {
      const infoLower = info.toLowerCase();
      let found = false;

      for (const [, items] of state.categorizedInfo) {
        if (items.some(item =>
          item.content.toLowerCase().includes(infoLower) ||
          item.source.toLowerCase().includes(infoLower)
        )) {
          found = true;
          break;
        }
      }

      if (found) requiredInfoMet++;
    }

    const requiredInfoScore = this.requiredInfo.length > 0
      ? (requiredInfoMet / this.requiredInfo.length) * 100
      : 100;

    // 综合规则分数
    const score = (avgCoverage * 0.6) + (requiredInfoScore * 0.4);

    // 最低要求：至少 3 个分类有内容，且总结果 >= 5
    const minRequirementsMet = categoriesWithContent >= 3 && state.rawResults.length >= 5;

    return { score, coverageByCategory, minRequirementsMet };
  }

  /**
   * LLM 评估
   */
  private async llmEvaluation(state: ResearchState): Promise<{
    score: number;
    reasoning: string;
    missingCriticalInfo: string[];
    suggestedQueries: string[];
  }> {
    // 收集当前信息摘要
    const infoSummary: string[] = [];
    for (const [category, items] of state.categorizedInfo) {
      if (items.length > 0) {
        infoSummary.push(
          `【${CATEGORY_LABELS[category]}】(${items.length} 条)\n` +
          items.slice(0, 3).map(i => `  - ${i.content.substring(0, 100)}`).join('\n')
        );
      }
    }

    const prompt = `你是一个研究质量评估专家。请评估以下研究的信息充足度。

研究主题: ${this.topic}
原始查询: ${state.originalQuery}
${this.requiredInfo.length > 0 ? `需要收集的信息: ${this.requiredInfo.join(', ')}` : ''}

当前已收集信息:
${infoSummary.length > 0 ? infoSummary.join('\n\n') : '暂无收集到的信息'}

搜索轮次: ${state.currentRound}/${state.maxRounds}
总结果数: ${state.rawResults.length}

请评估:
1. 当前信息是否足够回答原始问题？(0-100 分)
2. 还缺少哪些关键信息？
3. 如果需要继续搜索，建议什么查询？

以 JSON 格式返回:
{
  "score": 75,
  "reasoning": "评估理由（1-2句话）",
  "missingCriticalInfo": ["缺失信息1", "缺失信息2"],
  "suggestedQueries": ["建议查询1", "建议查询2"]
}

只返回 JSON，不要其他内容。`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const parsed = this.safeParseJSON(content.text);
        if (parsed) {
          return {
            score: parsed.score || 50,
            reasoning: parsed.reasoning || '',
            missingCriticalInfo: parsed.missingCriticalInfo || [],
            suggestedQueries: parsed.suggestedQueries || []
          };
        }
      }
    } catch (error) {
      console.error('[Evaluator] LLM evaluation error:', error);
    }

    // 降级评估
    return {
      score: state.rawResults.length >= 10 ? 60 : 40,
      reasoning: '无法进行 LLM 评估，使用降级策略',
      missingCriticalInfo: this.requiredInfo.filter(
        info => !infoSummary.some(s => s.toLowerCase().includes(info.toLowerCase()))
      ),
      suggestedQueries: [`${this.topic} 详细信息`, `${this.topic} 最新进展`]
    };
  }

  /**
   * 综合分数
   */
  private combineScores(ruleScore: number, llmScore: number): number {
    // 加权平均：规则 40%，LLM 60%
    return ruleScore * 0.4 + llmScore * 0.6;
  }

  /**
   * 判断是否充足
   */
  private determineSufficiency(
    overallScore: number,
    ruleEval: { minRequirementsMet: boolean },
    llmEval: { missingCriticalInfo: string[] }
  ): boolean {
    // 必须满足最低要求
    if (!ruleEval.minRequirementsMet) {
      return false;
    }

    // 如果有关键信息缺失，不能认为充足
    if (llmEval.missingCriticalInfo.length > 2) {
      return false;
    }

    // 分数达标
    return overallScore >= this.minCoverage;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    ruleEval: { score: number },
    llmEval: { score: number }
  ): number {
    // 两个评估分数越接近，置信度越高
    const diff = Math.abs(ruleEval.score - llmEval.score);
    const agreement = 1 - (diff / 100);

    // 综合置信度
    return Math.min(agreement * 0.7 + 0.3, 1);
  }

  /**
   * 获取推荐行动
   */
  private getRecommendation(
    overallScore: number,
    llmEval: { suggestedQueries: string[] }
  ): 'stop' | 'continue' | 'pivot' {
    if (overallScore >= 85) {
      return 'stop';
    }

    if (overallScore >= 60 && llmEval.suggestedQueries.length === 0) {
      return 'stop';
    }

    if (overallScore < 40) {
      return 'pivot'; // 可能需要换个搜索策略
    }

    return 'continue';
  }

  /**
   * 生成下一轮搜索计划
   */
  async generateSearchPlan(
    state: ResearchState,
    evaluation: SufficiencyEvaluation
  ): Promise<SearchPlan> {
    // 根据评估结果决定策略
    const strategy = this.determineStrategy(state, evaluation);

    // 生成查询
    const queries = await this.generateQueries(state, evaluation, strategy);

    return {
      queries,
      strategy,
      reasoning: this.explainStrategy(strategy, evaluation)
    };
  }

  /**
   * 决定搜索策略
   */
  private determineStrategy(
    state: ResearchState,
    evaluation: SufficiencyEvaluation
  ): 'broad' | 'deep' | 'comparative' | 'verification' {
    const round = state.currentRound;

    // 前期：广度优先
    if (round <= 2) {
      return 'broad';
    }

    // 中期：根据缺失信息深入
    if (evaluation.missingCriticalInfo.length > 0) {
      return 'deep';
    }

    // 后期：验证和补充
    if (evaluation.overallScore >= 70) {
      return 'verification';
    }

    // 如果覆盖率低，尝试对比搜索
    return 'comparative';
  }

  /**
   * 生成搜索查询
   */
  private async generateQueries(
    state: ResearchState,
    evaluation: SufficiencyEvaluation,
    strategy: string
  ): Promise<SearchQuery[]> {
    const queries: SearchQuery[] = [];
    const executedQueries = new Set(state.queriesExecuted.map(q => q.toLowerCase()));

    // 优先使用 LLM 建议的查询
    for (const suggested of evaluation.suggestedQueries.slice(0, 2)) {
      if (!executedQueries.has(suggested.toLowerCase())) {
        queries.push({
          query: suggested,
          searchType: 'neural',
          targetInfo: [],
          source: 'both',
          priority: 5
        });
      }
    }

    // 根据缺失信息生成查询
    for (const missing of evaluation.missingCriticalInfo.slice(0, 2)) {
      const query = `${this.topic} ${missing}`;
      if (!executedQueries.has(query.toLowerCase())) {
        queries.push({
          query,
          searchType: 'auto',
          targetInfo: [missing],
          source: 'both',
          priority: 4
        });
      }
    }

    // 根据策略补充查询
    if (queries.length < 3) {
      const strategyQueries = this.getStrategyQueries(strategy, state);
      for (const q of strategyQueries) {
        if (!executedQueries.has(q.query.toLowerCase()) && queries.length < 4) {
          queries.push(q);
        }
      }
    }

    return queries;
  }

  /**
   * 根据策略生成查询
   */
  private getStrategyQueries(
    strategy: string,
    state: ResearchState
  ): SearchQuery[] {
    const topic = this.topic;

    switch (strategy) {
      case 'broad':
        return [
          { query: `${topic} 概述 介绍`, searchType: 'auto', targetInfo: [], source: 'both', priority: 3 },
          { query: `${topic} 最新 动态`, searchType: 'neural', targetInfo: ['latest_updates'], source: 'exa', priority: 3 }
        ];

      case 'deep':
        return [
          { query: `${topic} 详细分析`, searchType: 'neural', targetInfo: [], source: 'exa', priority: 3 },
          { query: `${topic} 专业解读`, searchType: 'neural', targetInfo: [], source: 'both', priority: 3 }
        ];

      case 'comparative':
        return [
          { query: `${topic} 对比 比较`, searchType: 'auto', targetInfo: ['opinions'], source: 'both', priority: 3 },
          { query: `${topic} 优缺点 利弊`, searchType: 'auto', targetInfo: ['opinions'], source: 'both', priority: 3 }
        ];

      case 'verification':
        return [
          { query: `${topic} 数据 统计`, searchType: 'auto', targetInfo: ['statistics'], source: 'both', priority: 3 },
          { query: `${topic} 案例 实例`, searchType: 'auto', targetInfo: ['examples'], source: 'both', priority: 3 }
        ];

      default:
        return [];
    }
  }

  /**
   * 解释策略
   */
  private explainStrategy(
    strategy: string,
    evaluation: SufficiencyEvaluation
  ): string {
    switch (strategy) {
      case 'broad':
        return '采用广度优先策略，收集主题的基础信息';
      case 'deep':
        return `针对缺失信息进行深度搜索: ${evaluation.missingCriticalInfo.slice(0, 2).join(', ')}`;
      case 'comparative':
        return '采用对比搜索策略，收集多角度观点';
      case 'verification':
        return '采用验证策略，补充数据和案例支撑';
      default:
        return '继续探索';
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
        // 修复单引号
        .replace(/'/g, '"');

      try {
        return JSON.parse(fixed);
      } catch {
        // 继续尝试
      }

      // 3. 尝试提取关键字段
      try {
        const scoreMatch = jsonStr.match(/"score"\s*:\s*(\d+)/);
        const reasoningMatch = jsonStr.match(/"reasoning"\s*:\s*"([^"]*)"/);

        if (scoreMatch) {
          return {
            score: parseInt(scoreMatch[1], 10),
            reasoning: reasoningMatch ? reasoningMatch[1] : '',
            missingCriticalInfo: [],
            suggestedQueries: []
          };
        }
      } catch {
        // 放弃
      }
    }

    return null;
  }
}
