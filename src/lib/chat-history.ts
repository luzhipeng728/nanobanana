// 会话历史存储模块（MySQL 数据库持久化）
// 每个节点通过 nodeId 存储最多 5 轮会话历史

import { prisma } from '@/lib/prisma';

// 最大保留轮数
const MAX_ROUNDS = 5;

// 节点类型
export type NodeType = 'agent' | 'super-agent';

// 元数据类型
interface ChatMetadata {
  prompts?: any[];
  matchedSkill?: string;
  iterationCount?: number;
}

// 会话轮次
interface ChatRound {
  roundNumber: number;
  userMessage: string;
  assistantResponse: string;
  metadata?: ChatMetadata;
  createdAt: Date;
}

/**
 * 获取节点的会话历史
 */
export async function getChatHistory(nodeId: string): Promise<ChatRound[]> {
  const records = await prisma.nodeChatHistory.findMany({
    where: { nodeId },
    orderBy: { roundNumber: 'asc' },
  });

  return records.map(r => ({
    roundNumber: r.roundNumber,
    userMessage: r.userMessage,
    assistantResponse: r.assistantResponse,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    createdAt: r.createdAt,
  }));
}

/**
 * 获取节点历史的轮数
 */
export async function getChatHistoryCount(nodeId: string): Promise<number> {
  return prisma.nodeChatHistory.count({
    where: { nodeId },
  });
}

/**
 * 添加一轮会话到节点历史
 * 自动管理轮次：超过 MAX_ROUNDS 时删除最早的记录
 */
export async function addChatRound(
  nodeId: string,
  nodeType: NodeType,
  userMessage: string,
  assistantResponse: string,
  metadata?: ChatMetadata
): Promise<void> {
  // 获取当前轮数
  const currentCount = await getChatHistoryCount(nodeId);

  // 如果已达最大轮数，删除最早的记录并重新编号
  if (currentCount >= MAX_ROUNDS) {
    // 获取所有记录
    const existingRecords = await prisma.nodeChatHistory.findMany({
      where: { nodeId },
      orderBy: { roundNumber: 'asc' },
    });

    // 删除所有旧记录
    await prisma.nodeChatHistory.deleteMany({
      where: { nodeId },
    });

    // 重新插入（跳过第一条，后面的往前移）
    const recordsToKeep = existingRecords.slice(1);
    for (let i = 0; i < recordsToKeep.length; i++) {
      await prisma.nodeChatHistory.create({
        data: {
          nodeId,
          nodeType,
          roundNumber: i + 1,
          userMessage: recordsToKeep[i].userMessage,
          assistantResponse: recordsToKeep[i].assistantResponse,
          metadata: recordsToKeep[i].metadata,
        },
      });
    }

    // 插入新记录
    await prisma.nodeChatHistory.create({
      data: {
        nodeId,
        nodeType,
        roundNumber: MAX_ROUNDS,
        userMessage,
        assistantResponse,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } else {
    // 直接插入新记录
    await prisma.nodeChatHistory.create({
      data: {
        nodeId,
        nodeType,
        roundNumber: currentCount + 1,
        userMessage,
        assistantResponse,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }

  const newCount = await getChatHistoryCount(nodeId);
  console.log(`[ChatHistory] Node ${nodeId}: ${newCount} rounds stored`);
}

/**
 * 清除节点的会话历史
 */
export async function clearChatHistory(nodeId: string): Promise<boolean> {
  const result = await prisma.nodeChatHistory.deleteMany({
    where: { nodeId },
  });
  console.log(`[ChatHistory] Node ${nodeId}: history cleared (${result.count} records deleted)`);
  return result.count > 0;
}

/**
 * 构建包含历史的用户消息
 * 用于 Agent API
 */
export async function buildMessagesWithHistory(
  nodeId: string,
  currentUserRequest: string
): Promise<string> {
  const rounds = await getChatHistory(nodeId);

  if (rounds.length === 0) {
    return currentUserRequest;
  }

  // 构建带历史的消息
  let contextMessage = `## 历史对话记录（共 ${rounds.length} 轮）\n\n`;

  rounds.forEach((round, index) => {
    contextMessage += `### 第 ${round.roundNumber} 轮\n`;
    contextMessage += `**用户**: ${round.userMessage}\n`;
    contextMessage += `**助手**: ${round.assistantResponse}\n\n`;
  });

  contextMessage += `---\n\n## 当前请求\n\n${currentUserRequest}`;
  contextMessage += `\n\n**注意**: 请结合历史对话的上下文来理解和响应当前请求。如果用户在继续之前的讨论，请保持一致性。`;

  return contextMessage;
}

/**
 * 构建 ReAct 循环的初始消息（带历史）
 * 用于 SuperAgent API
 */
export async function buildReActInitialMessageWithHistory(
  nodeId: string,
  userRequest: string,
  referenceImages?: string[]
): Promise<string> {
  const rounds = await getChatHistory(nodeId);

  let message = '';

  // 如果有历史记录，先添加历史
  if (rounds.length > 0) {
    message += `## 历史对话记录（共 ${rounds.length} 轮）\n\n`;

    rounds.forEach((round) => {
      message += `### 第 ${round.roundNumber} 轮\n`;
      message += `**用户需求**: ${round.userMessage}\n`;
      message += `**生成结果**: ${round.assistantResponse}\n`;
      if (round.metadata?.matchedSkill) {
        message += `**匹配技能**: ${round.metadata.matchedSkill}\n`;
      }
      message += '\n';
    });

    message += `---\n\n`;
  }

  // 当前请求
  message += `## 当前用户需求\n\n${userRequest}\n`;

  // 参考图片
  if (referenceImages && referenceImages.length > 0) {
    message += `\n## 参考图片\n\n用户提供了 ${referenceImages.length} 张参考图片：\n`;
    referenceImages.forEach((url, i) => {
      message += `- 图片 ${i + 1}: ${url}\n`;
    });
    message += `\n⚠️ **重要提醒**：用户提供了参考图片，你生成的提示词中**必须包含参考指令**，例如：
- "Follow the visual style, color palette, and artistic approach of the reference image"
- "Maintain the same aesthetic and composition style as the reference"

没有这个指令，生图模型可能会忽略参考图片！\n`;
  }

  message += `\n## 开始探索\n\n请根据用户需求，自主决定如何完成任务。`;

  if (rounds.length > 0) {
    message += `\n\n**上下文提示**: 用户之前已经进行过 ${rounds.length} 轮对话，请结合历史记录来理解当前需求。如果用户在继续之前的讨论，请保持风格和主题的一致性。`;
  }

  message += `\n\n你可以：
- 直接生成提示词（如果需求简单清晰）
- 先搜索相关信息（如果需要实时数据或参考）
- 查看是否有匹配的技能模板（如果想借鉴现有模板）
- 分析参考图片（如果用户提供了）

**你来决定流程，不需要遵循固定步骤。**
当你准备好最终提示词时，调用 \`finalize_output\` 输出结果。`;

  return message;
}

/**
 * 生成响应摘要（用于存储）
 */
export function generateResponseSummary(prompts: any[]): string {
  if (!prompts || prompts.length === 0) {
    return '未生成提示词';
  }

  const scenes = prompts.map(p => p.scene || '场景').join('、');
  return `生成了 ${prompts.length} 个场景：${scenes}`;
}
