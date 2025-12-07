/**
 * Gemini 图像生成 API 测试脚本
 *
 * 使用方法：
 *   npx tsx scripts/test-gemini-image.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// API 配置
const API_CONFIG = {
  baseUrl: 'http://104.243.42.248:8020',
  apiKey: 'sk-Hueuh821981hHDJHA278wy7qhdus',
  model: 'gemini-3-pro-image',
};

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 2000, // 2 秒
};

/**
 * 延迟函数
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 生成图像
 */
async function generateImage(
  prompt: string,
  options: {
    imageSize?: '2K' | '4K';
    aspectRatio?: string;
  } = {}
): Promise<{ success: boolean; imageData?: Buffer; mimeType?: string; error?: string }> {
  const apiUrl = `${API_CONFIG.baseUrl}/v1beta/models/${API_CONFIG.model}:generateContent`;

  // 构建请求体
  const requestBody: any = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  // 添加图像配置
  if (options.imageSize || options.aspectRatio) {
    requestBody.generationConfig.imageConfig = {};
    if (options.imageSize) {
      requestBody.generationConfig.imageConfig.image_size = options.imageSize;
    }
    if (options.aspectRatio) {
      requestBody.generationConfig.imageConfig.aspectRatio = options.aspectRatio;
    }
  }

  // 重试循环
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_CONFIG.initialDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ 重试 ${attempt}/${RETRY_CONFIG.maxRetries}，等待 ${delay}ms...`);
        await sleep(delay);
      }

      console.log(`🚀 发送请求到 ${apiUrl}...`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_CONFIG.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // 429 错误重试
        if (response.status === 429) {
          console.log(`⚠️  429 限流，准备重试...`);
          continue;
        }

        throw new Error(`API 错误: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // 解析响应
      const candidates = data?.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('无候选响应');
      }

      const parts = candidates[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        throw new Error('响应中无内容');
      }

      // 查找图像数据
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          const imageData = Buffer.from(base64Data, 'base64');

          console.log(`✅ 图像生成成功！`);
          console.log(`   MIME: ${mimeType}`);
          console.log(`   大小: ${(imageData.length / 1024 / 1024).toFixed(2)} MB`);

          return { success: true, imageData, mimeType };
        }
      }

      throw new Error('响应中无图像数据');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt === RETRY_CONFIG.maxRetries) {
        console.error(`❌ 生成失败: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }

      // 网络错误重试
      if (errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
        console.log(`⚠️  网络错误，准备重试...`);
        continue;
      }

      return { success: false, error: errorMessage };
    }
  }

  return { success: false, error: '超过最大重试次数' };
}

/**
 * 保存图像到文件
 */
function saveImage(imageData: Buffer, mimeType: string, filename?: string): string {
  // 确定扩展名
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';

  // 生成文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFilename = filename || `gemini-image-${timestamp}.${ext}`;

  // 保存到 scripts 目录
  const outputPath = path.join(__dirname, outputFilename);
  fs.writeFileSync(outputPath, imageData);

  console.log(`💾 图像已保存: ${outputPath}`);
  return outputPath;
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Gemini 图像生成 API 测试');
  console.log('='.repeat(60));
  console.log(`Base URL: ${API_CONFIG.baseUrl}`);
  console.log(`Model: ${API_CONFIG.model}`);
  console.log('='.repeat(60));

  // 测试用例
  const testCases = [
    {
      name: '测试1: 基础图像生成',
      prompt: 'A cute orange cat sitting on a comfortable sofa, photorealistic',
      options: {},
    },
    {
      name: '测试2: 4K 高清图像',
      prompt: 'A beautiful sunset over the ocean with vibrant colors, 4K quality',
      options: { imageSize: '4K' as const },
    },
  ];

  for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(60));
    console.log(`📝 ${testCase.name}`);
    console.log(`   Prompt: ${testCase.prompt}`);
    console.log('-'.repeat(60));

    const result = await generateImage(testCase.prompt, testCase.options);

    if (result.success && result.imageData && result.mimeType) {
      const filename = `test-${testCase.name.replace(/[^a-zA-Z0-9]/g, '-')}.${result.mimeType.includes('jpeg') ? 'jpg' : 'png'}`;
      saveImage(result.imageData, result.mimeType, filename);
    } else {
      console.error(`❌ 测试失败: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成！');
  console.log('='.repeat(60));
}

// 运行
main().catch(console.error);
