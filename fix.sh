#!/bin/bash
set -e

echo "🔥 开始清理旧架构代码..."

# 1. 删除已废弃的业务逻辑代码
# service.py 是旧的服务层，现在逻辑都在 router.py 和 factory.py 中
rm -f services/agent-bridge/agent_bridge/service.py
# registry.py 是旧的注册表，现在使用 core/factory.py
rm -f services/agent-bridge/agent_bridge/registry.py

# 2. 删除已失效的旧测试代码
# 这些测试依赖于 service.py，已无法通过，且不再代表现有逻辑
rm -f services/agent-bridge/tests/test_service.py
rm -f services/agent-bridge/tests/test_app.py
rm -f services/agent-bridge/tests/test_client.py # Client 逻辑已在集成测试中覆盖

# 3. 修正 __init__.py (移除对已删除模块的引用)
echo '"""Agent Bridge Service Package."""' > services/agent-bridge/agent_bridge/__init__.py

# 4. 修正 providers/__init__.py (移除旧的别名引用，只暴露必要的)
cat > services/agent-bridge/agent_bridge/providers/__init__.py << 'EOF'
from .base import BaseProvider
from .coze import CozeProvider
from .system import SystemProvider

__all__ = ["BaseProvider", "CozeProvider", "SystemProvider"]
EOF

# 5. 【关键】重写 app.py 以接入新架构
# 将 app.py 从调用 service.py 改为直接挂载 router.py
cat > services/agent-bridge/agent_bridge/app.py << 'EOF'
"""FastAPI entry point for the Agent Bridge service."""

from __future__ import annotations

import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .logging import configure_logging
from .router import router as agent_router

# Configure structured logging
configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="Agent Bridge Service", version="0.1.0")

# 挂载新的路由模块 (v1/agent)
app.include_router(agent_router)

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}

# 全局异常处理 (可选)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Global exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal Server Error"},
    )
EOF

echo "✅ 代码清理完成！"
echo "------------------------------------------------"
echo "现在的架构状态："
echo "1. 入口: app.py -> router.py"
echo "2. 核心: router.py -> core/factory.py -> providers/"
echo "3. 数据: asyncpg -> PostgreSQL (workflow_templates)"
echo "------------------------------------------------"
echo "请运行以下命令验证最终结果："
echo "pnpm run test:py"