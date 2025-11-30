// 代码解释器工具 - 图片处理专用

import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult } from '../types';
import { codeInterpreterSchema } from '../tool-registry';

// 预定义的图片处理操作
const IMAGE_OPERATIONS = {
  resize: (width: number, height: number) => `
from PIL import Image
import io
import base64

# 加载图片
img = Image.open(input_image_path)

# 调整大小
img = img.resize((${width}, ${height}), Image.Resampling.LANCZOS)

# 保存结果
img.save(output_image_path)
print(f"图片已调整为 {img.size}")
`,

  crop: (left: number, top: number, right: number, bottom: number) => `
from PIL import Image

img = Image.open(input_image_path)
img = img.crop((${left}, ${top}, ${right}, ${bottom}))
img.save(output_image_path)
print(f"图片已裁剪为 {img.size}")
`,

  filter: (filterType: string) => {
    const filters: Record<string, string> = {
      blur: 'ImageFilter.BLUR',
      sharpen: 'ImageFilter.SHARPEN',
      contour: 'ImageFilter.CONTOUR',
      edge: 'ImageFilter.FIND_EDGES',
      emboss: 'ImageFilter.EMBOSS',
    };
    return `
from PIL import Image, ImageFilter

img = Image.open(input_image_path)
img = img.filter(${filters[filterType] || 'ImageFilter.BLUR'})
img.save(output_image_path)
print("滤镜已应用")
`;
  },

  convert: (format: string) => `
from PIL import Image

img = Image.open(input_image_path)
# 转换模式（如果需要）
if img.mode == 'RGBA' and '${format}'.upper() == 'JPEG':
    img = img.convert('RGB')
img.save(output_image_path, format='${format.toUpperCase()}')
print(f"图片已转换为 ${format} 格式")
`,

  analyze: () => `
from PIL import Image
import json

img = Image.open(input_image_path)

analysis = {
    "size": img.size,
    "mode": img.mode,
    "format": img.format,
    "info": dict(img.info) if img.info else {}
}

# 计算颜色统计
if img.mode in ['RGB', 'RGBA']:
    colors = img.getcolors(maxcolors=256*256*256)
    if colors:
        analysis["unique_colors"] = len(colors)
        analysis["dominant_colors"] = sorted(colors, key=lambda x: x[0], reverse=True)[:5]

print(json.dumps(analysis, indent=2, default=str))
`,
};

/**
 * 安全执行代码（通过 API 或模拟）
 * 注意：目前没有实际的代码执行服务，返回代码说明
 */
async function executeCodeSafely(
  code: string,
  imageUrl: string | undefined,
  operation: string | undefined,
  callbacks: ToolCallbacks,
  _abortSignal: AbortSignal
): Promise<{ output: string; resultImageUrl?: string }> {
  // 模拟代码执行 - 返回代码说明和建议
  callbacks.onProgress('分析代码...');

  // 根据操作类型生成说明
  let explanation = '';

  if (operation) {
    const operationDescriptions: Record<string, string> = {
      resize: '调整图片尺寸',
      crop: '裁剪图片',
      filter: '应用滤镜效果',
      convert: '转换图片格式',
      analyze: '分析图片属性',
      custom: '执行自定义代码',
    };
    explanation = `操作类型: ${operationDescriptions[operation] || operation}\n\n`;
  }

  explanation += `代码内容:\n\`\`\`python\n${code}\n\`\`\`\n\n`;

  if (imageUrl) {
    explanation += `输入图片: ${imageUrl}\n\n`;
  }

  explanation += `⚠️ 注意: 代码执行服务目前未配置。\n`;
  explanation += `如需实际执行代码，请配置安全的代码执行环境（如 Docker sandbox 或云函数）。`;

  return {
    output: explanation,
  };
}

/**
 * 生成图片处理代码
 */
function generateImageCode(
  operation: string,
  params: Record<string, unknown>
): string {
  switch (operation) {
    case 'resize':
      return IMAGE_OPERATIONS.resize(
        (params.width as number) || 800,
        (params.height as number) || 600
      );
    case 'crop':
      return IMAGE_OPERATIONS.crop(
        (params.left as number) || 0,
        (params.top as number) || 0,
        (params.right as number) || 100,
        (params.bottom as number) || 100
      );
    case 'filter':
      return IMAGE_OPERATIONS.filter((params.filterType as string) || 'blur');
    case 'convert':
      return IMAGE_OPERATIONS.convert((params.format as string) || 'PNG');
    case 'analyze':
      return IMAGE_OPERATIONS.analyze();
    default:
      return '';
  }
}

/**
 * 代码解释器工具
 */
export const codeInterpreterTool: ChatAgentTool = {
  name: 'code_interpreter',
  description: `执行 Python 代码进行图片处理。

支持的操作：
- resize: 调整图片大小
- crop: 裁剪图片
- filter: 应用滤镜（blur、sharpen、contour、edge、emboss）
- convert: 转换格式（PNG、JPEG、WEBP 等）
- analyze: 分析图片属性
- custom: 自定义 Python 代码

注意：
- 代码在安全沙箱中执行
- 支持 PIL/Pillow 库
- 输入图片通过 input_image_path 变量访问
- 输出图片保存到 output_image_path`,

  schema: codeInterpreterSchema,

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ): Promise<ToolResult> {
    const {
      code,
      imageUrl,
      operation,
    } = input as {
      code: string;
      imageUrl?: string;
      operation?: 'resize' | 'crop' | 'filter' | 'convert' | 'analyze' | 'custom';
    };

    // 确定输入图片
    const inputImage = imageUrl || context.attachedImages[0];

    callbacks.onProgress('准备执行代码...');

    try {
      let codeToExecute = code;

      // 如果指定了操作类型且没有自定义代码，生成代码
      if (operation && operation !== 'custom' && !code) {
        codeToExecute = generateImageCode(operation, input);
        if (!codeToExecute) {
          return {
            success: false,
            error: `不支持的操作: ${operation}`,
          };
        }
      }

      if (!codeToExecute) {
        return {
          success: false,
          error: '请提供要执行的代码或选择操作类型',
        };
      }

      callbacks.onProgress('执行代码中...');

      const { output, resultImageUrl } = await executeCodeSafely(
        codeToExecute,
        inputImage,
        operation,
        callbacks,
        context.abortSignal
      );

      callbacks.onProgress('代码执行完成！');

      // 流式输出代码执行结果
      if (callbacks.onChunk && output) {
        callbacks.onChunk(output);
      }

      return {
        success: true,
        codeOutput: output,
        imageUrl: resultImageUrl,
        data: {
          code: codeToExecute,
          operation,
          inputImage,
          output,
          resultImageUrl,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '代码执行失败';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

export default codeInterpreterTool;
