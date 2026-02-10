# Agent Bridge 测试设计说明（Agent Bridge Testing Spec v0.2）

文档版本：v0.2  
最后修改日期：2026-01-30  
作者：待定  
所属模块：Agent Bridge  
建议存放路径：`docs/test/agent-bridge-testing.md`

相关文档（按 docs-map 注册表路径）：
- `docs-map.md`

- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`

- `docs/features/prd-workspace.md`
- `docs/features/prd-identity-access.md`

- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/architecture/nginx-gateway-arch.md`
- `docs/technical/api/agent-interface-spec.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/ops/observability-logging.md`

- `docs/test/qa-master-plan.md`
- `docs/test/frontend-testing.md`
- `docs/test/backend-testing.md`

说明：本文件聚焦 Agent Bridge 的“可验收行为”（会话握手、事件语义与顺序、可靠性、取消/超时、鉴权边界、日志/可观测）。前端体验细节由 `frontend-testing.md` 覆盖；平台核心的资源管理 API 与配额/审计由 `backend-testing.md` 覆盖。

---

## 1. 背景与目标

Agent Bridge Service 是 Orbitaskflow 平台的 **AI 编排中枢**，负责：

- 维护与 Workspace Web 的 WebSocket / SSE 长连接；
- 管理 Agent Run 生命周期：创建、流式输出、工具调用、完成/失败；
- 将统一的 Agent 协议映射到不同 Model Provider / 工具后端；
- 在多主账号/子账号隔离边界内安全地调度 LLM 资源与工具调用。

本测试设计文档的目标：

- 将 Agent Bridge 的核心行为与协议要求，转化为可执行、可维护的测试用例；
- 明确各测试层级（Unit / Integration / E2E / Contract）的覆盖策略；
- 为 AI 生成和重构 Agent Bridge 代码提供清晰的“行为约束”，确保不会破坏前端体验、主账号/子账号隔离安全和统一协议。

注：LLM / Agent 的“内容质量评估”（如答案是否好用、幻觉率）以 `docs/test/qa-master-plan.md` 中的定义为准，本文件聚焦 **协议、状态机、错误处理与安全边界**。
说明：本文件 **不重新定义业务需求或协议**。所有断言必须可回溯到 SSOT：
- 产品/验收口径以 PRD（L1/L3）为准；
- 交互事件语义与可靠性以 `interaction-protocol.md`（L2）为准；
- 字段语义对象以 `agent-interface-spec.md`（L2）为准；
- 实现细节（L4）仅用于落地参考。

若 PRD 与 L2/L4 出现冲突：按 `docs-map.md` 的流程回流修订（PRD 或 L2），本文件仅做同步更新，不自行裁决。

---

## 2. 范围（In Scope / Out of Scope）

### 2.1 In Scope

本 Test Spec v0.2 覆盖以下 Agent Bridge 可验收能力（所有断言均需可回溯到 PRD 或协议 SSOT）：

- **对外会话通道行为**：WS 主通道 + HTTP SSE 兼容通道的握手、鉴权、关闭、断连处理（见 `interaction-protocol.md`、`nginx-gateway-arch.md`）。
- **任务/Run 生命周期与事件流**：事件类型与顺序以 `interaction-protocol.md` 的 **事件类型注册表** 与 **Legacy 映射** 为准（本文件不自造事件名）。
- **工具调用语义与错误恢复**：工具事件、重试/超时、幂等与副作用保护（与 `agent-interface-spec.md` 的 tool_call/tool_result 语义对齐）。
- **主账号/子账号隔离与权限边界**：`master_account_id` / 可选 `sub_account_id` / `principal_id` / `agent_id` 等上下文字段必须贯穿事件与日志（字段口径以协议/日志规范为准）。
- **可观测性**：trace_id 透传、结构化日志字段、metrics 端点的最小约束（见 `observability-logging.md`）。
- **取消/超时**：客户端取消、连接中断、服务端超时后的资源清理与终态可判定。
- **跨服务契约**：与 Platform Core（身份/上下文）与 Model Provider（请求/响应/错误）之间的契约级行为（不覆盖实现细节）。

### 2.2 Out of Scope

暂不在本版本自动化测试设计范围内的内容：

- LLM 输出内容本身的质量评估（答案是否好用、幻觉率等）：以 `docs/test/qa-master-plan.md` 的定义为准（本文件不覆盖）。
- 极端性能/压测（大规模并发 WS/Run 数、长稳连接容量等）：以 `docs/test/qa-master-plan.md` 的非功能测试章节为准（本文件不覆盖）。
- 前端 UI 细节（按钮位置、文案、loading 动效），由《frontend-testing.md》负责；
- 非 Agent Bridge 的业务服务（例如 Data Insights、Platform Core 内部逻辑）。

---

## 3. 需求 → 测试覆盖矩阵

需求引用口径：本文件不再引入独立 Requirement ID。

每条测试覆盖必须绑定到 PRD 或协议 SSOT 的唯一可回溯引用：
- 产品体验/验收：优先使用 PRD 内显式编号（如 `[WS-PRD 2.x]`），否则使用“PRD 小节标题”并保持唯一；
- 协议/契约：使用 `[PROTO interaction-protocol：<条目>]`、`[PROTO agent-interface-spec：<条目>]`、`[PROTO api-style-guide：<条目>]`。

---

### 3.1 连接与会话生命周期（WS 主通道 + SSE 兼容）

本小节覆盖 **WS 主通道 + SSE 兼容通道** 的对外行为：  
- **主通道**：Workspace Web ↔ Agent Bridge 通过 WebSocket 承载交互协议（见 `interaction-protocol.md`）。  
- **兼容通道**：通过 `POST /api/agent/chat/completions` 提供 HTTP SSE 语义兼容（便于部分客户端/回放/降级）。  

注：网关路由与端口拓扑细节以 `nginx-gateway-arch.md` 为准；本表只约束“对客户端可观察的行为”。

| PRD/协议引用 | 说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [PROTO nginx-gateway-arch：JWT(HTTP)/Ticket(WS)] / [IA-PRD 身份校验] | 当客户端以 **WebSocket 主通道**连接时，必须使用 **Ticket（WS）** 完成握手鉴权；鉴权通过后建立稳定 WS 连接 | TC-AB-001A | 集成测试 | `agent_bridge/tests/test_ws_lifecycle.py::test_ws_accepts_valid_ticket` |
| [PROTO nginx-gateway-arch：JWT(HTTP)/Ticket(WS)] / [IA-PRD 身份校验] | Ticket 无效/过期/重放时，必须拒绝握手并返回明确错误（不建立 WS 连接） | TC-AB-002A | 集成测试 | `agent_bridge/tests/test_ws_lifecycle.py::test_ws_rejects_invalid_ticket` |
| [PROTO interaction-protocol：Reliability / Heartbeat] | WS 会话存续期间，应支持协议要求的心跳机制（如 ping/pong 或等效），避免连接“假活” | TC-AB-003A | 集成测试 | `agent_bridge/tests/test_ws_lifecycle.py::test_ws_heartbeat` |
| [PROTO nginx-gateway-arch：JWT(HTTP)] / [IA-PRD 身份校验] | 当客户端以 **HTTP SSE 兼容通道**调用 `POST /api/agent/chat/completions` 时，必须携带有效 **JWT（HTTP）**；鉴权通过后以 `Content-Type: text/event-stream` 建立稳定 SSE 连接 | TC-AB-001 | 集成测试 | `agent_bridge/tests/test_sse_lifecycle.py::test_sse_accepts_valid_identity` |
| [PROTO nginx-gateway-arch：JWT(HTTP)] / [IA-PRD 身份校验] | 当 JWT 无效/过期/无权限时，必须返回明确 HTTP 错误码与规范化错误响应（例如 401/403 + reason_code），不得建立 SSE 流 | TC-AB-002 | 集成测试 | `agent_bridge/tests/test_sse_lifecycle.py::test_sse_rejects_invalid_identity` |
| [PROTO interaction-protocol：Server→Client 顺序/终止] | 在 SSE 会话存续期间，Agent Bridge 按协议顺序发送事件（见 3.2）；任务终态后必须显式结束流（发送最后一个提交点/终态事件并关闭连接），不得“悬空” | TC-AB-003 | 集成测试 | `agent_bridge/tests/test_sse_lifecycle.py::test_sse_closes_after_task_terminal` |
| [PROTO interaction-protocol：Client→Server agent.interrupt] | 当客户端主动取消/中断（如浏览器断开 SSE/WS）时，Agent Bridge 应及时触发取消/清理逻辑（见 3.6），避免长时间占用 LLM/工具资源 | TC-AB-004 | 集成 + 日志测试 | `agent_bridge/tests/test_sse_lifecycle.py::test_client_abort_triggers_cleanup` |

---

### 3.2 任务/Run 生命周期与事件协议（对齐 interaction-protocol SSOT）

本节对齐 `interaction-protocol.md`：  
- **事件类型以 Canonical type 为准**（`3.2 Event Type Registry`）；如需兼容旧客户端，可使用对应 **Legacy alias**（Deprecated Appendix）映射；  
- 本表只约束“必须出现的事件语义、最小字段与顺序/提交点”，不固定内部实现。

| PRD/协议引用 | 说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [PROTO interaction-protocol：Event Type Registry / Workflow & Tasks] | 当任务被接受并进入执行生命周期时，必须首先可观察到任务状态语义（例如 `agent.task.update`），用于前端/日志关联与可见进度 | TC-AB-010 | 集成测试 | `agent_bridge/tests/test_run_lifecycle.py::test_task_update_emitted_first` |
| [PROTO interaction-protocol：Chat Core agent.message.delta] / [PROTO agent-interface-spec：Message/MessageDelta] | 自然语言回复必须通过 `agent.message.delta`（或 legacy `message.delta`）按序流式发送；客户端串联后可复原完整消息；不得乱序/重复/缺失片段 | TC-AB-012 | 集成 + 属性测试 | `agent_bridge/tests/test_run_streaming.py::test_message_deltas_form_complete_message` |
| [PROTO interaction-protocol：Chat Core agent.message.completed] | 消息完成必须出现 `agent.message.completed`（或 legacy `message.complete`）作为提交点；如需要应用层确认，按协议要求 ACK | TC-AB-013A | 契约 + 集成 | `agent_bridge/tests/test_run_lifecycle.py::test_message_completed_commit_point` |
| [PROTO interaction-protocol：Tooling & Safety agent.tool.call] | 当需要客户端/执行层参与工具调用时，必须发送 `agent.tool.call`（或 legacy `agent.tool_call`），字段结构与语义对象一致 | TC-AB-020A | 契约 + 集成 | `agent_bridge/tests/test_tool_calls.py::test_tool_call_event_emitted` |
| [PROTO interaction-protocol：Notify / Reliability / error] / [PROTO api-style-guide：错误结构] | 发生不可恢复错误时，必须通过 `error` 事件（或等效）返回规范化错误码与用户可理解摘要；不得暴露底层异常栈；并保证任务终态可判定（failed/cancelled/succeeded） | TC-AB-014 | 集成测试 | `agent_bridge/tests/test_run_lifecycle.py::test_failed_status_and_error_payload` |
| [PROTO interaction-protocol：Workflow & Tasks agent.task.update] | 任务终态必须通过任务状态语义落到终态（succeeded/failed/cancelled）；与消息提交点/错误事件的组合应满足“前端可正确收敛 UI 状态” | TC-AB-013B | 集成测试 | `agent_bridge/tests/test_run_lifecycle.py::test_task_terminal_state_reachable` |

---

### 3.3 工具调用与错误恢复（对齐 Tooling 事件）

| PRD/协议引用 | 说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [PROTO interaction-protocol：agent.tool.call] / [PROTO agent-interface-spec：ToolCall] | 当触发工具调用时，必须发送 `agent.tool.call`，包含 `tool_name`、`arguments`、`call_id`（或等效关联键），用于追踪与展示 | TC-AB-020 | 集成测试 | `agent_bridge/tests/test_tool_calls.py::test_tool_call_event_emitted` |
| [PROTO interaction-protocol：Client→Server agent.tool.result] / [PROTO agent-interface-spec：ToolResult] | 工具执行成功后，必须通过 `agent.tool.result`（或 legacy `agent.tool_result`）回传结果；并确保该结果可被后续模型/链路消费（语义一致） | TC-AB-021 | 集成测试 | `agent_bridge/tests/test_tool_calls.py::test_tool_result_event_emitted` |
| [PROTO interaction-protocol：error] / [PROTO api-style-guide：错误码] | 工具超时/失败时，应按策略进行有限重试；若仍失败，必须返回规范化错误（`error` 事件或等效），并推动任务进入可判定终态（failed 或按策略降级） | TC-AB-022 | 集成 + 超时模拟 | `agent_bridge/tests/test_tool_calls.py::test_tool_timeout_and_retry_policy` |
| [PROTO interaction-protocol：Side-effect / Idempotency 原则] | 标记为幂等的工具在网络重试时不得造成副作用重复（如重复发送/重复扣费）；通过集成测试验证幂等策略生效 | TC-AB-023 | 集成测试 | `agent_bridge/tests/test_tool_calls.py::test_idempotent_tool_retry_is_safe` |
| [PROTO agent-interface-spec：ToolResult schema] / [PROTO api-style-guide：错误结构] | 工具结果格式不符合约定（缺字段/类型不符）时，应在 Agent Bridge 层捕获并规范化错误，不得把原始异常直接暴露给用户 | TC-AB-024 | 集成测试 | `agent_bridge/tests/test_tool_calls.py::test_invalid_tool_result_is_handled` |
| [PROTO interaction-protocol：agent.guardrail.blocked] | 触发安全/合规拦截时，必须发送 `agent.guardrail.blocked`（或 legacy `agent.guardrail`）提示，并保证不泄露敏感内容 | TC-AB-025 | 集成测试 | `agent_bridge/tests/test_guardrail.py::test_guardrail_block_event` |

---

### 3.4 主账号/子账号隔离与安全边界

| PRD/协议引用 | 说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [IA-PRD 主账号/子账号] / [PROTO interaction-protocol：control/context] | 任意任务/Run 的上下文必须绑定 `master_account_id`（可选 `sub_account_id`）与 `principal_id`（用户/主体）；不得跨主账号复用 Run/工具上下文 | TC-AB-030 | 集成测试 | `agent_bridge/tests/test_account_isolation.py::test_run_always_binds_to_master_context` |
| [IA-PRD 权限] / [WS-PRD Agent 可用性] | 不允许通过伪造/篡改 `agent_id` / `tool_id` 等跨主账号访问其他上下文的配置或数据；覆盖恶意输入与越权场景 | TC-AB-031 | 安全测试（集成） | `agent_bridge/tests/test_account_isolation.py::test_cross_account_access_is_denied` |
| [PROTO observability-logging：脱敏] | 日志与事件中敏感信息必须脱敏或不记录；仅记录必要的 IDs/类型/状态；不得记录用户原文与机密配置 | TC-AB-032 | 日志测试 | `agent_bridge/tests/test_account_isolation.py::test_sensitive_data_not_logged` |
| [PROTO nginx-gateway-arch / 配置隔离原则] | Model Provider 凭证不得在事件/日志中泄露；按环境隔离或按主账号隔离策略执行（以实现策略为准，但必须可验证） | TC-AB-033 | 配置 + 日志测试 | `agent_bridge/tests/test_account_isolation.py::test_provider_credentials_not_leaked` |

---

### 3.5 可观测性（日志 / 指标 / Trace）

| PRD/协议引用 | 说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [PROTO observability-logging：trace_id] / [PROTO interaction-protocol：trace] | 每个任务/Run 必须具备可关联的 `trace_id`，并在相关日志与关键事件中保持一致，便于端到端追踪 | TC-AB-040 | 集成 + 日志测试 | `agent_bridge/tests/test_observability.py::test_trace_id_propagation_across_events` |
| [PROTO observability-logging：error schema] | 严重错误（任务失败/工具失败/provider_error 等）必须输出 `level=error` 的结构化 JSON 日志，字段符合规范 | TC-AB-041 | 日志测试 | `agent_bridge/tests/test_observability.py::test_error_logs_follow_schema` |
| [PROTO observability-logging：metrics] | 应暴露基础指标（例如活跃连接数、运行中任务数、工具成功/失败计数等）；可通过本地 metrics 端点验证关键指标存在 | TC-AB-042 | 集成测试 | `agent_bridge/tests/test_observability.py::test_metrics_endpoint_exposes_core_metrics` |
| [PROTO observability-logging：内容最小化] | 日志不得记录 LLM 输出完整内容；仅可记录摘要/截断；验证日志中不会出现完整 prompt/response | TC-AB-043 | 日志测试 | `agent_bridge/tests/test_observability.py::test_llm_content_not_fully_logged` |

---

### 3.6 客户端取消与超时（Interrupt / Timeout）

| PRD/协议引用 | 说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [PROTO interaction-protocol：Client→Server agent.interrupt] | 客户端请求取消/打断时，必须使用 `agent.interrupt`（或等效）；服务端应尝试中止底层 LLM/工具执行，并推动任务进入可判定终态（cancelled 或按策略 failed） | TC-AB-050 | 集成测试 | `agent_bridge/tests/test_cancellation.py::test_client_can_interrupt_run` |
| [PROTO interaction-protocol：断连处理] | 客户端直接断开连接（断网/刷新）时，服务端必须按策略决定是否中止长任务，并记录结构化日志，避免资源泄漏 | TC-AB-051 | 集成 + 日志测试 | `agent_bridge/tests/test_cancellation.py::test_disconnect_triggers_cleanup` |
| [PROTO interaction-protocol：Task 状态机] / [PROTO api-style-guide：错误码] | 超过配置上限的长任务应触发超时机制：返回规范化错误（`error` 或等效）并推动任务进入终态（failed/cancelled）；日志记录超时原因（不含敏感内容） | TC-AB-052 | 集成测试 | `agent_bridge/tests/test_cancellation.py::test_run_timeout_generates_terminal_state` |

---

## 4. 测试分层与策略

本模块的测试设计遵循 `docs/test/qa-master-plan.md` 中定义的测试分层策略，这里对 Agent Bridge 进行具体化说明。

### 4.1 单元测试（Unit Tests）

主要针对：

- 纯函数/轻逻辑组件：
  - 状态机转换逻辑（事件与终态语义以 `interaction-protocol.md` 为准，示例不自造事件名）；
  - 工具调用重试策略（根据错误类型和配置决定是否重试）；
  - 日志/事件 payload 构建函数。

策略：

- 使用本地内存替身/假实现（fake provider / fake tool registry），不依赖真实网络；
- 对不变式进行属性测试（如状态机不能从 run_completed 回到 run_started）。

### 4.2 集成测试（Integration Tests）

主要针对：

- WebSocket / SSE 握手与会话生命周期；
- Run 生命周期完整链路（创建 → 流式输出 → 工具调用 → 完成/失败）；
- 主账号/子账号隔离与权限校验；
- 日志与 metrics 端点。

策略：

- 在测试环境中以真实方式启动 Agent Bridge（可使用 test config）；
- 使用测试客户端（如 `httpx` + `websockets` / `pytest-asyncio`）模拟前端行为；
- 对接口响应、事件顺序、日志输出进行断言。

### 4.3 端到端测试（E2E Tests）

Agent Bridge E2E 测试通常由前端 E2E（Playwright / Cypress）触发，但本模块视角下关注：

- 从 Workspace Web 发起一个典型的 Agent 会话：
  - 用户输入问题 → 前端通过 WebSocket 发送 → Agent Bridge 调用 LLM/工具 → 最终展示结果；
- 确认在整个链路中，关键事件语义与顺序按 `interaction-protocol.md` 发生，并能通过 trace_id 进行端到端定位。

策略：

- 在 `frontend-testing.md` 中定义 E2E 场景，本文件仅记录相关需求 ID（AB-3.2-*, AB-3.3-* 等）；
- E2E 失败时，可通过 Agent Bridge 日志与 trace 进行问题定位。

### 4.4 合约测试（Contract Tests）

Agent Bridge 对外/对内有若干关键合约：

- 对前端：通过 WebSocket 承载的 SSE 风格事件格式与顺序；
- 对 Platform Core：身份/权限/租户信息传递契约；
- 对 Model Provider：请求/响应格式与错误处理规则。
> 说明：本节提到的 “SSE” 指的是事件语义（event: / data: 结构），
> Workspace Web 与 Agent Bridge 之间的实际传输层为 WebSocket。

策略：

- 使用合约测试思路（可参考 Pact 等模式）定义期望事件/请求结构；
- 在 Agent Bridge 端维护一组“契约测试”，确保对协议的变更不会意外破坏前端或上游服务。

---

## 5. 测试数据与环境依赖

### 5.1 测试数据与假实现

- 测试主账号与用户：
  - 至少两个主账号（Master Account A / Master Account B），各自包含 Admin / Member 用户；
  - 如覆盖子账号：每个主账号下至少 2 个子账号（Sub Account 1 / 2），用于验证可见性与隔离。
- 假 Model Provider：
  - 提供可控的 LLM 假实现（固定响应、可注入错误/超时），避免真实调用产生成本与不确定性；
- 假工具（Tools）：
  - 提供幂等工具和非幂等工具各至少一个，用于测试重试策略；
  - 提供可配置延迟/错误注入能力的工具，用于测试超时与错误处理路径。

### 5.2 环境依赖

- 服务：
  - Agent Bridge Service 实例（测试配置，如降低超时/重试次数）；
  - Platform Core / Auth Stub（可选）：用于验证 ticket 校验与 tenant 解析；
- 基础设施：
  - Redis / 队列（若 Agent Bridge 使用异步队列）；
  - 日志输出（本地文件或 stdout，供测试解析）；
  - Metrics 端点（如 `/metrics`）。

> 具体环境启动方式可参考《local-development.md》《deployment.md》，测试环境应尽量贴近生产配置，但允许使用假实现降低成本与风险。

---

## 6. 与 CI/CD 集成方式

### 6.1 测试代码组织建议

建议在 Agent Bridge 仓库/目录中组织测试如下（示例）：

```text
agent-bridge/
  src/
    ...
  tests/
    test_ws_lifecycle.py
    test_sse_lifecycle.py
    test_run_lifecycle.py
    test_run_streaming.py
    test_tool_calls.py
    test_account_isolation.py
    test_observability.py
    test_cancellation.py
```

- PRD/协议引用建议通过注释或标记方式与测试函数关联，例如：

```python
import pytest

@pytest.mark.requirement_ref("PROTO:interaction-protocol#event-registry")
async def test_event_registry_invariants(...):
    ...
```

### 6.2 CI 执行策略

- 每次提交（push / PR）：
  - 必跑：单元测试 + 关键集成测试（WS 握手、简单 Run 生命周期、多租户隔离、基础工具调用）；
- 主干分支 / 预发环境：
  - 建议增加：带超时/错误注入的集成测试、日志/metrics 测试；
- Nightly / 定时任务：
  - 可运行更重的契约测试、属性测试与大规模 Run 场景（性能/容量测试入口以 `docs/test/qa-master-plan.md` 为准）。

CI 配置应与 `docs/test/qa-master-plan.md` 中定义的项目级测试矩阵保持一致，确保 Agent Bridge 作为“中枢服务”具备更高的测试覆盖优先级。

---

## 7. 未决问题与后续扩展

- 工具调度策略的复杂场景（并行工具、工具链）暂未在 v0.2 中展开，后续一旦 PRD 固化需补充相应测试需求；
- 对流式输出的“背压控制”与性能表现仅在非功能测试章节中设计，目前 v0.2 只要求行为正确，不强制性能指标；
- 与更多 Model Provider（例如多家厂商、不同模型类型）的集成测试可在后续版本中通过 Provider-specific 的契约测试补充；
- 未来若引入跨 Region / 多实例的 Agent Bridge 部署，需要新增与会话亲和性、Run 粘性相关的测试场景；
- 是否为 Agent Bridge 引入 mutation testing 以评估状态机与错误处理路径的测试有效性，可在测试基础稳定后再评估。

> 本文档为 Agent Bridge 模块的测试设计说明 v0.1，后续会随 PRD 与服务实现的演进持续更新。

