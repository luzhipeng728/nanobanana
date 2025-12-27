#!/bin/bash
# ============================================================================
# 服务器首次部署配置脚本
# 在目标服务器上运行此脚本来准备 Docker 环境
# ============================================================================

set -e

echo "=== NanoBanana 服务器部署配置 ==="
echo ""

# 创建部署目录
echo "1. 创建部署目录..."
sudo mkdir -p /opt/nanobanana
sudo chown $USER:$USER /opt/nanobanana

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "2. 安装 Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "   Docker 已安装，请重新登录以使 docker 组生效"
else
    echo "2. Docker 已安装: $(docker --version)"
fi

# 检查 Docker 是否运行
if ! docker info &> /dev/null; then
    echo "   启动 Docker..."
    sudo systemctl start docker
    sudo systemctl enable docker
fi

# 登录到 GitHub Container Registry
echo ""
echo "3. 登录到 GitHub Container Registry..."
echo "   请输入你的 GitHub Personal Access Token (需要 read:packages 权限):"
echo "   创建 Token: https://github.com/settings/tokens/new?scopes=read:packages"
echo ""
read -sp "Token: " GITHUB_TOKEN
echo ""

echo "$GITHUB_TOKEN" | docker login ghcr.io -u luzhipeng728 --password-stdin

echo ""
echo "=== 配置完成！==="
echo ""
echo "现在你可以通过以下方式部署："
echo ""
echo "方式 1: GitHub Actions 自动部署"
echo "  - 推送代码到 main 分支即可自动部署"
echo ""
echo "方式 2: 手动部署"
echo "  cd /opt/nanobanana"
echo "  docker pull ghcr.io/luzhipeng728/nanobanana:latest"
echo "  docker run -d --name nanobanana -p 3004:3004 --env-file .env.production ghcr.io/luzhipeng728/nanobanana:latest"
echo ""
