// DeepResearch 智能体模块导出

// 类型导出
export type {
  SearchResultItem,
  InfoCategory,
  CategorizedInfo,
  ResearchState,
  ExplorationStep,
  SearchPlan,
  SearchQuery,
  SufficiencyEvaluation,
  ResearchReport,
  DeepResearchConfig,
  ResearchProgressEvent,
  ProgressEventSender,
  DeepResearchInput,
  DeepResearchOutput
} from './types';

// 状态管理
export {
  ResearchStateManager,
  DEFAULT_CONFIG,
  INFO_CATEGORIES,
  CATEGORY_LABELS
} from './state';
export type { ResearchStats } from './state';

// 搜索工具
export {
  ExaSearchClient,
  TavilySearchClient,
  UnifiedSearchManager,
  searchManager
} from './search-tools';
export type { SearchStats } from './search-tools';

// 结果处理
export { ResultProcessor } from './result-processor';

// 评估器
export { SufficiencyEvaluator } from './evaluator';

// 核心智能体
export { DeepResearchAgent, runDeepResearch } from './agent';
