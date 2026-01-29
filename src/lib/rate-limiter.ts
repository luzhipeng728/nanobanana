/**
 * 全局速率限制器 - 基于 RPM (Requests Per Minute)
 * Fast 模型: 500 RPM
 * Pro 模型: 20 RPM
 */

export type ModelType = "nano-banana" | "nano-banana-pro" | "seedream-4.5" | "glm-image";

interface QueueItem {
  id: string;
  model: ModelType;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  addedAt: number;
}

interface RateLimiterState {
  // 每个模型的请求计数（按分钟窗口）
  requestCounts: Map<ModelType, { count: number; windowStart: number }>;
  // 任务队列
  queue: QueueItem[];
  // 正在处理的任务数
  processing: number;
  // 是否正在处理队列
  isProcessing: boolean;
}

// RPM 限制配置
const RPM_LIMITS: Record<ModelType, number> = {
  "nano-banana": 500,      // Fast 模型 500 RPM
  "nano-banana-pro": 20,   // Pro 模型 20 RPM
  "seedream-4.5": 60,      // Seedream 4.5 60 RPM (保守估计)
  "glm-image": 60,         // GLM 智谱 60 RPM
};

// 最大并发数（避免同时发送太多请求）
const MAX_CONCURRENT: Record<ModelType, number> = {
  "nano-banana": 50,       // Fast 模型最多 50 并发
  "nano-banana-pro": 5,    // Pro 模型最多 5 并发
  "seedream-4.5": 10,      // Seedream 最多 10 并发
  "glm-image": 10,         // GLM 最多 10 并发
};

// 全局状态（单例）
const state: RateLimiterState = {
  requestCounts: new Map(),
  queue: [],
  processing: 0,
  isProcessing: false,
};

// 获取当前模型的可用配额
function getAvailableQuota(model: ModelType): number {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 分钟窗口

  let modelState = state.requestCounts.get(model);

  // 如果没有记录或窗口已过期，重置
  if (!modelState || (now - modelState.windowStart) >= windowMs) {
    modelState = { count: 0, windowStart: now };
    state.requestCounts.set(model, modelState);
  }

  const limit = RPM_LIMITS[model];
  return Math.max(0, limit - modelState.count);
}

// 消耗配额
function consumeQuota(model: ModelType): boolean {
  const available = getAvailableQuota(model);
  if (available <= 0) return false;

  const modelState = state.requestCounts.get(model)!;
  modelState.count++;
  return true;
}

// 获取需要等待的时间（毫秒）
function getWaitTime(model: ModelType): number {
  const modelState = state.requestCounts.get(model);
  if (!modelState) return 0;

  const now = Date.now();
  const windowMs = 60 * 1000;
  const elapsed = now - modelState.windowStart;

  if (elapsed >= windowMs) return 0;

  // 如果配额用完，需要等待窗口重置
  if (getAvailableQuota(model) <= 0) {
    return windowMs - elapsed + 100; // 额外 100ms 缓冲
  }

  return 0;
}

// 处理队列
async function processQueue() {
  if (state.isProcessing) return;
  state.isProcessing = true;

  while (state.queue.length > 0) {
    // 按模型分组检查
    const fastItems = state.queue.filter(item => item.model === "nano-banana");
    const proItems = state.queue.filter(item => item.model === "nano-banana-pro");
    const seedreamItems = state.queue.filter(item => item.model === "seedream-4.5");
    const glmItems = state.queue.filter(item => item.model === "glm-image");

    let processed = false;

    // 处理 Fast 模型队列
    const fastConcurrent = state.queue.filter(
      item => item.model === "nano-banana" && state.processing < MAX_CONCURRENT["nano-banana"]
    ).length;

    for (const item of fastItems) {
      if (getAvailableQuota("nano-banana") > 0 &&
          fastConcurrent < MAX_CONCURRENT["nano-banana"]) {
        if (consumeQuota("nano-banana")) {
          processItem(item);
          processed = true;
        }
      }
    }

    // 处理 Pro 模型队列
    const proConcurrent = state.queue.filter(
      item => item.model === "nano-banana-pro" && state.processing < MAX_CONCURRENT["nano-banana-pro"]
    ).length;

    for (const item of proItems) {
      if (getAvailableQuota("nano-banana-pro") > 0 &&
          proConcurrent < MAX_CONCURRENT["nano-banana-pro"]) {
        if (consumeQuota("nano-banana-pro")) {
          processItem(item);
          processed = true;
        }
      }
    }

    // 处理 Seedream 4.5 模型队列
    const seedreamConcurrent = state.queue.filter(
      item => item.model === "seedream-4.5" && state.processing < MAX_CONCURRENT["seedream-4.5"]
    ).length;

    for (const item of seedreamItems) {
      if (getAvailableQuota("seedream-4.5") > 0 &&
          seedreamConcurrent < MAX_CONCURRENT["seedream-4.5"]) {
        if (consumeQuota("seedream-4.5")) {
          processItem(item);
          processed = true;
        }
      }
    }

    // 处理 GLM 模型队列
    const glmConcurrent = state.queue.filter(
      item => item.model === "glm-image" && state.processing < MAX_CONCURRENT["glm-image"]
    ).length;

    for (const item of glmItems) {
      if (getAvailableQuota("glm-image") > 0 &&
          glmConcurrent < MAX_CONCURRENT["glm-image"]) {
        if (consumeQuota("glm-image")) {
          processItem(item);
          processed = true;
        }
      }
    }

    // 如果没有处理任何项，等待一段时间
    if (!processed && state.queue.length > 0) {
      const waitFast = getWaitTime("nano-banana");
      const waitPro = getWaitTime("nano-banana-pro");
      const waitSeedream = getWaitTime("seedream-4.5");
      const waitGlm = getWaitTime("glm-image");
      const minWait = Math.min(
        fastItems.length > 0 ? waitFast : Infinity,
        proItems.length > 0 ? waitPro : Infinity,
        seedreamItems.length > 0 ? waitSeedream : Infinity,
        glmItems.length > 0 ? waitGlm : Infinity
      );

      if (minWait > 0 && minWait < Infinity) {
        console.log(`⏳ [RateLimiter] Waiting ${minWait}ms for rate limit reset...`);
        await new Promise(resolve => setTimeout(resolve, Math.min(minWait, 5000)));
      } else {
        // 短暂等待避免忙循环
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 如果队列为空且没有正在处理的任务，退出
    if (state.queue.length === 0 && state.processing === 0) {
      break;
    }
  }

  state.isProcessing = false;
}

// 处理单个任务
async function processItem(item: QueueItem) {
  // 从队列中移除
  const index = state.queue.findIndex(q => q.id === item.id);
  if (index !== -1) {
    state.queue.splice(index, 1);
  }

  state.processing++;

  try {
    const result = await item.execute();
    item.resolve(result);
  } catch (error) {
    item.reject(error);
  } finally {
    state.processing--;
    // 继续处理队列
    if (state.queue.length > 0) {
      processQueue();
    }
  }
}

/**
 * 将任务加入速率限制队列
 * @param model 模型类型
 * @param execute 执行函数
 * @returns Promise，在任务执行完成后 resolve
 */
export function enqueue<T>(
  model: ModelType,
  execute: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      model,
      execute,
      resolve,
      reject,
      addedAt: Date.now(),
    };

    state.queue.push(item);

    console.log(`📥 [RateLimiter] Task added to queue. Model: ${model}, Queue size: ${state.queue.length}`);

    // 开始处理队列
    processQueue();
  });
}

/**
 * 获取队列状态
 */
export function getQueueStatus() {
  return {
    queueLength: state.queue.length,
    processing: state.processing,
    fastQuota: getAvailableQuota("nano-banana"),
    proQuota: getAvailableQuota("nano-banana-pro"),
    seedreamQuota: getAvailableQuota("seedream-4.5"),
    glmQuota: getAvailableQuota("glm-image"),
    fastInQueue: state.queue.filter(item => item.model === "nano-banana").length,
    proInQueue: state.queue.filter(item => item.model === "nano-banana-pro").length,
    seedreamInQueue: state.queue.filter(item => item.model === "seedream-4.5").length,
    glmInQueue: state.queue.filter(item => item.model === "glm-image").length,
  };
}

/**
 * 清空队列（取消所有等待中的任务）
 */
export function clearQueue() {
  const cancelled = state.queue.length;
  state.queue.forEach(item => {
    item.reject(new Error("Queue cleared"));
  });
  state.queue = [];
  console.log(`🗑️ [RateLimiter] Cleared ${cancelled} tasks from queue`);
  return cancelled;
}
