#!/bin/bash
# ============================================================================
# GitHub Secrets 配置脚本
# 使用方法: ./scripts/setup-github-secrets.sh
# 需要先安装 GitHub CLI: https://cli.github.com/
# ============================================================================

set -e

REPO="luzhipeng728/nanobanana"

echo "=== NanoBanana GitHub Secrets 配置脚本 ==="
echo ""

# 检查 gh 是否安装
if ! command -v gh &> /dev/null; then
    echo "错误: 需要安装 GitHub CLI (gh)"
    echo "安装方法: https://cli.github.com/"
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo "请先登录 GitHub CLI:"
    gh auth login
fi

# 从 .env 文件读取配置
if [ ! -f ".env" ]; then
    echo "错误: 找不到 .env 文件"
    exit 1
fi

echo "正在从 .env 文件读取配置..."
echo ""

# 函数：设置 secret
set_secret() {
    local name=$1
    local value=$2
    if [ -n "$value" ] && [ "$value" != "your_"* ]; then
        echo "  设置 $name..."
        echo "$value" | gh secret set "$name" --repo "$REPO"
    else
        echo "  跳过 $name (未配置)"
    fi
}

# 从 .env 读取并设置
source .env

echo "=== 配置 Database ==="
set_secret "DATABASE_URL" "$DATABASE_URL"

echo ""
echo "=== 配置 Cloudflare R2 ==="
set_secret "R2_ACCOUNT_ID" "$R2_ACCOUNT_ID"
set_secret "R2_ACCESS_KEY_ID" "$R2_ACCESS_KEY_ID"
set_secret "R2_SECRET_ACCESS_KEY" "$R2_SECRET_ACCESS_KEY"
set_secret "R2_BUCKET_NAME" "$R2_BUCKET_NAME"
set_secret "R2_PUBLIC_URL" "$R2_PUBLIC_URL"

echo ""
echo "=== 配置 OpenAI ==="
set_secret "OPENAI_BASE_URL" "$OPENAI_BASE_URL"
set_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
set_secret "OPENAI_MODEL" "$OPENAI_MODEL"

echo ""
echo "=== 配置 Gemini ==="
set_secret "GEMINI_API_KEY" "$GEMINI_API_KEY"
set_secret "GEMINI_API_KEY_2" "$GEMINI_API_KEY_2"
set_secret "GEMINI_API_KEY_3" "$GEMINI_API_KEY_3"
set_secret "GEMINI_MODEL" "$GEMINI_MODEL"

echo ""
echo "=== 配置 Tavily ==="
set_secret "TAVILY_API_KEY" "$TAVILY_API_KEY"

echo ""
echo "=== 配置 Mureka ==="
set_secret "MUREKA_API_URL" "$MUREKA_API_URL"
set_secret "MUREKA_API_TOKEN" "$MUREKA_API_TOKEN"

echo ""
echo "=== 配置 Sora ==="
set_secret "SORA_API_BASE_URL" "$SORA_API_BASE_URL"
set_secret "SORA_API_TOKEN" "$SORA_API_TOKEN"
set_secret "SORA_API_TYPE" "$SORA_API_TYPE"

echo ""
echo "=== 配置 Google Cloud ==="
set_secret "GOOGLE_CLOUD_PROJECT" "$GOOGLE_CLOUD_PROJECT"
set_secret "GOOGLE_CLOUD_LOCATION" "$GOOGLE_CLOUD_LOCATION"

echo ""
echo "=== 配置 Anthropic ==="
set_secret "ANTHROPIC_BASE_URL" "$ANTHROPIC_BASE_URL"
set_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"

echo ""
echo "=== 配置 Google Search ==="
set_secret "GOOGLE_SEARCH_API_KEY" "$GOOGLE_SEARCH_API_KEY"
set_secret "GOOGLE_SEARCH_ENGINE_ID" "$GOOGLE_SEARCH_ENGINE_ID"

echo ""
echo "=== 配置 Claude ==="
set_secret "CLAUDE_MODEL" "$CLAUDE_MODEL"
set_secret "CLAUDE_MAX_TOKENS" "$CLAUDE_MAX_TOKENS"
set_secret "CLAUDE_LIGHT_MODEL" "$CLAUDE_LIGHT_MODEL"
set_secret "CLAUDE_LIGHT_MAX_TOKENS" "$CLAUDE_LIGHT_MAX_TOKENS"
set_secret "DEEP_RESEARCH_MAX_ROUNDS" "$DEEP_RESEARCH_MAX_ROUNDS"

echo ""
echo "=== 配置 HyprLab ==="
set_secret "HYPRLAB_API_KEY" "$HYPRLAB_API_KEY"

echo ""
echo "=== 配置 Bytedance TTS ==="
set_secret "BYTEDANCE_TTS_API_KEY" "$BYTEDANCE_TTS_API_KEY"
set_secret "BYTEDANCE_TTS_RESOURCE_ID" "$BYTEDANCE_TTS_RESOURCE_ID"

echo ""
echo "=== 配置 Scrollytelling ==="
set_secret "SCROLLYTELLING_API_BASE_URL" "$SCROLLYTELLING_API_BASE_URL"
set_secret "SCROLLYTELLING_API_KEY" "$SCROLLYTELLING_API_KEY"
set_secret "SCROLLYTELLING_MODEL" "$SCROLLYTELLING_MODEL"

echo ""
echo "=== 配置 Priority Image API ==="
set_secret "PRIORITY_IMAGE_API_BASE_URL" "$PRIORITY_IMAGE_API_BASE_URL"
set_secret "PRIORITY_IMAGE_API_KEY" "$PRIORITY_IMAGE_API_KEY"
set_secret "PRIORITY_IMAGE_API_MODEL" "$PRIORITY_IMAGE_API_MODEL"
set_secret "PRIORITY_IMAGE_API_MAX_RETRIES" "$PRIORITY_IMAGE_API_MAX_RETRIES"

echo ""
echo "=== 配置 Seedream ==="
set_secret "SEEDREAM_API_KEY" "$SEEDREAM_API_KEY"

echo ""
echo "=== 配置 Sora2 ==="
set_secret "SORA2_API_KEY" "$SORA2_API_KEY"

echo ""
echo "=============================================="
echo "还需要手动配置部署服务器信息:"
echo ""
echo "1. DEPLOY_HOST - 服务器 IP 或域名"
echo "2. DEPLOY_USER - SSH 用户名"
echo "3. DEPLOY_SSH_KEY - SSH 私钥"
echo "4. DEPLOY_PORT - SSH 端口 (默认 22)"
echo ""
echo "使用以下命令配置:"
echo "  gh secret set DEPLOY_HOST --repo $REPO"
echo "  gh secret set DEPLOY_USER --repo $REPO"
echo "  gh secret set DEPLOY_SSH_KEY < ~/.ssh/id_rsa --repo $REPO"
echo "  gh secret set DEPLOY_PORT --repo $REPO"
echo ""
echo "=============================================="
echo "配置完成！"
