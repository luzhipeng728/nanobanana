// 超级智能体类型定义

// ========== 技能相关类型 ==========

export type SkillCategory =
  | 'product-display'    // 产品展示
  | 'tutorial'           // 教程图解
  | 'storytelling'       // 故事场景
  | 'data-visualization' // 数据可视化
  | 'architecture'       // 架构图
  | 'lifestyle';         // 生活场景

export interface SkillMetadata {
  id: string;                    // 技能唯一标识
  name: string;                  // 技能名称
  description: string;           // 技能描述（用于匹配）
  keywords: string[];            // 触发关键词
  category: SkillCategory;       // 技能分类
  difficulty: 'easy' | 'medium' | 'hard';  // 复杂度
  requiredInputs: string[];      // 必需的用户输入
  optionalInputs: string[];      // 可选的用户输入
}

export interface SkillVariable {
  name: string;          // 变量名
  description: string;   // 变量说明
  type: 'text' | 'list' | 'color' | 'style';
  required: boolean;
  defaultValue?: string;
  examples: string[];
}

export interface SkillExample {
  userRequest: string;   // 用户原始需求
  filledPrompt: string;  // 填充后的提示词
  chineseTexts: string[]; // 中文文字清单
}

export interface CommonIssue {
  issue: string;         // 问题描述
  solution: string;      // 解决方案
  promptFix: string;     // 提示词修复语句
}

export interface SkillTemplate {
  metadata: SkillMetadata;
  basePrompt: string;            // 基础提示词模板
  variables: SkillVariable[];    // 可替换变量
  examples: SkillExample[];      // 使用示例
  qualityChecklist: string[];    // 质量检查清单
  commonIssues: CommonIssue[];   // 常见问题及解决方案
}

// ========== 工具相关类型 ==========

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  shouldContinue: boolean;  // 是否需要继续 ReAct 循环
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

// ========== ReAct 相关类型 ==========

export interface ThoughtStep {
  iteration: number;
  thought: string;
  action: string;
  actionInput: Record<string, any>;
  observation: string;
}

export interface ReActState {
  iteration: number;
  maxIterations: number;
  thoughtHistory: ThoughtStep[];
  currentPrompt: string | null;
  evaluationScore: number;
  isComplete: boolean;
  matchedSkill: string | null;
}

// ========== 输出相关类型 ==========

// 单个提示词输出
export interface PromptItem {
  id: string;              // 唯一标识
  scene: string;           // 场景名称（如 "封面页"、"步骤1"）
  prompt: string;          // 提示词内容
  chineseTexts: string[];  // 该提示词中的中文文字
}

export interface FinalOutput {
  finalPrompt: string;           // 主提示词（兼容单提示词模式）
  prompts: PromptItem[];         // 多提示词列表
  chineseTexts: string[];        // 所有中文文字汇总
  generationTips: string[];
  recommendedModel: string;
  iterationCount: number;
  matchedSkill: string | null;
}

// ========== 流式事件类型 ==========

export type SuperAgentStreamEvent =
  | { type: 'start'; message: string }
  | { type: 'skill_matching'; status: string }
  | { type: 'skill_matched'; skillId: string; skillName: string; confidence: number }
  | { type: 'skill_not_matched'; reason: string }
  // 流式思考事件
  | { type: 'thinking_chunk'; iteration: number; chunk: string }  // 实时思考片段
  | { type: 'thought'; iteration: number; content: string }       // 完整思考（向后兼容）
  | { type: 'action'; iteration: number; tool: string; input: Record<string, any> }
  | { type: 'observation'; iteration: number; result: any }
  | { type: 'search_start'; query: string }
  | { type: 'search_result'; summary: string }
  // 深度研究事件
  | { type: 'research_start'; topic: string; requiredInfo: string[] }
  | { type: 'research_progress'; round: number; maxRounds: number; status: string }
  | { type: 'research_evaluation'; round: number; coverage: number; missing: string[]; sufficient: boolean }
  | { type: 'research_complete'; topic: string; rounds: number; coverage: number }
  | { type: 'image_analysis_start' }
  | { type: 'image_analysis_chunk'; chunk: string }
  | { type: 'image_analysis_end'; analysis: string }
  | { type: 'prompt_generated'; version: number; prompt: string }
  | { type: 'evaluation'; score: number; issues: string[]; passed: boolean }
  | { type: 'optimization'; version: number; changes: string[] }
  | { type: 'complete'; result: FinalOutput }
  | { type: 'error'; error: string }
  // 多轮对话事件
  | { type: 'conversation_state'; conversationId: string; totalTokens: number; hasCompressedHistory: boolean };

// ========== 节点数据类型 ==========

export interface SuperAgentNodeData {
  userRequest?: string;
  referenceImages?: string[];
  isProcessing?: boolean;
  currentIteration?: number;
  thoughtSteps?: ThoughtStep[];
  matchedSkill?: {
    id: string;
    name: string;
    confidence: number;
  } | null;
  result?: FinalOutput | null;
  error?: string;
}
