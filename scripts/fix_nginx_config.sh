#!/bin/bash
# 修复 Nginx 配置问题：默认监听 8080 而不是 9080

echo "=== 修复 Nginx 配置问题 ==="
echo ""

# 1. 查找 Nginx 安装位置
echo "1. 查找 Nginx 安装位置..."
NGINX_PREFIX=""
if [ -d "/opt/homebrew/etc/nginx" ]; then
    NGINX_PREFIX="/opt/homebrew/etc/nginx"
    echo "   找到: $NGINX_PREFIX (Apple Silicon)"
elif [ -d "/usr/local/etc/nginx" ]; then
    NGINX_PREFIX="/usr/local/etc/nginx"
    echo "   找到: $NGINX_PREFIX (Intel)"
else
    echo "   ✗ 未找到 Nginx 配置目录"
    exit 1
fi
echo ""

# 2. 检查主配置文件
echo "2. 检查主配置文件..."
MAIN_CONF="$NGINX_PREFIX/nginx.conf"
if [ -f "$MAIN_CONF" ]; then
    echo "   ✓ 主配置文件存在: $MAIN_CONF"
    echo "   检查是否包含 servers 目录配置..."
    if grep -q "include.*servers" "$MAIN_CONF" 2>/dev/null; then
        echo "   ✓ 已包含 servers 目录配置"
    else
        echo "   ✗ 未包含 servers 目录配置，需要添加"
        SERVERS_DIR="$NGINX_PREFIX/servers"
        echo "   需要添加: include $SERVERS_DIR/*.conf;"
    fi
else
    echo "   ✗ 主配置文件不存在: $MAIN_CONF"
fi
echo ""

# 3. 检查默认配置（可能监听 8080）
echo "3. 检查默认配置..."
DEFAULT_CONF="$NGINX_PREFIX/nginx.conf"
if [ -f "$DEFAULT_CONF" ]; then
    echo "   检查默认配置中的 listen 指令..."
    if grep -E "^\s*listen\s+8080" "$DEFAULT_CONF" 2>/dev/null; then
        echo "   ⚠ 发现默认配置监听 8080 端口"
        echo "   建议注释掉或修改默认 server 块"
    else
        echo "   ✓ 默认配置未监听 8080"
    fi
fi

# 检查 servers 目录中的其他配置
SERVERS_DIR="$NGINX_PREFIX/servers"
if [ -d "$SERVERS_DIR" ]; then
    echo "   检查 servers 目录中的配置..."
    for conf in "$SERVERS_DIR"/*.conf; do
        if [ -f "$conf" ] && [ "$(basename "$conf")" != "orbitaskflow.conf" ]; then
            echo "   发现其他配置: $(basename "$conf")"
            if grep -E "^\s*listen\s+8080" "$conf" 2>/dev/null; then
                echo "   ⚠ 此配置监听 8080 端口: $conf"
            fi
        fi
    done
fi
echo ""

# 4. 检查我们的配置文件
echo "4. 检查我们的配置文件..."
OUR_CONF="$SERVERS_DIR/orbitaskflow.conf"
if [ -f "$OUR_CONF" ]; then
    echo "   ✓ 配置文件存在: $OUR_CONF"
    echo "   检查监听端口..."
    if grep -q "listen 9080" "$OUR_CONF"; then
        echo "   ✓ 配置正确监听 9080 端口"
    else
        echo "   ✗ 配置未监听 9080 端口"
    fi
else
    echo "   ✗ 配置文件不存在: $OUR_CONF"
    echo "   需要运行部署脚本部署配置"
fi
echo ""

# 5. 检查端口占用
echo "5. 检查端口占用..."
echo "   检查 8080 端口:"
if lsof -i :8080 2>/dev/null; then
    echo "   ⚠ 8080 端口被占用（可能是后端服务，这是正常的）"
else
    echo "   ✓ 8080 端口未被占用"
fi
echo "   检查 9080 端口:"
if lsof -i :9080 2>/dev/null; then
    echo "   ✓ 9080 端口被占用（应该是 Nginx）"
    lsof -i :9080
else
    echo "   ✗ 9080 端口未被占用（Nginx 未正确启动）"
fi
echo ""

# 6. 提供修复建议
echo "=== 修复建议 ==="
echo ""
echo "如果 Nginx 主配置文件未包含 servers 目录，需要添加："
echo "  在 $MAIN_CONF 的 http 块中添加："
echo "  include $SERVERS_DIR/*.conf;"
echo ""
echo "如果默认配置监听 8080，需要："
echo "  1. 注释掉默认 server 块中的 listen 8080"
echo "  2. 或删除/重命名默认配置文件"
echo ""
echo "修复后，运行："
echo "  sudo nginx -t  # 测试配置"
echo "  sudo nginx     # 启动 Nginx"
