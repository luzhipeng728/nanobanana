"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
} from "lucide-react";

interface ApiKey {
  id: string;
  provider: string;
  key: string;
  fullKey: string;
  name: string | null;
  isActive: boolean;
  priority: number;
  usageCount: number;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini (豆包画布)",
  seedream: "Seedream 4.5",
};

export default function ApiKeysClient({ currentUser }: { currentUser: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // 获取 API Keys
  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (data.success) {
        setKeys(data.keys);
      }
    } catch (error) {
      console.error("获取 API Keys 失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // 复制 Key
  const copyKey = async (id: string, fullKey: string) => {
    await navigator.clipboard.writeText(fullKey);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 切换 Key 显示
  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 切换激活状态
  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !isActive }),
      });
      const data = await res.json();
      if (data.success) {
        fetchKeys();
      } else {
        alert(data.error || "更新失败");
      }
    } catch (error) {
      console.error("更新失败:", error);
      alert("更新失败");
    }
  };

  // 删除 Key
  const deleteKey = async (id: string) => {
    if (!confirm("确定要删除这个 API Key 吗？删除后无法恢复！")) return;

    try {
      const res = await fetch(`/api/admin/api-keys?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchKeys();
      } else {
        alert(data.error || "删除失败");
      }
    } catch (error) {
      console.error("删除失败:", error);
      alert("删除失败");
    }
  };

  // 按 provider 分组
  const groupedKeys = keys.reduce((acc, key) => {
    if (!acc[key.provider]) {
      acc[key.provider] = [];
    }
    acc[key.provider].push(key);
    return acc;
  }, {} as Record<string, ApiKey[]>);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* 头部 */}
      <header className="bg-white border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="p-2 hover:bg-[var(--secondary)] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--muted-foreground)]" />
            </Link>
            <Link href="/" className="text-2xl font-bold text-[var(--primary)]">
              豆包画布
            </Link>
            <span className="text-sm text-[var(--muted-foreground)]">
              管理后台 / API Keys
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--foreground)]">
              管理员: {currentUser}
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加 Key
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 统计 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">Gemini Keys</div>
            <div className="text-3xl font-bold text-[var(--primary)] mt-1">
              {groupedKeys["gemini"]?.filter((k) => k.isActive).length || 0}
              <span className="text-lg text-[var(--muted-foreground)]">
                {" "}/ {groupedKeys["gemini"]?.length || 0}
              </span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">Seedream Keys</div>
            <div className="text-3xl font-bold text-purple-600 mt-1">
              {groupedKeys["seedream"]?.filter((k) => k.isActive).length || 0}
              <span className="text-lg text-[var(--muted-foreground)]">
                {" "}/ {groupedKeys["seedream"]?.length || 0}
              </span>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">总调用次数</div>
            <div className="text-3xl font-bold text-[var(--foreground)] mt-1">
              {keys.reduce((sum, k) => sum + k.usageCount, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[var(--muted-foreground)]">
            加载中...
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-12 h-12 mx-auto text-[var(--muted-foreground)] mb-4" />
            <p className="text-[var(--muted-foreground)]">暂无 API Key</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90"
            >
              添加第一个 Key
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedKeys).map(([provider, providerKeys]) => (
              <div key={provider} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-6 py-4 bg-[var(--secondary)] border-b border-[var(--border)]">
                  <h2 className="font-bold text-[var(--foreground)]">
                    {PROVIDER_LABELS[provider] || provider}
                  </h2>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {providerKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className={`p-4 flex items-center gap-4 ${
                        !apiKey.isActive ? "bg-gray-50 opacity-60" : ""
                      }`}
                    >
                      {/* Key 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--foreground)]">
                            {apiKey.name || "未命名"}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              apiKey.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {apiKey.isActive ? "启用" : "禁用"}
                          </span>
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                            优先级: {apiKey.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-sm text-[var(--muted-foreground)] font-mono">
                            {visibleKeys.has(apiKey.id) ? apiKey.fullKey : apiKey.key}
                          </code>
                          <button
                            onClick={() => toggleKeyVisibility(apiKey.id)}
                            className="p-1 hover:bg-[var(--secondary)] rounded"
                            title={visibleKeys.has(apiKey.id) ? "隐藏" : "显示"}
                          >
                            {visibleKeys.has(apiKey.id) ? (
                              <EyeOff className="w-4 h-4 text-[var(--muted-foreground)]" />
                            ) : (
                              <Eye className="w-4 h-4 text-[var(--muted-foreground)]" />
                            )}
                          </button>
                          <button
                            onClick={() => copyKey(apiKey.id, apiKey.fullKey)}
                            className="p-1 hover:bg-[var(--secondary)] rounded"
                            title="复制"
                          >
                            {copiedId === apiKey.id ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4 text-[var(--muted-foreground)]" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-[var(--muted-foreground)]">
                          <span>调用: {apiKey.usageCount.toLocaleString()} 次</span>
                          {apiKey.lastUsedAt && (
                            <span>
                              最后使用: {new Date(apiKey.lastUsedAt).toLocaleString("zh-CN")}
                            </span>
                          )}
                          {apiKey.lastError && (
                            <span className="text-red-500 truncate max-w-[200px]" title={apiKey.lastError}>
                              错误: {apiKey.lastError}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(apiKey.id, apiKey.isActive)}
                          className={`p-2 rounded-lg transition-colors ${
                            apiKey.isActive
                              ? "hover:bg-red-50 text-green-600"
                              : "hover:bg-green-50 text-gray-400"
                          }`}
                          title={apiKey.isActive ? "禁用" : "启用"}
                        >
                          {apiKey.isActive ? (
                            <ToggleRight className="w-6 h-6" />
                          ) : (
                            <ToggleLeft className="w-6 h-6" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteKey(apiKey.id)}
                          className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 添加 Key 弹窗 */}
      {showAddModal && (
        <AddKeyModal onClose={() => setShowAddModal(false)} onSuccess={fetchKeys} />
      )}
    </div>
  );
}

// 添加 Key 弹窗
function AddKeyModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [provider, setProvider] = useState("gemini");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("0");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      alert("请输入 API Key");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: key.trim(), name: name.trim() || null, priority }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        alert(data.error || "添加失败");
      }
    } catch (error) {
      console.error("添加失败:", error);
      alert("添加失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--foreground)]">添加 API Key</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              提供商
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="gemini">Gemini (豆包画布)</option>
              <option value="seedream">Seedream 4.5</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="输入 API Key..."
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              备注名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：主账号、备用 Key 1"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              优先级（数字越大优先级越高）
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--secondary)] transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "添加中..." : "添加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
