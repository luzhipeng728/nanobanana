// Agent Node Types

export type AgentStatus =
  | "idle"           // 初始状态
  | "searching"      // 搜索阶段
  | "planning"       // 规划阶段
  | "generating"     // 生成 prompts 阶段
  | "creating"       // 创建图片节点阶段
  | "completed"      // 完成
  | "error";         // 错误

export interface AgentPrompt {
  id: string;
  prompt: string;
  scene: string;        // 场景描述
  status: "pending" | "generating" | "completed" | "error";
  imageUrl?: string;
  error?: string;
}

export interface AgentNodeData {
  userRequest: string;         // 用户需求
  status: AgentStatus;
  currentStep?: string;        // 当前步骤描述
  prompts: AgentPrompt[];      // 生成的 prompts
  progress: number;            // 0-100
  error?: string;
}

// 流式输出事件类型
export interface AgentStreamEvent {
  type: "status" | "progress" | "prompts" | "error" | "complete";
  status?: AgentStatus;
  step?: string;
  progress?: number;
  prompts?: AgentPrompt[];
  error?: string;
}
