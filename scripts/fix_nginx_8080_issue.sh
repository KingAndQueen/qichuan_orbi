#!/bin/bash
# 一键修复 Nginx 监听 8080 而不是 9080 的问题

set -e

echo "=== 修复 Nginx 8080 端口问题 ==="
echo ""

# 1. 查找 Nginx 安装位置
if [ -d "/opt/homebrew/etc/nginx" ]; then
    NGINX_PREFIX="/opt/homebrew/etc/nginx"
    echo "检测到: Apple Silicon Mac"
elif [ -d "/usr/local/etc/nginx" ]; then
    NGINX_PREFIX="/usr/local/etc/nginx"
    echo "检测到: Intel Mac"
else
    echo "错误: 未找到 Nginx 配置目录"
    exit 1
fi

echo "Nginx 配置目录: $NGINX_PREFIX"
echo ""

# 2. 停止现有 Nginx 进程
echo "1. 停止现有 Nginx 进程..."
sudo nginx -s stop 2>/dev/null || killall nginx 2>/dev/null || true
sleep 1
echo "   ✓ 已停止"
echo ""

# 3. 备份主配置文件
MAIN_CONF="$NGINX_PREFIX/nginx.conf"
if [ -f "$MAIN_CONF" ]; then
    echo "2. 备份主配置文件..."
    sudo cp "$MAIN_CONF" "${MAIN_CONF}.bak.$(date +%Y%m%d_%H%M%S)"
    echo "   ✓ 已备份"
else
    echo "2. 创建主配置文件..."
    sudo tee "$MAIN_CONF" > /dev/null << 'EOF'
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    # Include server configurations
    include servers/*.conf;
}
EOF
    echo "   ✓ 已创建"
fi
echo ""

# 4. 确保 servers 目录存在
SERVERS_DIR="$NGINX_PREFIX/servers"
echo "3. 确保 servers 目录存在..."
if [ ! -d "$SERVERS_DIR" ]; then
    sudo mkdir -p "$SERVERS_DIR"
    echo "   ✓ 已创建: $SERVERS_DIR"
else
    echo "   ✓ 目录已存在: $SERVERS_DIR"
fi
echo ""

# 5. 修复主配置文件：注释掉监听 8080 的配置
echo "4. 修复主配置文件..."
if grep -E "^\s*listen\s+8080" "$MAIN_CONF" 2>/dev/null; then
    echo "   发现监听 8080 的配置，正在注释..."
    sudo sed -i.bak 's/^\(\s*listen\s+8080\)/# \1/' "$MAIN_CONF"
    echo "   ✓ 已注释掉监听 8080 的配置"
else
    echo "   ✓ 未发现监听 8080 的配置"
fi

# 确保包含 servers 目录
if ! grep -q "include.*servers" "$MAIN_CONF"; then
    echo "   添加 servers 目录配置..."
    if grep -q "include.*mime.types" "$MAIN_CONF"; then
        sudo sed -i.bak '/include.*mime.types/a\
    include servers/*.conf;
' "$MAIN_CONF"
    else
        sudo sed -i.bak '/^http {/a\
    include servers/*.conf;
' "$MAIN_CONF"
    fi
    echo "   ✓ 已添加 servers 目录配置"
else
    echo "   ✓ 已包含 servers 目录配置"
fi
echo ""

# 6. 检查我们的配置文件
OUR_CONF="$SERVERS_DIR/orbitaskflow.conf"
echo "5. 检查我们的配置文件..."
if [ -f "$OUR_CONF" ]; then
    echo "   ✓ 配置文件存在: $OUR_CONF"
    if grep -q "listen 9080" "$OUR_CONF"; then
        echo "   ✓ 配置正确监听 9080 端口"
    else
        echo "   ⚠ 警告: 配置文件未监听 9080 端口"
        echo "   需要重新运行部署脚本部署配置"
    fi
else
    echo "   ✗ 配置文件不存在: $OUR_CONF"
    echo "   需要运行部署脚本部署配置:"
    echo "   python3 deploy_macos.py --config deploy_config.toml --action start"
fi
echo ""

# 7. 测试配置
echo "6. 测试 Nginx 配置..."
if sudo nginx -t 2>&1; then
    echo "   ✓ 配置测试通过"
else
    echo "   ✗ 配置测试失败"
    echo "   请检查错误信息并修复"
    exit 1
fi
echo ""

# 8. 启动 Nginx
echo "7. 启动 Nginx..."
if sudo nginx; then
    echo "   ✓ Nginx 启动成功"
else
    echo "   ✗ Nginx 启动失败"
    exit 1
fi
echo ""

# 9. 验证
echo "8. 验证服务..."
sleep 2

# 检查进程
if pgrep -f nginx > /dev/null; then
    echo "   ✓ Nginx 进程正在运行"
else
    echo "   ✗ Nginx 进程未运行"
fi

# 检查端口
if lsof -i :9080 > /dev/null 2>&1; then
    echo "   ✓ 9080 端口正在监听"
    lsof -i :9080 | head -2
else
    echo "   ✗ 9080 端口未监听"
fi

# 测试 HTTP 连接
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9080/healthz 2>/dev/null | grep -q "200\|404\|502"; then
    status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9080/healthz 2>/dev/null)
    echo "   ✓ HTTP 连接成功，状态码: $status"
else
    echo "   ⚠ HTTP 连接测试失败（可能是上游服务未启动）"
fi
echo ""

echo "=== 修复完成 ==="
echo ""
echo "如果 9080 端口仍未监听，请："
echo "  1. 检查配置文件: cat $OUR_CONF"
echo "  2. 检查错误日志: tail -50 $NGINX_PREFIX/../var/log/nginx/error.log"
echo "  3. 重新运行部署脚本部署配置"
