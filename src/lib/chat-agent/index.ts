// Chat Agent 主入口

// 导出类型
export type {
  // WebSocket 消息类型
  ClientMessage,
  ClientChatMessage,
  ClientAbortMessage,
  ClientClearContextMessage,
  ServerMessage,
  ServerContentChunk,
  ServerToolStart,
  ServerToolProgress,
  ServerToolEnd,
  ServerToolChunk,
  ServerContextUpdate,
  ServerDone,
  ServerError,
  // 附件和设置
  Attachment,
  ChatSettings,
  // 工具类型
  ChatAgentTool,
  ClaudeTool,
  ToolResult,
  ToolContext,
  ToolCallbacks,
  ToolRegistryOptions,
  // 消息类型
  ChatMessage,
  ClaudeMessage,
  // 配置
  ReActConfig,
  WebSocketClient,
} from './types';

// 导出默认配置
export { DEFAULT_REACT_CONFIG } from './types';

// 导出工具注册表
export {
  toolRegistry,
  registerTool,
  getTool,
  getAllTools,
  formatToolsForClaude,
} from './tool-registry';

// 导出 ReAct 循环
export {
  runReactLoop,
  buildInitialMessages,
  appendUserMessage,
} from './react-loop';

// 导出所有工具
export {
  allTools,
  registerAllTools,
  getToolInstanceMap,
  webSearchTool,
  deepResearchTool,
  generateImageTool,
  editImageTool,
  analyzeDocumentTool,
  codeInterpreterTool,
} from './tools';

// 导出 SSE 处理器
export {
  createSSEStream,
  clearSessionContext,
  getSessionState,
  generateSessionId,
} from './sse-handler';
