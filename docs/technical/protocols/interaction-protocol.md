# 交互协议（Interaction Protocol, V2）
文档版本：v2.0 (Draft)  
最后修改日期：2026-01-26  
作者：Billow 
适用范围：`Workspace Web (Frontend)` 与 `Agent Bridge (Backend)` 的实时交互协议（WebSocket 优先）  
相关文档：
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`
- `docs/features/prd-workspace.md`
- `docs/features/prd-identity-access.md`
- `docs/platform-overview.md`

文档目的：定义工作台端到端实时交互的“消息信封 + 事件类型 + 连接与恢复策略”契约，确保多端一致、可观测、可治理。

## 0. 概述（Overview）
- 本文档定义：工作台实时交互通道（WebSocket 优先）与统一事件信封（Envelope）规范。
- 本文档不定义：卡片 UI Schema 细节、服务端业务决策逻辑、具体权限策略与配额口径（仅引用相关契约文档）。

## 0.1 范围（Scope）
### In Scope
- [TERM-WS-004] 超级输入框发起交互（agent.message；legacy: chat.input）
- [TERM-WS-007] 推理步骤面板所需的步骤/状态事件（workflow.step）
- [TERM-WS-005] 服务端驱动界面所需的交互卡片下发与回传（interaction.card / interaction.response）
- 文件/制品传输（resource.artifact）与大载荷混合传输策略
- 连接建立、重连、断线恢复、ACK 与去重

### Out of Scope
- UI Schema 组件白名单与渲染细节（见产品/组件白名单相关文档）
- Ticket 的签发、权限校验、配额扣减与审计落库细节（见身份与治理相关契约）
- HTTP REST API 的具体路径/字段口径（以 `api-style-guide.md` 与各服务契约为准）

## 0.2 核心内容导航（Core Contents）
- 连接与会话（WebSocket/Ticket/重连）：见第 2 章
- 事件信封与事件类型：见第 3 章
- 可靠性（ACK/去重/恢复）：见第 4～5 章

## 1. 分层边界与统一约定

- 执行层只关心 **怎么传**：握手、事件信封、可靠性、分片、重连。
- 语义层只关心 **传什么**：数据字段与含义，不在本文重复字段定义。
- 会话主键统一为 `session_id`；任何历史对话别名仅在文末 Deprecated Appendix 作为兼容说明出现。
- 事件信封使用 CloudEvents：核心属性为 `specversion/id/source/type/time/datacontenttype/data/control`；并允许顶层扩展属性（extensions），例如 Distributed Tracing 的 `traceparent/tracestate`。
- WebSocket 为主交互通道；HTTP/SSE 仅作为 fallback，且必须与相同的 `control.session_id` 对齐。
- 旧版接口列表与 `interface AgentEvent` 已废弃，事件类型清单以 3.2 为唯一 SSOT；Legacy Envelope 仅在 Deprecated Appendix 提供迁移说明，SSE 不维护独立事件名集合。
- `data` 的字段结构不在本文定义：`Data source` 仅表示“语义对象类型引用”，其字段的唯一权威定义点以 `docs/technical/contracts/agent-interface-spec.md`（及后续专门的 ontology/action contracts）为准，本文不得重复字段表以避免口径漂移。


## 2. Transport Entry Points & Handshake

说明：
- 所有 HTTP API 的版本、命名与错误结构以 `docs/standards/api-style-guide.md` 为唯一口径；
- 本章仅定义“交互协议所需的最小入口集合”，不在此处展开 CoreSvc/Agent Bridge 的完整 REST 契约。

### 2.1 WebSocket Primary Channel（Normative）

- URL：`wss://<api_host>/ws/agent`
- Query Params：
  - `ticket=<ws_ticket>`（必填，一次性 Ticket；签发/校验/权限口径见身份与访问控制相关文档）
- 运行期上下文绑定：
  - 禁止在握手 URL 上混入 `agent_id` / `target_agent_id` 等业务选择参数
  - 会话绑定、工作流选择、运行配置等通过 `session.update`（或同等语义事件）在连接建立后完成
- 连接策略：
  - WebSocket 优先
  - 断线后指数退避重连
  - 必须支持断线恢复（见第 4 章：ACK/去重/恢复策略）
- 握手校验与上下文恢复：
  - 服务端必须从 `ticket` 恢复并绑定 [TERM-IA-035] 主账号边界键（`master_account_id` + 可选 `sub_account_id`）与 `principal_id`。
  - 客户端不得伪造或覆盖上述字段；如需在事件中出现，仅允许由服务端回填到 `control`。

### 2.2 HTTP / SSE 兼容层（Non-normative）

- URL：`POST /api/v{N}/agent/chat/stream`
- Response：`text/event-stream`（SSE）
- 语义约束：
  - 仅用于 WebSocket 不可用时的兼容层
  - 复用本文第 3 章事件信封与 `type/data/control` 语义，不定义独立事件体系
  - 不支持卡片交互回传与复杂工具调用闭环（仅允许只读/不可打断的降级场景）
- 会话一致性：
  - SSE/HTTP 中的会话主键必须与 WebSocket 的 `control.session_id` 口径一致

### 2.3 Large File Upload（Hybrid Transport, Normative）

- 原则：WebSocket 不承载大体积二进制，避免阻塞心跳与交互事件。
- 默认策略：预签名直传对象存储（Preferred）。
- 流程：
  1) `POST /api/v{N}/files/presign`（CoreSvc）获取 `upload_url` 与 `file_id`
  2) Client 直传对象存储（PUT/POST 到 `upload_url`）
  3) 在 `agent.message` / `agent.tool.result` 等事件中仅引用 `file_id`（只传引用，不传正文）
- 例外：小载荷允许内联（例如 < 20KB），但禁止默认使用 Base64 传图/传 PDF。

### 2.4 Conversation Export（Normative）

- URL：`GET /api/v{N}/sessions/{session_id}/export?format=md|html|pdf`
- Response：文件流（Blob/Download）
- 备注：如需兼容 legacy `conversation_id`，仅在 Deprecated Appendix 说明映射关系；导出权限与审计口径以身份与治理文档为准。

## 3. Unified Event Envelope

### 3.1 CloudEvents Envelope（规范）

所有上/下行事件均遵循 CloudEvents 结构，默认 `datacontenttype=application/json`。
约束：`traceparent` / `tracestate` 采用 W3C Trace Context，并按 CloudEvents Distributed Tracing extension 作为顶层扩展属性携带；客户端不得伪造或覆盖，如存在则必须原样透传。

```jsonc
{
  "specversion": "1.0",
  "id": "<uuid_or_ulid>",
  "type": "<canonical_event_type>",
  "source": "orbitaskflow://<service_name>",
  "time": "<rfc3339>",
  "datacontenttype": "application/json",
  "subject": "<optional>",
  "traceparent": "<w3c_traceparent_optional>",
  "tracestate": "<w3c_tracestate_optional>",

  "control": {
    "session_id": "<required_for_routing>",
    "task_id": "<optional_task_context>",
    "target_agent_id": "<optional>",

    "master_account_id": "<resolved_from_ticket>",
    "sub_account_id": "<optional_resolved_from_ticket>",
    "principal_id": "<resolved_from_ticket>",

    // stream recovery anchors (optional)
    "stream_epoch": "<optional_uint64>",
    "stream_offset": "<optional_uint64>",

    "legacy": { /* deprecated compat fields, see Deprecated Appendix */ }
  },

  "data": {
    // event-specific payload, see §3.2+ per event type
  }
}
```
---
### 3.2 Event Type Registry（唯一 SSOT）

- 此表是事件类型的唯一来源，按方向与功能域分组。
- `data` 结构来源：语义协议（完整对象）、增量协议（delta/chunk）、或轻量执行层结构。
- `ACK` 列指明是否需要应用层回执；`Ordering` 描述是否要求序号或流式顺序。
- Reserved 事件的 `Data source` 仅作为“语义对象类型引用”；字段的唯一权威定义以 `docs/technical/contracts/agent-interface-spec.md`（或后续专门的 ontology/action contracts）为准，本文不重复字段表。


#### 3.2.1 Server → Client

| Canonical type | Legacy alias (deprecated) | Data source | ACK | Ordering | Notes |
| --- | --- | --- | --- | --- | --- |
| **Chat Core** |  |  |  |  |  |
| `agent.message.delta` | `message.delta` | MessageDelta（增量） | No | Sequenced (`seq`) | 可流式合并到同一 `message_id`；终点见 `agent.message.completed`。 |
| `agent.message.completed` | `message.complete` | AgentMessage（语义） | Recommended | N/A | 消息完成并落库的提交点。 |
| `agent.message.user` | `message.user` | AgentMessage（role=user） | No | N/A | 多端广播的用户消息。 |
| `agent.ui.typing` | `chat.typing` | TypingState（轻量） | No | N/A | 瞬态输入状态，可丢失。 |
| **Tooling & Safety** |  |  |  |  |  |
| `agent.tool.call` | `agent.tool_call` | ToolCall（语义） | Required | N/A | 服务端请求客户端执行本地/前端工具。 |
| `agent.guardrail.blocked` | `agent.guardrail` | GuardrailEvent（语义） | No | N/A | 安全/合规拦截提示。 |
| `agent.debug.trace` | — | DebugTraceSummary（轻量） | No | N/A | 仅调试摘要/轨迹，不返回逐字推理链。 |
| **Workflow & Tasks** |  |  |  |  |  |
| `agent.task.update` | `job.status` | AgentTask（语义） | No | N/A | 对外统一 Task 状态机；与内部 job 状态不等价。 |
| `workflow.step` | `workflow.step` | WorkflowStepUpdate（增量） | No | Streamed | 可选的可视化步骤更新。 |
| `agent.reasoning_summary` | — | ReasoningSummary（轻量） | No | N/A | 用户可见推理摘要/下一步理由（禁止逐 token 推理链/系统提示/隐私）。 |
| **Artifacts & Interaction** |  |  |  |  |  |
| `resource.artifact.chunk` | `resource.artifact` | ArtifactChunk（分片） | No | Sequenced (chunk index) | 小型制品的 WS 片段传输；建议与 completed 联用。 |
| `resource.artifact.completed` | — | ArtifactRef（语义） | No | N/A | 制品可用的提交点，指向预签名上传的结果或已收齐的分片。 |
| `interaction.card.render` | `interaction.card` | InteractionCard（语义） | Optional | N/A | 下发富交互卡片或表单。 |
| **Notify / Reliability / Heartbeat** |  |  |  |  |  |
| `notification.event` | `notification.push` | Notification（语义） | No | N/A | 轻量通知推送，离线靠 HTTP 拉取。 |
| `error` | `error` | AgentErrorEvent（语义） | Optional | N/A | 与任务或会话关联的错误。 |
| `ack` | `ack` | Ack（轻量） | N/A | N/A | 回执指定 `id/type`，用于应用层确认。 |
| `pong` | `pong` | Pong（轻量） | No | N/A | 应用层心跳响应。 |
| **Ontology / Action / Receipt（Reserved）** |  |  |  |  |  |
| `ontology.sor.updated` | — | SorUpdate（轻量） | No | N/A | **预留**：当 [TERM-G-019] 语义对象注册表（SOR）中的 [TERM-G-020] 对象类型 / [TERM-G-021] 动作类型 / [TERM-G-022] 关系类型发生变更时通知客户端/执行面刷新缓存；不承载 schema 全量，建议只含 `kind + key + version + etag + change_type`。 |
| `action.submit.accepted` | — | ActionSubmitAck（语义） | Recommended | N/A | **预留**：服务端接受一次动作提交请求，返回 [TERM-G-024] 动作引用（ActionRef）与（可选）`task_id`；后续状态推进复用 `agent.task.update`。 |
| `action.submit.completed` | — | ActionSubmitResult（语义） | Recommended | N/A | **预留**：动作执行达到提交点（成功/失败/拒绝/取消），建议携带 [TERM-G-024] 动作引用（ActionRef） + `receipt_id`（若已生成）。 |
| `receipt.created` | — | ReceiptRef（语义） | No | N/A | **预留**：当 [TERM-G-011] 回执（Receipt）落库可查询时推送；可与 `action.submit.completed` 合并使用，但事件名保留以便解耦。 |

#### 3.2.2 Client → Server

| Canonical type | Legacy alias (deprecated) | Data source | ACK | Ordering | Notes |
| --- | --- | --- | --- | --- | --- |
| **User Input** |  |  |  |  |  |
| `agent.message` | `chat.input` | AgentMessage（role=user） | Recommended | N/A | 主用户输入入口，可附带 artifacts refs。 |
| `agent.ui.typing` | `chat.typing` | TypingState（轻量） | No | N/A | 输入态提示。 |
| `agent.interrupt` | `agent.interrupt` | InterruptRequest（轻量） | Recommended | N/A | 打断当前执行或请求取消 Task。 |
| **Tooling** |  |  |  |  |  |
| `agent.tool.result` | `agent.tool_result` | ToolResult（语义） | Required | N/A | 对应 `agent.tool.call` 的结果。 |
| **Interaction Feedback** |  |  |  |  |  |
| `interaction.response` | `interaction.response` | InteractionResponse（语义） | Recommended | N/A | 表单/卡片回复，建议携带 `control.task_id`。 |
| **Session / Message Meta** |  |  |  |  |  |
| `message.feedback` | `message.feedback` | MessageFeedback（轻量） | Optional | N/A | 点赞/纠错与 `message_id` 关联。 |
| `session.update` | `session.update` | SessionUpdate（轻量） | Optional | N/A | 会话元数据更新，主键为 `session_id`。 |
| `message.pin` | `message.pin` | MessagePin（轻量） | Optional | N/A | 消息置顶/取消置顶。 |
| **Ontology / Action（Reserved）** |  |  |  |  |  |
| `action.submit.requested` | — | ActionSubmitRequest（语义） | Required | N/A | **预留**：客户端/用户触发的显式动作提交入口（区别于纯聊天 `agent.message`）；约束：`action_ref` 与 `{action_type_key + input}` 二选一；两种形态都必须携带 `idempotency_key`；服务端必须进行 policy_check（fail-closed）。 |
| **Reliability / Heartbeat** |  |  |  |  |  |
| `ack` | `ack` | Ack（轻量） | N/A | N/A | 用于确认收到下行关键事件或提交点。 |
| `ping` | `ping` | Ping（轻量） | No | N/A | 应用层心跳。 |

## 4. Client Implementation Guide

- **Connection lifecycle**：页面加载即建立 WebSocket；异常断开按指数退避（1s/2s/4s/…，最多 5 次）；收到正常关闭且原因为 Idle Timeout 时进入休眠，待用户重新激活页面或发起操作时再重连。
- **State rehydration**：重连后应通过 HTTP 兜底补齐 `agent.message.completed` 之后的历史与 `notification.event`，并携带最新 `session_id`（接口路径以各服务契约为准）。例如（Non-normative）：
  1) `GET /api/v{N}/sessions/{session_id}/messages?after_message_id=<local_last_id>`
  2) `GET /api/v{N}/notifications?unread=true`
- **ACK 策略**：
  - 必须回执：`agent.tool.call`（业务操作）、关键提交点（如 `agent.message.completed`、`resource.artifact.completed` 若实现方要求强一致）。
  - 客户端发送的用户输入建议等待 `ack` 再将 UI 状态标记为“已送达”。
- **追踪与治理**：
  - 所有事件应透传 `traceparent/tracestate`；身份与 [TERM-IA-035] 主账号边界键（`master_account_id` + 可选 `sub_account_id`）由 Ticket 解析后写入 `control`，客户端不得伪造。
  - `master_account_id` / `sub_account_id` / `principal_id` 由握手 `ticket` 在服务端恢复并回填到 `control`；客户端不得伪造或覆盖。
- **大文件与制品**：
  - 优先使用对象存储预签名上传，WS/事件中只传引用（如 `file_id` / `artifact_id`），不传二进制正文。
  - 仅在小型代码片段或轻量预览时使用 `resource.artifact.chunk`；收到 `resource.artifact.completed` 后再更新 UI 状态或允许下载。
- **命名一致性**：所有请求和事件中的会话主键均为 `session_id`；如需兼容外部对话句柄，仅可写入 `control.legacy.*`（见 Deprecated Appendix）并在业务层转换为 `session_id`。

### 4.1 Stream Recovery via `stream_epoch` / `stream_offset`（Normative）

为支持断线恢复与“可回放”的可靠事件投递，服务端 **可选** 在 CloudEvents `control` 中填充 `stream_epoch` 与 `stream_offset`：

- `control.stream_epoch`：会话事件流的“世代号（epoch）”。当服务端因压缩、迁移、重建或任何原因导致该会话的事件历史发生不可兼容切换时，必须递增该值。
- `control.stream_offset`：在同一 `stream_epoch` 内单调递增的全局偏移（per `session_id`），用于恢复点定位与去重。`stream_offset` 必须在同一 `stream_epoch` 内严格递增（允许不连续）。

#### Client Requirements

1) 客户端在收到事件且完成处理后，必须持久化最后一个已处理事件的 `(stream_epoch, stream_offset)`。
   - 若服务端未提供 `stream_epoch/stream_offset`，客户端应跳过本机制，并退化为本地会话快照/全量拉取的恢复方式。

2) 客户端重连后，应在建立会话上下文的第一轮 `session.update`（或等价的恢复入口）中携带本地保存的恢复点；服务端据此决定恢复策略：
   - **epoch 相同**：服务端可从 `stream_offset` 之后开始重放事件（允许重放最近窗口内的少量事件）；客户端必须按 `(stream_epoch, stream_offset)` 去重处理。
   - **epoch 不同**：客户端必须执行全量 rehydrate（例如通过 HTTP 拉取 session state、last completed artifacts、task states），并以服务端返回的最新 `stream_epoch` 重新开始记录恢复点。

3) `stream_offset` 不替代 `data.seq`：
   - `data.seq` 用于**同一 message/content 的增量拼接**（如 message.delta 的片段顺序）。
   - `stream_offset` 用于**跨事件流的恢复与去重**（面向断线重连与重放）。

#### Minimum Recovery Semantics for Reserved Ontology-related Events

- `ontology.sor.updated`：允许丢失；客户端应在重连后通过拉取机制获取 SOR 最新状态（例如按 etag/version）。若投递则建议携带 `(stream_epoch, stream_offset)` 以便客户端去重。
- `action.submit.*`、`receipt.created`：允许重放；客户端必须幂等处理（建议以 `action_ref` / `receipt_id` 作为去重键）。


## 5. Key Event Semantics

本节只展开关键复杂事件的细则，完整清单以 3.2 为准。

### 5.1 `agent.message.delta` 合并规则
- `data.seq` 必须单调递增；缺失序号的增量需缓存或丢弃，防止内容错位。
- 同一 `message_id` 的增量按 `seq` 拼接；`agent.message.completed` 确认最终内容并提供幂等落库点。
- 断线重连后允许服务端重放最近一批增量，客户端需按 `id`/`seq` 去重。

### 5.2 制品分片与提交点
- `resource.artifact.chunk` 仅用于轻量分片，建议包含 `chunk_index/total_chunks/artifact_id`。
- 服务端在分片全部送达或预签名上传完成后发送 `resource.artifact.completed`，客户端以该事件为渲染/下载的提交点。
- 大体积二进制数据不应通过长连接传输；WS/事件中仅引用 `file_id` / `artifact_id` 等标识，不传二进制正文。

### 5.3 工具调用与结果
- 每个 `agent.tool.call` 都必须对应一个 `agent.tool.result`；在重试或断线场景下，`id` 与 `task_id` 用于幂等匹配。
- 若客户端拒绝执行（权限/安全原因），应返回 `agent.tool.result`，`data` 中携带标准化错误（引用 AgentError 定义）。
- 服务端可要求 `ack` 以确认工具调用已被消费，未收到回执可重发。

### 5.4 任务状态机（AgentTask）
- 状态集：`CREATED → RUNNING → (SUSPENDED ↔ RUNNING) → COMPLETED/FAILED/CANCELLED`。
- `/jobs` 等内部实现可有独立状态，但必须在文档中声明“job status != task state”，对外事件一律使用 `agent.task.update`。
- `control.session_id` 必填，确保任务更新与会话上下文一致；如需携带兼容性对话句柄，放入 `control.legacy.*`，不可替代主键。

### 5.5 推理摘要 / 安全与调试事件
- `agent.reasoning_summary`：用于提供用户可理解的“推理摘要/下一步理由”（可展示给用户）。约束：不得包含逐 token 推理链、系统提示、隐私数据；必须是可公开的短摘要。
- `agent.guardrail.blocked`：用于提示已拦截内容，应包含最小必要信息（原因/规则）且不泄露敏感文本。
- `agent.debug.trace`：仅输出阶段摘要、调用轨迹或指标，禁止逐字返回模型内部推理链，避免信息泄露；仅在 debug 模式下下发。

### 5.6 `action.submit.*` / `receipt.created`（Reserved）

- `action.submit.requested`：
  - 语义：显式请求执行一个 [TERM-G-021] 动作类型（Action Type）；服务端必须进行 policy_check（fail-closed），并在需要时升级为二次确认/协助（obligations 由 PDP/PEP 与治理契约定义，本文不重述）。
  - 幂等：必须携带 `idempotency_key`，用于 [TERM-G-010] 副作用网关（Side-effect Gateway）幂等去重与防重复提交。
- `action.submit.accepted`：
  - 语义：服务端接受请求并返回 [TERM-G-024] 动作引用（ActionRef）；若进入异步执行，建议同时返回 `task_id`，并依赖 `agent.task.update` 推进状态。
- `action.submit.completed`：
  - 语义：动作达到最终提交点：`succeeded/failed/denied/cancelled`；若 [TERM-G-011] 回执（Receipt）已生成则附 `receipt_id`。
- `receipt.created`：
  - 语义：[TERM-G-011] 回执（Receipt）已落库可查询/可回溯；客户端可据此刷新“证据链/回执面板”。

## 6. 依赖与引用（Dependencies & References）
- 术语口径（SSOT）：`docs/standards/ssot-glossary.md`
- API 风格与错误结构（SSOT）：`docs/standards/api-style-guide.md`
- 文档规范：`docs/standards/doc-guidelines.md`
- 工作台需求与规则：`docs/features/prd-workspace.md`
- 身份与访问控制（Ticket/权限/审计）：`docs/features/prd-identity-access.md`
- 平台总览：`docs/platform-overview.md`

## 7. 变更记录（Changelog）

| 日期 | 修改人 | 变更摘要 | 影响范围 |
|---|---|---|---|
| 2026-01-26 | Billow | 建立 Interaction Protocol V2 草案骨架；WebSocket 优先；CloudEvents Envelope；事件类型 Registry；可靠性与迁移附录 | Workspace Web、Agent Bridge、CoreSvc（相关端点与回溯） |

## Deprecated Appendix（仅迁移参考）

### A. Legacy 事件名映射（Deprecated）
- `chat.input` → `agent.message`
- `agent.tool_result` → `agent.tool.result`
- `interaction.card` → `interaction.card.render`
- `notification.push` → `notification.event`
- `message.complete` → `agent.message.completed`
- `message.delta` → `agent.message.delta`

### B. Legacy 资源标识（Deprecated）
- `conversation_id`：仅用于历史数据/旧接口兼容；主口径为 `session_id`，如需兼容在业务层做映射。

