#!/bin/bash

# 1. 修复 system.py，添加缺失的别名
echo "🔧 Fixing services/agent-bridge/agent_bridge/providers/system.py..."

# 检查是否已经存在别名，防止重复添加
if grep -q "SystemMessageProvider =" services/agent-bridge/agent_bridge/providers/system.py; then
    echo "ℹ️  Alias already exists."
else
    cat >> services/agent-bridge/agent_bridge/providers/system.py <<EOF

# Backwards compatibility alias for legacy code (service.py)
SystemMessageProvider = SystemProvider
EOF
    echo "✅ Added SystemMessageProvider alias."
fi

# 2. 验证 __init__.py (通常不需要改，只要 system.py 有这个属性即可)
# 但为了保险，我们确保文件存在
touch services/agent-bridge/agent_bridge/providers/__init__.py

echo "🎉 Fix applied. Please run tests again:"
echo "pnpm run test:py"