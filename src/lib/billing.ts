/**
 * 计费服务
 *
 * 处理用户余额扣减、消费记录等
 */

import { prisma } from '@/lib/prisma';
import { getModelPrice, type ConsumptionType } from '@/lib/pricing';
import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const DAILY_FREE_BALANCE = 20;

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getUserWithRefreshedFreeBalance(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { balance: true, freeBalance: true, freeBalanceUpdatedAt: true },
  });

  if (!user) {
    return null;
  }

  const now = new Date();
  const shouldRefresh =
    !user.freeBalanceUpdatedAt ||
    getDateKey(user.freeBalanceUpdatedAt) !== getDateKey(now);

  if (!shouldRefresh) {
    return user;
  }

  return tx.user.update({
    where: { id: userId },
    data: {
      freeBalance: new Decimal(DAILY_FREE_BALANCE),
      freeBalanceUpdatedAt: now,
    },
    select: { balance: true, freeBalance: true, freeBalanceUpdatedAt: true },
  });
}

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
  const result = await prisma.$transaction(async (tx) => {
    const user = await getUserWithRefreshedFreeBalance(tx, userId);

    if (!user) {
      return { sufficient: false, balance: 0 };
    }

    const balance = Number(user.freeBalance) + Number(user.balance);
    return {
      sufficient: balance >= amount,
      balance,
    };
  });

  return result;
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
      // 获取并刷新每日免费额度
      const user = await getUserWithRefreshedFreeBalance(tx, userId);

      if (!user) {
        throw new Error('用户不存在');
      }

      const freeBalanceBefore = Number(user.freeBalance);
      const paidBalanceBefore = Number(user.balance);
      const balanceBefore = freeBalanceBefore + paidBalanceBefore;

      if (balanceBefore < amount) {
        throw new Error(`余额不足，当前余额 ¥${balanceBefore.toFixed(2)}，需要 ¥${amount.toFixed(2)}`);
      }

      const freeDeduct = Math.min(freeBalanceBefore, amount);
      const paidDeduct = amount - freeDeduct;
      const freeBalanceAfter = freeBalanceBefore - freeDeduct;
      const paidBalanceAfter = paidBalanceBefore - paidDeduct;
      const balanceAfter = freeBalanceAfter + paidBalanceAfter;

      // 扣减余额
      await tx.user.update({
        where: { id: userId },
        data: {
          freeBalance: new Decimal(freeBalanceAfter),
          balance: new Decimal(paidBalanceAfter),
        },
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
  const balances = await getUserBalances(userId);
  return balances.totalBalance;
}

/**
 * 获取用户免费/永久额度
 */
export async function getUserBalances(userId: string): Promise<{
  freeBalance: number;
  paidBalance: number;
  totalBalance: number;
  freeBalanceUpdatedAt: Date | null;
}> {
  const user = await prisma.$transaction(async (tx) => {
    return getUserWithRefreshedFreeBalance(tx, userId);
  });

  if (!user) {
    return { freeBalance: 0, paidBalance: 0, totalBalance: 0, freeBalanceUpdatedAt: null };
  }

  const freeBalance = Number(user.freeBalance);
  const paidBalance = Number(user.balance);
  return {
    freeBalance,
    paidBalance,
    totalBalance: freeBalance + paidBalance,
    freeBalanceUpdatedAt: user.freeBalanceUpdatedAt,
  };
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
      const user = await getUserWithRefreshedFreeBalance(tx, userId);

      if (!user) {
        throw new Error('用户不存在');
      }

      const paidBalanceBefore = Number(user.balance);
      const paidBalanceAfter = paidBalanceBefore + amount;
      const totalBefore = Number(user.freeBalance) + paidBalanceBefore;
      const totalAfter = Number(user.freeBalance) + paidBalanceAfter;

      await tx.user.update({
        where: { id: userId },
        data: { balance: new Decimal(paidBalanceAfter) },
      });

      // 记录充值（type 为 'recharge'，amount 为负数表示增加余额）
      await tx.consumptionRecord.create({
        data: {
          userId,
          type: 'quota_grant',
          modelId: 'system',
          amount: new Decimal(-amount), // 负数表示收入
          balanceBefore: new Decimal(totalBefore),
          balanceAfter: new Decimal(totalAfter),
          description: description ?? '额度发放',
        },
      });

      return { balanceAfter: totalAfter, amount };
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
