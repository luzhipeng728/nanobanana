// Scrollytelling HTML 生成 API - 流式响应
// 使用 Gemini 3 分析图片并生成一镜到底的单页 HTML

import { NextRequest } from 'next/server';

export const maxDuration = 300; // 5分钟超时

// Scrollytelling 系统提示词
const SCROLLYTELLING_SYSTEM_PROMPT = `你是一位顶级 Creative Technologist，精通 GSAP ScrollTrigger 动画。

## 任务
根据用户提供的【图片序列】和【每张图片的描述(prompt)】，创建一个"一镜到底"的沉浸式滚动网页。

## 核心要求

### 1. 理解图片内容
- **必须仔细阅读每张图片的 prompt 描述**，这是理解图片内容的关键
- prompt 描述了图片的主题、内容、情感，你要基于此设计布局和文案
- 观察图片本身的视觉特征：是横版还是竖版？主体在哪里？

### 2. 动效设计（最重要！）
每个场景必须有滚动触发的动画效果：
- **淡入淡出**: 元素从透明渐变到可见
- **视差滚动**: 图片和文字以不同速度移动
- **缩放效果**: 图片从小变大或从大变小
- **位移动画**: 元素从屏幕外滑入
- **固定滚动(Pin)**: 场景固定，内容在其中变化

### 3. 技术规范
**CDN 引入（必须且只能使用这两个库）**:
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>

**⚠️ 禁止使用 Lenis、Locomotive Scroll 等其他滚动库！只用 GSAP！**

**JS 初始化模板**:
document.addEventListener('DOMContentLoaded', function() {
    gsap.registerPlugin(ScrollTrigger);

    // 示例：淡入动画
    gsap.from('.fade-in', {
        opacity: 0,
        y: 50,
        duration: 1,
        scrollTrigger: {
            trigger: '.fade-in',
            start: 'top 80%',
            end: 'top 50%',
            scrub: true
        }
    });

    // 示例：固定场景
    ScrollTrigger.create({
        trigger: '.pinned-section',
        start: 'top top',
        end: '+=100%',
        pin: true,
        scrub: 1
    });
});

### 4. 图片布局
- 横版图片：宽度 100%，高度自适应
- 竖版图片：高度 100vh，宽度自适应，居中显示
- 使用 object-fit: contain 确保图片完整显示

## 输出格式
直接输出完整 HTML，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。`;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // 创建流式响应
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // 跟踪连接状态
  let isAborted = false;

  // 监听请求中断
  request.signal.addEventListener('abort', () => {
    isAborted = true;
    console.log('[Scrollytelling API] Request aborted by client');
  });

  // 异步处理
  (async () => {
    try {
      const body = await request.json();
      const { images, prompts, theme } = body as {
        images: string[];   // 图片 URL 数组
        prompts?: string[]; // 图片描述数组（与 images 对应）
        theme?: string;     // 可选的主题描述
      };

      if (!images || !Array.isArray(images) || images.length === 0) {
        await writer.write(encoder.encode('<!-- Error: 请提供至少一张图片 -->'));
        await writer.close();
        return;
      }

      console.log('[Scrollytelling API] Starting generation...');
      console.log('[Scrollytelling API] Images count:', images.length);
      console.log('[Scrollytelling API] Has prompts:', !!prompts && prompts.length > 0);
      console.log('[Scrollytelling API] Theme:', theme || 'auto');

      // 构建用户消息内容 - 包含图片
      const userContent: any[] = [];

      // 添加图片
      for (const imageUrl of images) {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: imageUrl
          }
        });
      }

      // 构建图片信息列表（包含描述）- 更清晰的格式
      const imageInfoList = images.map((url, i) => {
        const prompt = prompts?.[i] || '';
        return `【第 ${i + 1} 张图片】
URL: ${url}
描述(prompt): ${prompt || '(请观察图片内容)'}
---`;
      }).join('\n');

      // 添加文本说明
      userContent.push({
        type: 'text',
        text: `请为以下 ${images.length} 张图片创建一个【一镜到底】的沉浸式滚动网页。

=== 图片序列 ===
${imageInfoList}

=== 设计要求 ===
1. **图文并茂**：每张图片都要配合相应的文案标题和说明文字
2. **基于 prompt 设计文案**：图片的描述(prompt)包含了图片的核心内容，请据此提取关键信息作为网页文案
3. **滚动动效**：必须使用 GSAP ScrollTrigger 实现滚动触发的动画效果
4. **图片完整展示**：根据图片比例选择合适的布局，确保图片不被裁切
${theme ? `5. **主题风格**：${theme}` : '5. **主题风格**：根据图片内容自动判断'}

=== 输出 ===
直接输出完整的 HTML 代码，从 <!DOCTYPE html> 开始。`
      });

      // 调用 Gemini API (OpenAI 兼容格式)
      const apiBaseUrl = process.env.SCROLLYTELLING_API_BASE_URL || 'http://172.93.101.237:8317';
      const apiKey = process.env.SCROLLYTELLING_API_KEY || 'sk-12345';
      const model = process.env.SCROLLYTELLING_MODEL || 'gemini-3-pro-preview';

      const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SCROLLYTELLING_SYSTEM_PROMPT },
            { role: 'user', content: userContent }
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 32000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Scrollytelling API] API error:', errorText);
        await writer.write(encoder.encode(`<!-- Error: API 调用失败 - ${response.status} -->`));
        await writer.close();
        return;
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        await writer.write(encoder.encode('<!-- Error: 无法读取响应流 -->'));
        await writer.close();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (!isAborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                await writer.write(encoder.encode(content));
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      console.log('[Scrollytelling API] Generation completed');
    } catch (error) {
      if (!isAborted) {
        console.error('[Scrollytelling API] Error:', error);
        await writer.write(encoder.encode(`<!-- Error: ${error instanceof Error ? error.message : '未知错误'} -->`));
      }
    } finally {
      try {
        await writer.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
