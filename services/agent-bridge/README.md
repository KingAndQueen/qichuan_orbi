# Agent Bridge Service

基于 FastAPI 的 Python 服务，用于桥接核心系统与 Coze 智能体平台。

## 功能概览

- 提供 `/v1/agent/runs` 接口创建会话请求并获取 Coze 结果。
- 封装 `CozeClient`，负责调用 Coze 官方 Open API 并解析流式响应。
- 通过 Pydantic 管理配置，支持在环境变量中设置 API Key、Bot ID 等。
- 按环境可配置的日志等级，方便本地调试与生产排障。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AGENT_BRIDGE_API_KEY` | (必填) | 调用 Coze API 的 Bearer Token。 |
| `AGENT_BRIDGE_BOT_ID` | `7559780859004960831` | 默认机器人 ID，可在请求体中覆盖。 |
| `AGENT_BRIDGE_STREAM` | `True` | 是否默认开启流式响应。 |
| `AGENT_BRIDGE_LOG_LEVEL` | `INFO` | 日志等级，支持 `DEBUG/INFO/WARNING/ERROR/CRITICAL`。 |

## 开发

```bash
pip install -e .[dev]
uvicorn agent_bridge.app:app --reload
pytest
```

更多整体说明可参考仓库根目录的 [README](../../README.md)。
