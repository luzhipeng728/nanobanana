/**
 * API Key 管理服务
 *
 * 从数据库获取和管理 Gemini、Seedream 等外部服务的 API Key
 */

import { prisma } from './prisma';

export type ApiKeyProvider = 'gemini' | 'seedream';

interface ApiKeyInfo {
  id: string;
  key: string;
  name: string | null;
  priority: number;
}

// 内存缓存（避免频繁查询数据库）
const keyCache: Map<ApiKeyProvider, { keys: ApiKeyInfo[]; loadedAt: number }> = new Map();
const CACHE_TTL = 60 * 1000; // 1 分钟缓存

/**
 * 获取指定提供商的所有有效 API Key（按优先级排序）
 */
export async function getApiKeys(provider: ApiKeyProvider): Promise<ApiKeyInfo[]> {
  // 检查缓存
  const cached = keyCache.get(provider);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.keys;
  }

  // 从数据库获取
  const keys = await prisma.apiKey.findMany({
    where: {
      provider,
      isActive: true,
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      key: true,
      name: true,
      priority: true,
    },
  });

  // 更新缓存
  keyCache.set(provider, { keys, loadedAt: Date.now() });

  return keys;
}

/**
 * 获取指定提供商的第一个可用 Key
 */
export async function getApiKey(provider: ApiKeyProvider): Promise<string | null> {
  const keys = await getApiKeys(provider);
  return keys.length > 0 ? keys[0].key : null;
}

/**
 * 获取所有 Gemini Keys（用于轮询）
 */
export async function getGeminiKeys(): Promise<string[]> {
  const keys = await getApiKeys('gemini');
  return keys.map(k => k.key);
}

/**
 * 获取 Seedream Key
 */
export async function getSeedreamKey(): Promise<string | null> {
  return getApiKey('seedream');
}

/**
 * 记录 Key 使用情况
 */
export async function recordKeyUsage(keyId: string, error?: string): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
        ...(error ? { lastError: error } : {}),
      },
    });
  } catch (e) {
    console.error('[ApiKeys] Failed to record key usage:', e);
  }
}

/**
 * 清除缓存（当数据库中的 Key 更新后调用）
 */
export function clearApiKeyCache(provider?: ApiKeyProvider): void {
  if (provider) {
    keyCache.delete(provider);
  } else {
    keyCache.clear();
  }
}

/**
 * 检查是否有可用的 Key（用于启动时检查）
 */
export async function hasApiKeys(provider: ApiKeyProvider): Promise<boolean> {
  const keys = await getApiKeys(provider);
  return keys.length > 0;
}
