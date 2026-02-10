#!/bin/bash
# 检查并修复 Nginx 主配置文件

echo "=== 检查 Nginx 主配置文件 ==="
echo ""

# 查找 Nginx 安装位置
if [ -d "/opt/homebrew/etc/nginx" ]; then
    NGINX_PREFIX="/opt/homebrew/etc/nginx"
elif [ -d "/usr/local/etc/nginx" ]; then
    NGINX_PREFIX="/usr/local/etc/nginx"
else
    echo "未找到 Nginx 配置目录"
    exit 1
fi

MAIN_CONF="$NGINX_PREFIX/nginx.conf"
SERVERS_DIR="$NGINX_PREFIX/servers"

echo "Nginx 配置目录: $NGINX_PREFIX"
echo "主配置文件: $MAIN_CONF"
echo ""

# 检查主配置文件
if [ ! -f "$MAIN_CONF" ]; then
    echo "主配置文件不存在，创建默认配置..."
    cat > "$MAIN_CONF" << 'EOF'
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
    echo "✓ 已创建主配置文件"
else
    echo "主配置文件已存在"
fi

# 检查是否包含 servers 目录
if ! grep -q "include.*servers" "$MAIN_CONF"; then
    echo ""
    echo "主配置文件未包含 servers 目录，需要添加..."
    echo "在 http 块中添加: include servers/*.conf;"
    echo ""
    echo "当前 http 块内容："
    sed -n '/^http {/,/^}/p' "$MAIN_CONF" | head -20
    echo ""
    read -p "是否自动添加？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 在 http 块的最后一个 } 之前添加 include
        if grep -q "include.*mime.types" "$MAIN_CONF"; then
            # 在 include mime.types 之后添加
            sed -i.bak '/include.*mime.types/a\
    include servers/*.conf;
' "$MAIN_CONF"
        else
            # 在 http 块内添加
            sed -i.bak '/^http {/a\
    include servers/*.conf;
' "$MAIN_CONF"
        fi
        echo "✓ 已添加 servers 目录配置"
    fi
fi

# 检查默认 server 块是否监听 8080
if grep -E "^\s*listen\s+8080" "$MAIN_CONF" 2>/dev/null; then
    echo ""
    echo "⚠ 警告: 主配置文件中发现监听 8080 的配置"
    echo "这会导致与后端服务冲突"
    echo ""
    read -p "是否注释掉监听 8080 的配置？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sed -i.bak 's/^\(\s*listen\s+8080\)/# \1/' "$MAIN_CONF"
        echo "✓ 已注释掉监听 8080 的配置"
    fi
fi

# 确保 servers 目录存在
if [ ! -d "$SERVERS_DIR" ]; then
    echo ""
    echo "创建 servers 目录..."
    mkdir -p "$SERVERS_DIR"
    echo "✓ 已创建 servers 目录"
fi

echo ""
echo "=== 检查完成 ==="
echo ""
echo "运行测试: sudo nginx -t"
