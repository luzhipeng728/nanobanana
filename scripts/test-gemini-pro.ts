/**
 * Gemini 3 Pro Preview API 并发测试 - 1000并发，每个重试到成功
 */

const API_CONFIG = {
  baseUrl: 'https://generativelanguage.googleapis.com',
  apiKey: 'AIzaSyD6ZF7RS9istBmpRBwd0dIoEz-GQbNSIvA',
  model: 'gemini-2.5-flash',
};

const CONCURRENCY = 250;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 存储已完成的结果
const completedResults: number[] = [];
let startTime = Date.now();

function printReport() {
  const totalDuration = Date.now() - startTime;

  if (completedResults.length === 0) {
    console.log('\n没有完成的请求');
    return;
  }

  const groups: Record<number, number> = {};
  for (const v of completedResults) {
    groups[v] = (groups[v] || 0) + 1;
  }

  console.log('\n========== 报告 ==========');
  console.log(`完成: ${completedResults.length}/${CONCURRENCY}`);
  console.log(`总耗时: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`\npromptTokenCount 分组:`);
  for (const [count, num] of Object.entries(groups).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${count} tokens: ${num} 个`);
  }
  console.log('==========================');
}

// 监听 Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️  收到中断信号，输出当前统计...');
  printReport();
  process.exit(0);
});

async function singleRequest(id: number): Promise<number> {
  const apiUrl = `${API_CONFIG.baseUrl}/v1beta/models/${API_CONFIG.model}:generateContent`;
  const prompt = 'What is 2+2?';

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  };

  while (true) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_CONFIG.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429) {
        await sleep(500 + Math.random() * 500);
        continue;
      }

      if (!response.ok) {
        await sleep(500 + Math.random() * 500);
        continue;
      }

      const data = await response.json();
      const promptTokenCount = data.usageMetadata?.promptTokenCount || 0;

      completedResults.push(promptTokenCount);
      console.log(`✅ #${id} | promptTokenCount: ${promptTokenCount} (${completedResults.length}/${CONCURRENCY})`);
      return promptTokenCount;

    } catch (error) {
      await sleep(500 + Math.random() * 500);
    }
  }
}

async function main() {
  console.log(`Gemini 并发测试 - ${CONCURRENCY} 并发`);
  console.log(`开始时间: ${new Date().toLocaleString()}`);
  console.log(`按 Ctrl+C 可随时中断并查看已完成统计\n`);

  startTime = Date.now();
  const promises = Array.from({ length: CONCURRENCY }, (_, i) => singleRequest(i + 1));
  await Promise.all(promises);

  printReport();
}

main();
