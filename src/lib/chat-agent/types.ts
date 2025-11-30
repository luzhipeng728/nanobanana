// Chat Agent 类型定义

import { z } from 'zod';

// ========== WebSocket 消息类型 ==========

// 客户端 → 服务端消息
export type ClientMessage =
  | ClientChatMessage
  | ClientAbortMessage
  | ClientClearContextMessage;

export interface ClientChatMessage {
  type: 'message';
  content: string;
  attachments?: Attachment[];
  settings: ChatSettings;
}

export interface ClientAbortMessage {
  type: 'abort';
}

export interface ClientClearContextMessage {
  type: 'clear_context';
}

// 附件类型
export interface Attachment {
  type: 'image' | 'document';
  url?: string;           // 图片 URL（已上传到 R2）
  content?: string;       // 文档内容（已解析的文本）
  filename?: string;      // 文件名
  mimeType?: string;      // MIME 类型
}

// 聊天设置
export interface ChatSettings {
  enableDeepResearch: boolean;
}

// 服务端 → 客户端消息
export type ServerMessage =
  | ServerContentChunk
  | ServerToolStart
  | ServerToolInput
  | ServerToolProgress
  | ServerToolEnd
  | ServerToolChunk
  | ServerContextUpdate
  | ServerDone
  | ServerError;

export interface ServerContentChunk {
  type: 'content_chunk';
  content: string;
}

export interface ServerToolStart {
  type: 'tool_start';
  toolId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ServerToolInput {
  type: 'tool_input';
  toolId: string;
  input: Record<string, unknown>;
}

export interface ServerToolProgress {
  type: 'tool_progress';
  toolId: string;
  elapsed: number;     // 已用时间（毫秒）
  status: string;      // 状态描述
}

export interface ServerToolEnd {
  type: 'tool_end';
  toolId: string;
  output: ToolResult;
  duration: number;    // 总耗时（毫秒）
}

export interface ServerToolChunk {
  type: 'tool_chunk';
  toolId: string;
  chunk: string;       // 流式输出的片段
}

export interface ServerContextUpdate {
  type: 'context_update';
  tokens: number;
  maxTokens: number;
}

export interface ServerDone {
  type: 'done';
  messageId: string;
}

export interface ServerError {
  type: 'error';
  message: string;
  code?: string;
}

// ========== 工具系统类型 ==========

// 工具执行结果
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  // 特定工具的结果字段
  imageUrl?: string;         // generate_image, edit_image
  searchResults?: SearchResult[];  // web_search
  researchReport?: string;   // deep_research
  analysis?: string;         // analyze_document
  codeOutput?: string;       // code_interpreter
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// 工具回调
export interface ToolCallbacks {
  onProgress: (status: string) => void;
  onChunk?: (chunk: string) => void;
}

// 工具上下文
export interface ToolContext {
  conversationId: string;
  attachedImages: string[];      // 上下文中的图片 URL
  attachedDocuments: DocumentInfo[];  // 上下文中的文档
  abortSignal: AbortSignal;
}

export interface DocumentInfo {
  filename: string;
  content: string;
  mimeType?: string;
}

// 工具定义接口
export interface ChatAgentTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ) => Promise<ToolResult>;
}

// Claude API 工具格式
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

// ========== 对话消息类型 ==========

// 对话消息（存储用）
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCallRecord[];
  createdAt: Date;
}

// 工具调用记录
export interface ToolCallRecord {
  toolId: string;
  name: string;
  input: Record<string, unknown>;
  output: ToolResult;
  duration: number;
}

// Claude API 消息格式
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: ClaudeContent[];
}

export type ClaudeContent =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock;

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

export interface ClaudeImageBlock {
  type: 'image';
  source: {
    type: 'url';
    url: string;
  };
}

export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

// ========== 上下文管理类型 ==========

export interface ConversationState {
  id: string;
  messages: ChatMessage[];
  totalTokens: number;
  compressedHistory?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ========== ReAct 循环类型 ==========

export interface ReActConfig {
  maxIterations: number;
  model: string;
  maxTokens: number;
}

export const DEFAULT_REACT_CONFIG = {
  maxIterations: 10,
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
} as const satisfies ReActConfig;

// ========== WebSocket 处理器类型 ==========

export interface WebSocketClient {
  send: (message: ServerMessage) => void;
  close: () => void;
  isConnected: () => boolean;
}

// ========== 工具注册选项 ==========

export interface ToolRegistryOptions {
  enableDeepResearch?: boolean;
}
