/**
 * 测试 generateImageAction 完整流程
 *
 * 使用方法：
 *   npx tsx scripts/test-generate-action.ts
 */

import 'dotenv/config';

// 动态导入 generateImageAction
async function main() {
  console.log('='.repeat(60));
  console.log('测试 generateImageAction 完整流程');
  console.log('='.repeat(60));
  console.log('');
  console.log('环境变量检查:');
  console.log(`  PRIORITY_IMAGE_API_BASE_URL: ${process.env.PRIORITY_IMAGE_API_BASE_URL || '未配置'}`);
  console.log(`  PRIORITY_IMAGE_API_MODEL: ${process.env.PRIORITY_IMAGE_API_MODEL || '未配置'}`);
  console.log(`  PRIORITY_IMAGE_API_MAX_RETRIES: ${process.env.PRIORITY_IMAGE_API_MAX_RETRIES || '未配置'}`);
  console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '已配置' : '未配置'}`);
  console.log('');
  console.log('='.repeat(60));

  // 动态导入
  const { generateImageAction } = await import('../src/app/actions/generate');

  console.log('\n📝 测试: 生成一只可爱的橘猫\n');

  const result = await generateImageAction(
    'A cute orange cat sitting on a comfortable sofa, photorealistic, high quality',
    'nano-banana-pro',
    { imageSize: '2K' }
  );

  console.log('\n' + '='.repeat(60));
  console.log('测试结果:');
  console.log('='.repeat(60));

  if (result.success) {
    console.log(`✅ 成功！`);
    console.log(`   图像 URL: ${result.imageUrl}`);
    console.log(`   使用模型: ${result.model}`);
  } else {
    console.log(`❌ 失败: ${result.error}`);
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
