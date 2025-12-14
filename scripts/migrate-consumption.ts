/**
 * 将现有 ImageTask 记录同步到 ConsumptionRecord
 * 运行: npx tsx scripts/migrate-consumption.ts
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// 模型价格 (RMB)
const MODEL_PRICES: Record<string, number> = {
  'nano-banana': 0.28,
  'nano-banana-pro': 1.73,
  'seedream-4.5': 0.25,
};

async function migrateImageTasksToConsumption() {
  console.log('开始同步 ImageTask 到 ConsumptionRecord...\n');

  // 获取所有已完成的 ImageTask（有 userId 的）
  const tasks = await prisma.imageTask.findMany({
    where: {
      status: 'completed',
      userId: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`找到 ${tasks.length} 条已完成的任务\n`);

  let created = 0;
  let skipped = 0;

  for (const task of tasks) {
    // 检查是否已有该任务的消费记录
    const existing = await prisma.consumptionRecord.findFirst({
      where: { taskId: task.id },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const price = MODEL_PRICES[task.model] || 0;
    if (price === 0) {
      console.log(`跳过未知模型: ${task.model}`);
      skipped++;
      continue;
    }

    // 创建消费记录
    await prisma.consumptionRecord.create({
      data: {
        userId: task.userId!,
        type: 'image',
        modelId: task.model,
        taskId: task.id,
        amount: new Decimal(price),
        balanceBefore: new Decimal(0), // 历史数据无法准确计算
        balanceAfter: new Decimal(0),  // 历史数据无法准确计算
        description: `图片生成: ${task.prompt.substring(0, 50)}...`,
        createdAt: task.completedAt || task.createdAt,
      },
    });
    created++;

    if (created % 100 === 0) {
      console.log(`已处理 ${created} 条...`);
    }
  }

  console.log(`\n完成! 创建 ${created} 条记录, 跳过 ${skipped} 条`);

  // 统计每个用户的消费
  const userStats = await prisma.consumptionRecord.groupBy({
    by: ['userId'],
    _sum: { amount: true },
    _count: true,
  });

  console.log('\n用户消费统计:');
  for (const stat of userStats) {
    const user = await prisma.user.findUnique({
      where: { id: stat.userId },
      select: { username: true },
    });
    console.log(`  ${user?.username || stat.userId}: ${stat._count} 条, ¥${Number(stat._sum.amount || 0).toFixed(2)}`);
  }

  await prisma.$disconnect();
}

migrateImageTasksToConsumption().catch(console.error);
