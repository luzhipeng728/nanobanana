// DeepResearch 智能体核心实现

import {
  DeepResearchConfig,
  DeepResearchInput,
  ResearchReport,
  ProgressEventSender,
  ResearchProgressEvent,
  SearchQuery
} from './types';
import { ResearchStateManager, DEFAULT_CONFIG } from './state';
import { UnifiedSearchManager } from './search-tools';
import { ResultProcessor } from './result-processor';
import { SufficiencyEvaluator } from './evaluator';

/**
 * DeepResearch 智能体
 *
 * 一个自主探索、收集和整理信息的子智能体。
 * 采用迭代式搜索策略，通过规则+LLM混合评估判断信息充足度。
 */
export class DeepResearchAgent {
  private config: DeepResearchConfig;
  private stateManager: ResearchStateManager;
  private searchManager: UnifiedSearchManager;
  private resultProcessor: ResultProcessor;
  private evaluator: SufficiencyEvaluator;
  private sendEvent: ProgressEventSender;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private dateRestrict?: string; // 日期限制参数

  constructor(
    input: DeepResearchInput,
    sendEvent: ProgressEventSender,
    config: Partial<DeepResearchConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 覆盖配置
    if (input.maxRounds) {
      this.config.maxRounds = input.maxRounds;
    }
    if (input.outputMode) {
      this.config.outputMode = input.outputMode;
    }

    // 保存日期限制
    this.dateRestrict = input.dateRestrict;

    this.sendEvent = sendEvent;

    // 初始化组件
    this.stateManager = new ResearchStateManager(
      input.topic,
      input.context || input.topic,
      input.requiredInfo || [],
      this.config
    );

    this.searchManager = new UnifiedSearchManager(sendEvent);
    this.resultProcessor = new ResultProcessor(input.topic, sendEvent);
    this.evaluator = new SufficiencyEvaluator(
      input.topic,
      input.requiredInfo || [],
      this.config.minCoverageScore,
      this.config.minQualityScore,
      sendEvent
    );
  }

  /**
   * 启动心跳，防止 Cloudflare 等代理超时
   * 每 25 秒发送一次心跳事件
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const stats = this.stateManager.getStats();
      await this.sendEvent({
        type: 'processing',
        action: `持续研究中... 已收集 ${stats.categorizedInfoCount} 条信息`
      });
    }, 25000); // 25 秒，小于 Cloudflare 的 100 秒超时
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 执行深度研究
   */
  async run(): Promise<ResearchReport> {
    const state = this.stateManager.getState();

    console.log(`[DeepResearchAgent] Starting research on: ${state.topic}`);

    // 启动心跳
    this.startHeartbeat();

    // 发送开始事件
    await this.sendEvent({
      type: 'start',
      topic: state.topic,
      config: this.config
    });

    try {
      // 主探索循环
      while (!this.stateManager.getState().isComplete) {
        const shouldStop = this.stateManager.shouldStop();
        if (shouldStop.stop) {
          console.log(`[DeepResearchAgent] Stopping: ${shouldStop.reason}`);
          this.stateManager.markComplete(shouldStop.reason);
          break;
        }

        await this.executeRound();
      }

      // 发送报告生成开始事件
      await this.sendEvent({
        type: 'report_start'
      });

      // 生成最终报告
      const report = await this.resultProcessor.generateReport(
        this.stateManager.getState()
      );

      // 发送报告完成事件
      await this.sendEvent({
        type: 'report_complete'
      });

      // 发送完成事件
      await this.sendEvent({
        type: 'complete',
        report
      });

      console.log(
        `[DeepResearchAgent] Research complete. ` +
        `Rounds: ${state.currentRound}, Sources: ${report.sourcesCount}, ` +
        `Quality: ${report.quality.qualityScore.toFixed(1)}%`
      );

      return report;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('[DeepResearchAgent] Error:', error);

      await this.sendEvent({
        type: 'error',
        error: errorMessage
      });

      // 返回部分报告
      return this.createErrorReport(errorMessage);
    } finally {
      // 确保停止心跳
      this.stopHeartbeat();
    }
  }

  /**
   * 执行一轮探索
   */
  private async executeRound(): Promise<void> {
    const round = this.stateManager.startNewRound();
    const state = this.stateManager.getState();

    console.log(`[DeepResearchAgent] Round ${round}/${state.maxRounds}`);

    // 1. 评估当前状态，生成搜索计划
    const evaluation = await this.evaluator.evaluate(state);
    const searchPlan = await this.evaluator.generateSearchPlan(state, evaluation);

    // 更新分数
    this.stateManager.updateScores(evaluation.ruleBasedScore, evaluation.llmScore);
    this.stateManager.updateMissingAspects(evaluation.missingCriticalInfo);

    // 检查是否已充足
    if (evaluation.isSufficient && round > 1) {
      console.log(`[DeepResearchAgent] Information sufficient (score: ${evaluation.overallScore.toFixed(1)})`);
      this.stateManager.markComplete('信息已充足');
      return;
    }

    // 如果没有新查询可执行
    if (searchPlan.queries.length === 0) {
      console.log('[DeepResearchAgent] No new queries to execute');
      this.stateManager.markComplete('无更多可探索内容');
      return;
    }

    // 如果有日期限制，给所有查询添加
    if (this.dateRestrict) {
      searchPlan.queries.forEach(q => {
        q.dateRestrict = this.dateRestrict;
      });
      console.log(`[DeepResearchAgent] Applied date restriction: ${this.dateRestrict}`);
    }

    // 发送轮次开始事件
    await this.sendEvent({
      type: 'round_start',
      round,
      maxRounds: state.maxRounds,
      queries: searchPlan.queries.map(q => q.query)
    });

    // 2. 执行搜索
    const { results, stats } = await this.searchManager.parallelSearch(searchPlan.queries);

    // 记录执行的查询
    this.stateManager.addExecutedQueries(searchPlan.queries.map(q => q.query));

    // 发送搜索完成事件
    await this.sendEvent({
      type: 'search_complete',
      source: 'parallel',
      resultsCount: results.length
    });

    // 3. 处理结果（使用 GLM 智能分类，速度快效果好）
    await this.sendEvent({
      type: 'processing',
      action: '使用 AI 分析和分类搜索结果'
    });

    const existingUrls = new Set(this.stateManager.getCollectedUrls());
    const { uniqueResults, categorized } = await this.resultProcessor.processResults(
      results,
      existingUrls
    );

    // 添加到状态
    this.stateManager.addRawResults(uniqueResults);
    this.stateManager.addCategorizedInfoBatch(categorized);

    // 4. 记录探索步骤
    // 基于实际收集的结果重新计算分数
    const totalResults = this.stateManager.getState().rawResults.length;
    const totalCategorized = this.stateManager.getStats().categorizedInfoCount;

    // 覆盖分数：基于结果数量和分类数量
    const coverageScore = Math.min(
      (totalResults / 50) * 50 + (totalCategorized / 20) * 50,
      100
    );

    // 质量分数：基于分类信息的丰富度
    let qualityScore: number;
    if (totalResults >= 50 && totalCategorized >= 15) {
      qualityScore = 80;
    } else if (totalResults >= 30 && totalCategorized >= 10) {
      qualityScore = 70;
    } else if (totalResults >= 15 && totalCategorized >= 5) {
      qualityScore = 60;
    } else {
      qualityScore = 50;
    }

    this.stateManager.recordExplorationStep({
      round,
      queries: searchPlan.queries.map(q => q.query),
      resultsCount: results.length,
      newInfoCount: categorized.length,
      coverageAfter: coverageScore,
      qualityAfter: qualityScore,
      decision: evaluation.recommendation,
      reasoning: searchPlan.reasoning
    });

    // 更新分数
    this.stateManager.updateScores(coverageScore, qualityScore);
    console.log(`[DeepResearchAgent] Scores updated - Coverage: ${coverageScore.toFixed(1)}%, Quality: ${qualityScore.toFixed(1)}%`);

    // 发送评估事件
    await this.sendEvent({
      type: 'evaluation',
      scores: {
        coverage: coverageScore,
        quality: qualityScore
      },
      decision: evaluation.recommendation
    });

    // 发送轮次完成事件
    await this.sendEvent({
      type: 'round_complete',
      round,
      newInfoCount: categorized.length,
      totalInfoCount: this.stateManager.getStats().categorizedInfoCount
    });

    // 5. 根据评估结果决定下一步（复用之前的 evaluation）
    if (evaluation.recommendation === 'pivot') {
      await this.sendEvent({
        type: 'pivot',
        reason: '当前策略效果不佳',
        newDirection: '尝试不同的搜索角度'
      });
    }

    // 添加延迟避免 API 限流
    await this.delay(300);
  }

  /**
   * 创建错误报告
   */
  private createErrorReport(error: string): ResearchReport {
    const state = this.stateManager.getState();
    const stats = this.stateManager.getStats();

    return {
      topic: state.topic,
      totalRounds: state.currentRound,
      totalTime: Date.now() - state.startTime,
      sourcesCount: stats.rawResultsCount,
      summary: {
        overview: `研究过程中发生错误: ${error}`,
        keyFindings: [],
        categories: this.stateManager.getCategorizedSummary()
      },
      quality: {
        coverageScore: stats.coverageScore,
        qualityScore: stats.qualityScore,
        confidence: 0,
        limitations: [`研究未完成: ${error}`]
      },
      explorationTrace: state.explorationHistory
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 便捷函数：执行深度研究
 */
export async function runDeepResearch(
  input: DeepResearchInput,
  sendEvent: ProgressEventSender,
  config?: Partial<DeepResearchConfig>
): Promise<ResearchReport> {
  const agent = new DeepResearchAgent(input, sendEvent, config);
  return agent.run();
}
