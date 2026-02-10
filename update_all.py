import os
import sys

def write_file(path, content):
    """写入文件的辅助函数，自动创建目录"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✅ 已写入/覆盖: {path}")

def replace_in_file(path, old_snippet, new_snippet):
    """精准替换文件内容的辅助函数"""
    if not os.path.exists(path):
        print(f"⚠️ 文件不存在，跳过: {path}")
        return
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    if new_snippet in content:
        print(f"ℹ️  内容已存在，无需替换: {path}")
        return

    # 尝试标准替换
    if old_snippet in content:
        new_content = content.replace(old_snippet, new_snippet)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"✅ 已更新文件内容: {path}")
    else:
        # 如果因为格式问题找不到旧片段，尝试简单的追加（针对依赖）或报错
        print(f"❌ 无法定位旧内容，请手动检查: {path}")

# ==========================================
# 1. 更新文档 (修复你报错的部分)
# ==========================================
doc_path = "docs/database-design-and-data-models.md"
doc_old = """- `workflow_templates`
  - PK: `id UUID`
  - `name VARCHAR(255) NOT NULL`
  - `description TEXT`
  - `tags TEXT[]` + `GIN` 索引
  - `meta JSONB`
  - `is_public BOOLEAN NOT NULL DEFAULT TRUE`"""

doc_new = """- `workflow_templates`
  - **设计理念**: 采用“配置即数据”模式，所有执行策略、Prompt、UI 配置均存储在 `meta` 字段中。
  - PK: `id UUID`
  - `slug TEXT UNIQUE` (新增): 用于代码锚定的可读标识符 (如 `system-default`)。
  - `name VARCHAR(255) NOT NULL`
  - `description TEXT`
  - `tags TEXT[]` + `GIN` 索引
  - `meta JSONB`: 核心配置容器。结构示例：
    ```json
    {
      "execution": {
        "provider": "system_native", // 或 "coze_api"
        "config": {
          "prompt": "你好，我是系统助手...", // 统一 Prompt
          "bot_id": "7388..." // Coze 专用
        }
      },
      "ui": { "icon": "...", "color": "#3B82F6" }
    }
    ```
  - `is_public BOOLEAN NOT NULL DEFAULT TRUE`"""

replace_in_file(doc_path, doc_old, doc_new)

# ==========================================
# 2. 更新 Python 依赖 (pyproject.toml)
# ==========================================
dep_path = "services/agent-bridge/pyproject.toml"
dep_old = '"tenacity>=8.2.0,<9.0.0"'
dep_new = '"tenacity>=8.2.0,<9.0.0",\n  "asyncpg>=0.29.0,<1.0.0"'
replace_in_file(dep_path, dep_old, dep_new)

# ==========================================
# 3. 创建核心工厂类 (core/factory.py)
# ==========================================
write_file("services/agent-bridge/agent_bridge/core/__init__.py", "")
write_file("services/agent-bridge/agent_bridge/core/factory.py", """\"\"\"Factory for creating execution strategies (providers) from configuration.\"\"\"

from __future__ import annotations

from typing import Any

from ..providers.base import BaseProvider
from ..providers.coze import CozeProvider
from ..providers.system import SystemProvider


class ExecutionStrategyFactory:
    \"\"\"Creates provider instances based on workflow metadata.\"\"\"

    def create(self, meta: dict[str, Any] | None) -> BaseProvider:
        \"\"\"Create a provider instance from the workflow metadata.\"\"\"
        if not meta:
            # Fallback to a safe default if meta is missing
            return SystemProvider({"prompt": "Error: Workflow configuration missing."})

        execution = meta.get("execution", {})
        provider_type = execution.get("provider")
        config = execution.get("config", {})

        if provider_type == "system_native":
            return SystemProvider(config)
        elif provider_type == "coze_api":
            return CozeProvider(config)
        else:
            # Unknown provider, fallback to system with error
            return SystemProvider(
                {"prompt": f"Error: Unknown provider type '{provider_type}'."}
            )
""")

# ==========================================
# 4. 重写 Providers (coze.py & system.py)
# ==========================================
write_file("services/agent-bridge/agent_bridge/providers/coze.py", """\"\"\"Coze provider implementation.\"\"\"

from __future__ import annotations

from typing import Any, AsyncIterator

from ..client import CozeClient
from ..config import Settings
from ..models import AgentEvent, AgentRunRequest
from .base import BaseProvider


class CozeProvider(BaseProvider):
    \"\"\"Provider that routes requests to the Coze API.\"\"\"

    name = "coze_api"

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.config = config or {}
        self.bot_id = self.config.get("bot_id")
        self.prompt = self.config.get("prompt", "")

    async def stream(
        self, request: AgentRunRequest, settings: Settings
    ) -> AsyncIterator[AgentEvent]:
        \"\"\"Stream events from Coze API.\"\"\"
        client = CozeClient(
            api_key=settings.coze.api_key,
            base_url=settings.coze.base_url,
        )

        # Logic: DB Config > Global Settings. NEVER use request.workflow_id
        target_bot_id = self.bot_id or settings.coze.bot_id

        input_message = request.input_message
        if self.prompt:
             input_message = f"{self.prompt}\\n\\n{input_message}"

        async for event in client.chat_stream(
            bot_id=target_bot_id,
            user_id=request.user_id,
            query=input_message,
            chat_history=request.history,
        ):
            yield event
""")

write_file("services/agent-bridge/agent_bridge/providers/system.py", """\"\"\"System provider rendering prompts from workflow configuration.\"\"\"

from __future__ import annotations

import uuid
import logging
from typing import Any, AsyncIterator

from jinja2 import Template

from ..config import Settings
from ..models import AgentEvent, AgentRunRequest
from .base import BaseProvider

logger = logging.getLogger(__name__)

class SystemProvider(BaseProvider):
    \"\"\"Render prompt via Jinja2 and emit it as SSE-like events.\"\"\"

    name = "system_native"

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.prompt = (config or {}).get("prompt", "")

    async def stream(
        self, request: AgentRunRequest, settings: Settings
    ) -> AsyncIterator[AgentEvent]:
        message_id = request.reply_message_id or f"system-{uuid.uuid4().hex}"
        
        try:
            metadata = getattr(request, "metadata", {}) or {}
            rendered = Template(self.prompt).render(
                request=request.model_dump(), metadata=metadata
            )
        except Exception as e:
            logger.error(f"Prompt rendering failed: {e}")
            rendered = f"System Error: Failed to render prompt. ({e})"

        async def _gen() -> AsyncIterator[AgentEvent]:
            yield AgentEvent(
                event="run_update",
                conversation_id=request.conversation_id,
                user_id=request.user_id,
                run_id=request.run_id,
                payload={
                    "runId": request.run_id,
                    "stepId": "system.prepare",
                    "stepName": "准备中",
                    "status": "succeeded",
                },
            )
            yield AgentEvent(
                event="stream_chunk",
                conversation_id=request.conversation_id,
                user_id=request.user_id,
                run_id=request.run_id,
                payload={
                    "messageId": message_id,
                    "delta": rendered,
                    "final": True,
                },
            )
            yield AgentEvent(
                event="stream_result",
                conversation_id=request.conversation_id,
                user_id=request.user_id,
                run_id=request.run_id,
                payload={
                    "messageId": message_id,
                    "content": rendered,
                },
            )

        return _gen()
""")

# ==========================================
# 5. 重写 Router (升级 DB 连接)
# ==========================================
write_file("services/agent-bridge/agent_bridge/router.py", """\"\"\"Routing layer that resolves workflow templates and streams events.\"\"\"

from __future__ import annotations

import json
import os
import logging
from typing import Any, Awaitable, Callable, Protocol

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from sse_starlette.sse import EventSourceResponse
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import Settings, get_settings
from .core.factory import ExecutionStrategyFactory
from .models import AgentRunRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/agent")


class DatabaseNotReady(Exception):
    \"\"\"Raised when the database connection is unavailable.\"\"\"


class WorkflowTemplateRepository(Protocol):
    \"\"\"Minimal repository interface for workflow templates.\"\"\"

    async def get_by_id(self, workflow_id: str) -> dict[str, Any] | None:
        ...

    async def get_by_slug(self, slug: str) -> dict[str, Any] | None:
        ...


class PostgresWorkflowTemplateRepository:
    \"\"\"Real database repository using asyncpg.\"\"\"

    def __init__(self) -> None:
        self.dsn = os.environ.get(
            "SITE_AUTH_DATABASE_URL",
            "postgres://postgres:postgres@localhost:5432/orbitaskflow?sslmode=disable"
        )

    async def _fetch_one(self, query: str, arg: str) -> dict[str, Any] | None:
        conn = None
        try:
            conn = await asyncpg.connect(self.dsn)
            record = await conn.fetchrow(query, arg)
            if record:
                data = dict(record)
                if isinstance(data.get("meta"), str):
                    data["meta"] = json.loads(data["meta"])
                return data
            return None
        except Exception as exc:
            logger.error(f"Database query failed: {exc}")
            raise DatabaseNotReady("Database connection failed") from exc
        finally:
            if conn:
                await conn.close()

    async def get_by_id(self, workflow_id: str) -> dict[str, Any] | None:
        return await self._fetch_one("SELECT * FROM workflow_templates WHERE id = $1", workflow_id)

    async def get_by_slug(self, slug: str) -> dict[str, Any] | None:
        return await self._fetch_one("SELECT * FROM workflow_templates WHERE slug = $1", slug)


async def get_repository() -> WorkflowTemplateRepository:
    return PostgresWorkflowTemplateRepository()


@retry(
    stop=stop_after_attempt(15),
    wait=wait_exponential(multiplier=0.2, min=0.2, max=2),
    retry=retry_if_exception_type(DatabaseNotReady),
    reraise=True,
)
async def _call_with_retry(fetcher: Callable[[], Awaitable[Any]]) -> Any:
    try:
        return await fetcher()
    except DatabaseNotReady:
        raise
    except Exception as exc:
        raise DatabaseNotReady("database temporarily unavailable") from exc


async def resolve_workflow_template(
    request: AgentRunRequest, repository: WorkflowTemplateRepository
) -> dict[str, Any]:
    \"\"\"Resolve workflow template by ID, falling back to system default slug.\"\"\"

    template: dict[str, Any] | None = None
    try:
        if request.workflow_id:
            template = await _call_with_retry(
                lambda: repository.get_by_id(request.workflow_id)
            )
        if not template:
            template = await _call_with_retry(lambda: repository.get_by_slug("system-default"))
    except DatabaseNotReady as exc:
        logger.error("数据库不可用，无法加载工作流模版", exc_info=exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow template not found",
        )

    return template


@router.post("/runs/stream")
async def stream_runs(
    request: AgentRunRequest,
    settings: Settings = Depends(get_settings),
    repository: WorkflowTemplateRepository = Depends(get_repository),
) -> EventSourceResponse:
    \"\"\"Stream events from a provider built via workflow template metadata.\"\"\"

    template = await resolve_workflow_template(request, repository)
    provider = ExecutionStrategyFactory().create(template.get("meta"))

    async def event_iterator():
        try:
            async for event in provider.stream(request, settings):
                yield {
                    "event": event.event,
                    "data": json.dumps(event.model_dump(by_alias=True, mode="json"), ensure_ascii=False),
                }
        except Exception as exc:
            logger.exception("流式响应过程中出现异常", exc_info=exc)
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "event": "error",
                        "payload": {"message": str(exc)},
                        "conversationId": request.conversation_id,
                        "runId": request.run_id,
                        "userId": request.user_id,
                    },
                    ensure_ascii=False,
                ),
            }

    return EventSourceResponse(event_iterator())
""")

print("\n✨ 所有文件更新完成！请运行以下命令完成收尾：")
print("1. python scripts/otf.py install --scope python")
print("2. python scripts/otf.py migrate up")