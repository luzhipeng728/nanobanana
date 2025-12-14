# NanoBanana 项目开发指南

## 图片生成适配器系统

### 架构概述

项目使用适配器模式管理多个图片生成服务，位于 `src/lib/image-generation/`：

```
src/lib/image-generation/
├── index.ts                    # 统一入口 + 工厂函数
├── base-adapter.ts             # 适配器基类
├── types.ts                    # 统一类型定义
├── adapters/
│   ├── gemini-adapter.ts       # Gemini 系列
│   └── seedream-adapter.ts     # Seedream 4.5
└── utils/
    ├── resolution-mapper.ts    # 分辨率映射
    └── image-compress.ts       # 图片压缩
```

### 添加新图片适配器步骤

#### 1. 创建适配器文件

在 `src/lib/image-generation/adapters/` 创建新文件，如 `my-adapter.ts`：

```typescript
import { ImageGenerationAdapter } from '../base-adapter';
import type { ImageGenerationParams, ImageGenerationResult, AdapterCapabilitiesConfig } from '../types';

export class MyAdapter extends ImageGenerationAdapter {
  readonly name = 'my-adapter';
  readonly models = ['my-model-fast', 'my-model-pro'];

  readonly capabilities: AdapterCapabilitiesConfig = {
    supportedResolutions: ['1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportsReferenceImages: false,  // 是否支持参考图
    maxReferenceImages: 0,
    extraOptions: [],  // 模型特有选项
  };

  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    const apiKey = process.env.MY_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'MY_API_KEY 未配置' };
    }

    // 实现 API 调用逻辑
    // ...

    return {
      success: true,
      imageUrl: 'https://...',
      meta: { model: params.model },
    };
  }
}
```

#### 2. 注册适配器

在 `src/lib/image-generation/index.ts` 中注册：

```typescript
import { MyAdapter } from './adapters/my-adapter';

const adapters: ImageGenerationAdapter[] = [
  new GeminiAdapter(),
  new SeedreamAdapter(),
  new MyAdapter(),  // 添加新适配器
];
```

#### 3. 更新类型定义

在 `src/types/image-gen.ts` 添加模型信息：

```typescript
export const IMAGE_MODELS = {
  // 现有模型...
  'my-model-fast': { adapter: 'my-adapter', apiModel: 'actual-api-model-id', label: '我的模型快速版' },
  'my-model-pro': { adapter: 'my-adapter', apiModel: 'actual-api-model-pro', label: '我的模型高级版' },
} as const;
```

#### 4. 更新速率限制器

在 `src/lib/rate-limiter.ts` 添加模型配置：

```typescript
// 更新 ModelType
export type ModelType = "nano-banana" | "nano-banana-pro" | "seedream-4.5" | "my-model-fast" | "my-model-pro";

// 添加 RPM 限制
const RPM_LIMITS: Record<ModelType, number> = {
  // 现有配置...
  "my-model-fast": 100,
  "my-model-pro": 20,
};

// 添加并发限制
const MAX_CONCURRENT: Record<ModelType, number> = {
  // 现有配置...
  "my-model-fast": 20,
  "my-model-pro": 5,
};
```

#### 5. 添加环境变量

在 `.env` 添加 API Key：

```env
MY_API_KEY=your-api-key-here
```

#### 6. 测试验证

1. 重启开发服务器
2. 访问 `/api/image-models` 确认新模型出现
3. 在画布节点中测试模型选择和生成

### 关键文件说明

| 文件 | 用途 |
|------|------|
| `src/lib/image-generation/types.ts` | 类型定义（ImageGenerationParams, ImageGenerationResult, AdapterCapabilities） |
| `src/lib/image-generation/base-adapter.ts` | 适配器基类，提供参数验证 |
| `src/lib/image-generation/index.ts` | 统一入口，`generateImage()` 和 `getAvailableModels()` |
| `src/app/api/image-models/route.ts` | 模型列表 API，供前端获取 |
| `src/hooks/useImageModels.ts` | React Hook，提供模型列表和能力查询 |
| `src/lib/rate-limiter.ts` | 速率限制器，控制 API 调用频率 |

### 前端节点更新

三个节点使用 `useImageModels` hook 动态获取模型列表：
- `ImageGenNode.tsx` - 基础图片生成
- `AgentNode.tsx` - Agent 批量生成
- `SuperAgentNode.tsx` - 智能提示词生成

这些节点会自动显示新添加的模型，无需手动修改 UI。

### 设计文档

详细设计文档：`docs/plans/2025-01-12-image-generation-adapter-design.md`
