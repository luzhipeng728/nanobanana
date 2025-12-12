# 图片生成适配器架构设计

> 日期: 2025-01-12
> 状态: 已确认，待实现

## 1. 背景与目标

### 现状问题
- `generate.ts` 已有 1000+ 行，所有逻辑耦合在一起
- 添加新模型需要修改核心代码
- 没有适配器模式，难以扩展
- 不同模型的特殊逻辑混杂

### 目标
1. 添加 **seedream 4.5** 模型支持
2. 统一封装所有图片生成功能
3. 使用 **适配器模式**，方便后续添加新模型
4. 对外接口保持一致

## 2. 目录结构

```
src/lib/image-generation/
├── index.ts                    # 统一导出 + 工厂函数
├── base-adapter.ts             # 基类定义
├── types.ts                    # 统一类型定义
├── adapters/
│   ├── gemini-adapter.ts       # Gemini 系列 (nano-banana, nano-banana-pro)
│   └── seedream-adapter.ts     # Seedream 4.5
└── utils/
    ├── resolution-mapper.ts    # 分辨率映射工具
    └── image-compress.ts       # 图片压缩（从现有代码迁移）
```

## 3. 类型定义 (`types.ts`)

```typescript
// ============ 输入参数 ============
export interface ImageGenerationParams {
  prompt: string;
  model: string;                              // 'nano-banana' | 'nano-banana-pro' | 'seedream-4.5'
  resolution?: '1K' | '2K' | '4K';            // 分辨率
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | 'auto';
  referenceImages?: string[];                 // 参考图片 URL 列表

  // 模型特定选项（可选）
  extraOptions?: {
    // Seedream 专用
    sequentialImageGeneration?: 'disabled' | 'auto';
    sequentialImageGenerationOptions?: {
      imageCount?: number;                    // 组图数量
    };
    // Gemini 专用
    enableGoogleSearch?: boolean;             // Pro 模型的 Google Search
  };
}

// ============ 输出结果 ============
export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;                          // 单图 URL
  imageUrls?: string[];                       // 组图 URL 列表（seedream 组图功能）
  error?: string;

  // 元信息
  meta?: {
    model: string;                            // 实际使用的模型
    actualResolution?: string;                // 实际生成的分辨率 "2048x2048"
    usage?: {                                 // 用量统计
      generatedImages: number;
      tokens?: number;
    };
  };
}

// ============ 能力声明（给前端用）============
export interface AdapterCapabilities {
  name: string;
  models: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  supportsReferenceImages: boolean;
  maxReferenceImages: number;
  extraOptions?: Array<{
    key: string;
    label: string;
    type: 'boolean' | 'select' | 'number';
    options?: string[];                       // select 类型的选项
    default?: any;
  }>;
}

// ============ 验证结果 ============
export interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

## 4. 基类设计 (`base-adapter.ts`)

```typescript
export abstract class ImageGenerationAdapter {
  abstract readonly name: string;           // 适配器名称
  abstract readonly models: string[];       // 支持的模型列表

  // 能力声明 - 告知前端该适配器支持什么
  abstract readonly capabilities: {
    supportedResolutions: string[];         // ['1K', '2K', '4K']
    supportedAspectRatios: string[];        // ['1:1', '16:9', '9:16', '4:3', '3:4']
    supportsReferenceImages: boolean;       // 是否支持参考图
    maxReferenceImages: number;             // 最大参考图数量
    extraOptions?: string[];                // 特殊参数 ['sequential_image_generation']
  };

  // 统一生成接口
  abstract generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;

  // 检查参数是否支持（基类提供默认实现）
  validateParams(params: ImageGenerationParams): ValidationResult {
    const { resolution, aspectRatio, referenceImages } = params;

    if (resolution && !this.capabilities.supportedResolutions.includes(resolution)) {
      return { valid: false, error: `不支持的分辨率: ${resolution}` };
    }

    if (aspectRatio && aspectRatio !== 'auto' && !this.capabilities.supportedAspectRatios.includes(aspectRatio)) {
      return { valid: false, error: `不支持的比例: ${aspectRatio}` };
    }

    if (referenceImages && referenceImages.length > 0) {
      if (!this.capabilities.supportsReferenceImages) {
        return { valid: false, error: `该模型不支持参考图片` };
      }
      if (referenceImages.length > this.capabilities.maxReferenceImages) {
        return { valid: false, error: `参考图片数量超出限制 (最大 ${this.capabilities.maxReferenceImages})` };
      }
    }

    return { valid: true };
  }
}
```

## 5. Seedream 适配器 (`adapters/seedream-adapter.ts`)

### Seedream 4.5 分辨率映射表

| 分辨率 | 比例 | 实际尺寸 | 像素数 |
|-------|------|---------|--------|
| 1K | 1:1 | 1920×1920 | 3,686,400 |
| 1K | 16:9 | 2560×1440 | 3,686,400 |
| 1K | 9:16 | 1440×2560 | 3,686,400 |
| 1K | 4:3 | 2220×1665 | 3,696,300 |
| 1K | 3:4 | 1665×2220 | 3,696,300 |
| 2K | 1:1 | 2048×2048 | 4,194,304 |
| 2K | 16:9 | 2880×1620 | 4,665,600 |
| 2K | 9:16 | 1620×2880 | 4,665,600 |
| 2K | 4:3 | 2560×1920 | 4,915,200 |
| 2K | 3:4 | 1920×2560 | 4,915,200 |
| 4K | 1:1 | 4096×4096 | 16,777,216 |
| 4K | 16:9 | 4096×2304 | 9,437,184 |
| 4K | 9:16 | 2304×4096 | 9,437,184 |
| 4K | 4:3 | 4096×3072 | 12,582,912 |
| 4K | 3:4 | 3072×4096 | 12,582,912 |

> 注：seedream 4.5 最小像素限制为 3,686,400

### API 信息
- **端点**: `https://ark.cn-beijing.volces.com/api/v3/images/generations`
- **模型 ID**: `doubao-seedream-4-5-251128`
- **认证**: Bearer Token
- **特殊参数**: `sequential_image_generation` (组图功能)

```typescript
export class SeedreamAdapter extends ImageGenerationAdapter {
  readonly name = 'seedream';
  readonly models = ['seedream-4.5'];

  readonly capabilities = {
    supportedResolutions: ['1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportsReferenceImages: false,           // seedream 不支持参考图
    maxReferenceImages: 0,
    extraOptions: ['sequentialImageGeneration'],
  };

  private readonly resolutionMap: Record<string, Record<string, string>> = {
    '1K': { '1:1': '1920x1920', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2220x1665', '3:4': '1665x2220' },
    '2K': { '1:1': '2048x2048', '16:9': '2880x1620', '9:16': '1620x2880', '4:3': '2560x1920', '3:4': '1920x2560' },
    '4K': { '1:1': '4096x4096', '16:9': '4096x2304', '9:16': '2304x4096', '4:3': '4096x3072', '3:4': '3072x4096' },
  };

  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    // 实现详见代码
  }
}
```

## 6. Gemini 适配器 (`adapters/gemini-adapter.ts`)

从现有 `generate.ts` 迁移，保留：
- 优先 API 逻辑（可选启用）
- 多 API Key 轮转
- Vertex AI 回退
- 参考图片压缩处理

```typescript
export class GeminiAdapter extends ImageGenerationAdapter {
  readonly name = 'gemini';
  readonly models = ['nano-banana', 'nano-banana-pro'];

  readonly capabilities = {
    supportedResolutions: ['1K', '2K', '4K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', 'auto'],
    supportsReferenceImages: true,
    maxReferenceImages: 10,
    extraOptions: ['enableGoogleSearch'],
  };

  async generate(params: ImageGenerationParams): Promise<ImageGenerationResult> {
    // 迁移现有逻辑
  }
}
```

## 7. 统一入口 (`index.ts`)

```typescript
import { GeminiAdapter } from './adapters/gemini-adapter';
import { SeedreamAdapter } from './adapters/seedream-adapter';

const adapters = [
  new GeminiAdapter(),
  new SeedreamAdapter(),
];

const modelToAdapter = new Map<string, ImageGenerationAdapter>();
for (const adapter of adapters) {
  for (const model of adapter.models) {
    modelToAdapter.set(model, adapter);
  }
}

/** 生成图片 - 统一入口 */
export async function generateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
  const adapter = modelToAdapter.get(params.model);
  if (!adapter) {
    return { success: false, error: `不支持的模型: ${params.model}` };
  }

  const validation = adapter.validateParams(params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  return adapter.generate(params);
}

/** 获取所有可用模型及其能力 */
export function getAvailableModels(): AdapterCapabilities[] {
  return adapters.map(a => ({
    name: a.name,
    models: a.models.map(m => ({ id: m, label: getModelLabel(m) })),
    ...a.capabilities,
  }));
}
```

## 8. 前端更新

### 模型类型更新 (`types/image-gen.ts`)

```typescript
export const IMAGE_MODELS = {
  'nano-banana': { adapter: 'gemini', apiModel: 'gemini-2.5-flash-image', label: 'Gemini 快速' },
  'nano-banana-pro': { adapter: 'gemini', apiModel: 'gemini-3-pro-image-preview', label: 'Gemini 高级' },
  'seedream-4.5': { adapter: 'seedream', apiModel: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
} as const;

export type ImageModel = keyof typeof IMAGE_MODELS;
```

### ImageGenNode 模型选择

```typescript
options={[
  { value: "nano-banana", label: "Gemini 快速" },
  { value: "nano-banana-pro", label: "Gemini 高级" },
  { value: "seedream-4.5", label: "Seedream 4.5" },
]}
```

## 9. 实现步骤

1. 创建 `src/lib/image-generation/` 目录结构
2. 实现 `types.ts` 类型定义
3. 实现 `base-adapter.ts` 基类
4. 实现 `seedream-adapter.ts`（新增）
5. 迁移现有代码到 `gemini-adapter.ts`
6. 实现 `index.ts` 统一入口
7. 更新 `src/app/actions/generate.ts` 调用新接口
8. 更新前端组件添加 seedream 模型选项
9. 添加环境变量 `SEEDREAM_API_KEY`
10. 测试验证

## 10. 环境变量

新增：
```env
SEEDREAM_API_KEY=your-seedream-api-key
```
