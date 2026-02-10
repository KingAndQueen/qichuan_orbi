#!/bin/bash
# 修复 macOS brew services nginx 启动问题

echo "=== 修复 Nginx brew services 问题 ==="
echo ""

# 1. 停止可能存在的服务
echo "1. 停止现有的 Nginx 服务..."
brew services stop nginx 2>/dev/null || true
killall nginx 2>/dev/null || true
echo "   ✓ 已停止现有服务"
echo ""

# 2. 清理旧的 plist 文件
echo "2. 清理旧的 launchctl plist 文件..."
PLIST_FILE="$HOME/Library/LaunchAgents/homebrew.mxcl.nginx.plist"
if [ -f "$PLIST_FILE" ]; then
    echo "   发现旧的 plist 文件: $PLIST_FILE"
    # 尝试卸载
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    # 删除文件
    rm -f "$PLIST_FILE"
    echo "   ✓ 已清理旧的 plist 文件"
else
    echo "   ℹ 未找到旧的 plist 文件"
fi
echo ""

# 3. 检查 launchctl 中的残留
echo "3. 检查 launchctl 中的残留服务..."
launchctl list | grep nginx || echo "   ℹ 未找到残留服务"
echo ""

# 4. 检查 Nginx 配置
echo "4. 检查 Nginx 配置..."
if nginx -t 2>&1; then
    echo "   ✓ Nginx 配置测试通过"
else
    echo "   ✗ Nginx 配置测试失败，请先修复配置"
    exit 1
fi
echo ""

# 5. 尝试直接启动 Nginx（不使用 brew services）
echo "5. 尝试直接启动 Nginx..."
if pgrep -f nginx > /dev/null; then
    echo "   ℹ Nginx 已经在运行"
else
    # 检查 nginx 可执行文件位置
    NGINX_BIN=$(brew --prefix)/bin/nginx
    if [ -f "$NGINX_BIN" ]; then
        echo "   使用: $NGINX_BIN"
        sudo "$NGINX_BIN" 2>/dev/null || "$NGINX_BIN" 2>/dev/null || {
            echo "   ✗ 直接启动失败，尝试其他方法..."
        }
    else
        echo "   ✗ 未找到 nginx 可执行文件"
    fi
fi
echo ""

# 6. 检查 Nginx 是否运行
echo "6. 检查 Nginx 状态..."
sleep 2
if pgrep -f nginx > /dev/null; then
    echo "   ✓ Nginx 正在运行"
    ps aux | grep nginx | grep -v grep | head -3
else
    echo "   ✗ Nginx 未运行"
    echo ""
    echo "   尝试手动启动方法："
    echo "   方法 1: sudo nginx"
    echo "   方法 2: $(brew --prefix)/bin/nginx"
    echo "   方法 3: 检查错误日志: tail -50 /usr/local/var/log/nginx/error.log"
fi
echo ""

# 7. 检查端口监听
echo "7. 检查端口监听..."
if lsof -i :9080 > /dev/null 2>&1; then
    echo "   ✓ 9080 端口正在监听"
    lsof -i :9080
else
    echo "   ✗ 9080 端口未监听"
fi
echo ""

echo "=== 修复完成 ==="
echo ""
echo "如果 Nginx 仍未运行，请尝试："
echo "  1. sudo nginx"
echo "  2. 检查错误日志: tail -50 /usr/local/var/log/nginx/error.log"
echo "  3. 检查配置文件: nginx -t"
