// Claude 模型统一配置
// 通过环境变量配置，修改后重启服务即可生效

/**
 * Claude 模型配置
 *
 * 支持的模型:
 * - claude-opus-4-5-20251101 (最强，max output: 32K) ⭐ 推荐用于 SuperAgent
 * - claude-sonnet-4-5-20250929 (平衡，max output: 64K)
 * - claude-sonnet-4-20250514 (max output: 64K)
 * - claude-haiku-4-5-20251001 (max output: 8K, 最快最便宜)
 */

// 主模型 - 用于 SuperAgent ReAct 循环等核心任务
// 使用 Sonnet 4.5：平衡性能和兼容性
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

// 主模型最大输出 tokens（Sonnet 4.5 最大支持 64K）
export const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || '64000', 10);

// 轻量模型 - 用于简单任务如分类、评估等
// 使用 Haiku 4.5：最快最便宜，适合结构化输出任务
export const CLAUDE_LIGHT_MODEL = process.env.CLAUDE_LIGHT_MODEL || 'claude-haiku-4-5-20251001';

// 轻量模型最大输出 tokens（Haiku 4.5 最大支持 8K）
export const CLAUDE_LIGHT_MAX_TOKENS = parseInt(process.env.CLAUDE_LIGHT_MAX_TOKENS || '8192', 10);

// DeepResearch 最大轮数
export const DEEP_RESEARCH_MAX_ROUNDS = parseInt(process.env.DEEP_RESEARCH_MAX_ROUNDS || '10', 10);

// 导出配置对象，方便一次性获取所有配置
export const claudeConfig = {
  model: CLAUDE_MODEL,
  maxTokens: CLAUDE_MAX_TOKENS,
  lightModel: CLAUDE_LIGHT_MODEL,
  lightMaxTokens: CLAUDE_LIGHT_MAX_TOKENS,
  deepResearchMaxRounds: DEEP_RESEARCH_MAX_ROUNDS,
} as const;

// 日志输出当前配置（仅在服务启动时）
if (typeof window === 'undefined') {
  console.log('[Claude Config] Loaded configuration:');
  console.log(`  - Model: ${CLAUDE_MODEL}`);
  console.log(`  - Max Tokens: ${CLAUDE_MAX_TOKENS}`);
  console.log(`  - Light Model: ${CLAUDE_LIGHT_MODEL}`);
  console.log(`  - Light Max Tokens: ${CLAUDE_LIGHT_MAX_TOKENS}`);
  console.log(`  - DeepResearch Max Rounds: ${DEEP_RESEARCH_MAX_ROUNDS}`);
}
