// Chat Agent 工具导出和注册

import { registerTool } from '../tool-registry';

// 导入所有工具
import { webSearchTool } from './web-search';
import { deepResearchTool } from './deep-research';
import { generateImageTool } from './generate-image';
import { editImageTool } from './edit-image';
import { analyzeDocumentTool } from './analyze-document';
import { codeInterpreterTool } from './code-interpreter';

// 导出所有工具
export {
  webSearchTool,
  deepResearchTool,
  generateImageTool,
  editImageTool,
  analyzeDocumentTool,
  codeInterpreterTool,
};

// 所有工具列表
export const allTools = [
  webSearchTool,
  deepResearchTool,
  generateImageTool,
  editImageTool,
  analyzeDocumentTool,
  codeInterpreterTool,
];

// 条件工具（需要特定开关才启用）
export const conditionalToolNames = ['deep_research'];

/**
 * 注册所有工具到注册表
 */
export function registerAllTools(): void {
  // 注册普通工具
  registerTool(webSearchTool, false);
  registerTool(generateImageTool, false);
  registerTool(editImageTool, false);
  registerTool(analyzeDocumentTool, false);
  registerTool(codeInterpreterTool, false);

  // 注册条件工具（deep_research 需要勾选才启用）
  registerTool(deepResearchTool, true);
}

/**
 * 获取工具实例映射
 */
export function getToolInstanceMap(): Map<string, typeof allTools[number]> {
  const map = new Map();
  for (const tool of allTools) {
    map.set(tool.name, tool);
  }
  return map;
}

// 自动注册
registerAllTools();
