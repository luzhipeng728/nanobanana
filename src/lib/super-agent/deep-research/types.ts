// DeepResearch 智能体类型定义

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  id: string;
  url: string;
  title: string;
  content: string;
  snippet?: string;
  publishedDate?: string;
  author?: string;
  source: 'google' | 'exa' | 'tavily';
  score?: number;
  highlights?: string[];
}

/**
 * 信息分类类型
 */
export type InfoCategory =
  | 'background'      // 背景信息
  | 'key_facts'       // 关键事实
  | 'latest_updates'  // 最新动态
  | 'opinions'        // 观点/争议
  | 'statistics'      // 数据/统计
  | 'examples'        // 案例/示例
  | 'references'      // 参考资料
  | 'other';          // 其他

/**
 * 分类后的信息项
 */
export interface CategorizedInfo {
  category: InfoCategory;
  content: string;
  source: string;
  url: string;
  relevanceScore: number;
}

/**
 * 研究状态
 */
export interface ResearchState {
  // 基本信息
  topic: string;
  originalQuery: string;
  requiredInfo: string[];

  // 进度追踪
  currentRound: number;
  maxRounds: number;
  startTime: number;

  // 搜索状态
  queriesExecuted: string[];
  totalResultsCount: number;

  // 收集的信息
  rawResults: SearchResultItem[];
  categorizedInfo: Map<InfoCategory, CategorizedInfo[]>;

  // 评估状态
  coverageScore: number;        // 0-100
  qualityScore: number;         // 0-100
  missingAspects: string[];     // 缺失的方面

  // 控制标志
  isComplete: boolean;
  earlyStopReason?: string;

  // 探索历史
  explorationHistory: ExplorationStep[];
}

/**
 * 探索步骤记录
 */
export interface ExplorationStep {
  round: number;
  queries: string[];
  resultsCount: number;
  newInfoCount: number;
  coverageAfter: number;
  qualityAfter: number;
  decision: 'continue' | 'stop' | 'pivot';
  reasoning: string;
  timestamp: number;
}

/**
 * 搜索查询计划
 */
export interface SearchPlan {
  queries: SearchQuery[];
  strategy: 'broad' | 'deep' | 'comparative' | 'verification';
  reasoning: string;
}

/**
 * 单个搜索查询
 */
export interface SearchQuery {
  query: string;
  searchType: 'neural' | 'keyword' | 'auto';
  targetInfo: string[];           // 目标获取的信息类型
  source: 'google' | 'exa' | 'tavily' | 'both';
  priority: number;               // 1-5, 5 最高
  dateRestrict?: string;          // 日期限制，如 'd1', 'd7', 'm1'
}

/**
 * 充足度评估结果
 */
export interface SufficiencyEvaluation {
  // 规则评估
  ruleBasedScore: number;         // 0-100
  coverageByCategory: Record<InfoCategory, number>;
  minRequirementsMet: boolean;

  // LLM 评估
  llmScore: number;               // 0-100
  llmReasoning: string;
  missingCriticalInfo: string[];
  suggestedQueries: string[];

  // 综合判断
  overallScore: number;           // 0-100
  isSufficient: boolean;
  confidence: number;             // 0-1
  recommendation: 'stop' | 'continue' | 'pivot';
}

/**
 * 研究报告 - 最终输出
 */
export interface ResearchReport {
  // 元信息
  topic: string;
  totalRounds: number;
  totalTime: number;              // 毫秒
  sourcesCount: number;

  // 结构化摘要
  summary: {
    overview: string;             // 总体概述
    keyFindings: string[];        // 关键发现
    categories: Record<InfoCategory, string[]>;
  };

  // 原始数据（可选，根据输出模式）
  rawData?: {
    sources: Array<{
      url: string;
      title: string;
      snippet: string;
    }>;
    fullContent: CategorizedInfo[];
  };

  // 质量指标
  quality: {
    coverageScore: number;
    qualityScore: number;
    confidence: number;
    limitations: string[];
  };

  // 探索轨迹（可选）
  explorationTrace?: ExplorationStep[];
}

/**
 * DeepResearch 配置选项
 */
export interface DeepResearchConfig {
  maxRounds: number;              // 最大搜索轮数，默认 10
  minCoverageScore: number;       // 最低覆盖率阈值，默认 70
  minQualityScore: number;        // 最低质量阈值，默认 75
  earlyStopThreshold: number;     // 提前停止阈值，默认 85
  parallelSearches: boolean;      // 是否并行搜索，默认 true
  includeRawData: boolean;        // 是否包含原始数据，默认 false
  includeTrace: boolean;          // 是否包含探索轨迹，默认 false
  outputMode: 'summary' | 'detailed' | 'adaptive';
}

/**
 * 进度事件 - 用于流式报告
 */
export type ResearchProgressEvent =
  | { type: 'start'; topic: string; config: DeepResearchConfig }
  | { type: 'round_start'; round: number; maxRounds: number; queries: string[] }
  // 搜索相关事件
  | { type: 'search_start'; query: string; source: string }
  | { type: 'search_result'; query: string; resultsCount: number; totalTime?: number }
  | { type: 'search_complete'; source: string; resultsCount: number }
  // 处理相关事件
  | { type: 'processing'; action: string }
  | { type: 'dedup_complete'; before: number; after: number }
  | { type: 'categorize_start'; totalResults: number; batchCount: number }
  | { type: 'categorize_batch'; batch: number; total: number; itemsProcessed: number }
  | { type: 'categorize_complete'; totalCategorized: number }
  // 评估相关事件
  | { type: 'evaluation_start'; round: number }
  | { type: 'evaluation_rule'; ruleScore: number; categoryCoverage: Record<string, number> }
  | { type: 'evaluation_llm_start' }
  | { type: 'evaluation_llm_complete'; llmScore: number; missingInfo: string[]; suggestedQueries: string[] }
  | { type: 'evaluation'; scores: { coverage: number; quality: number }; decision: string }
  // 搜索计划事件
  | { type: 'plan_start'; strategy: string }
  | { type: 'plan_complete'; queriesCount: number; reasoning: string }
  // 轮次事件
  | { type: 'round_complete'; round: number; newInfoCount: number; totalInfoCount: number }
  | { type: 'pivot'; reason: string; newDirection: string }
  // 报告生成事件
  | { type: 'report_start' }
  | { type: 'report_summary_start' }
  | { type: 'report_summary_chunk'; chunk: string }  // 摘要流式输出
  | { type: 'report_summary_complete' }
  | { type: 'report_complete' }
  // 完成和错误
  | { type: 'complete'; report: ResearchReport }
  | { type: 'error'; error: string };

/**
 * 事件发送器类型
 */
export type ProgressEventSender = (event: ResearchProgressEvent) => Promise<void>;

/**
 * DeepResearch 工具输入参数
 */
export interface DeepResearchInput {
  topic: string;                  // 研究主题
  context?: string;               // 上下文信息
  requiredInfo?: string[];        // 需要获取的信息类型
  outputMode?: 'summary' | 'detailed' | 'adaptive';
  maxRounds?: number;             // 覆盖默认最大轮数
  dateRestrict?: string;          // 日期限制，如 'd1'=今天, 'd7'=一周内, 'm1'=一个月内
}

/**
 * DeepResearch 工具输出
 */
export interface DeepResearchOutput {
  success: boolean;
  report?: ResearchReport;
  error?: string;
  shouldContinue: boolean;
}
