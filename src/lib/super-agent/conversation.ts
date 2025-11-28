// SuperAgent 多轮对话管理
// 支持会话持久化、Token 计数和上下文压缩

import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/claude-config';

// Token 限制配置
const MAX_CONTEXT_TOKENS = 100000;  // 最大上下文 tokens
const COMPRESS_THRESHOLD = 90000;   // 触发压缩的阈值（90%）
const RECENT_TURNS_TO_KEEP = 2;     // 压缩时保留最近的轮数

// Haiku 模型用于压缩
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/**
 * 对话消息类型
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    toolCalls?: Array<{ name: string; input: any; result: any }>;
    searchResults?: any[];
    thoughtSteps?: any[];
  };
}

/**
 * 对话状态
 */
export interface ConversationState {
  id: string;
  messages: ConversationMessage[];
  compressedHistory?: string;  // 压缩后的历史摘要
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 估算文本的 token 数量（粗略估算）
 * Claude 平均 1 token ≈ 4 个字符（英文）或 1.5 个字符（中文）
 */
export function estimateTokens(text: string): number {
  // 简单估算：英文按 4 字符/token，中文按 1.5 字符/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 估算消息数组的总 token 数
 */
export function estimateMessagesTokens(messages: ConversationMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content);
    if (msg.metadata) {
      total += estimateTokens(JSON.stringify(msg.metadata));
    }
  }
  return total;
}

/**
 * 使用 Haiku 压缩对话历史
 */
async function compressHistory(
  messages: ConversationMessage[],
  existingCompressed?: string
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  // 构建需要压缩的内容
  const contentToCompress = messages.map((msg, i) => {
    let text = `[${msg.role.toUpperCase()}]: ${msg.content}`;
    if (msg.metadata?.toolCalls?.length) {
      const tools = msg.metadata.toolCalls.map(t => t.name).join(', ');
      text += `\n  工具调用: ${tools}`;
    }
    if (msg.metadata?.searchResults?.length) {
      text += `\n  搜索结果: ${msg.metadata.searchResults.length} 条`;
    }
    return text;
  }).join('\n\n');

  const prompt = `你是一个对话历史压缩专家。请将以下对话历史压缩成一个结构化的摘要，保留所有重要信息，包括：
1. 用户的主要需求和意图
2. 搜索到的关键信息和数据
3. 生成的提示词（如果有）
4. 重要的工具调用结果
5. 任何关键的决策或结论

${existingCompressed ? `## 已有的历史摘要\n${existingCompressed}\n\n` : ''}## 需要压缩的新对话
${contentToCompress}

请输出压缩后的摘要，格式如下：
## 用户需求
[简要描述]

## 关键信息
- [信息1]
- [信息2]
...

## 已生成内容
[如果有生成的提示词或其他内容]

## 重要结论
[任何重要的发现或决策]`;

  try {
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }
    return existingCompressed || '';
  } catch (error) {
    console.error('[Conversation] Failed to compress history:', error);
    return existingCompressed || '';
  }
}

/**
 * 对话管理器
 */
export class ConversationManager {
  private conversationId: string;
  private state: ConversationState | null = null;

  constructor(conversationId?: string) {
    this.conversationId = conversationId || crypto.randomUUID();
  }

  /**
   * 获取或创建对话
   */
  async getOrCreate(): Promise<ConversationState> {
    if (this.state) {
      return this.state;
    }

    // 从数据库加载
    const existing = await prisma.superAgentConversation.findUnique({
      where: { id: this.conversationId },
    });

    if (existing) {
      this.state = {
        id: existing.id,
        messages: JSON.parse(existing.messages),
        compressedHistory: existing.compressedHistory || undefined,
        totalTokens: existing.totalTokens,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      };
    } else {
      // 创建新对话
      const created = await prisma.superAgentConversation.create({
        data: {
          id: this.conversationId,
          messages: '[]',
          totalTokens: 0,
        },
      });
      this.state = {
        id: created.id,
        messages: [],
        totalTokens: 0,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    }

    return this.state;
  }

  /**
   * 添加消息
   */
  async addMessage(message: ConversationMessage): Promise<void> {
    if (!this.state) {
      await this.getOrCreate();
    }

    this.state!.messages.push(message);
    this.state!.totalTokens = estimateMessagesTokens(this.state!.messages);

    // 检查是否需要压缩
    if (this.state!.totalTokens > COMPRESS_THRESHOLD) {
      await this.compressIfNeeded();
    }

    // 保存到数据库
    await this.save();
  }

  /**
   * 压缩历史（如果需要）
   */
  private async compressIfNeeded(): Promise<void> {
    if (!this.state || this.state.messages.length <= RECENT_TURNS_TO_KEEP * 2) {
      return;
    }

    console.log(`[Conversation] Compressing history, current tokens: ${this.state.totalTokens}`);

    // 保留最近的轮次（每轮 = 1 user + 1 assistant）
    const recentCount = RECENT_TURNS_TO_KEEP * 2;
    const messagesToCompress = this.state.messages.slice(0, -recentCount);
    const recentMessages = this.state.messages.slice(-recentCount);

    // 压缩旧消息
    const compressed = await compressHistory(
      messagesToCompress,
      this.state.compressedHistory
    );

    // 更新状态
    this.state.compressedHistory = compressed;
    this.state.messages = recentMessages;
    this.state.totalTokens = estimateMessagesTokens(recentMessages) + estimateTokens(compressed);

    console.log(`[Conversation] Compressed to ${this.state.totalTokens} tokens`);
  }

  /**
   * 获取用于 Claude API 的消息格式
   */
  async getMessagesForClaude(): Promise<Anthropic.MessageParam[]> {
    if (!this.state) {
      await this.getOrCreate();
    }

    const messages: Anthropic.MessageParam[] = [];

    // 如果有压缩的历史，作为第一条系统级上下文
    if (this.state!.compressedHistory) {
      messages.push({
        role: 'user',
        content: `## 对话历史摘要\n以下是之前对话的压缩摘要，请参考这些信息继续对话：\n\n${this.state!.compressedHistory}\n\n---\n\n现在继续对话。`,
      });
      messages.push({
        role: 'assistant',
        content: '我已了解之前的对话内容，请继续。',
      });
    }

    // 添加最近的消息
    for (const msg of this.state!.messages) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return messages;
  }

  /**
   * 保存到数据库
   */
  async save(): Promise<void> {
    if (!this.state) return;

    await prisma.superAgentConversation.update({
      where: { id: this.conversationId },
      data: {
        messages: JSON.stringify(this.state.messages),
        compressedHistory: this.state.compressedHistory || null,
        totalTokens: this.state.totalTokens,
      },
    });
  }

  /**
   * 获取对话 ID
   */
  getId(): string {
    return this.conversationId;
  }

  /**
   * 获取当前 token 数
   */
  getTotalTokens(): number {
    return this.state?.totalTokens || 0;
  }

  /**
   * 清除对话
   */
  async clear(): Promise<void> {
    await prisma.superAgentConversation.delete({
      where: { id: this.conversationId },
    }).catch(() => {});
    this.state = null;
  }
}

/**
 * 获取用户的对话列表
 */
export async function getUserConversations(userId?: string, limit = 20) {
  return prisma.superAgentConversation.findMany({
    where: userId ? { userId } : {},
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      totalTokens: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * 删除对话
 */
export async function deleteConversation(conversationId: string) {
  return prisma.superAgentConversation.delete({
    where: { id: conversationId },
  });
}
