// Chat Agent 工具注册表

import { z } from 'zod';
import type { ChatAgentTool, ClaudeTool, ToolRegistryOptions } from './types';
import { zodToJsonSchema } from 'zod-to-json-schema';

// 工具注册表
class ToolRegistry {
  private tools: Map<string, ChatAgentTool> = new Map();
  private conditionalTools: Set<string> = new Set(); // 条件启用的工具

  // 注册工具
  register(tool: ChatAgentTool, conditional: boolean = false): void {
    this.tools.set(tool.name, tool);
    if (conditional) {
      this.conditionalTools.add(tool.name);
    }
  }

  // 获取单个工具
  get(name: string): ChatAgentTool | undefined {
    return this.tools.get(name);
  }

  // 获取所有工具（根据选项过滤）
  getAll(options: ToolRegistryOptions = {}): ChatAgentTool[] {
    const { enableDeepResearch = false } = options;

    return Array.from(this.tools.values()).filter(tool => {
      // 如果是条件工具，检查是否启用
      if (this.conditionalTools.has(tool.name)) {
        if (tool.name === 'deep_research' && !enableDeepResearch) {
          return false;
        }
      }
      return true;
    });
  }

  // 获取工具名称列表
  getNames(options: ToolRegistryOptions = {}): string[] {
    return this.getAll(options).map(t => t.name);
  }

  // 转换为 Claude API 格式
  formatForClaude(options: ToolRegistryOptions = {}): ClaudeTool[] {
    const tools = this.getAll(options);

    return tools.map(tool => {
      // 将 Zod schema 转换为 JSON Schema
      // 使用类型断言解决 zod 版本兼容性问题
      const jsonSchema = zodToJsonSchema(tool.schema as any, {
        $refStrategy: 'none',
        target: 'openApi3',
      });

      // 提取 properties 和 required
      const schemaObj = jsonSchema as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };

      return {
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: 'object' as const,
          properties: (schemaObj.properties || {}) as Record<string, {
            type: string;
            description: string;
            enum?: string[];
            items?: { type: string };
          }>,
          required: schemaObj.required || [],
        },
      };
    });
  }

  // 清空注册表
  clear(): void {
    this.tools.clear();
    this.conditionalTools.clear();
  }
}

// 单例实例
export const toolRegistry = new ToolRegistry();

// 便捷函数：注册工具
export function registerTool(tool: ChatAgentTool, conditional: boolean = false): void {
  toolRegistry.register(tool, conditional);
}

// 便捷函数：获取工具
export function getTool(name: string): ChatAgentTool | undefined {
  return toolRegistry.get(name);
}

// 便捷函数：获取所有工具
export function getAllTools(options?: ToolRegistryOptions): ChatAgentTool[] {
  return toolRegistry.getAll(options);
}

// 便捷函数：格式化为 Claude API
export function formatToolsForClaude(options?: ToolRegistryOptions): ClaudeTool[] {
  return toolRegistry.formatForClaude(options);
}

// ========== 工具 Schema 定义（供各工具使用） ==========

// 网络搜索
export const webSearchSchema = z.object({
  query: z.string().describe('搜索查询关键词'),
  maxResults: z.number().optional().default(5).describe('最大结果数量，默认5'),
});

// 深度研究
export const deepResearchSchema = z.object({
  topic: z.string().describe('研究主题'),
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional().default('low')
    .describe('研究强度：low(1-3分钟)、medium(3-7分钟)、high(7-15分钟)'),
  context: z.string().optional().describe('补充背景信息'),
});

// 生成图片
export const generateImageSchema = z.object({
  prompt: z.string().describe('图片描述提示词'),
  style: z.enum(['realistic', 'anime', 'artistic', 'photo']).optional()
    .describe('图片风格'),
  referenceImageUrl: z.string().optional()
    .describe('参考图片URL，可从对话上下文中的已上传图片获取'),
  aspectRatio: z.enum(['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']).optional()
    .describe('图片比例，auto 表示自动选择'),
  resolution: z.enum(['1k', '2k', '4k']).optional()
    .describe('图片分辨率：1k(1024px)、2k(2048px)、4k(4096px)'),
});

// 编辑图片
export const editImageSchema = z.object({
  imageUrl: z.string().describe('要编辑的图片URL'),
  editPrompt: z.string().describe('编辑指令，描述要如何修改图片'),
  maskArea: z.string().optional().describe('需要编辑的区域描述'),
});

// 分析文档
export const analyzeDocumentSchema = z.object({
  documentContent: z.string().optional().describe('文档内容（如果已解析）'),
  documentUrl: z.string().optional().describe('文档URL（如果需要下载）'),
  analysisType: z.enum(['summary', 'extract', 'qa', 'translate']).optional()
    .describe('分析类型：summary(摘要)、extract(提取信息)、qa(问答)、translate(翻译)'),
  query: z.string().optional().describe('针对文档的具体问题'),
});

// 代码解释器（图片处理）
export const codeInterpreterSchema = z.object({
  code: z.string().describe('要执行的 Python 代码'),
  imageUrl: z.string().optional().describe('输入图片URL（如果需要处理图片）'),
  operation: z.enum(['resize', 'crop', 'filter', 'convert', 'analyze', 'custom']).optional()
    .describe('图片操作类型'),
});
