#!/bin/bash
# Nginx 9080 端口排查脚本
# 用于排查 Nginx 网关服务问题

echo "=== Nginx 9080 端口排查 ==="
echo ""

# 1. 检查 Nginx 进程
echo "1. 检查 Nginx 进程:"
if pgrep -f nginx > /dev/null; then
    echo "   ✓ Nginx 进程正在运行"
    ps aux | grep nginx | grep -v grep
else
    echo "   ✗ Nginx 进程未运行"
fi
echo ""

# 2. 检查 9080 端口监听
echo "2. 检查 9080 端口监听:"
if lsof -i :9080 > /dev/null 2>&1; then
    echo "   ✓ 9080 端口正在监听"
    lsof -i :9080
else
    echo "   ✗ 9080 端口未监听"
fi
echo ""

# 3. 检查 Nginx 配置文件
echo "3. 检查 Nginx 配置文件:"
if [ -f "/usr/local/etc/nginx/servers/orbitaskflow.conf" ]; then
    echo "   ✓ macOS 配置文件存在: /usr/local/etc/nginx/servers/orbitaskflow.conf"
    echo "   配置文件内容（前 30 行）:"
    head -30 /usr/local/etc/nginx/servers/orbitaskflow.conf | sed 's/^/      /'
elif [ -f "/etc/nginx/sites-available/orbitaskflow" ]; then
    echo "   ✓ Linux 配置文件存在: /etc/nginx/sites-available/orbitaskflow"
    echo "   配置文件内容（前 30 行）:"
    head -30 /etc/nginx/sites-available/orbitaskflow | sed 's/^/      /'
else
    echo "   ✗ Nginx 配置文件不存在"
    echo "   检查常见位置:"
    echo "     - /usr/local/etc/nginx/servers/orbitaskflow.conf (macOS)"
    echo "     - /etc/nginx/sites-available/orbitaskflow (Linux)"
fi
echo ""

# 4. 测试 Nginx 配置
echo "4. 测试 Nginx 配置:"
if nginx -t 2>&1; then
    echo "   ✓ Nginx 配置测试通过"
else
    echo "   ✗ Nginx 配置测试失败"
fi
echo ""

# 5. 检查 Nginx 错误日志
echo "5. 检查 Nginx 错误日志（最后 20 行）:"
if [ -f "/usr/local/var/log/nginx/error.log" ]; then
    echo "   macOS 错误日志:"
    tail -20 /usr/local/var/log/nginx/error.log | sed 's/^/      /'
elif [ -f "/var/log/nginx/error.log" ]; then
    echo "   Linux 错误日志:"
    tail -20 /var/log/nginx/error.log | sed 's/^/      /'
else
    echo "   ⚠ 未找到错误日志文件"
fi
echo ""

# 6. 检查上游服务
echo "6. 检查上游服务:"
echo "   检查后端服务 (127.0.0.1:8080):"
if lsof -i :8080 > /dev/null 2>&1; then
    echo "   ✓ 后端服务正在监听 8080 端口"
    lsof -i :8080 | head -2
else
    echo "   ✗ 后端服务未监听 8080 端口"
fi
echo "   检查前端服务 (127.0.0.1:5174):"
if lsof -i :5174 > /dev/null 2>&1; then
    echo "   ✓ 前端服务正在监听 5174 端口"
    lsof -i :5174 | head -2
else
    echo "   ✗ 前端服务未监听 5174 端口"
fi
echo ""

# 7. 测试 HTTP 连接
echo "7. 测试 HTTP 连接:"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9080/healthz 2>/dev/null | grep -q "200\|404\|502\|503"; then
    status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9080/healthz 2>/dev/null)
    echo "   ✓ HTTP 连接成功，状态码: $status"
    echo "   响应内容:"
    curl -s http://localhost:9080/healthz | head -5 | sed 's/^/      /'
else
    echo "   ✗ HTTP 连接失败"
    echo "   尝试连接: curl http://localhost:9080/healthz"
fi
echo ""

# 8. 检查 brew services (macOS)
if command -v brew > /dev/null 2>&1; then
    echo "8. 检查 brew services (macOS):"
    brew services list | grep nginx | sed 's/^/      /'
    echo ""
fi

echo "=== 排查完成 ==="
echo ""
echo "如果 Nginx 未运行，尝试:"
echo "  macOS: brew services start nginx"
echo "  Linux: sudo systemctl start nginx"
echo ""
echo "如果配置有问题，检查配置文件并运行: nginx -t"
