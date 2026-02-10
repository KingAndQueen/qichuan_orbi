#!/bin/bash
# Generate JWT key pair and internal token for gateway setup
# 生成 JWT 密钥对和内部 token 用于网关配置

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYS_DIR="$REPO_ROOT/keys"

echo "=== 生成 JWT 密钥对和内部 Token ==="
echo ""

# Create keys directory if it doesn't exist
mkdir -p "$KEYS_DIR"

# Generate JWT private key (RS256, 2048 bits)
echo "1. 生成 JWT 私钥 (RS256, 2048 bits)..."
openssl genrsa -out "$KEYS_DIR/jwt_private.pem" 2048
echo "   ✓ 私钥已生成: $KEYS_DIR/jwt_private.pem"

# Generate JWT public key from private key
echo "2. 生成 JWT 公钥..."
openssl rsa -in "$KEYS_DIR/jwt_private.pem" -pubout -out "$KEYS_DIR/jwt_public.pem"
echo "   ✓ 公钥已生成: $KEYS_DIR/jwt_public.pem"

# Generate internal token (32 bytes = 256 bits, hex encoded = 64 characters)
echo "3. 生成内部服务通信 Token (32 字节)..."
INTERNAL_TOKEN=$(openssl rand -hex 32)
echo "   ✓ Token 已生成: $INTERNAL_TOKEN"

echo ""
echo "=== 生成完成 ==="
echo ""
echo "请将以下配置添加到 deploy_config.toml 的 [nginx] 配置段："
echo ""
echo "[nginx]"
echo "environment = \"development\"  # 或 \"production\""
echo "jwt_private_key_path = \"$KEYS_DIR/jwt_private.pem\""
echo "jwt_public_key_path = \"$KEYS_DIR/jwt_public.pem\""
echo "agent_bridge_internal_token = \"$INTERNAL_TOKEN\""
echo "public_base_url = \"http://localhost:9080\"  # 开发环境，生产环境请修改"
echo "public_ws_url = \"ws://localhost:9080/ws/agent\"  # 开发环境，生产环境请修改"
echo ""
echo "⚠️  重要提示："
echo "   - 请妥善保管私钥文件，不要提交到版本控制系统"
echo "   - 生产环境请使用绝对路径"
echo "   - 内部 Token 请保密，不要泄露"
echo ""
