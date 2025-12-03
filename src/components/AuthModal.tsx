import React, { useState } from "react";
import { User as UserIcon, LogOut, X } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  username: string;
  setUsername: (name: string) => void;
  onLogin: (password: string) => void;
  onRegister: (password: string) => void;
  onLogout: () => void;
  isLoading: boolean;
  authError: string;
  setAuthError: (error: string) => void;
}

export const AuthModal = React.memo(({
  isOpen,
  onClose,
  userId,
  username,
  setUsername,
  onLogin,
  onRegister,
  onLogout,
  isLoading,
  authError,
  setAuthError
}: AuthModalProps) => {
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [localLoading, setLocalLoading] = useState(false);

  if (!isOpen) return null;

  const handleAuth = async () => {
    setLocalLoading(true);
    try {
      if (authMode === "login") {
        await onLogin(password);
      } else {
        await onRegister(password);
      }
      // Clear password on success handled by parent, or error handled by parent
    } finally {
      setLocalLoading(false);
    }
  };

  // Toggle mode
  const toggleAuthMode = () => {
    setAuthMode(authMode === "login" ? "register" : "login");
    setAuthError("");
  };

  // If user is already logged in, show simple info or don't show modal? 
  // Based on original code, this modal only shows when !userId usually, or if we want to show user info.
  // But original code had a dropdown for logged in users and this modal for login/register.
  // Let's assume this is purely for Login/Register.

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl shadow-2xl w-96 border border-neutral-200 dark:border-neutral-800 transform transition-all">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">
            {authMode === "login" ? "登录 NanoBanana" : "注册 NanoBanana"}
          </h2>
          {userId && (
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-full">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        
        <p className="text-sm text-neutral-500 mb-6">
          {authMode === "login" ? "欢迎回来！请输入账号密码登录" : "创建新账号开始你的创作之旅"}
        </p>

        {/* 错误提示 */}
        {authError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
            <div className="w-1 h-4 bg-red-500 rounded-full"></div>
            {authError}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-shadow"
            autoFocus
            disabled={localLoading || isLoading}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAuth()}
            placeholder="密码"
            className="w-full p-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-shadow"
            disabled={localLoading || isLoading}
          />
        </div>

        <button
          onClick={handleAuth}
          disabled={localLoading || isLoading || !username || !password}
          className="w-full mt-6 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white py-3 rounded-xl transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30"
        >
          {localLoading || isLoading ? "处理中..." : (authMode === "login" ? "登录" : "注册")}
        </button>

        <div className="mt-4 text-center">
          <button
            onClick={toggleAuthMode}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline underline-offset-4"
            disabled={localLoading || isLoading}
          >
            {authMode === "login" ? "没有账号？点击注册" : "已有账号？点击登录"}
          </button>
        </div>

        {authMode === "register" && (
          <p className="text-xs text-neutral-400 mt-4 text-center">
            用户名 2-20 字符，密码至少 6 位
          </p>
        )}
      </div>
    </div>
  );
});

AuthModal.displayName = "AuthModal";
