# OSS Reference Playbook（开源参考作战手册）

> 目的：将《Orbitaskflow 技术栈与最佳实践》《Orbitaskflow 开源架构与方案调研报告》《寻找有影响力且可维护的开源代码》三份输入整合为一份**可执行**的工程手册，用于后续：
> - 技术细节设计（ADR / L2-L3 技术文档）
> - AI 生成代码（生成时参考 + 生成后校验）
> - 代码评审/CI（Guardrails 落地）
>
> **硬要求**：凡引用开源项目/框架/代码库，必须在本书中给出 **GitHub 地址**（必要时补充官方文档链接）。

---

## 0. 如何使用（团队与 AI 的统一工作流）

### 0.1 AI 生成“上下文包”（Context Pack）
每次生成技术细节或代码，必须输入以下最小上下文包：
1) 目标模块对应 PRD/ADR（需求与决策）
2) 本书对应章节（不变量 + 默认解 + Cookbook + Guardrails）
3) 相关接口契约（Proto/JSON Schema/HTTP API/WS Event）
4) 相关代码骨架（repo 目录、关键抽象、示例实现）
5) （可选）本章列出的 OSS 参考仓库的关键实现点（文件路径/模块名）

### 0.2 生成输出必须包含的“对齐声明”（AI Output Contract）
AI 输出（文档/代码）必须显式声明：
- 采用了哪些本章 **不变量**（Invariants）
- 采用了哪些本章 **默认解**（Default Blueprint）
- 触发了哪些 **Guardrails**（必须/禁止/需审计）
- 如果偏离默认解：列出偏离点 + 原因 + 风险 + 回滚方案

### 0.3 引用开源代码的格式（必须）
- 参考项目：`<项目名> — <GitHub URL> (可选：官方文档 URL)`
- 若借鉴特定实现：补 `关键文件路径/模块名`（如 `pkg/...`、`src/...`）

### 0.4 本书的更新节奏（持续演进，而非一次性文档）
- 每次新增一个关键能力（例如 Side-effect Gateway），必须同步：
  - 该能力的 Blueprint（端到端链路）
  - 该能力的 Cookbook（最小实现）
  - 该能力的 Guardrails（可检查规则）
  - 该能力的 OSS 参考（含 GitHub + 关键实现点）

---

## 1. 系统不变量（Invariants / 工程宪法）

> 本章是不允许被 AI 以及开发者“随便改”的系统级红线。

### 1.1 控制面 / 执行面分离
- 控制面（Go）：身份安全、租户上下文、对象 CRUD、策略决策（PDP）、审计/计量事件写入。
- 执行面（Python）：Agent runtime、工具编排、长时任务执行、Worker 弹性扩展。

### 1.2 多租户强隔离（DB-enforced isolation）
- Shared DB + DB 强制隔离（优先 Postgres RLS）。
- 事务内必须 `SET LOCAL` 租户上下文；避免连接池污染。

### 1.3 长时任务语义
- 至少一次（at-least-once）投递 + 幂等兜底。
- 失败可重试、可补偿；状态机可追踪。

### 1.4 副作用与出站治理
- 所有副作用（对外 HTTP、工具调用、文件导出等）必须经统一治理入口。
- 必须产生 receipt（回执）+ 审计事件 + 计量事件；可追溯与可计费。

### 1.5 WebSocket 优先（交互主通道）
- 交互（聊天、打断、Generative UI 推送、编辑器协同）使用 WebSocket。
- 必须支持断线重连与补拉；事件版本化。

### 1.6 可观测性与治理
- trace/metrics/logs 必须可贯通：从用户交互 → 任务 → 副作用 → 持久化。
- 审计/计量事件 schema 必须稳定可演进。

---

## 2. 默认参考架构（Default Blueprints）

> 本章给出“默认组合解”，作为 AI 与工程实现的首选路径。偏离必须写 ADR。

### 2.1 部署形态（优先）
- 优先：Kubernetes（控制面/执行面/Worker 分离部署，Worker 水平扩缩）。
- MVP 降级：单机/混合（但仍保持进程边界与权限边界）。

### 2.2 任务与工作流
- **MVP 默认**：Redis 队列（Streams/Lists） + Python Worker（at-least-once + 幂等）。
- **可演进**：引入 Durable Workflow（Temporal）用于长时编排/补偿（Saga）与可视化执行历史。

### 2.3 副作用治理（Egress/Side-effect Gateway）
- 统一出站入口：签名/权限/capability、速率限制、重试、回执 receipt、审计/计量。
- 与 Outbox 配合：DB 事务内写业务对象 + Outbox；异步消费者执行副作用。

### 2.4 多租户隔离
- Postgres RLS 默认开启于核心对象（对话资产、交付物、工作流实例、订阅实例、授权分发、审计/计量事件）。
- 服务端事务内 SET LOCAL 传递租户上下文。

### 2.5 实时通道
- WebSocket 为主；推荐引入独立实时服务（Centrifugo）承接连接、历史与恢复，保护 DB 免受重连风暴。

### 2.6 多语言契约（Go ↔ Python）
- Protobuf 作为单一事实来源，生成 Go struct 与 Python model。

### 2.7 生成式 UI（Server-driven / Generative UI）
- 输出必须结构化（JSON Schema 或 Protobuf），支持版本与降级。

### 2.8 安全执行（Sandbox）
- 不可信代码/工具执行必须隔离；最小权限；可观测与可审计。

---

## 3. 参考实现骨架（Repository Skeleton）

> 用于约束“代码该长什么样”。AI 生成代码时应尽量贴合此骨架。

### 3.1 建议的目录（示例）
- `docs/technical/oss-reference-playbook/`（本书与索引）
- `proto/`（Protobuf 单一事实来源）
- `services/platform-core-go/`（控制面）
  - `internal/tenant/`（SET LOCAL、租户上下文注入）
  - `internal/policy/`（PDP：capability/policy）
  - `internal/audit/`（审计、计量事件写入）
  - `internal/outbox/`（Outbox 写入与管理）
  - `internal/ws-ticket/`（WS Ticket 签发）
- `services/agent-bridge-py/`（执行面）
  - `app/ws/`（WS session 编排、事件推送）
  - `app/tools/`（工具/外部调用抽象，不允许直连）
  - `app/receipts/`（receipt 结构与回写）
- `workers/task-runner-py/`（Worker）
  - `jobs/`（Arq/Celery tasks）
  - `idempotency/`（幂等去重）
- `infra/`（Centrifugo、Redis、Postgres、Gateway 配置）
- `ci/guardrails/`（自研检查脚本、Semgrep 规则、SQL 扫描规则）

---

## 4. Cookbook（最小可行实现清单）

> 每个 Cookbook：1) 目标；2) 接口与数据；3) 状态机；4) 最小实现步骤；5) 验收测试；6) 参考 OSS（含 GitHub + 关键实现点）。

### 4.1 Cookbook：Redis 队列 + Python Worker（at-least-once）

**目标**：提供可扩展的后台任务执行（RAG ingestion、批处理、长耗时工具），保证 at-least-once + 幂等。

**接口与数据**
- Task Payload：必须来自 `proto/`（或 JSON schema），包含：
  - `task_id`（全局唯一）
  - `tenant_id` / `master_account_id`
  - `idempotency_key`
  - `requested_by`（actor / employee / sub_account）
  - `trace_id` / `correlation_id`
  - `capability_token`（如涉及副作用）

**幂等策略（必须其一）**
- Redis SETNX / setex：`processed:{idempotency_key}`
- 或 Postgres 唯一约束（推荐用于“不可重复副作用”）

**最小实现步骤**
1) 定义 `proto/task_payload.proto`，生成 Go/Python 代码
2) Worker 启动时注入：Redis client、DB pool（只写白名单派生表）、Tracing
3) 每个 task handler：先做幂等检查，再执行业务逻辑
4) 失败策略：
   - 业务失败 → 可重试
   - 幂等冲突/重复 → 直接 ack

**验收测试**
- 重复投递同一任务 3 次，副作用最多执行 1 次
- Worker 在 ack 前 crash，重启后不产生重复副作用

**参考 OSS（GitHub）**
- Arq — https://github.com/python-arq/arq （关键点：async native、retry、job id）
- Celery — https://github.com/celery/celery （对照：语义、retry、acks_late 等配置）
- RQ — https://github.com/rq/rq （对照：简化队列模型）

---

### 4.2 Cookbook：Go 侧 Redis 任务/延迟队列（可选）

**目标**：当 Go 控制面需要直接投递某些延迟任务（如定时清理、计量聚合）时的 Go 生态参考。

**参考 OSS（GitHub）**
- Asynq — https://github.com/hibiken/asynq

---

### 4.3 Cookbook：Durable Workflow（Temporal，可演进）

**目标**：为长时、可暂停/可恢复、带补偿的流程提供可靠执行与可视化。

**最小实现步骤**
1) 部署 Temporal Server（可先用 Postgres persistence）
2) 建 namespace：`orbitaskflow`
3) Go 控制面：Temporal client 启动 workflow
4) Python 执行面/worker：实现 Activities（必须幂等）
5) Human-in-the-loop：Signal/Query 用于暂停/恢复/人工确认

**验收测试**
- workflow 中断（worker crash）后可恢复继续，不重复执行外部动作
- Saga 补偿在失败时按顺序执行

**参考 OSS（GitHub）**
- Temporal Server — https://github.com/temporalio/temporal
- Temporal Go SDK — https://github.com/temporalio/sdk-go
- Temporal Python SDK — https://github.com/temporalio/sdk-python

---

### 4.4 Cookbook：Transactional Outbox + Side-effect Consumer + Receipt

**目标**：保证“业务状态变更”与“外部副作用”最终一致，且每次外部调用可审计、可计量、可回放。

**核心表结构（建议 v0）**
- `outbox_event`（append-only）
  - `event_id` (PK, UUID)
  - `tenant_id`
  - `action_type`（枚举：LLM_CALL / TOOL_CALL / EXPORT / WEBHOOK / ...）
  - `payload` (jsonb)
  - `status`（PENDING/SENT/FAILED/DEAD）
  - `retry_count`
  - `next_retry_at`
  - `created_at`
  - `updated_at`
- `side_effect_receipt`（append-only）
  - `receipt_id` (PK, UUID)
  - `event_id` (FK)
  - `tenant_id`
  - `request_digest`（hash）
  - `response_digest`（hash）
  - `status_code`
  - `latency_ms`
  - `error_code` / `error_message`（可选）
  - `created_at`

**最小实现步骤**
1) 控制面在同一 DB 事务内：写业务对象 + 写 outbox_event
2) Consumer（可在 Worker 或独立 Sender 服务）：
   - `SELECT ... FOR UPDATE SKIP LOCKED` 拉取 PENDING
   - 经 Egress/Side-effect Gateway 调用外部
   - 写 receipt（append-only）
   - 更新 outbox_event 状态（SENT/FAILED + retry）
3) 幂等：
   - 外部接口支持 idempotency-key → 透传
   - 本地以 `event_id` 唯一处理

**验收测试**
- 主事务回滚 → outbox 不应产生事件
- outbox 事件重复消费 → 不产生重复外部调用
- receipt 可追溯到 trace_id/correlation_id

**参考 OSS（GitHub）**
- Debezium（Outbox 模式参考）— https://github.com/debezium/debezium

---

### 4.5 Cookbook：基础设施级 Egress Gateway（K8s/Istio，可选演进）

**目标**：在基础设施层强制所有 Pod 出站流量经统一出口（观测/审计/白名单）。

**说明**：这是“基础设施兜底”，不替代应用层 Side-effect Gateway（应用层仍负责 receipt、计量、幂等）。

**参考 OSS（GitHub）**
- Istio — https://github.com/istio/istio
- Envoy — https://github.com/envoyproxy/envoy

---

### 4.6 Cookbook：Postgres RLS + SET LOCAL 租户上下文

**目标**：把租户隔离从“应用约定”提升为“数据库强制执行的不变量”。

**最小实现步骤**
1) 每个核心业务表必须含 `tenant_id/master_account_id`
2) 为核心表启用 RLS：`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
3) 以 `current_setting('app.tenant_id', true)` 驱动 policy
4) 每次事务开始必须 `SET LOCAL app.tenant_id = '<tid>'`
5) 连接池：必须在事务内 SET LOCAL，禁止在连接级 SET（防串租）

**验收测试**
- 属性测试：随机插入多租户数据，切换 tenant_id 查询，确保看不到他租
- 负例测试：忘记 SET LOCAL → 查询必须失败或返回空（取决于 policy）

**参考 OSS（GitHub）**
- PostgREST — https://github.com/PostgREST/postgrest
- Hasura — https://github.com/hasura/graphql-engine
- Supabase — https://github.com/supabase/supabase

---

### 4.7 Cookbook：Policy / Capability（PDP/PEP）

**目标**：用可衰减、可委派的能力令牌约束副作用与敏感操作，支持离线校验与最小权限。

**最小实现步骤（建议）**
1) 控制面签发 capability token（绑定：tenant、actor、scope、allowed_actions、expiry）
2) PEP（Egress/Side-effect Gateway、关键 API 中间件）校验 capability
3) 任何副作用必须携带 capability；审计事件记录 capability 摘要

**参考 OSS（GitHub）**
- OPA — https://github.com/open-policy-agent/opa
- Casbin — https://github.com/casbin/casbin
- Biscuit（能力令牌）— https://github.com/biscuit-auth/biscuit
- Keycloak（对照：多租户 realm）— https://github.com/keycloak/keycloak

---

### 4.8 Cookbook：WebSocket 事件流（重连补拉/背压）

**目标**：保证客户端网络抖动后可以“断点续传”，避免回退全量拉取导致 DB 重连风暴。

**最小实现步骤（推荐：Centrifugo）**
1) 引入 Centrifugo 作为 WS 网关
2) 使用 Redis engine（Streams）启用 History & Recovery
3) 频道命名：`tenant:{tid}:...`，确保租户隔离
4) 客户端携带 `offset/epoch` 重连补拉

**参考 OSS（GitHub）**
- Centrifugo — https://github.com/centrifugal/centrifugo
- Centrifugo JS SDK — https://github.com/centrifugal/centrifuge-js
- Mattermost（对照：高并发 WS 实践）— https://github.com/mattermost/mattermost

---

### 4.9 Cookbook：Server-driven UI / Generative UI（Schema + 降级）

**目标**：LLM/服务端输出结构化 UI 指令，前端按 schema 渲染；失败可降级到安全 UI。

**最小实现步骤**
1) 定义 UI schema（JSON Schema 或 proto）并版本化
2) LLM 输出必须严格匹配 schema（否则拒绝/重试）
3) 前端渲染：支持 fallback（纯文本/简化表单）

**参考 OSS（GitHub）**
- Backstage（插件化/元数据驱动）— https://github.com/backstage/backstage
- NocoBase（schema protocol / block 扩展范式）— https://github.com/nocobase/nocobase
- Appsmith（低代码 UI 工程实践）— https://github.com/appsmithorg/appsmith
- ToolJet（对照：插件/CLI/发布流程）— https://github.com/ToolJet/ToolJet

---

### 4.10 Cookbook：插件市场与加载器（Marketplace / Microkernel）

**目标**：构建轻量核心 + 插件契约 + 发布流程，为工作流市场/数字员工市场奠定结构。

**最小实现步骤**
1) 插件 Manifest（JSON/YAML）：name/version/capabilities/ui_schema/deps
2) 插件打包与发布（CI）：生成 metadata
3) 加载器：根据 manifest 装载前端 UI 与后端能力

**参考 OSS（GitHub）**
- Backstage — https://github.com/backstage/backstage
- n8n — https://github.com/n8n-io/n8n

---

### 4.11 Cookbook：Sandbox（不可信代码/工具执行）

**目标**：将不可信执行隔离在最小权限环境中，限制系统调用、网络、文件访问。

**最小实现步骤（建议 v0）**
1) Firecracker MicroVM 或 WASM runtime 作为执行边界
2) 默认禁止出站网络（仅白名单域名）
3) 文件系统仅挂载临时目录
4) 所有执行写审计事件与资源用量（CPU/内存/IO）

**参考 OSS（GitHub）**
- Firecracker — https://github.com/firecracker-microvm/firecracker
- Wasmtime — https://github.com/bytecodealliance/wasmtime

---

## 5. Guardrails（AI 生成与代码实现的硬性规则）

> 目标：把不变量转成“可检查规则”。本章规则应逐步落到 CI 与运行时 Gate。

### 5.1 出站与副作用（必须）
- 禁止业务代码直接调用外部 HTTP/SDK；必须通过 `Egress/Side-effect Gateway`。
- 每次副作用必须携带：`capability_token`、`idempotency_key`、`correlation_id`。
- 必须写入：receipt + 审计事件 + 计量事件（append-only）。

**CI 落地建议**
- Python：禁止 `requests`/`httpx` 在业务层直接出现（仅允许在 gateway 模块）
- Go：禁止直接 `net/http` 出站（仅允许在 gateway 模块）
- 通过 Semgrep + 路径白名单实现

### 5.2 多租户隔离（必须）
- 禁止任何 DB 事务缺少租户上下文：必须 `SET LOCAL`。
- 核心对象表必须启用 RLS；任何绕开 RLS 的访问必须被禁止或强审计。

**CI 落地建议**
- SQL 扫描：检测危险 `SET app.tenant_id`（非 SET LOCAL）、检测缺少 tenant 注入的事务模板
- 单测：多租户穿越测试（黑盒）

### 5.3 任务语义（必须）
- 所有任务处理函数必须幂等（以 `idempotency_key`/去重表保障）。
- 重试与补偿必须可追踪：状态机与事件日志必须可重放。

### 5.4 WebSocket 事件（必须）
- 事件必须可版本化；客户端必须可重连补拉。
- 任何消息推送必须带 `sequence_id/offset`（或等价）。

### 5.5 生成式 UI（必须）
- LLM 输出必须经过 schema 校验；失败必须降级为纯文本或安全 UI。

### 5.6 高危变更（必须人工）
- 安全配置、依赖大版本升级、RLS policy 变更、Gateway 出站白名单变更：禁止 AI 自动落库/合并，必须人工复核。

---

## 6. 可观测性与事件规范（Observability & Events）

### 6.1 统一关联字段（所有链路必须携带）
- `trace_id`（OpenTelemetry）
- `correlation_id`（跨服务关联）
- `tenant_id/master_account_id`
- `actor_id`（主/子/员工）
- `process_id/workflow_id/task_id`

### 6.2 审计事件（Audit Event）
- append-only
- 记录：谁在何时对什么对象做了什么（含 capability 摘要与关键参数摘要）

### 6.3 计量事件（Metering Event）
- append-only
- 记录：计费维度（token、调用次数、外部 API、导出次数、存储增量等）

**参考 OSS（GitHub）**
- OpenTelemetry Go — https://github.com/open-telemetry/opentelemetry-go
- OpenTelemetry Python — https://github.com/open-telemetry/opentelemetry-python

---

## 7. OSS 参考索引（按子系统）

> 本章用于 AI 与工程人员快速定位“该抄谁的作业”。每条必须含 GitHub。

### 7.1 Workflow / Queue
- Arq — https://github.com/python-arq/arq
- Celery — https://github.com/celery/celery
- RQ — https://github.com/rq/rq
- Asynq (Go) — https://github.com/hibiken/asynq
- Temporal — https://github.com/temporalio/temporal

### 7.2 Multi-tenant / RLS
- PostgREST — https://github.com/PostgREST/postgrest
- Hasura — https://github.com/hasura/graphql-engine
- Supabase — https://github.com/supabase/supabase

### 7.3 Policy / AuthZ
- OPA — https://github.com/open-policy-agent/opa
- Casbin — https://github.com/casbin/casbin
- Biscuit — https://github.com/biscuit-auth/biscuit
- Keycloak（对照）— https://github.com/keycloak/keycloak

### 7.4 Realtime / WebSocket
- Centrifugo — https://github.com/centrifugal/centrifugo
- centrifuge-js — https://github.com/centrifugal/centrifuge-js
- Mattermost（对照）— https://github.com/mattermost/mattermost

### 7.5 SDUI / Plugin / Low-code
- Backstage — https://github.com/backstage/backstage
- NocoBase — https://github.com/nocobase/nocobase
- Appsmith — https://github.com/appsmithorg/appsmith
- ToolJet — https://github.com/ToolJet/ToolJet
- n8n — https://github.com/n8n-io/n8n

### 7.6 Sandbox
- Firecracker — https://github.com/firecracker-microvm/firecracker
- Wasmtime — https://github.com/bytecodealliance/wasmtime

---

## 8. 下一步落地清单（把“书”变成“工程约束”）

> 目标：把本书从“指导性文档”升级为“工程系统的一部分”。本章给出可直接落到 repo 的文件/目录级改造清单。

### 8.1 建立单一事实来源：`proto/` + 代码生成流水线
**落点目录**
- `proto/`：所有跨服务契约（Task Payload、Audit/Metering Events、WS Events、UI Schema Proto 可选）
- `tools/proto/`：生成脚本与版本锁

**建议文件**
- `tools/proto/Makefile`（或 `scripts/gen_proto.sh`）：
  - `make proto-gen-go`
  - `make proto-gen-py`
  - `make proto-lint`
- `buf.yaml` / `buf.gen.yaml`（可选：更强的 lint 与 breaking check）

**推荐工具（GitHub）**
- protoc-gen-go — https://github.com/protocolbuffers/protobuf-go
- grpc-gateway（可选）— https://github.com/grpc-ecosystem/grpc-gateway
- protoc-gen-pydantic（Python model 生成）— https://github.com/koxudaxi/protoc-gen-pydantic
- Buf（可选）— https://github.com/bufbuild/buf

**验收点**
- 修改任一 `proto/*.proto` 后，Go/Python 生成物一致更新；CI 可检测未生成/不一致。

---

### 8.2 把 Guardrails 落到 CI：Semgrep + SQL 扫描 + Policy 测试

**落点目录**
- `ci/guardrails/`
  - `semgrep/`（语言级静态检查）
  - `sql/`（SQL/迁移脚本扫描）
  - `policy/`（OPA/Casbin/Biscuit 的测试样例）

**建议文件（最小可行）**
- `ci/guardrails/semgrep/rules.yaml`
- `ci/guardrails/sql/check_sql.sh`
- `ci/guardrails/run_guardrails.sh`（统一入口，CI 调用）

**CI 规则（必须覆盖）**
1) 出站禁止：
   - Python：业务层禁止直接出现 `requests`/`httpx` 出站（只允许 gateway 模块白名单路径）
   - Go：业务层禁止直接 `net/http` 出站（只允许 gateway 模块白名单路径）
2) 租户上下文：
   - SQL/迁移脚本中检测危险 `SET app.tenant_id =`（非 `SET LOCAL`）
   - Go/Python 事务模板必须调用 `SetTenantContext()`（你们后续实现的统一函数）
3) 高危变更：
   - RLS policy 变更、Gateway 白名单变更、依赖大版本升级：标记为 `requires-human-review`

**推荐工具（GitHub）**
- Semgrep — https://github.com/semgrep/semgrep

---

### 8.3 为每个 Cookbook 做“Reference Spike”（最小端到端跑通）

**落点建议**
- `spikes/`（或用分支约定，如 `spike/<topic>`）
  - `spike/outbox-receipt/`
  - `spike/rls-tenant-context/`
  - `spike/ws-recovery/`
  - `spike/task-idempotency/`

**每个 Spike 必须产出**
- 可运行 demo（docker compose 或 k8s manifests）
- 最小接口契约（proto/schema）
- 最小表结构（migration）
- 最小可观测性（trace_id/correlation_id 打通）
- 最小验收脚本（重复投递、崩溃恢复、串租负例）

---

### 8.4 把“OSS 可借鉴点”固化为可检索的实现索引（给 AI 用）

> 你强调“便于 AI 搜索检查”。这里采用 **GitHub + 检索关键词** 的方式，避免写死不准确文件路径。

对每个 OSS，在本书对应章节补充：
- GitHub（必填）
- 建议检索关键词（必填）：如 `idempotency`、`retry`、`acks_late`、`RLS`、`current_setting`、`history recovery`、`outbox`、`SKIP LOCKED` 等
- 关键概念映射（必填）：该 OSS 概念如何映射到 Orbitaskflow 的对象与不变量

---

### 8.5 将本书与 ADR / 技术文档地图做双向索引

**落点建议**
- ADR 模板新增字段：
  - `Related Playbook Sections:`（引用本书章节）
  - `Reference OSS:`（引用本书 OSS 索引条目）
- 本书每章末尾新增：
  - `Related ADRs:`（回链）

**验收点**
- 任一 ADR 都能回链到本书章节；任一本书章节都能找到对应 ADR。

---

## 附录 A：AI 生成代码 Prompt 片段（可直接复用）

> 你在生成代码时，把以下片段附在提示词末尾即可：

- “你必须遵守《OSS Reference Playbook》的 Invariants 与 Guardrails。禁止直接出站调用；所有副作用必须经 Side-effect Gateway 并产生 receipt/audit/metering。所有 DB 事务必须 SET LOCAL 租户上下文。输出前请列出你遵守了哪些 Guardrails，并指出涉及的模块路径。”

---

## 附录 B：CI Guardrails 最小实现蓝图（可直接落到 repo）

### B.1 目录与入口
- `ci/guardrails/run_guardrails.sh`
  - 运行 Semgrep
  - 运行 SQL 扫描
  - 运行最小 policy 测试（如有）

### B.2 Semgrep 规则（建议分组）
- `G-OUTBOUND-001`：禁止业务层直接出站（requests/httpx/net/http）
- `G-TENANT-001`：禁止绕过统一的 tenant context 注入
- `G-SECRETS-001`：禁止在代码中硬编码 token/secret（可选）

### B.3 SQL 扫描（建议分组）
- `SQL-TENANT-001`：检测 `SET app.tenant_id`（必须是 `SET LOCAL`）
- `SQL-RLS-001`：核心表必须 `ENABLE ROW LEVEL SECURITY`

### B.4 人工复核闸门（最小策略）
- 若 diff 命中：`RLS policy` / `Gateway whitelist` / `AuthZ policy` / `dependency major bump`
  - CI 输出警告并要求人工审批（可用 CODEOWNERS / required reviewers 落地）

---

## 附录 C：Proto 契约建议清单（先做 3 个就能驱动落地）

> v0 建议优先固化 3 类契约：任务、审计计量、WS 事件。

1) `task_payload.proto`
- 用于：Worker 队列、Workflow/Activity 参数
- 必含：tenant_id、idempotency_key、trace_id/correlation_id、requested_by

2) `audit_event.proto` / `metering_event.proto`
- 用于：审计与计量 append-only 事件
- 必含：actor、object_ref、action、capability 摘要、result、latency、trace/correlation

3) `ws_event.proto`（或 JSON schema）
- 用于：WebSocket 推送/补拉
- 必含：sequence_id/offset、event_type、payload、schema_version

---

## 附录 D：Reference Spike 验收用例模板（每个 Spike 都照这个写）

1) **幂等用例**：相同 idempotency_key 重放 3 次 → 副作用最多 1 次
2) **崩溃恢复**：处理到一半 crash → 重启后继续且不重复副作用
3) **串租负例**：切换 tenant_id → 读不到他租；忘记 SET LOCAL → 必须失败或空
4) **回执追溯**：任何副作用都有 receipt，能关联 trace_id/correlation_id
5) **审计计量**：动作/副作用必写 audit + metering（append-only）
