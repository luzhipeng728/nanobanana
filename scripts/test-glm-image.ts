/**
 * 测试 GLM 图像生成
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  console.log('=== GLM Image Generation Test ===\n');

  // 检查 API Key
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    console.error('GLM_API_KEY not found in environment');
    process.exit(1);
  }
  console.log('API Key loaded:', apiKey.substring(0, 10) + '...');

  // 动态导入
  const { generateImage } = await import('../src/lib/image-generation');

  // 测试提示词 - AI 新闻仪表板
  const prompt = `A futuristic tech news dashboard with cyberpunk-inspired design. Dark background with holographic elements.

HEADER: Bold Chinese title "今日AI速报 - 产品竞争" in large white text with cyan glow effect. Right side: "2026.01.30" in a holographic pill badge.

MAIN CONTENT - 2 NEWS CARDS:

CARD 1: Glassmorphism card with amber border. Badge "产品" in amber. Headline "雅虎推出Scout AI答案引擎" in bold white. Subtext "集成Anthropic Claude模型 利用Bing接地API".

CARD 2: Glassmorphism card with emerald border. Badge "科技" in emerald. Headline "Moonshot K2.5开源模型超越GPT-5.2" in bold white. Subtext "在15万亿混合tokens上训练 原生多模态能力".

Ultra high quality, 8K resolution, cinematic lighting.`;

  console.log('\nPrompt:', prompt.substring(0, 100) + '...\n');

  console.log('Generating image with GLM...\n');
  const startTime = Date.now();

  const result = await generateImage({
    prompt,
    model: 'glm-image',
    resolution: '2K',
    aspectRatio: '16:9',
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.success) {
    console.log(`✅ Success in ${elapsed}s`);
    console.log(`   Image URL: ${result.imageUrl}`);
    console.log(`   Resolution: ${result.meta?.actualResolution}`);
  } else {
    console.log(`❌ Failed: ${result.error}`);
  }
}

main().catch(console.error);
