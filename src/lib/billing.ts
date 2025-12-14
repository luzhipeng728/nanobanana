/**
 * 计费服务
 *
 * 处理用户余额扣减、消费记录等
 */

import { prisma } from '@/lib/prisma';
import { getModelPrice, type ConsumptionType } from '@/lib/pricing';
import { Decimal } from '@prisma/client/runtime/library';

export interface BillingResult {
  success: boolean;
  error?: string;
  /** 本次消费金额 */
  amount?: number;
  /** 消费后余额 */
  balanceAfter?: number;
}

/**
 * 检查用户余额是否足够
 * @param userId 用户 ID
 * @param amount 需要的金额
 */
export async function checkBalance(userId: string, amount: number): Promise<{
  sufficient: boolean;
  balance: number;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });

  if (!user) {
    return { sufficient: false, balance: 0 };
  }

  const balance = Number(user.balance);
  return {
    sufficient: balance >= amount,
    balance,
  };
}

/**
 * 扣减用户余额并记录消费
 *
 * @param userId 用户 ID
 * @param type 消费类型
 * @param modelId 使用的模型 ID
 * @param taskId 关联的任务 ID（可选）
 * @param description 描述信息（可选）
 * @param customAmount 自定义金额（可选，不传则根据 modelId 查询价格）
 */
export async function deductBalance(
  userId: string,
  type: ConsumptionType,
  modelId: string,
  taskId?: string,
  description?: string,
  customAmount?: number
): Promise<BillingResult> {
  // 获取扣费金额
  const amount = customAmount ?? getModelPrice(modelId);

  if (amount <= 0) {
    // 免费模型，不扣费但可以记录
    return { success: true, amount: 0 };
  }

  try {
    // 使用事务确保原子性
    const result = await prisma.$transaction(async (tx) => {
      // 获取当前余额并锁定
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      const balanceBefore = Number(user.balance);

      if (balanceBefore < amount) {
        throw new Error(`余额不足，当前余额 ¥${balanceBefore.toFixed(2)}，需要 ¥${amount.toFixed(2)}`);
      }

      const balanceAfter = balanceBefore - amount;

      // 扣减余额
      await tx.user.update({
        where: { id: userId },
        data: { balance: new Decimal(balanceAfter) },
      });

      // 记录消费
      await tx.consumptionRecord.create({
        data: {
          userId,
          type,
          modelId,
          taskId,
          amount: new Decimal(amount),
          balanceBefore: new Decimal(balanceBefore),
          balanceAfter: new Decimal(balanceAfter),
          description,
        },
      });

      return { balanceBefore, balanceAfter, amount };
    });

    return {
      success: true,
      amount: result.amount,
      balanceAfter: result.balanceAfter,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '扣费失败';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * 获取用户余额
 */
export async function getUserBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });
  return user ? Number(user.balance) : 0;
}

/**
 * 获取用户消费记录
 */
export async function getConsumptionRecords(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: ConsumptionType;
  }
) {
  const { limit = 20, offset = 0, type } = options ?? {};

  const [records, total] = await Promise.all([
    prisma.consumptionRecord.findMany({
      where: {
        userId,
        ...(type && { type }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.consumptionRecord.count({
      where: {
        userId,
        ...(type && { type }),
      },
    }),
  ]);

  return {
    records: records.map((r) => ({
      ...r,
      amount: Number(r.amount),
      balanceBefore: Number(r.balanceBefore),
      balanceAfter: Number(r.balanceAfter),
    })),
    total,
    hasMore: offset + records.length < total,
  };
}

/**
 * 充值（增加余额）
 * 后续支付功能使用
 */
export async function addBalance(
  userId: string,
  amount: number,
  description?: string
): Promise<BillingResult> {
  if (amount <= 0) {
    return { success: false, error: '充值金额必须大于 0' };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      const balanceBefore = Number(user.balance);
      const balanceAfter = balanceBefore + amount;

      await tx.user.update({
        where: { id: userId },
        data: { balance: new Decimal(balanceAfter) },
      });

      // 记录充值（type 为 'recharge'，amount 为负数表示增加余额）
      await tx.consumptionRecord.create({
        data: {
          userId,
          type: 'recharge',
          modelId: 'system',
          amount: new Decimal(-amount), // 负数表示收入
          balanceBefore: new Decimal(balanceBefore),
          balanceAfter: new Decimal(balanceAfter),
          description: description ?? '账户充值',
        },
      });

      return { balanceAfter, amount };
    });

    return {
      success: true,
      amount: result.amount,
      balanceAfter: result.balanceAfter,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '充值失败';
    return { success: false, error: message };
  }
}
