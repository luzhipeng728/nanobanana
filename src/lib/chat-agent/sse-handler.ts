// Chat Agent SSE 处理器

import type {
  ServerMessage,
  WebSocketClient,
  ClientChatMessage,
  ToolContext,
  ClaudeMessage,
} from './types';
import { DEFAULT_REACT_CONFIG } from './types';
import { formatToolsForClaude, getAllTools } from './tool-registry';
import { runReactLoop, buildInitialMessages, appendUserMessage } from './react-loop';
import { getToolInstanceMap } from './tools';
import { v4 as uuidv4 } from 'uuid';

// 会话存储（实际应用中应该使用数据库）
const sessions = new Map<string, {
  messages: ClaudeMessage[];
  attachedImages: string[];
  attachedDocuments: { filename: string; content: string }[];
  totalTokens: number;
}>();

/**
 * 创建 SSE 响应流
 */
export function createSSEStream(
  request: ClientChatMessage,
  sessionId: string,
  abortSignal: AbortSignal
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      // 创建模拟的 WebSocket 客户端（通过 SSE 发送消息）
      const wsClient: WebSocketClient = {
        send: (message: ServerMessage) => {
          if (abortSignal.aborted) return;
          try {
            const data = `data: ${JSON.stringify(message)}\n\n`;
            controller.enqueue(encoder.encode(data));
          } catch {
            // 忽略发送错误
          }
        },
        close: () => {
          try {
            controller.close();
          } catch {
            // 忽略关闭错误
          }
        },
        isConnected: () => !abortSignal.aborted,
      };

      try {
        // 获取或创建会话
        let session = sessions.get(sessionId);
        if (!session) {
          session = {
            messages: [],
            attachedImages: [],
            attachedDocuments: [],
            totalTokens: 0,
          };
          sessions.set(sessionId, session);
        }

        // 处理附件
        const newImages: string[] = [];
        const newDocuments: { filename: string; content: string }[] = [];

        if (request.attachments) {
          for (const attachment of request.attachments) {
            if (attachment.type === 'image' && attachment.url) {
              newImages.push(attachment.url);
              session.attachedImages.push(attachment.url);
            } else if (attachment.type === 'document' && attachment.content) {
              const doc = {
                filename: attachment.filename || 'document.txt',
                content: attachment.content,
              };
              newDocuments.push(doc);
              session.attachedDocuments.push(doc);
            }
          }
        }

        // 构建消息
        if (session.messages.length === 0) {
          // 首条消息
          session.messages = buildInitialMessages(
            request.content,
            newImages,
            newDocuments
          );
        } else {
          // 追加消息
          appendUserMessage(
            session.messages,
            request.content,
            newImages,
            newDocuments
          );
        }

        // 获取工具
        const toolOptions = {
          enableDeepResearch: request.settings.enableDeepResearch,
        };
        const claudeTools = formatToolsForClaude(toolOptions);
        const toolInstances = getToolInstanceMap();

        // 创建工具上下文
        const toolContext: ToolContext = {
          conversationId: sessionId,
          attachedImages: session.attachedImages,
          attachedDocuments: session.attachedDocuments,
          abortSignal,
        };

        // 运行 ReAct 循环
        await runReactLoop(
          session.messages,
          claudeTools,
          toolInstances,
          toolContext,
          wsClient,
          DEFAULT_REACT_CONFIG
        );

        // 估算 token 数量（简化计算）
        const totalChars = session.messages.reduce((sum, m) => {
          return sum + JSON.stringify(m.content).length;
        }, 0);
        session.totalTokens = Math.ceil(totalChars / 4);

        // 发送上下文更新
        wsClient.send({
          type: 'context_update',
          tokens: session.totalTokens,
          maxTokens: 100000,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        wsClient.send({ type: 'error', message: errorMessage, code: 'INTERNAL_ERROR' });
      } finally {
        // 发送结束标记
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });
}

/**
 * 清除会话上下文
 */
export function clearSessionContext(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * 获取会话状态
 */
export function getSessionState(sessionId: string): {
  tokens: number;
  messageCount: number;
  imageCount: number;
  documentCount: number;
} | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  return {
    tokens: session.totalTokens,
    messageCount: session.messages.length,
    imageCount: session.attachedImages.length,
    documentCount: session.attachedDocuments.length,
  };
}

/**
 * 生成新的会话 ID
 */
export function generateSessionId(): string {
  return uuidv4();
}
