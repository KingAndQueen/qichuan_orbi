# Platform Core Implementation（platform-core-impl）

文档版本：v0.1（Draft）\
最后修改日期：2026-01-30\
作者：\
适用范围：`docs/technical/` 下 Platform Core 的 **实现级（L4）** 设计与代码生成依据\
相关文档：

- `docs/docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`
- `docs/technical/fullstack-architecture.md`
- `docs/technical/database-design.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/contracts/agent-interface-spec.md`
- `docs/technical/oss-reference-playbook.md`
- `docs/features/prd-identity-access.md`
- `docs/features/prd-workspace.md`
- `docs/features/prd-marketplace.md`
- `docs/features/prd-insights.md`

文档目的：将 Platform Core 的 **关键实现骨架** 固化为可生成代码的“单一参考”，明确：模块边界、关键抽象、接口/事件落点、数据访问模式、治理与 guardrails，以及 **可追溯的 OSS 参考点**（含 GitHub + 关键实现点），用于后续 AI 生成代码与评审校验。

---

## 0. 引用与标注规范（实现级最小约束）

1. 术语引用：首次出现写全：`[TERM-XXX] 中文术语`（TERM 来自 `docs/standards/ssot-glossary.md`）。
2. PRD 需求引用：当实现直接对应某条 PRD 需求时在句末标注 `（需求：MOD-xxx）`。
3. 上游技术口径引用：只引用 SSOT 文件路径 + 章节号；本文不复述上游口径。
4. OSS 引用：每个“借鉴点”必须包含 `项目名 — GitHub URL (+ 关键文件路径/模块名)`。

### 0.1 PRD → L2/L4 Coverage Matrix（Implementation-only）

目的：把 L1(PRD 规则/验收口径) 映射到 L2(契约锚点) 与本文 L4(实现落点)，用于 AI 生成代码时定位“必须遵守的契约”。

| PRD Rule  | Owner（组件/域）   | L2 Anchor（文件名/章节）   | L4 Anchor（本文章节） | Implementation Invariants（≤3条） |
| --------- | ------------- | ------------------- | --------------- | ------------------------------ |
| \<MOD.R#> | Platform Core | \<file.md §section> | §\<x.y>         | 1)  2)  3)                     |

---

## 1. 背景与范围（Context & Scope）

### 1.1 背景

TBD

### 1.2 In Scope

- Platform Core（Control Plane）实现骨架：身份与会话、主账号/子账号上下文、核心对象 CRUD、策略决策（PDP）、审计/计量写入、Outbox、WS Ticket 签发等。
- 对外 API/WS 入口的实现落点（路由、handler、middleware、错误语义）。
- 数据访问层（transaction 模板、RLS/SET LOCAL 注入、Repository/DAO）。
- 可观测与运行手册落点（trace/log/metrics）。
- **最小语义对象模型（MVP）**：在 Platform Core 引入“语义对象注册表（Semantic Object Registry, SOR）”的最小骨架，用于统一对象类型（Object Type）与动作类型（Action Type）的 **标识、版本、字段/属性引用、以及授权治理锚点**；为未来参考 Palantir Foundry Ontology 的完整对象/关系/动作模型演进预留路径。

### 1.3 Out of Scope

TBD（例如：Execution Plane 的 Agent runtime；前端 UI；第三方商业化支付的具体实现等）

### 1.4 依赖（Dependencies）

- 上游依赖：`api-style-guide.md`、`database-design.md`、`interaction-protocol.md`、`ssot-glossary.md`
- 下游影响：`agent-bridge`、`workers`、前端 BFF/Next.js（如适用）

---

## 2. 目标与验收（Goals & Acceptance）

### 2.1 目标

- G1：形成可生成代码的实现骨架（模块边界与关键抽象清晰）。
- G2：所有关键链路具备可审计/可计量/可回执与可追溯能力。
- G3：账号隔离（master\_account/sub\_account）与策略检查在实现层 **fail-closed**。
- G4：在不引入完整 Ontology 的前提下，引入“最小语义对象模型（SOR）”的实现骨架：对象类型/动作类型的注册、版本化、读取缓存与 policy\_check 保护，为后续 Ontology 演进提供稳定锚点。

### 2.2 非功能目标（NFR）

- 性能：TBD（P95、吞吐、连接数等）
- 可靠性：TBD（幂等、重试、补偿、恢复语义）
- 安全与合规：TBD（隔离、审计、最小权限、出站治理）

### 2.3 验收口径（可测试）

- AC1：任一请求若缺失上下文/票据/策略授权则 fail-closed，返回 RFC7807 + `reason_code`。
- AC2：任一副作用写入 receipt + audit + metering，且可关联 `trace_id/correlation_id`。
- AC3：任一 DB 事务均执行 `SET LOCAL` 上下文注入；串租负例可被测试与 CI guardrails 捕获。

---

## 3. 总体实现设计（High-level Implementation Design）

### 3.1 架构位置与边界

- 所属层级：Control Plane（Go）
- 边界：负责鉴权/上下文/对象与治理；不负责执行面 Agent 推理与工具编排。

### 3.2 关键不变量（Invariants）

- 隔离上下文：所有请求必须携带主账号/子账号上下文；缺失必须 fail-closed。
- 策略执行：所有敏感动作必须通过 policy\_check；PEP 落在 middleware/handler。
- 副作用与回执：任何外部出站与副作用必须经 Side-effect Gateway，并产生 receipt/audit/metering。
- （MVP：SOR）对象类型/动作类型元数据必须版本化、可审计；对 SOR 的读写同样受 policy\_check 约束（fail-closed）。

### 3.3 关键拓扑与数据流（实现视角）

TBD（补 Mermaid：HTTP/WS → Middleware → Handler → Tx → Outbox/Audit/Metering）

---

## 4. 代码库布局与模块边界（Repository & Module Map）

### 4.1 目录骨架（建议）

目标：为后续 **AI 代码生成** 提供“写入路径 + 模块归属”的唯一答案。 说明：以下为 **建议骨架**；若仓库真实路径不同，以仓库为准并在此处同步更新。

```text
repo/
  docs/
    standards/                 # SSOT：术语、API 规范、文档规范
    technical/                 # L2/L3：架构、协议、数据设计
    technical/platform-core-impl.md  # 本文：L4 实现级

  proto/                       # 契约单一事实来源（如 gRPC/Protobuf）

  services/
    platform-core-go/          # Control Plane（Go）：鉴权/上下文/对象与治理
      cmd/
      internal/
        auth/                  # AuthN：session/jwt/ticket
        ws_ticket/             # WS Ticket 签发/撤销
        ctx/                   # master_account/sub_account 上下文解析与注入
        tx/                    # Tx wrapper：WithTx + SET LOCAL 注入
        policy/                # PDP client + policy decision audit
        capability/            # capability token（如需）
        audit/                 # audit/metering（append-only）
        outbox/                # transactional outbox
        httpapi/               # handlers/routers（对齐 api-style-guide）
        observability/         # tracing/logging/metrics

    agent-bridge-py/           # Execution Plane Orchestrator（Python）：agent/tool 编排

    side-effect-gateway/       # 出站/副作用统一出口（语言 TBD；建议独立服务）

  workers/
    task-runner-py/            # Python workers：异步任务执行（消费 outbox / 执行作业）

  infra/
    postgres/                  # Postgres + migrations + RLS policies
    redis/                     # Redis（queue/caching/rate-limit 等）
    centrifugo/                # 实时服务（WS/SSE/WebTransport）
    opa/                       # OPA（PDP）部署与 bundle（如采用）
    temporal/                  # 可选：durable workflow（如采用）
    sandbox/                   # 可选：Firecracker/WASM sandbox（如采用）

  tools/
    buf/                       # buf lint/breaking 配置

  ci/
    guardrails/
      semgrep/                 # 禁止直连出站/禁止绕过 tx wrapper 等规则
      sql/                     # SQL 扫描：禁止连接级 SET、要求 SET LOCAL 等
      policy/                  # 策略测试（OPA rego / capability rules 等）
```

**目录边界硬约束（用于 codegen）**

- `platform-core-go/` 不允许直接执行 LLM 推理/工具编排；只负责 **鉴权、上下文、对象与治理**。
- 任一对外副作用（网络出站/写外部系统）必须经 `side-effect-gateway/`（deny-by-default）。
- 所有 DB 访问必须通过 `internal/tx/` 模板；不得在业务代码中绕开 Tx wrapper。

### 4.2 模块职责清单

| 模块                           | 责任边界                                     | 主要入口                 | 依赖        | 关键不变量               |
| ---------------------------- | ---------------------------------------- | -------------------- | --------- | ------------------- |
| `internal/auth`              | 会话/JWT/票据校验                              | middleware           | db, redis | fail-closed         |
| `internal/ctx`               | 上下文注入（tx-scoped settings / SET LOCAL 语义） | tx wrapper           | db        | 严禁连接级 SET           |
| `internal/policy`            | PDP/Policy eval                          | service              | db/cache  | 决策可审计               |
| `internal/audit`             | audit/metering 写入                        | hooks                | db        | append-only         |
| `internal/outbox`            | outbox 记录与投递                             | hooks/worker         | db/redis  | 事务一致性               |
| `internal/ws_ticket`         | WS Ticket 签发/撤销                          | http handler         | db/redis  | TTL/撤销              |
| `internal/ontology`（MVP：SOR） | 语义对象注册表：对象类型/动作类型元数据（最小集合）与授权治理          | http handler/service | db/cache  | 版本化 + policy\_check |

---

## 5. 核心抽象与代码生成锚点（Core Abstractions & Codegen Anchors）

本章用于 AI 生成代码时的“必须遵循的接口形态”。每个抽象给出：接口、责任、错误语义、可测试断言、OSS 借鉴点。

### 5.1 HTTP Handler 规范

本节锁定：路由组织、统一错误映射、幂等与并发控制的实现落点，作为后续 codegen 的强约束。

#### 5.1.1 路由组织（Router → RouteSpec）

- 建议在 `internal/httpapi/router.go` 维护一份“路由单一真相表”（RouteSpec），用于：
  - 生成/校验 `action`（Policy 输入）
  - 绑定请求级约束（是否需要 sub\_account 上下文、是否强制 If-Match、是否允许匿名等）
  - 统一挂载 middleware 链

推荐结构：

- `internal/httpapi/router.go`：声明 `[]RouteSpec`，初始化 router
- `internal/httpapi/handlers/<resource>.go`：每个资源一个 handler struct + 方法
- `internal/httpapi/middleware/`：中间件实现（见 §5.2）

`RouteSpec`（最小字段）：

- `method`, `path`
- `handler`（函数指针）
- `policy_action`（稳定字符串）
- `object_ref_builder`（从请求构造 object\_ref）
- `requires_sub_account`（bool）
- `requires_if_match`（bool；用于 PATCH/DELETE 的“强制条件更新”）
- `idempotency`（none | create | outbox\_submit）

#### 5.1.2 错误返回（RFC7807 + reason\_code）

- 所有 handler 返回统一的 domain error（或 `Problem`），由 `ErrorMappingMiddleware` 负责映射到 RFC7807 响应。
- RFC7807 body 最小字段：`type`, `title`, `status`, `detail`, `instance`。
- 扩展字段（必须）：
  - `reason_code`
  - `trace_id`
  - `correlation_id`

错误映射策略（最小集合）：

- 参数错误：400 `invalid_argument`
- 认证失败：401 `authn_failed`
- 授权失败：403 `policy_denied`
- PDP 不可用：403 `policy_unavailable`（fail-closed）
- 资源不可见/不存在：404 `not_found`
- 幂等冲突：409 `idempotency_key_conflict`
- 并发前置条件失败：412 `precondition_failed`
- 强制条件缺失：428 `precondition_required`（仅当路由要求必须带 If-Match 时）

#### 5.1.3 幂等（Idempotency-Key）——仅用于“可能产生重复副作用”的入口

适用范围（MVP 推荐）：

- `POST /v1/<resource>`（create）
- `POST /v1/actions:submit`（未来 action submit；占位）

实现约束：

1. 仅当请求携带 `Idempotency-Key` 时启用幂等逻辑；未携带则走非幂等路径（但依赖 outbox/receipt 保证副作用幂等）。
2. 幂等键作用域必须包含：`master_account_id + sub_account_id(可空)`，避免跨账号重放。
3. 服务端必须记录“首次请求的 request\_hash + 响应（status\_code + response\_body 摘要/引用）”。
4. 重放规则：
   - 若 key 已存在且 `request_hash` 相同：直接返回缓存响应（不再次执行业务逻辑）。
   - 若 key 已存在但 `request_hash` 不同：返回 409 `idempotency_key_conflict`。

存储建议：

- 优先 DB 表（强一致）：`idempotency_keys(master_account_id, sub_account_id, key, request_hash, status_code, response_body, created_at, expires_at)`。
- 可选 Redis（弱一致/短窗）：仅用于“可容忍少量重复”的低风险 create。

幂等保留窗口：

- 建议至少 24h（与常见支付/资源创建重试窗口一致）。

#### 5.1.4 Handler 模板（用于 codegen）

每个 handler 生成的最小结构：

1. 解析与校验输入（DTO → domain input）
2. 构造 `object_ref` 与 `policy_action`
3. 执行 `policy_check`（PEP；fail-closed）
4. 若写请求：进入 `WithTx` → 注入 `SET LOCAL` → repo 操作 → 写 audit/outbox/metering → commit
5. 构造响应（含 ETag/Cache-Control 等头）

建议代码形态：

- handler 返回 `(*Response, error)`，由 middleware 统一写出。
- ETag：
  - GET：返回当前版本 ETag，支持 `If-None-Match`（304）
  - PATCH/DELETE：支持 `If-Match`（412）；若路由要求必须带 If-Match，则缺失返回 428

### 5.2 Middleware 链（AuthN/AuthZ/Account Context/Tracing）

- `TraceContextMiddleware`
- `AuthnMiddleware`
- `AccountContextMiddleware`
- `PolicyEnforcementMiddleware`
- `ErrorMappingMiddleware`

### 5.3 Transaction Template（RLS/SET LOCAL）

- `WithTx(ctx, func(tx Tx) error) error`
- `SetAccountContext(tx, master_account_id, sub_account_id)`（事务内 `SET LOCAL`）
- 失败策略：缺失上下文则拒绝执行任何 SQL

### 5.4 Policy Engine（PDP）接口

#### 5.4.1 设计目标

- 将策略决策外置为 PDP（推荐 OPA），Platform Core 作为 PEP（middleware/handler）统一执行。
- 任一策略请求必须可审计、可关联（`decision_id` ↔ `trace_id` ↔ `outbox_event_id/receipt_id`）。
- PDP 不可用时 **fail-closed**。

#### 5.4.2 Action 命名与对象引用（L4 约束）

- `action`：稳定字符串，采用命名空间：
  - 示例：`ontology.object_type.read`、`ontology.action_type.read`、`side_effect.http.request`、`job.enqueue`。
- `object_ref`（MVP）：
  - `type_key`（必填；如 `sor_object_type` / `sor_action_type`）
  - `object_id`（可空；列表/集合动作可省略）
  - `master_account_id` / `sub_account_id`（来自上下文；用于审计与策略输入）

#### 5.4.3 PDP 请求/响应（推荐 OPA REST 形态）

```go
// internal/policy

type Principal struct {
  MasterAccountID string
  SubAccountID    *string
  ActorID         string
  Roles           []string
}

type ObjectRef struct {
  TypeKey  string
  ObjectID *string
}

type PolicyInput struct {
  Principal Principal
  Action    string
  ObjectRef ObjectRef
  Context   map[string]any // request metadata, ip, ua, trace_id, etc.
}

type Obligation struct {
  Type string            // e.g. requires_human_review, redact_fields, rate_limit
  Data map[string]any
}

type Decision struct {
  Allow        bool
  ReasonCode   string
  DecisionID   string            // PDP correlation id (OPA decision_id)
  PolicyRef    map[string]string // bundle revision / policy hash
  Obligations  []Obligation
  EvalLatencyMs int64
}

type Client interface {
  Evaluate(ctx context.Context, input PolicyInput) (Decision, error)
}
```

实现建议：

- 使用 OPA `/v1/data/<package>/<rule>` 查询策略，若启用 decision logging，OPA 会在响应中返回 `decision_id`，用于审计关联。
- 将 `decision_id` 写入我们的 `audit_events`（或专用 `policy_decisions` append-only 表）。

#### 5.4.4 Fail-closed 规则（必须）

- PDP 请求超时/网络错误/解析错误：一律 deny，`reason_code=policy_unavailable`。
- PDP 响应缺失关键字段：一律 deny，`reason_code=policy_malformed`。

#### 5.4.5 可观测性要求

- `traceparent` 必须从入口透传到 PDP 调用，并写入 audit（用于离线追踪与对账）。
- 每次策略评估必须记录：`decision_id`、`reason_code`、`policy_ref`、`eval_latency_ms`。

### 5.5 Audit/Metering/Receipt Hooks

#### 5.5.1 三类 Append-only 事件

- `audit_events`：安全与治理事件（允许/拒绝、对象变更、出站调用、人工审核等）。
- `metering_events`：计量事件（token/时长/调用次数/外部 API 计费提示）。
- `receipts`：副作用回执（外部请求/写回/被策略拦截/失败重试等）。

#### 5.5.2 写入时机（Hook 点）

- 请求级（HTTP/WS）：
  - `authn.failed` / `policy.denied` / `request.accepted`
- 事务级（DB commit 前后）：
  - `object.mutated`（包含对象 ref 与版本）
  - `outbox.enqueued`（绑定 `outbox_event_id`）
- 副作用级（Side-effect Gateway）：
  - `side_effect.started` / `side_effect.succeeded` / `side_effect.failed` / `side_effect.denied`
  - 每次必须产出 `receipt` 并回写 `audit/metering`

#### 5.5.3 字段最小集合（L4 必填，便于 trace/对账）

- 通用关联字段：
  - `trace_id`（优先从 OTel/W3C traceparent 提取）
  - `correlation_id`（跨系统业务关联；可与 session/workflow/job 绑定）
  - `master_account_id`、`sub_account_id`、`actor_id`
- 策略字段：
  - `action`、`object_ref.type_key`、`object_ref.object_id`
  - `policy_decision_id`（对齐 PDP 的 `decision_id`）
  - `reason_code`
- Outbox/Receipt 关联：
  - `outbox_event_id`、`receipt_id`
- 计量字段（metering\_events）：
  - `metering_scope`（如 llm\_tokens / tool\_calls / egress\_bytes）
  - `quantity`、`unit`、`cost_hint`（可选 JSON）

### 5.6 最小语义对象模型（MVP：SOR）接口

说明：SOR 是对“Ontology”的 **最小可用骨架**。MVP 仅提供：对象类型（Object Type）与动作类型（Action Type）的注册与查询；不引入复杂关系推理/图查询。

- SOR 资源类型：
  - `object_types`：对象类型定义（`type_key`、`display_name`、`version`、`properties` 引用、`status`、`owner`、`created_at`/`updated_at`）
  - `action_types`：动作类型定义（`action_key`、`target_object_type`、`parameters`、`side_effect_profile`、`version`、`status`）
- 最小 API（由 `platform-core-go` 提供）：
  - `GET /v1/ontology/object-types`（列表/过滤/分页）
  - `GET /v1/ontology/object-types/{type_key}`（按 key 获取）
  - `GET /v1/ontology/action-types`（列表/过滤/分页）
  - `GET /v1/ontology/action-types/{action_key}`（按 key 获取）
  - （写接口：MVP 可先由管理员后台/迁移脚本写入；若开放写入，必须启用强 policy + 审计）
- 授权与审计：
  - 所有读取也必须经过 `policy_check`（至少区分：viewer/editor/admin）。
  - 任何变更必须写入 `audit`，并产生版本记录（append-only）。

### 5.7 Ontology 演进预留：Link Types（关系类型）

目标：为后续从 SOR 演进到完整 Ontology（对象/关系/动作）预留稳定接口与数据模型。

- MVP 不提供 link types 的实例级读写；但需要预留：
  - `link_types` 元数据（`link_key`、`from_object_type`、`to_object_type`、`cardinality`、`version`、`status`）
  - `link_instances` 的承载策略（后续决定：即时查询 vs 物化/索引）
- 预留 API（仅占位）：
  - `GET /v1/ontology/link-types`
  - `GET /v1/ontology/link-types/{link_key}`

### 5.8 Kinetic Layer 演进预留：Action 提交与 Side Effects

目标：建立 Action 的确定性执行边界，使“读 → 决策 → 行动”闭环可治理、可回执。

- Action 的 2 阶段抽象（后续可落地）：
  - `plan`：生成可执行变更集（对象属性/关系的 edits）+ obligations
  - `submit`：提交变更集并触发 side effects（出站/回写）
- Side-effect profile（行动侧写）：
  - outbound targets allowlist / requires\_human\_review / idempotency\_required / retry\_policy
- Action 与 Outbox/Receipt 的绑定：
  - 任一 `submit` 必须写入 outbox + receipt；失败必须可重试/可补偿。

### 5.9 Functions / Logic（可选）

目标：把“确定性函数/校验/计算”作为 Action 的可组合组件（先骨架，后实现）。

- `function_registry`（占位）：函数签名、输入/输出类型、版本、运行时（go/python）、权限与计量
- 与 Action 的绑定：Action 执行前的 validation / enrichment / scoring

### 5.10 Ontology SDK（OSDK 风格）代码生成（演进）

目标：当 Ontology 元数据稳定后，自动生成强类型 SDK（TS/Python/Go）以降低应用/Agent 集成成本。

- 代码生成输入：`object_types` / `action_types` /（未来 `link_types`）+ OpenAPI/Proto
- 输出形态：
  - `sdk/typescript/`、`sdk/python/`（Go 可先用 OpenAPI client）
- 版本策略：SDK 版本随 Ontology 元数据版本变更（breaking change 需强制检测）。

---

## 6. 关键端到端链路（End-to-End Flows）

每条链路必须写：前置条件、步骤、数据写入点、错误/降级、可观测字段、验收用例。

### 6.1 Session/JWT 与上下文建立

目标：在浏览器/SDK/服务间调用三类入口上，形成一致的 AuthN 与上下文建立口径；并保证 token 可控生命周期、可撤销（至少最终一致）、可审计。

#### 6.1.1 AuthN 模式（MVP）

- **Browser（推荐）**：Cookie-based Session（opaque session id）
  - 优点：服务端可撤销/可强制失效；适配“主账号/子账号上下文”与权限变更的即时生效。
- **API/SDK（可选）**：Bearer Access Token（JWT, short-lived）
  - 适用：CLI/服务间/移动端；access token 过期后通过 refresh 续期。
- **Realtime（WS）**：connection JWT / subscription JWT（见 §6.6）

设计理由：JWT 一旦签发很难撤销，因此应短 TTL，并以 refresh + server-side session/策略检查实现“最终一致撤销”。（参照 JWT 生命周期最佳实践与 OWASP 的 token/session 管理建议）

#### 6.1.2 Session 生命周期（Browser）

- **创建**：登录成功后签发 `session_id`（opaque），写入 Redis（或 DB）`session:{session_id}`：
  - `master_account_id`、`actor_id`、`created_at`、`last_seen_at`、`expires_at`
  - 可选：`current_sub_account_id`（默认上下文；见 §6.2）
- **传输**：`Set-Cookie` 必须使用 `HttpOnly; Secure; SameSite=<Lax|Strict>`（由上游安全规范决定）。
- **续期**：滑动窗口（idle timeout）+ 绝对过期（absolute timeout）。
- **失效**：
  - 用户登出：删除 session 记录并清理 cookie。
  - 风险事件（密码重置/角色变更/封禁）：强制删除 session 或写入 `revoked_at`。

参照：OWASP Session Management Cheat Sheet 对 session 过期与失效的强制要求。

#### 6.1.3 JWT（Access Token）约束（API/SDK，可选）

- 标准：RFC 7519（JWT）。
- 关键约束：
  - `exp` 必填且短 TTL（分钟到小时级）；禁止长寿命 access token。
  - `iss`/`aud`/`kid`（如采用 JWKS）按需启用；签名算法白名单。
  - `jti`（可选）用于审计与可疑重放检测。
- 存储建议：浏览器不建议存 localStorage；优先 HttpOnly Cookie 或更安全的持久化策略（由客户端形态决定）。

参照：RFC 7519 与 OWASP/JWT 安全实践（短过期、正确校验、谨慎存储）。

#### 6.1.4 Refresh（续期）策略（若启用 JWT）

- **刷新接口**：`POST /v1/auth/tokens/refresh`
  - 输入：refresh token（cookie 或安全存储）
  - 输出：新的 access token（JWT）
- **撤销**：refresh token 必须可撤销（黑名单/状态表）；发现异常可强制失效。

参照：OWASP OAuth2 Cheat Sheet 对 refresh token 用途与生命周期的说明。

#### 6.1.5 Middleware 链路（实现落点）

1. `TraceContextMiddleware`：提取/创建 trace（见 §9.1）。
2. `AuthnMiddleware`：
   - 优先：校验 Cookie Session → 载入 principal（master\_account\_id/actor\_id/roles）。
   - 可选：校验 Bearer JWT（exp/签名/iss/aud）→ 载入 principal。
   - 失败：401 + RFC7807（`reason_code=authn_failed`），写 `audit_events(authn.failed)`。
3. `ContextResolveMiddleware`：解析默认 `sub_account_id`（见 §6.2）。
4. `AccountContextMiddleware`：将（master/sub）写入 request ctx（仅内存），供 tx wrapper `SET LOCAL`。
5. `PolicyEnforcementMiddleware`：按 route/action 执行 policy\_check（见 §5.4）。

#### 6.1.6 验收用例

- AC-AUTH-1：session 过期/被撤销后，任何 API 调用 fail-closed（401），并写 audit。
- AC-AUTH-2：若启用 JWT，access token 过期后必须通过 refresh 获取新 token；过期 token 不得被接受。
- AC-AUTH-3：Authn 成功后，request context 中必须存在 `master_account_id` 与 `actor_id`，否则所有 handler 拒绝执行。

---

### 6.2 主账号/子账号切换（Context Switch）

目标：把“子账号上下文（sub\_account\_id）”从业务逻辑中抽离为统一机制，确保：

1. 每次切换都可审计；2) 每个请求都能在 tx 内正确 `SET LOCAL`；3) 权限变更可尽快生效；4) 缺失/越权时 fail-closed。

#### 6.2.1 上下文来源优先级（MVP 固定）

1. **显式请求级**：Header `X-Sub-Account-Id`（或 query 参数，若必须）
2. **会话默认**：session 中保存的 `current_sub_account_id`
3. **空（允许）**：当用户仅在主账号域内操作且 PRD 允许时，可为空（表示“未进入子账号上下文”）

规则：

- 若请求包含 `X-Sub-Account-Id`，必须执行 `policy_check(action=context.switch, object_ref=sub_account:{id})`。
- 若缺失且 session 也无默认：由路由定义是否允许为空；不允许则 400/403 fail-closed。

#### 6.2.2 切换接口（推荐显式化，便于审计）

- `POST /v1/context/switch`
  - 入参：`sub_account_id`（nullable；置空表示退出子账号上下文）
  - AuthN：必须
  - AuthZ：
    - set：`policy_check(action=context.switch, object_ref=sub_account:{id})`
    - clear：`policy_check(action=context.clear, object_ref=master_account:{master})`
  - 行为：写 session 的 `current_sub_account_id` 并更新 `last_seen_at`。
  - 返回：当前有效上下文 `{master_account_id, sub_account_id}`。

#### 6.2.3 请求执行期解析（无切换接口时的兜底）

- 若前端未调用 `/v1/context/switch`，仍允许使用 `X-Sub-Account-Id` 覆盖 session 默认。
- 覆盖时必须写 `audit_events(context.switch.request_scoped)`（可采样）。

#### 6.2.4 Tx 注入（SET LOCAL）

- 所有 DB 事务必须按以下顺序执行（在 `WithTx` 内完成）：
  1. 校验 ctx 中存在 `master_account_id`（必填）
  2. 计算得到 `sub_account_id`（可空）
  3. 执行：
     - `SELECT set_config('app.master_account_id', $1, true);`
     - `SELECT set_config('app.sub_account_id', $2, true);`（\$2 可为 NULL 或空字符串，视 RLS 口径）
  4. 执行任何 SQL 之前必须完成上述注入

说明：必须使用“事务作用域”的设置（等价于 `SET LOCAL` 语义），避免连接池复用导致跨请求泄漏。PostgreSQL 文档明确 `SET LOCAL` 仅在当前事务内生效。 工程参照：PostgREST 的 transaction-scoped settings 实践（hoisted settings）。

#### 6.2.5 错误与降级

- `sub_account_id` 非法格式：400 `invalid_sub_account_id`
- 越权切换：403 `policy_denied`
- PDP 不可用：403 `policy_unavailable`（fail-closed）
- 上下文缺失且路由要求必须有 sub：400 `missing_sub_account_context`

#### 6.2.6 审计事件（必须）

- `context.switch`：用户切换子账号（包含 from/to、reason\_code、policy\_decision\_id）
- `context.clear`：退出子账号上下文
- `context.switch.denied`：越权或 PDP 不可用导致的拒绝

#### 6.2.7 验收用例（必须可自动化）

- AC-CTX-1：切换 sub\_account 后，下一次请求在 DB 内可观测到正确的 `current_setting('app.sub_account_id', true)`。
- AC-CTX-2：使用连接池并发请求时，不同 sub\_account 的 SQL 结果互不串租（负例测试必须失败）。
- AC-CTX-3：越权切换被拒绝（403），并写 audit\_events(context.switch.denied)。
- AC-CTX-4：缺失 sub\_account 且路由要求必须存在时 fail-closed（400/403），不执行任何 SQL。

---

### 6.3 对象 CRUD（带策略与 RLS）

目标：把“所有核心对象”的 CRUD 统一到一条可生成代码的实现轨道： AuthN → Context（master/sub）→ Policy（PEP）→ Tx（SET LOCAL + RLS）→ Repo → Audit/Metering/Outbox（如需要）→ RFC7807。

#### 6.3.1 适用对象范围（MVP 必须）

- 平台核心对象（最少覆盖）：
  - `sessions`（只读/注销/撤销）
  - `sub_accounts`（成员/子账号上下文相关资源）
  - `audit_events` / `metering_events`（只写/只读按策略）
  - `outbox_events`（只写为主；读仅运维/审计）
  - `receipts`（只写由执行链路产生；读用于追踪）
  - `sor_object_types` / `sor_action_types`（见 §6.7）

说明：业务域对象（Workspace/Marketplace/Insights）也应复用同一轨道，但在本文仅定义平台侧的“实现模板”。

#### 6.3.2 REST 资源与动作命名（实现约束）

- 资源 URL：`/v1/<resource>`（复数名词），子资源采用层级：`/v1/<resource>/{id}/<sub_resource>`。
- 动作（policy action）命名：
  - `resource.create` / `resource.read` / `resource.update` / `resource.delete` / `resource.list`
  - 示例：`sub_account.read`、`receipt.list`、`outbox_event.read`、`ontology.object_type.read`

#### 6.3.3 列表（List）标准模板

- `GET /v1/<resource>?q=&status=&cursor=&limit=`
- AuthZ：`policy_check(action=<resource>.list, object_ref={type_key:<resource>})`
- Tx：只读事务也必须 `SET LOCAL`（保证 RLS 与审计字段一致）
- 分页：cursor-based（opaque），默认 `limit=50`，上限 `200`
- 返回：`items[]` + `next_cursor`（无更多则为空）

#### 6.3.4 单体读取（Get）标准模板

- `GET /v1/<resource>/{id}`
- AuthZ：
  - `policy_check(action=<resource>.read, object_ref={type_key:<resource>, object_id:id})`
- RLS：由 DB 保证（Repo 不写额外 tenant filter）
- 返回：
  - 200 + body
  - 404：`reason_code=not_found`（但注意：若 RLS 拦截导致“不可见”，对外同样 404，避免侧信道）

#### 6.3.5 创建（Create）标准模板（含幂等）

- `POST /v1/<resource>`
- AuthZ：`policy_check(action=<resource>.create, object_ref={type_key:<resource>})`
- 幂等：
  - 客户端可选传 `Idempotency-Key`（UUID/ULID）。
  - 服务端必须把幂等键与“创建结果”绑定：
    - 推荐：DB 表 `idempotency_keys(master_account_id, sub_account_id, key, request_hash, response_body, status_code, created_at)` + 唯一约束（master, sub, key）
    - 或：Redis SETNX + TTL（仅适用于可容忍短窗重复的场景）
  - 行为：
    - 首次：执行业务创建 → 201
    - 重复：若 `request_hash` 相同 → 返回缓存的 201/200 与同一 resource；若不同 → 409 `reason_code=idempotency_key_conflict`
- 审计：
  - 成功：`audit_events(<resource>.created)`（含 object\_ref、policy\_decision\_id）
  - 失败：`audit_events(<resource>.create_failed)`（可采样）

#### 6.3.6 更新（Update）标准模板（并发控制）

- `PATCH /v1/<resource>/{id}`（优先 PATCH；PUT 仅用于全量替换场景）
- AuthZ：`policy_check(action=<resource>.update, object_ref={type_key:<resource>, object_id:id})`
- 并发控制（MVP 推荐）：
  - 服务器在 Get/List 返回 `ETag`（可用 `version` 或内容 hash）。
  - 客户端更新时带 `If-Match: <etag>`。
  - 校验：若不匹配 → 412 `reason_code=precondition_failed`（RFC7807 body 说明冲突）。
  - 若不提供 `If-Match`：
    - 默认允许（MVP 兼容），但对“高价值对象/高冲突对象”可在路由上强制要求 If-Match（返回 428 Precondition Required）。
- Tx：
  - `WithTx` 内：先 `SELECT ... FOR UPDATE`（仅当必要）或基于 `WHERE id=? AND version=?` 的乐观更新
  - 成功后 `version += 1`（或更新 `updated_at`）
- 审计：`audit_events(<resource>.updated)`（包含 from\_version/to\_version）

#### 6.3.7 删除（Delete）标准模板

- `DELETE /v1/<resource>/{id}`
- AuthZ：`policy_check(action=<resource>.delete, object_ref={type_key:<resource>, object_id:id})`
- 并发控制：支持 `If-Match`（同更新逻辑；不匹配 412）
- 语义：
  - 若需软删除：标记 `deleted_at` 并在 RLS/查询层默认过滤
  - 若硬删除：必须满足外键/约束；冲突返回 409 `reason_code=conflict`
- 审计：`audit_events(<resource>.deleted)`

#### 6.3.8 统一错误语义（RFC7807 + reason\_code）

- 400：`invalid_argument`
- 401：`authn_failed`
- 403：`policy_denied` / `policy_unavailable`
- 404：`not_found`
- 409：`conflict` / `idempotency_key_conflict`
- 412：`precondition_failed`（If-Match 不满足）

#### 6.3.9 与 Outbox/Receipt 的关系（当 CRUD 触发副作用）

- 若创建/更新动作需要触发副作用：
  - 在同一 DB 事务内写业务对象 + `outbox_events`
  - 副作用由 worker/gateway 执行（见 §6.5），最终以 receipt 体现外部结果

#### 6.3.10 验收用例（必须可自动化）

- AC-CRUD-1：任意 CRUD 若缺失上下文或 PDP 不可用 → fail-closed（403）且不执行 SQL。
- AC-CRUD-2：同一连接池并发请求不同 sub\_account，返回数据互不串租（RLS + SET LOCAL）。
- AC-CRUD-3：Create 携带 Idempotency-Key：重复请求（同 payload）返回同一资源；不同 payload 返回 409。
- AC-CRUD-4：Update/Delete 携带 If-Match：版本不匹配返回 412；匹配更新成功并 version+1。

---

### 6.4 异步任务创建与状态查询（Jobs）

本节用于落地 `api-style-guide.md` 中的 Async Jobs 口径；并对齐业界长期任务（Long-running operations, LRO）模式。

#### 6.4.1 何时使用 Jobs（MVP 边界）

- 任务预计超过请求超时上限（例如 > 5\~10s）或需要后台重试/补偿。
- 任务包含副作用或需要 Outbox/Receipt 闭环（见 §6.5）。
- 任务结果需要被前端/SDK 轮询或通过 realtime 事件推送。

#### 6.4.2 Job 资源形态（最小字段）

- `job_id`（ULID/UUID）
- `status`：`queued | running | succeeded | failed | cancelled`
- `reason_code`（失败/取消原因）
- `created_at` / `started_at` / `finished_at`
- `progress`（可选：0\~100 或结构化阶段）
- `result_ref`（可选：结果对象引用，如 artifact\_id / receipt\_id / outbox\_event\_id）
- `trace_id` / `correlation_id`

#### 6.4.3 API 形态（建议）

- `POST /v1/jobs`：创建任务
  - AuthZ：`policy_check(action=job.create, object_ref=job)`
  - 返回：202 + Job（或返回 201 + Job 资源；二选一需与 `api-style-guide.md` 对齐）
  - 推荐响应头：`Location: /v1/jobs/{job_id}`
- `GET /v1/jobs/{job_id}`：查询任务
  - AuthZ：`policy_check(action=job.read, object_ref={type_key:job, object_id:job_id})`
  - 支持 ETag + `If-None-Match`（未变更返回 304，降低轮询开销）
- `POST /v1/jobs/{job_id}:cancel`（可选）
  - AuthZ：`policy_check(action=job.cancel, object_ref={type_key:job, object_id:job_id})`

#### 6.4.4 实现落点（推荐复用 outbox/worker）

- `POST /v1/jobs` 的 handler：

  1. 校验输入 + policy\_check
  2. `WithTx` 内写入 `jobs` 表（或 `async_tasks` 表，命名以 database-design 为准）
  3. 同事务写入 `outbox_events`（event\_type = `job.run` 或具体任务类型）
  4. 写入 `audit_events(job.created)` 并返回 Job

- worker：

  - 消费 `outbox_events`（`job.run`）→ 执行业务 → 写 `audit/metering/receipt`（如有副作用）→ 更新 job 状态

#### 6.4.5 可靠性与幂等

- create job 支持 `Idempotency-Key`（同 §5.1.3），避免“用户重复点击”创建多条相同任务。
- worker 的执行必须幂等：
  - 若任务本质是对外副作用：以 `outbox_event_id` 作为 idempotency\_key（贯穿 Gateway）。
  - 若任务是纯计算：以 `job_id` 作为幂等键（重复执行结果一致或可检测）。

#### 6.4.6 Realtime 通知（可选但推荐）

- 状态变更事件：`job.status.updated`（包含 `job_id/status/progress/reason_code/trace_id`）
- 前端可订阅并结合轮询兜底；断线恢复依赖 history+recovery（见 §6.6）。

### 6.5 Outbox → Side-effect Gateway → Receipt 回写

#### 6.5.1 目标与边界

- 目标：用 **Transactional Outbox** 将“业务变更”和“副作用执行”解耦但强一致地串联，保证：
  - 业务写入与 outbox 入队同一 DB 事务（read-your-own-writes）
  - 副作用执行至少一次（at-least-once）且幂等兜底
  - 任一副作用都有可追溯的 receipt/audit/metering
- 边界：Platform Core 不直接出站；所有出站在 Side-effect Gateway 执行（deny-by-default）。

#### 6.5.2 数据写入点（最小）

- `outbox_events`（append-only 或状态机）：
  - `id`（ULID/UUID）
  - `event_type`（如 `side_effect.http.request`）
  - `payload`（JSON；必须包含 `capability_token` 引用或 scope）
  - `status`（pending/processing/succeeded/failed/dead）
  - `attempt_count`、`next_attempt_at`、`processing_deadline_at`
  - `trace_id`、`correlation_id`、`master_account_id`、`sub_account_id`
- `receipts`（append-only）：
  - `id`
  - `outbox_event_id`
  - `status`（started/succeeded/failed/denied/cancelled）
  - `reason_code`、`result_summary`、`external_ref`（可选）
  - `trace_id`、`correlation_id`、`created_at`

#### 6.5.3 端到端流程（推荐）

1. **HTTP/WS 入口（Platform Core）**

   - AuthN → 解析上下文 → `policy_check(action, object_ref)`。
   - deny：返回 RFC7807（`reason_code`），并写 `audit_events(policy.denied)`。

2. **DB 事务内写业务对象 + outbox（Platform Core）**

   - `WithTx` 内先写业务变更，再 `INSERT outbox_events`。
   - 同一事务内写 `audit_events(outbox.enqueued)`（绑定 `outbox_event_id`）。

3. **Outbox 消费（Worker）**

   - 循环拉取：
     - `SELECT ... FOR UPDATE SKIP LOCKED` 获取 `status=pending` 且 `next_attempt_at<=now()` 的记录（limit N）。
     - 将记录置为 `processing`，写 `processing_deadline_at=now()+lease`，`attempt_count+=1`。
   - worker crash/超时：若超过 `processing_deadline_at`，由下次扫描重新置回 `pending`（可审计）。

4. **调用 Side-effect Gateway（Worker → Gateway）**

   - 请求携带：`outbox_event_id` 作为 **idempotency\_key**、`capability_token`、`traceparent`。
   - Gateway 执行：
     - deny-by-default：若目标不在 allowlist/策略不允许，返回 deny，并产出 `receipt(status=denied)`。
     - 允许则执行外部调用/写回，并返回 `receipt(status=succeeded|failed)`。

5. **回写 Receipt + Audit/Metering（Worker，事务）**

   - `INSERT receipts`（append-only）。
   - `INSERT audit_events(side_effect.*)` + `INSERT metering_events`。
   - 更新 `outbox_events.status`：
     - succeeded：置 `succeeded`。
     - failed：计算 `next_attempt_at`（指数退避 + 抖动），超过阈值置 `dead`。

6. **通知（可选）**

   - 将 `receipt.created`、`action.submit.*` 事件发布到实时通道（如 Centrifugo），开启 history+recovery，客户端可用 offset/epoch 补拉。

#### 6.5.4 幂等与重试（必须）

- 幂等键：`idempotency_key = outbox_event_id`（贯穿 Gateway/外部系统写回）。
- Gateway 必须实现“同键同结果”（至少在 TTL 窗口内缓存/落库）。
- worker 重试：
  - 网络/5xx：可重试
  - 4xx（除 429/408）：默认不可重试，直接 `failed` 或 `dead`（由 reason\_code 判定）

#### 6.5.5 可观测字段（必须）

- 贯通头：W3C `traceparent`（HTTP/WS/worker/outbound）
- 关联键：`decision_id`（policy）↔ `outbox_event_id` ↔ `receipt_id` ↔ `trace_id`

#### 6.5.6 OSS 借鉴点（必须回链到 §11）

- Transactional Outbox：Debezium Outbox Pattern / Outbox Event Router。
- Outbox Forwarder（DB→Broker/执行器）：Watermill Forwarder。
- WS 历史与恢复：Centrifugo history+recovery（offset/epoch）。

---

### 6.6 WS Ticket 签发 → WS 会话建立

目标：将“实时通道”的鉴权、授权、撤销、恢复语义与 Platform Core 的治理不变量（AuthN/AuthZ/RLS/audit）对齐。 推荐实现：基于 Centrifugo（Realtime）+ JWT（连接 token + 订阅 token），Platform Core 负责签发与刷新。

#### 6.6.1 关键设计点（MVP 最优）

- **连接鉴权**：使用 Centrifugo connection JWT（短有效期，带 `exp`）建立 WS 连接，并启用 token refresh 机制。
- **频道授权**：对 private channels 使用 subscription JWT（按需签发，可单独过期），并将“订阅授权”视为一次 policy\_check。
- **撤销与封禁**：通过缩短 token `exp`（连接/订阅）+ refresh 回调时的 policy\_check 实现“最终一致的撤销”。
- **恢复语义**：所有业务事件发布到具备 history+recovery 的频道；客户端保存 `offset/epoch` 并断线恢复。

#### 6.6.2 接口一览（Platform Core）

1. **签发 WS Ticket（一次性）**

- `POST /v1/ws/tickets`
  - AuthN：必须（HTTP 会话/JWT）
  - AuthZ：`policy_check(action=ws.ticket.issue, object_ref=ws_ticket)`
  - 作用：返回连接所需信息：`ws_url`、`ticket_id`（一次性）、`connection_token`（JWT, exp）

2. **刷新连接 Token（SDK getToken）**

- `POST /v1/ws/tokens/refresh`
  - AuthN：必须（HTTP 会话/JWT）
  - AuthZ：`policy_check(action=ws.connection.refresh, object_ref=realtime_connection)`
  - 作用：返回新的 `connection_token`（延长 exp）

3. **签发订阅 Token（私有频道）**

- `POST /v1/ws/subscriptions/token`
  - AuthN：必须（HTTP 会话/JWT）
  - AuthZ：`policy_check(action=ws.channel.subscribe, object_ref=channel:{channel})`
  - 入参：`channel`（string）、可选 `client_id/session_id`（用于额外约束）
  - 出参：`subscription_token`（JWT, exp）

说明：为何保留 ws\_ticket？

- 浏览器 WebSocket 协议升级阶段无法稳定自定义 header；一次性 ticket 可以减少在 URL/query 中暴露长寿命凭证的风险（ticket TTL 极短）。

#### 6.6.3 WS Ticket 数据模型（Redis）

- Key：`ws:ticket:{ticket_id}`
- Value（JSON）：
  - `master_account_id` / `sub_account_id`
  - `actor_id`
  - `issued_at` / `expires_at`
  - `used_at`（空=未使用；非空=已消费）
  - `client_fingerprint`（可选：ua hash/ip prefix，用于弱绑定）
- TTL：30\~120 秒（MVP 建议 60s）
- 规则：
  - ticket 仅用于“辅助建立连接”与“降低 URL/token 暴露窗口”，不替代 connection JWT。
  - ticket 被使用后必须原子标记 `used_at`，重复使用返回 409（`reason_code=ws_ticket_reused`）。

#### 6.6.4 JWT Claim 约束（连接/订阅）

1. Connection JWT（连接 token）

- 必填：
  - `sub`：actor\_id（用户唯一标识）
  - `exp`：过期时间（建议 5\~15 分钟）
- 可选（但推荐）：
  - `iat` / `jti`
  - `info`：presence 可用的附加信息（如 display\_name；避免敏感字段）
  - `meta`：审计/关联字段（如 `master_account_id`、`sub_account_id`、`trace_id`）

2. Subscription JWT（订阅 token）

- 必填：
  - `sub`：actor\_id
  - `exp`
  - `channel`：要订阅的频道
- 可选：
  - `info`：presence/channel context（谨慎使用）

#### 6.6.5 端到端流程（推荐）

1. **前端获取 WS Ticket（HTTP）**

- 调用 `POST /v1/ws/tickets` → 返回 `{ws_url, ticket_id, connection_token, expires_at}`。
- 写入 `audit_events(ws.ticket.issued)`。

2. **前端建立 WS（Centrifugo/centrifuge-js）**

- 使用 `connection_token` 连接 Centrifugo（WebSocket transport）。
- 启用 SDK 的 `getToken` 回调：在 token 过期前调用 Platform Core 的 `/v1/ws/tokens/refresh` 获取新 token，并发送给 Centrifugo 续期。

3. **订阅私有频道（按需）**

- 客户端订阅 private channel 时，调用 `POST /v1/ws/subscriptions/token` 获取 subscription JWT。
- 将 subscription JWT 传给 subscribe 请求；Centrifugo 验证 token 后允许订阅。

4. **发布事件（服务端）**

- Platform Core / workers 将 `receipt.created`、`ontology.sor.updated` 等事件发布到对应频道，并启用 history+recovery。

5. **断线恢复**

- 客户端保存 `offset/epoch`，重连后自动带上恢复参数；若 epoch 变化则触发全量补拉（由业务协议定义）。

#### 6.6.6 错误与降级

- ticket 过期：401（`ws_ticket_expired`），客户端重新申请。
- ticket 重放：409（`ws_ticket_reused`），写 audit（安全事件）。
- 连接 token 续期失败：
  - 若 `/v1/ws/tokens/refresh` 返回 403（policy\_denied）或 401（authn\_failed），客户端必须断开并回到登录态。
- 订阅 token 续期失败：订阅被拒绝/取消，客户端提示“无权限/需要重新授权”。

#### 6.6.7 可观测字段（必须）

- `traceparent`：从 HTTP 签发/刷新贯通到 WS publish。
- 关联键：`ticket_id` ↔ `jti` ↔ `client_id` ↔ `trace_id`。
- audit 事件：`ws.ticket.issued`、`ws.connection.refresh`、`ws.subscribe.token_issued`、`ws.subscribe.denied`。

#### 6.6.8 验收用例（必须可自动化）

- AC-WS-1：ticket 单次可用，重复使用返回 409；audit 写入。
- AC-WS-2：connection token 含 exp 时，SDK 能通过 refresh 接口持续续期；refresh deny 会导致连接最终关闭并要求重新登录。
- AC-WS-3：订阅私有频道必须携带 subscription token；无 token 或 token 过期被拒绝。
- AC-WS-4：断线后在 offset/epoch 不变条件下可恢复补拉；epoch 变化触发全量同步。

---

### 6.7 SOR 查询（对象类型/动作类型）

#### 6.7.1 目标与边界

- 目标：为 UI/Agent/Bridge 提供“稳定、可缓存、可版本化”的语义元数据读取能力，支撑：
  - UI 生成表单/字段提示（object types / action parameters）
  - Agent 生成可控工具调用（action types / side\_effect\_profile）
  - policy\_check 的 object\_ref/action\_ref 对齐
- 边界：MVP 不提供“对象实例级图查询/推理”；仅提供元数据读取与缓存一致性。

#### 6.7.2 API 形态（与 §5.6 对齐）

- 单体读取：
  - `GET /v1/ontology/object-types/{type_key}`
  - `GET /v1/ontology/action-types/{action_key}`
- 列表读取：
  - `GET /v1/ontology/object-types?status=&q=&cursor=&limit=`
  - `GET /v1/ontology/action-types?status=&q=&cursor=&limit=`

#### 6.7.3 鉴权与 fail-closed

- 每个读取请求必须执行：`policy_check(action=ontology.object_type.read|ontology.action_type.read, object_ref)`。
- PDP 不可用 → fail-closed（403 + `reason_code=policy_unavailable`）。

#### 6.7.4 版本化与缓存一致性（推荐：ETag + Conditional GET）

- 响应必须包含：
  - `ETag`：由（`type_key/action_key` + `version` + `updated_at` 或内容 hash）计算。
  - `Cache-Control: private`（禁止共享缓存）；可选 `max-age=<short>` 以降低重复请求。
- 客户端/Agent/Bridge 应使用：
  - `If-None-Match: <etag>` 进行 Conditional GET。
  - 若未变更，返回 `304 Not Modified`，节省带宽与解析。

#### 6.7.5 Server-side Cache（Redis）

- 目的：降低 DB 读放大，保障 P95。
- Key 规范（建议）：
  - 单体：`sor:{master_account_id}:{sub_account_id|_}:object_type:{type_key}:v{version}`
  - 单体：`sor:{master_account_id}:{sub_account_id|_}:action_type:{action_key}:v{version}`
  - 列表游标页：`sor:{master_account_id}:{sub_account_id|_}:object_types:list:{hash(query)}:cursor:{cursor}`
- TTL：
  - 单体元数据：分钟级（如 10\~60min），并配合事件失效（见 6.7.6）。
  - 列表页：短 TTL（如 30\~120s）。
- 缓存穿透保护：
  - 对不存在 key 的查询可写入短 TTL 的 negative cache（避免热 key 反复打 DB）。

#### 6.7.6 事件驱动失效（与 interaction-protocol 对齐）

- 当 SOR 变更（新增/升级/废弃）时，发布：`ontology.sor.updated`（携带 `type_key/action_key` + 新 `version/etag`）。
- 订阅方（前端/Agent Bridge）策略：
  - 若本地缓存命中对应 key，则标记 stale 并触发异步刷新。
  - 断线恢复：依赖实时通道的 history+recovery（offset/epoch）补拉更新事件。

#### 6.7.7 列表分页（推荐 cursor-based）

- 参数：`limit`（默认 50，上限 200）、`cursor`（opaque）、`status`（active/experimental/deprecated）、`q`（可选全文/前缀）。
- 返回：`items[]` + `next_cursor`（无更多则为空）。

#### 6.7.8 错误语义（RFC7807）

- 403：`policy_denied` / `policy_unavailable`
- 404：`sor_not_found`
- 400：`invalid_query`

#### 6.7.9 可观测性

- 每次读取写 `audit_events(ontology.read)`（可采样），并记录：`policy_decision_id`、`etag`、`cache_hit`、`db_latency_ms`。

#### 6.7.10 验收用例（必须可自动化）

- AC-SOR-1：首次 GET 返回 200 + ETag；携带 If-None-Match 再次请求返回 304。
- AC-SOR-2：更新某 object\_type 后发布 `ontology.sor.updated`；客户端在恢复后能补拉并刷新到新版本。
- AC-SOR-3：PDP 不可用时，SOR 查询 fail-closed（403 + reason\_code），且写 audit。
- AC-SOR-4：Redis 命中与 miss 路径均正确；negative cache 生效且 TTL 可控。

### 6.8 Action 提交（演进）：Action → Outbox → Side-effect → Receipt

TBD（说明：未来与 `action_types.side_effect_profile` 对齐：plan/submit；提交后必须产出 receipt，并可回放/补偿）

---

## 7. 数据访问与存储实现（Data Access & Storage）

### 7.1 数据模型落点

- 表/索引：引用 `database-design.md` 对应章节（本文不重复定义 schema）。
- Repository/DAO：本节锁定“可生成代码”的最小接口与硬约束，防止绕开 tx wrapper 与隔离不变量。

#### 7.1.1 Repo 层硬约束（用于 codegen/CI）

1. **所有 DB 访问必须通过 **``：业务代码不得直接使用全局 `db` 执行 SQL。
2. **Repo 方法必须接收 **``**（或 **``**）**：
   - 允许在同一事务中组合多个 repo 调用。
3. **禁止在 Repo 内做租户过滤**：隔离由 RLS + tx-scoped settings 保证；Repo 不写 `WHERE master_account_id=...`（避免双口径）。
4. **Repo 不负责 AuthN/AuthZ**：授权必须在 handler/middleware（PEP），Repo 只负责数据读写。
5. **所有写操作必须可审计**：handler 在 tx 内写 `audit_events`（或通过 domain hook 统一写）。

#### 7.1.2 Tx/Queryer 抽象（Go）

- 统一一个最小接口用于注入：

```go
// internal/tx

type Queryer interface {
  Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
  Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
  QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Tx interface {
  Queryer
  Commit(ctx context.Context) error
  Rollback(ctx context.Context) error
}
```

- 事务模板：
  - `WithTx(ctx, fn)` 内部负责：begin → `set_config(..., true)` → 执行 fn → commit/rollback。

#### 7.1.3 Repository 接口模板（示例）

- 以 `sor_object_types` 为例（其它资源同样生成）：

```go
// internal/ontology/repo

type ObjectType struct {
  TypeKey    string
  Version    int64
  Status     string
  Body       []byte // jsonb raw
  UpdatedAt  time.Time
}

type ObjectTypeRepo interface {
  Get(ctx context.Context, q tx.Queryer, typeKey string) (ObjectType, error)
  List(ctx context.Context, q tx.Queryer, filter ListFilter) ([]ObjectType, string, error)
  Create(ctx context.Context, q tx.Queryer, in ObjectTypeCreate) (ObjectType, error)
  Update(ctx context.Context, q tx.Queryer, typeKey string, ifMatch *string, patch ObjectTypePatch) (ObjectType, error)
  Delete(ctx context.Context, q tx.Queryer, typeKey string, ifMatch *string) error
}
```

说明：`ifMatch` 的校验可在 handler 做（推荐），Repo 仅提供“按 version 条件更新”的 SQL 变体。

#### 7.1.4 SQL 编写规范（最小集合）

- 所有 SQL 必须显式列名（禁止 `SELECT *`）。
- 所有分页必须稳定排序（例如 `ORDER BY created_at, id`），避免 cursor 漂移。
- 所有更新必须返回新值（`RETURNING ...`），用于生成 ETag/version 与审计。
- 对幂等键表：唯一约束必须包含（master, sub, key）。

#### 7.1.5 读写路径的 Hook（审计/计量/outbox）

- 推荐在 handler 的 tx 内集中写入：
  - `audit_events`（object changed, policy decision, error）
  - `outbox_events`（如需要副作用）
  - `metering_events`（如需要计量）

原则：把“副作用与治理写入”放在同一事务里，保证可追溯与对账闭环。

#### 7.1.6 CI Guardrails（Repo 相关）

- 必须具备可自动检查的规则：
  - 禁止 `pgxpool.Pool` 在 handler/业务层直接调用 `Exec/Query`（必须经 `WithTx`）
  - 禁止在 SQL 里出现 `SET app.master_account_id`（连接级设置），必须使用 `set_config(..., true)`

---

### 7.2 Redis Key 规范

#### 7.2.1 总体原则

- Key 必须带上 `master_account_id` 与（可选）`sub_account_id`，避免跨账号污染。
- Key 前缀按子系统分层：`sor:`、`idempotency:`、`ratelimit:`、`ws:`、`session:`。
- TTL 默认必填；仅白名单 key 可永久。

#### 7.2.2 SOR 缓存 Key（见 §6.7）

- 单体（长 TTL + 事件失效）：
  - `sor:{master}:{sub|_}:object_type:{type_key}:v{version}`
  - `sor:{master}:{sub|_}:action_type:{action_key}:v{version}`
- 列表页（短 TTL）：
  - `sor:{master}:{sub|_}:object_types:list:{hash(query)}:cursor:{cursor}`
  - `sor:{master}:{sub|_}:action_types:list:{hash(query)}:cursor:{cursor}`

#### 7.2.3 幂等与去重

- 出站幂等：`idempotency:outbox:{outbox_event_id}`（TTL >= receipt 保留窗口）

#### 7.2.4 限流

- `ratelimit:{master}:{sub|_}:{scope}:{window}`（token-bucket 或 sliding window）

### 7.3 Schema Migration 与 Backfill

TBD

---

## 8. 安全、策略与治理实现（Security / Policy / Governance）

### 8.1 Ticket（Work Ticket / Job Ticket / WS Ticket）实现

Ticket 的定位：把“短时可撤销的会话入口”与“长期身份凭证”解耦。 MVP：至少落地 WS Ticket（见 §6.6），其余 ticket 类型按 PRD/协议逐步补齐。

#### 8.1.1 共通字段

- `ticket_id`（ULID/UUID）
- `master_account_id` / `sub_account_id`
- `actor_id`
- `scope`（ws / work / job）
- `issued_at` / `expires_at` / `revoked_at?`
- `bound_resource?`（如 session\_id / job\_id）

#### 8.1.2 存储与撤销

- 存储：Redis 优先（短 TTL），必要时落 DB（用于审计或跨进程一致性）。
- 撤销：
  - 主动撤销：写 `revoked_at` 并立即失效（Redis delete 或状态标记）。
  - 被动撤销：TTL 到期自然失效。
- 审计：ticket 的签发/撤销/复用检测必须写 `audit_events`。

#### 8.1.3 WS Ticket（MVP 必须）

- 约束：一次性、短 TTL、可选弱绑定（ua/ip prefix）。
- 错误语义：
  - expired → 401 `ws_ticket_expired`
  - reused → 409 `ws_ticket_reused`
  - revoked → 401 `ws_ticket_revoked`

#### 8.1.4 Work/Job Ticket（占位）

- Work Ticket：用于开启/恢复 workspace 会话（对齐 Workspace PRD 与 interaction-protocol）。
- Job Ticket：用于异步任务结果拉取/下载（对齐 Async Jobs 口径）。

---

### 8.2 Policy Enforcement Points（PEP）清单

| PEP 位置              | 覆盖动作域 | 失败行为                | 需要写审计 | 备注 |
| ------------------- | ----- | ------------------- | ----- | -- |
| HTTP middleware     |       | deny + reason\_code | 是     |    |
| Side-effect Gateway |       | deny + receipt      | 是     |    |

### 8.3 外部出站与副作用治理

#### 8.3.1 基本原则（必须）

- deny-by-default：未显式 allow 的出站一律拒绝。
- PEP 在 Gateway：所有出站在 Side-effect Gateway 统一做 AuthZ/限流/幂等/审计/回执。
- 出站等价安全事件：任何 allow/deny 都必须写入 `receipt + audit`。

#### 8.3.2 Allowlist 与策略

- allowlist 维度：
  - `target_service`（枚举/注册表）
  - `host`/`path_prefix`（精确或前缀）
  - `methods`（GET/POST/PUT/DELETE）
- 策略输入：
  - `action=side_effect.http.request`
  - `object_ref`：目标对象（如 `receipt`/`job`/业务对象）
  - `context`：`target_service/host/method` + `idempotency_key` + `capability_scope`
- obligations（可选）：
  - `requires_human_review=true`：Gateway 拒绝执行，生成 `receipt(status=denied, reason_code=requires_human_review)`
  - `rate_limit`：Gateway 以 token-bucket 执行

#### 8.3.3 幂等、重试与补偿

- 幂等：必须支持 `idempotency_key`（默认使用 `outbox_event_id`）。
- 重试：指数退避 + 抖动；对 429/5xx 可重试。
- 补偿：
  - MVP：以“可回放 + 人工补偿”为主（receipt 记录完整请求/响应摘要）。
  - 演进：引入 Saga/Temporal 时，将补偿动作作为 activity。

#### 8.3.4 Capability Token（可选，推荐与 Gateway 绑定）

- 目标：把“可委派/可衰减的权限”带到执行面与 Gateway，减少长链路中隐式信任。
- 推荐参考：Biscuit（attenuation/offline validation）。

---

### 8.4 Guardrails（CI/代码规范）

定位：Guardrails 是 Platform Core 的“自动化硬闸门”，用于把关键不变量（隔离/授权/出站治理/可审计/幂等）从“代码评审习惯”升级为“可机器阻断的合并门槛”。 原则：**默认阻断（block merge）**，允许通过明确的例外流程（见 8.4.6）。

#### 8.4.1 Guardrails 覆盖面（最小集合）

A. **安全与合规**

- Secrets 扫描：禁止提交任何明文 secret（token/key/password/private key）。
- 依赖漏洞扫描：阻断已知高危漏洞（CVSS/Severity 阈值由安全基线决定）。

B. **隔离与数据访问**

- 禁止绕过 `internal/tx/WithTx` 直接访问 DB（`pgxpool.Pool.Exec/Query` 等）。
- 禁止使用“连接级 SET”注入上下文（只允许 `set_config(..., true)` / 等价 `SET LOCAL` 语义）。
- 禁止在 Repo 内实现“账号过滤”（隔离仅由 RLS + tx-scoped settings 承担）。

C. **授权与治理**

- 禁止在 handler 内跳过 `policy_check` 执行敏感动作（RouteSpec 标记的必须 action）。
- 禁止在 Platform Core 直接出站（HTTP/gRPC/SDK 调用外部系统），所有出站必须走 Side-effect Gateway。

D. **可靠性**

- 对标记 `idempotency=create|outbox_submit` 的路由：必须读取并校验 `Idempotency-Key`。
- 对标记 `requires_if_match=true` 的路由：必须校验 `If-Match`，否则返回 428。

#### 8.4.2 CI Pipeline（建议分层）

建议在 `ci/guardrails/` 维护配置，并在 CI 中分 5 个 job（可并行）：

1. `guardrails:lint`

- `golangci-lint`（强制通过）
- `go test ./...`（至少单元测试）

2. `guardrails:semgrep`（强制通过）

- `semgrep`：执行本仓库自定义规则 + 官方 go 规则集（按需）。

3. `guardrails:secrets`（强制通过）

- `gitleaks`：全仓库 secrets 扫描。

4. `guardrails:deps`（强制通过，MVP 可先告警后阻断）

- 依赖漏洞扫描（工具选型见 §11：Trivy/OSV/Dependabot 任选其一，先落地一个）。

5. `guardrails:sql`（强制通过）

- SQL/迁移脚本扫描（禁止连接级 SET、禁止危险语句，见 8.4.4）。

#### 8.4.3 Semgrep 规则组（必须）

目录约定：

- `ci/guardrails/semgrep/rules/`
  - `p0-identity-isolation.yml`
  - `p0-no-direct-egress.yml`
  - `p0-policy-pep.yml`
  - `p1-quality.yml`

**P0 规则（block merge）**

R-GO-001：禁止 Platform Core 直接出站

- 目标：禁止在 `services/platform-core-go/` 中直接调用 `net/http`、常见第三方 HTTP client、以及直接创建 gRPC 外连（除 PDP client 与 Centrifugo publish 等“白名单内部依赖”）。
- 例外：
  - `internal/policy/`（PDP client）
  - `internal/ws_ticket/`（若需要调用 realtime 服务的 internal client）
  - 其它白名单必须走 8.4.6 例外流程。

R-GO-002：禁止绕过 `WithTx` 直接访问 DB

- 目标：在 handler/service 层禁止出现 `pgxpool.Pool.Query/Exec/QueryRow` 直接调用；必须通过 `internal/tx` 的 wrapper。
- 允许：仅 `internal/tx/` 自己可持有 pool。

R-GO-003：禁止连接级上下文注入

- 目标：禁止出现：
  - SQL 字符串中 `SET app.master_account_id` / `SET app.sub_account_id`
  - `set_config(..., false)`（session-scoped）
- 允许：`set_config('app.master_account_id', ..., true)`（transaction-scoped）。

R-GO-004：RouteSpec 强制策略检查

- 目标：对标记 `policy_action != ""` 的 route：handler 路径必须调用统一的 `policy.Evaluate(...)` 或 `pep.RequireAllowed(...)`。
- 实现建议：为 handler 模板提供 `requireAllowed(ctx, action, objectRef)`，让 Semgrep 只需要检测是否调用该函数。

R-GO-005：RouteSpec 强制 If-Match

- 目标：对标记 `requires_if_match=true` 的 route：必须在 handler 中调用 `requireIfMatch(...)`，否则阻断。

R-GO-006：Idempotency-Key 必须落库/校验

- 目标：对标记 `idempotency=create|outbox_submit` 的 route：必须调用 `idempotency.VerifyOrLoad(...)`。

**P1 规则（先告警，后逐步升级为阻断）**

- 禁止 `context.Background()` 出现在请求链路（应使用 request ctx）。
- 禁止 `log.Printf`（必须用结构化日志）。
- 禁止 `time.Sleep`（除测试）。

#### 8.4.4 SQL / Migration 扫描规则（必须）

扫描范围：

- `infra/postgres/migrations/**/*.sql`
- `services/**/sql/**/*.sql`（若存在内嵌 SQL 文件）

P0（block merge）：

- 禁止：`SET app.master_account_id` / `SET app.sub_account_id`（连接级设置风险）
- 禁止：`set_config('app.master_account_id', ..., false)` / `set_config('app.sub_account_id', ..., false)`（session-scoped 风险）
- 禁止：`ALTER ROLE ... SET`、`ALTER DATABASE ... SET` 写入 app.\* 上下文（会污染环境）
- 禁止：RLS 表在 migration 中被降级（`DISABLE ROW LEVEL SECURITY`）除非标记为受控运维脚本并走例外流程。

P1（告警）：

- 检测 `SELECT *`（建议显式列名）
- 检测无稳定排序的分页查询（缺少 `ORDER BY`）

实现方式（MVP 任选其一，先落地即可）：

- 简单 grep + allowlist（最快）；
- Semgrep 对 SQL 文件扫描（统一体系）；
- 引入 SQL linter（后续再演进）。

#### 8.4.5 requires-human-review 门槛（治理闸门）

以下变更必须进入“人工审核队列”，并在 PR 模板中勾选（否则 CI 阻断）：

1. 新增/修改出站 allowlist（`infra/side-effect-gateway/allowlist.*` 或同类文件）
2. 新增 capability scope / 变更 capability 语义
3. 新增高权限 policy action（例如 `*.delete`、`side_effect.*`、`ontology.*.write`）
4. 放开 SOR 写接口（从脚本写入变为 API 写入）
5. 变更 RLS 策略或 tx-scoped settings 逻辑

CI 实现建议：

- 维护 `ci/guardrails/requires_human_review_paths.yml`（路径规则）
- 对 PR diff 做路径匹配：命中则要求：
  - PR label：`requires-human-review`
  - 或必须有 CODEOWNERS 审核通过（例如 security/infra owner）

#### 8.4.6 例外与豁免流程（必须）

允许例外，但必须可审计、可追溯：

- 任何 P0 规则的豁免必须：
  1. 在代码旁写 `// guardrails:ignore <RULE_ID> <reason>`（reason 必填，且引用对应 issue/ADR）
  2. 在 PR 描述中填写：风险评估 + 回滚策略 + 计划移除日期
  3. 必须由 CODEOWNERS 中的安全/平台 owner 批准

#### 8.4.7 验收用例（Guardrails 自测）

- AC-GR-1：在 platform-core-go 任意新增 `http.NewRequest` 调用会被 Semgrep 阻断（除白名单目录）。
- AC-GR-2：在 handler 中直接 `pgxpool.Exec` 会被阻断。
- AC-GR-3：在 SQL migration 中写 `set_config(..., false)` 会被阻断。
- AC-GR-4：修改出站 allowlist 未加 `requires-human-review` label 会被阻断。
- AC-GR-5：对 `requires_if_match=true` 的 route 删除 `requireIfMatch` 调用会被阻断。

### 8.5 Ontology/SOR 治理（演进）

目标：在 **MVP 仅有“最小语义对象模型（SOR）”** 的前提下，把「语义元数据」当成一份需要治理的“公共契约”，建立：

1. 稳定读路径（可缓存/可回放）；2) 受控写路径（可审计/可回滚）；3) 清晰的兼容性/弃用策略（避免 codegen/SDK 漂移）； 并为未来演进到类 Palantir Ontology（对象/关系/动作 + 执行闭环）预留稳定锚点。

#### 8.5.1 治理对象与边界（MVP 固定）

MVP 仅治理 **“元数据”**，不治理“实例图”。

- 受治理资源（MVP 必须）：
  - `sor_object_types`（Object Type 元数据）
  - `sor_action_types`（Action Type 元数据）
- 预留但不开放（占位）：
  - `sor_link_types`（Link Type 元数据）
  - `link_instances` / 图查询 / 推理

原则：**先把“类型系统 + 版本化 + 授权锚点”做成稳定公共契约**；实例级图能力后置。

#### 8.5.2 资源稳定性与状态机（Status & Stability）

SOR 资源必须携带两个维度：

1. `status`（生命周期）：`active | deprecated | disabled`
2. `stability`（稳定性等级）：`experimental | beta | ga`

最小状态机（MVP）：

- `experimental`：允许快速迭代，可能发生 breaking；默认 **不生成稳定 SDK**，仅用于内部试点。
- `beta`：承诺“尽量兼容”，允许新增字段/参数；breaking 必须走“major version”或新 key。
- `ga`：强兼容承诺；breaking 必须走 **新 major** 或 **新 type\_key/action\_key**。

生命周期约束：

- `deprecated`：继续可读；默认不再推荐生成新用法；必须给出 `deprecation_info`（见 8.5.4）。
- `disabled`：不可读/不可用（通常只用于安全或合规紧急下线）；必须 requires-human-review 并附带风险说明。

#### 8.5.3 版本化策略（Versioning）

SOR 的版本化必须同时满足：

- **可比较**：客户端能判断“新旧”；
- **可审计**：每次变更可追溯；
- **可缓存**：ETag/If-None-Match 可用；
- **可迁移**：breaking 能清晰分叉。

字段约束（MVP 建议）：

- `version`：语义版本（SemVer，字符串，如 `1.2.0`）
- `revision`：单调递增整数（每次保存 +1）
- `schema_hash`：内容 hash（用于快速一致性校验）
- `etag`：由（`type_key/action_key` + `revision` 或 `schema_hash`）派生

兼容性判定（MVP 强约束）：

- **非破坏性（backward compatible）**：只允许
  - 新增可选字段/属性/参数；
  - 扩展枚举（需声明 default 行为）；
  - 仅文档级澄清（不改语义）。 → 递增 `MINOR/PATCH`，`revision+=1`。
- **破坏性（breaking）**：包括
  - 删除/重命名字段；
  - 收紧校验（原先可通过的输入现在拒绝）；
  - 改变 side\_effect\_profile 的关键语义（例如从 no-egress 变为 egress）。 → 必须 **新 major** 或 **新 key（推荐）**，并进入弃用流程（8.5.4）。

备注：MVP 更推荐“新 key 分叉”（例如 `invoice.v2`）来承接 breaking，因为它对 codegen/集成方更清晰，也便于并存迁移。

#### 8.5.4 弃用与迁移（Deprecation & Migration）

任何进入 `deprecated` 的 SOR 资源必须包含：

- `deprecated_at`：时间戳
- `sunset_at`：预计停止推荐/停止生成的时间点（MVP 可选，但建议尽早引入）
- `replaced_by`：指向替代的 `type_key/action_key@version`
- `migration_notes`：迁移要点（≤ 10 条，面向工程实现）

弃用最小承诺（MVP）：

- `deprecated` 资源 **继续可读**（至少一个“发布周期”）；
- SDK/codegen 默认不再生成 deprecated 资源的“新用法”（但保留兼容读取结构）。

紧急下线（`disabled`）约束：

- 必须 `requires-human-review` + CODEOWNERS 审核；
- 必须发布 `ontology.sor.updated` 事件并写 `audit_events(ontology.disabled)`；
- 必须给出“替代路径”或“回滚策略”。

#### 8.5.5 写入渠道与变更门禁（Write Channels & Review Gate）

MVP 的核心策略：**读开放、写收敛**。

A. 写入渠道（MVP 推荐）

1. **Migration / Admin Script（默认唯一写口）**

- 通过受控迁移脚本写入/升级 `sor_*` 表。
- 迁移脚本必须：
  - 追加式（append-only）保存历史（或写入 history 表）；
  - 写入审计事件（见 8.5.7）。

2. **Admin API（可选，feature-flag）**

- 若开放 `POST/PATCH /v1/ontology/*`：
  - 必须强 policy（`ontology.*.write`）
  - 必须强并发控制（If-Match 428/412）
  - 必须写 outbox（触发 `ontology.sor.updated`）
  - 必须开启 requires-human-review（见 8.4.5）

B. Review Gate（必须） 以下变更强制进入人工审核（并与 8.4.5 的路径规则对齐）：

- stability 变更（特别是 `beta→ga`）
- 任何 breaking（新 major / 新 key）
- 任何 `deprecated/disabled` 操作
- 任何 side\_effect\_profile 关键语义变化（例如新增出站目标/从 deny 到 allow）

#### 8.5.6 与 Policy / Obligations 的对齐（Fail-closed）

A. Policy Action 命名（MVP 固定）

- 读：
  - `ontology.object_type.read` / `ontology.action_type.read`
  - `ontology.object_type.list` / `ontology.action_type.list`
- 写（若启用）：
  - `ontology.object_type.create|update|delete`
  - `ontology.action_type.create|update|delete`
  - `ontology.lifecycle.deprecate|disable`

B. ObjectRef / ActionRef（MVP 形态）

- `object_ref.type_key = sor_object_type | sor_action_type`
- `object_ref.object_id = type_key/action_key`

C. Obligations（治理约束） PDP 可以返回 obligations，Platform Core 必须遵守（否则 deny）：

- `requires_human_review`：拒绝执行写入/提交，返回 403（或 409）并写审计
- `redact_fields`：对读取响应进行字段脱敏（如有敏感元数据）
- `rate_limit`：对 ontology 读取/写入加额外限流

原则：**obligations 是“额外约束”，不改变 allow/deny 的最小语义**。实现上建议把 obligations 处理封装为 `ApplyObligations()`，并纳入 8.4 的 Guardrails 规则集（防止遗漏）。

#### 8.5.7 审计、事件与缓存一致性（Audit / Events / Cache）

A. 必须写入的审计事件（append-only）

- `ontology.object_type.created|updated|deprecated|disabled`
- `ontology.action_type.created|updated|deprecated|disabled`
- 必填字段：`type_key/action_key`、`version`、`revision`、`schema_hash`、`policy_decision_id`、`reason_code`、`trace_id`、`actor_id`

B. 必须发布的事件（对齐 interaction-protocol 占位）

- `ontology.sor.updated`
  - payload：`kind`（object\_type/action\_type/link\_type）、`key`、`version`、`revision`、`etag`、`change_type`（compatible|breaking|deprecated|disabled）
  - 用途：客户端/Agent Bridge 失效缓存、触发刷新、记录变更历史。

C. 缓存一致性规则（MVP 强约束）

- Server-side Redis 缓存：必须按 `etag`/`revision` 组织 key（见 §6.7）。
- 任何写入成功后必须：
  1. 在同一事务写 outbox（或直接 publish）
  2. 发布 `ontology.sor.updated`
  3. 失效相关 cache key（或标记 stale）

#### 8.5.8 Codegen/SDK 的稳定性承诺（MVP）

- `experimental`：不生成“稳定 SDK”；只生成内部工具或实验性类型（可带 `@experimental` 标记）。
- `beta`：允许生成 SDK，但必须在生成物中保留“版本/etag”并提示兼容性等级。
- `ga`：生成稳定 SDK；breaking 必须通过 **新 major 或新 key**。
- `deprecated`：默认不生成新入口；保留类型定义用于读取兼容与迁移。

#### 8.5.9 验收用例（必须可自动化）

- AC-SOR-GOV-1：对 `ga` 的 breaking 变更必须被拒绝或强制走新 major/new key（CI/审查门禁触发）。
- AC-SOR-GOV-2：任何 `deprecated/disabled` 操作必须写审计并发布 `ontology.sor.updated`。
- AC-SOR-GOV-3：写入后，旧 ETag 的 Conditional GET 返回 200（新 ETag），并且缓存被正确失效。
- AC-SOR-GOV-4：PDP 返回 `requires_human_review` 时，写操作 fail-closed，并写 `audit_events(ontology.write.blocked)`。

---

## 9. 可观测与运维（Observability & Ops）

### 9.1 Trace 传播

目标：让任意一次用户请求（HTTP/WS/异步/outbound）形成“单条可追溯链”，并且能在 audit/metering/receipt 中稳定对账。 推荐标准：W3C Trace Context（`traceparent`/`tracestate`）+ W3C Baggage（`baggage`），由 OpenTelemetry SDK 负责注入/提取/关联。

#### 9.1.1 统一传播标准（必须）

- **跨服务**：
  - `traceparent` / `tracestate`（W3C Trace Context）
  - `baggage`（W3C Baggage）
- **跨语言**：Go（platform-core）与 Python（workers/agent-bridge）必须使用同一 propagator 组合：`tracecontext,baggage`。

#### 9.1.2 Context 字段分层（避免滥用 baggage）

- Trace（强关联）：
  - `trace_id`（从 `traceparent` 提取）
  - `span_id`（当前 span）
- Correlation（业务关联）：
  - `correlation_id`（业务键：session/workflow/job/outbox\_event\_id 之一；按链路选择）
- Baggage（轻量且受限）：
  - 仅允许低基数、短值字段（例如 `master_account_id`、`sub_account_id`、`actor_id`、`request_id`）；禁止把大对象/PII 放入 baggage。

#### 9.1.3 HTTP（入站/出站）

- 入站（Platform Core）：
  - middleware 提取 `traceparent/baggage`；若缺失则创建新 trace。
  - 将 `trace_id` 写入 request context，并注入到结构化日志与 `audit_events`。
- 出站（Platform Core → PDP/其它内部服务）：
  - 由 OTel HTTP client 自动注入 `traceparent/baggage`。

#### 9.1.4 WS（Realtime / Centrifugo）

- 连接层：WS 连接 token 只用于鉴权；trace 不依赖 token。
- publish 层：
  - Platform Core / workers 在调用 Centrifugo HTTP/GRPC API publish 时，必须携带 `traceparent/baggage`。
  - 若 Centrifugo 开启 OpenTelemetry（api tracing），则可将 publish/API 请求纳入同一 trace（便于定位“发布延迟/丢失”）。
- 事件 payload：
  - 每个业务事件 envelope 必须包含 `trace_id` 与 `correlation_id`（最小），用于客户端/下游对账。

#### 9.1.5 Async（Outbox / Worker / Side-effect Gateway）

- Outbox 写入（Platform Core，事务内）：
  - `outbox_events.payload` 必须包含：
    - `traceparent`（原样字符串）
    - `baggage`（可选；若包含必须遵守 9.1.2 约束）
    - `correlation_id`
- Worker 消费：
  - 从 outbox payload 提取 `traceparent/baggage`，作为 worker span 的 parent（恢复链路）。
- Worker → Side-effect Gateway：
  - outbound 请求必须注入 `traceparent/baggage`，并把 `outbox_event_id` 作为 idempotency\_key。
- Gateway 产出 receipt：
  - receipt 必须回写 `trace_id` 与 `correlation_id`（与 outbox 对齐）。

#### 9.1.6 日志与 Trace 的关联（最小约束）

- 结构化日志必须包含：`trace_id`、`span_id`、`correlation_id`、`master_account_id`、`sub_account_id`、`actor_id`。
- 对“拒绝/失败”路径（authn\_failed/policy\_denied/side\_effect\_failed）必须强制记录上述字段。

#### 9.1.7 环境变量传播（可选；用于子进程/外部执行）

- 若需要跨进程（非 HTTP）传播（例如执行器/子进程），可按 OTel 规范将 trace/baggage 映射为环境变量载体（env carriers）。

#### 9.1.8 验收用例（必须可自动化）

- AC-TRACE-1：HTTP 入站有 traceparent 时，PDP 调用与 audit\_events 记录同一 trace\_id。
- AC-TRACE-2：写入 outbox 的 payload 携带 traceparent；worker 执行 side-effect 后 receipt.trace\_id 与入口一致。
- AC-TRACE-3：WS publish 发生时，Centrifugo（若启用 OTel）能看到同一 trace 上的 publish API span。
- AC-TRACE-4：所有 error responses（RFC7807）日志都包含 trace\_id + correlation\_id。

---

### 9.2 Metrics & Logs

#### 9.2.1 指标（Metrics）最小集合（MVP 必须）

1. **HTTP/API**

- `http.server.duration`（按 route/method/status 分桶）
- `http.server.active_requests`

2. **Policy（PDP）**

- `policy.eval.count`（allow/deny/error）
- `policy.eval.latency_ms`
- `policy.eval.fail_closed.count`

3. **Outbox**

- `outbox.pending.count`（按 event\_type）
- `outbox.processing.count`
- `outbox.attempt.count`（重试次数分布）
- `outbox.dead.count`
- `outbox.lag_seconds`（now - next\_attempt\_at 或 created\_at）

4. **Side-effect Gateway（从 receipt 侧观测）**

- `side_effect.count`（started/succeeded/failed/denied）
- `side_effect.latency_ms`
- `side_effect.idempotency_hit.count`

5. **Realtime（WS）**

- `ws.connections.active`（来自 Centrifugo 指标）
- `ws.publish.count`（按 channel/event\_type）
- `ws.recovery.success.count` / `ws.recovery.miss.count`

备注：Centrifugo 内置 Prometheus 指标与可选 OpenTelemetry tracing（API 级）可直接复用；Platform Core 侧只需把业务维度补齐。

#### 9.2.2 结构化日志字段（必须）

- 关联字段：`trace_id`、`span_id`、`correlation_id`
- 身份上下文：`master_account_id`、`sub_account_id`、`actor_id`
- 请求字段：`method`、`route`、`status_code`、`reason_code`、`latency_ms`
- 策略字段：`action`、`object_ref.type_key`、`object_ref.object_id`、`policy_decision_id`
- Outbox/Receipt：`outbox_event_id`、`receipt_id`

#### 9.2.3 日志与 Trace 关联（建议）

- 使用 OTel 日志关联能力：在日志中自动注入 trace 上下文（trace\_id/span\_id）。
- 对高频成功路径可采样；对失败/deny 路径必须全量。

---

### 9.3 Runbook

TBD（常见告警与定位路径、降级开关）

---

## 10. 测试与验证（Testing & Verification）

目标：把本文件中的关键不变量（fail-closed、RLS 隔离、Outbox/Receipt 闭环、幂等、条件请求、WS 恢复语义、Guardrails）落到 **可自动化验证** 的测试与流水线闸门上。

### 10.1 测试分层（Test Pyramid）

#### 10.1.1 Unit（单元测试）

覆盖范围（仅内存/纯函数或轻量 stub）：

- `internal/httpapi`：DTO 校验、错误映射（domain error → RFC7807）、ETag 计算、`If-Match/If-None-Match` 判定。
- `internal/policy`：PDP client 的超时/重试/解析错误处理（确保 fail-closed）；obligations 的应用函数（`ApplyObligations`）。
- `internal/tx`：事务模板的边界行为（commit/rollback、panic safety、上下文字段缺失直接拒绝）。
- `internal/idempotency`（若实现）：request\_hash 计算、冲突判定（same key + different payload → 409）。

单测强约束：

- 所有单测必须可并发执行（`t.Parallel()` 友好）。
- 禁止依赖真实网络；外部依赖使用 interface + stub。

#### 10.1.2 Integration（集成测试）

覆盖范围（真实 Postgres/Redis/OPA/Realtime 可选）：

- **Postgres + RLS + tx-scoped settings**：验证 `set_config(..., true)` 事务内注入、连接池复用情况下不串租。
- **Outbox + Worker**：验证 `pending → processing → succeeded/failed/dead` 状态机、`SKIP LOCKED` 并发领取、lease/超时回收。
- **Idempotency keys**：验证 DB 唯一约束与重放返回（同 payload 命中缓存；不同 payload 冲突）。
- **OPA**：验证 PDP 可用/不可用时的行为（可用：allow/deny；不可用：fail-closed）。
- **Centrifugo（可选，建议）**：验证 history+recovery 的 offset/epoch 行为（至少 smoke）。

环境建议：

- 通过 `docker compose` 或 testcontainers 启动：Postgres（含 migrations + RLS）、Redis、OPA（带 bundle）、可选 Centrifugo。

#### 10.1.3 Contract（契约测试）

覆盖范围（对齐 `api-style-guide.md` / `interaction-protocol.md` / `agent-interface-spec.md`）：

- HTTP：
  - RFC7807 响应体字段最小集合与 `reason_code/trace_id/correlation_id` 扩展字段。
  - 条件请求：GET 支持 `ETag + If-None-Match → 304`；PATCH/DELETE 支持 `If-Match → 412/428`。
- WS：
  - `/v1/ws/tickets`、`/v1/ws/tokens/refresh`、`/v1/ws/subscriptions/token` 的请求/响应字段与错误语义。
- 事件：
  - `ontology.sor.updated`、`receipt.created`（占位事件） envelope 字段完整性（`type/specversion/id/time/datacontenttype/data`）。

实现建议：

- OpenAPI（或 Proto）为单一事实来源（如仓库已采用），契约测试在 CI 中对生成物与 handler 行为做一致性校验。

#### 10.1.4 E2E（端到端）

覆盖范围（从 HTTP 入口到 DB/Outbox/Receipt/Realtime 的闭环）：

- 核心链路：
  - AuthN → Context（master/sub）→ Policy → Tx（SET LOCAL）→ Repo → Audit/Outbox → Worker → Side-effect Gateway（可 stub）→ Receipt →（可选）Realtime publish。
- 重点验证：
  - deny 路径“无副作用”：被拒绝时不应写入业务表/不应写 outbox（除 audit/metering 的拒绝记录）。
  - 可追溯闭环：`policy_decision_id` ↔ `outbox_event_id` ↔ `receipt_id` ↔ `trace_id`。

### 10.2 关键验收用例（Reference Spike，可直接落 CI）

说明：以下用例直接对应本文前文 AC（AC-CTX/CRUD/WS/TRACE/GR 等），用于把“文档承诺”落到可重复的自动化断言。

#### 10.2.1 RLS 串租负例（P0）

- 前置：两组不同 `master_account_id/sub_account_id` 的测试数据。
- 步骤：
  1. 使用同一连接池，开两个并发 goroutine：A 在 tx 内注入（master=A, sub=A1），B 注入（master=B, sub=B1）。
  2. A/B 各自执行同一条 `SELECT`（不带任何 WHERE tenant filter）。
- 断言：
  - A 只能看到 A1 范围内数据；B 只能看到 B1。
  - 任一请求缺失 master\_account\_id 必须在执行 SQL 之前被拒绝。

#### 10.2.2 Tx-scoped settings 回滚语义（P0）

- 步骤：
  1. 在 tx 中注入 settings。
  2. 故意触发错误并 rollback。
  3. 在同一连接复用下开启新 tx，不注入 settings，直接查询。
- 断言：
  - 新 tx 不应继承旧 tx 的 settings（防止连接泄漏）。

#### 10.2.3 Policy fail-closed（P0）

- 前置：OPA 停机或将 PDP 地址指向不可达。
- 步骤：调用任一需要 policy\_check 的路由（如 `GET /v1/ontology/object-types/{type_key}`）。
- 断言：
  - 返回 403 + `reason_code=policy_unavailable`（或本文定义的 fail-closed 码）。
  - 写入 `audit_events(policy.denied|policy.unavailable)`（按实现口径）。
  - 不执行任何业务写（只允许审计类 append-only 写入）。

#### 10.2.4 条件请求与并发控制（P0）

- GET：
  - 首次 `GET /v1/ontology/object-types/{type_key}` 返回 `ETag`。
  - 再次携带 `If-None-Match` 请求返回 304。
- PATCH/DELETE：
  - 缺失 `If-Match` 且路由标记 `requires_if_match=true`：返回 428。
  - `If-Match` 不匹配：返回 412。

#### 10.2.5 幂等键重放（P0）

- 步骤：
  1. 对 `POST /v1/jobs`（或任一 create 路由）携带 `Idempotency-Key=K` 发起请求（payload=P1）。
  2. 再次用同 key + 同 payload 发起请求。
  3. 同 key + 不同 payload（P2）再发起请求。
- 断言：
  - 步骤 2 返回“同一结果”（同一资源或同一响应摘要）。
  - 步骤 3 返回 409 `idempotency_key_conflict`。

#### 10.2.6 Outbox 并发领取与至少一次（P0）

- 步骤：
  1. 写入 N 条 `outbox_events(status=pending)`。
  2. 启动 2\~3 个 worker 实例并发消费。
- 断言：
  - 每条 outbox event 最终仅被一个 worker 成功处理（通过 `processing` lease + `SKIP LOCKED` 证明）。
  - 失败事件可按退避策略重试，并在超过阈值进入 `dead`。
  - 每次处理都写入 `receipts`（至少 started + terminal）。

#### 10.2.7 WS Ticket 一次性与续期（P0）

- Ticket：
  - 同一 `ticket_id` 使用两次，第二次必须 409 `ws_ticket_reused`。
  - ticket 过期后必须 401 `ws_ticket_expired`。
- Token refresh：
  - 模拟连接 token 过期，调用 `/v1/ws/tokens/refresh` 成功返回新 token。
  - 若 refresh 被 deny（401/403），客户端侧应被迫下线（服务端仅需确保返回正确错误语义与审计）。

#### 10.2.8 Trace/Receipt 对账（P0）

- 步骤：
  1. 入口 HTTP 请求携带 traceparent。
  2. 写 outbox → worker →（stub）gateway → receipt。
- 断言：
  - receipt/audit/metering 中记录的 trace\_id 与入口一致。
  - `policy_decision_id` 能关联到对应 outbox/receipt。

#### 10.2.9 Guardrails 自测（P0）

- 在测试分支注入一段“违规代码”（例如 handler 内直接 `http.NewRequest`、直接 `pgxpool.Exec`、migration 中 `set_config(..., false)`）。
- 断言：CI 的 `guardrails:semgrep` / `guardrails:sql` 必须阻断合并。

### 10.3 测试工具与基线配置（Tooling Baseline）

#### 10.3.1 依赖服务编排

- `docker compose`：用于本地与 CI 的一致启动（Postgres/Redis/OPA/可选 Centrifugo）。
- migrations：E2E/集成测试启动后必须自动执行 migrations（确保 RLS/policies 生效）。

#### 10.3.2 OPA 策略测试

- Policy 代码必须具备单测：使用 `opa test` 运行 Rego tests，并将其纳入 CI（与代码同仓版本化）。

#### 10.3.3 数据夹具（Fixtures）与数据隔离

- 每个测试用例必须创建独立的 master/sub 上下文数据（避免共享全局数据导致串扰）。
- 对“串租负例”测试必须使用真实连接池（而不是单连接）以覆盖复用风险。

#### 10.3.4 可观测断言

- 测试 harness 应提供：
  - 从响应中提取 `trace_id/correlation_id`；
  - 从 DB 中查询对应 `audit_events/metering_events/receipts/outbox_events` 进行对账断言。

## 11. OSS 参考索引与映射（必填）

本章是“可追溯借鉴点”清单：后续写模块细节时必须把引用落到这里，并在具体章节回链。

### 11.1 引用格式（统一）

- 参考项目：`<项目名> — <GitHub URL> (+ 可选官方文档 URL)`
- 借鉴点：补充 `关键文件路径/模块名`（或“建议检索关键词”）

### 11.2 OSS → Orbitaskflow 概念映射表

| 子系统                         | OSS 项目                                          | GitHub / 官方文档                                                                                                                                                                                                                                                                                                                              | 借鉴点（文件/模块/关键词）                                                             | 我们的概念映射                           | 用途（为何需要）                                              | 落点（Repo 路径）                                                                                           |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Queue/Worker（执行面）           | Arq                                             | [https://arq-docs.helpmanual.io/](https://arq-docs.helpmanual.io/) / [https://github.com/python-arq/arq](https://github.com/python-arq/arq)                                                                                                                                                                                                | `retry` / `job` / 幂等与 at-least-once 语义                                     | Jobs / 异步任务                       | 低复杂度的 Python worker 队列；MVP 默认选型                       | `workers/task-runner-py/`                                                                             |
| Queue/Worker（控制面内部）         | Asynq                                           | [https://github.com/hibiken/asynq](https://github.com/hibiken/asynq)                                                                                                                                                                                                                                                                       | task enqueue / retry / schedule / queue                                    | Control-plane background jobs（可选） | 若 Go 侧需要后台任务（如回收、清理、周期任务）                             | `services/platform-core-go/internal/jobs/`（可选）                                                        |
| Durable Workflow（可选演进）      | Temporal                                        | [https://github.com/temporalio/temporal](https://github.com/temporalio/temporal) / [https://docs.temporal.io/](https://docs.temporal.io/)                                                                                                                                                                                                  | workflow history / signals / queries / retries                             | Durable workflows                 | “长时可暂停/可补偿/可回放”的流程再引入                                 | `infra/temporal/`（可选）                                                                                 |
| Realtime                    | Centrifugo                                      | [https://github.com/centrifugal/centrifugo](https://github.com/centrifugal/centrifugo) / [https://centrifugal.dev/docs/server/history\_and\_recovery](https://centrifugal.dev/docs/server/history_and_recovery)                                                                                                                            | `history` / `recovery` / `offset` / `epoch`                                | WS 事件流                            | 断线重连补拉与历史恢复，降低自研 WS 成本                                | `infra/centrifugo/` + `services/platform-core-go/internal/ws_ticket/`                                 |
| Multi-tenant / 隔离           | PostgreSQL RLS                                  | [https://www.postgresql.org/docs/current/ddl-rowsecurity.html](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)                                                                                                                                                                                                               | RLS policy / `CREATE POLICY` / `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` | DB 隔离不变量                          | 把隔离下沉到 DB，降低漏写过滤的风险                                   | `infra/postgres/` + `services/platform-core-go/internal/tx/`                                          |
| Transaction-scoped Settings | PostgreSQL SET/SET LOCAL                        | [https://www.postgresql.org/docs/current/sql-set.html](https://www.postgresql.org/docs/current/sql-set.html)                                                                                                                                                                                                                               | `SET LOCAL` / `set_config(..., true)` / savepoint rollback semantics       | tx 级上下文注入                         | 作为“连接池下必须用事务级设置”的权威依据                                 | `services/platform-core-go/internal/tx/`                                                              |
| Multi-tenant（工程参照）          | PostgREST                                       | [https://docs.postgrest.org/en/v12/explanations/db\_authz.html](https://docs.postgrest.org/en/v12/explanations/db_authz.html)                                                                                                                                                                                                              | RLS + transaction-scoped settings 的工程化经验                                   | `SET LOCAL` 上下文注入                 | 作为“连接池下必须用事务级设置”的参照实现                                 | 仅作为参照（不要求引入服务）                                                                                        |
| Policy/AuthZ（PDP）           | OPA                                             | [https://github.com/open-policy-agent/opa](https://github.com/open-policy-agent/opa) / [https://openpolicyagent.org/docs/management-decision-logs](https://openpolicyagent.org/docs/management-decision-logs) / [https://www.openpolicyagent.org/docs/latest/policy-testing/](https://www.openpolicyagent.org/docs/latest/policy-testing/) | `rego` / `decision logs` / `decision_id` / policy testing                  | PDP / policy\_check               | 外部化策略与可审计决策日志 + 策略单测（Rego tests）                      | `infra/opa/` + `services/platform-core-go/internal/policy/`                                           |
| Session 安全最佳实践              | OWASP Session Management Cheat Sheet            | [https://cheatsheetseries.owasp.org/cheatsheets/Session\_Management\_Cheat\_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)                                                                                                                                                                | idle timeout / absolute timeout / cookie flags（HttpOnly/Secure/SameSite）   | session 生命周期                      | 为 §6.1 的 session/cookie 约束提供权威安全依据                    | `services/platform-core-go/internal/auth/` + `services/platform-core-go/internal/httpapi/middleware/` |
| OAuth2 / Token 安全           | OWASP OAuth2 Cheat Sheet                        | [https://cheatsheetseries.owasp.org/cheatsheets/OAuth2\_Cheat\_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)                                                                                                                                                                                         | refresh token / revocation / token storage                                 | access/refresh token 策略           | 为 §6.1 的 token/refresh 约束提供安全最佳实践依据                   | `services/platform-core-go/internal/auth/`                                                            |
| Capability Token            | Biscuit                                         | [https://github.com/biscuit-auth/biscuit](https://github.com/biscuit-auth/biscuit) / [https://github.com/eclipse-biscuit/biscuit-go](https://github.com/eclipse-biscuit/biscuit-go)                                                                                                                                                        | attenuation（能力衰减）/ offline validation / datalog rules                      | capability token                  | 可委派/可衰减的能力凭证，适合 side-effect gating                    | `services/platform-core-go/internal/capability/` + `services/side-effect-gateway/`                    |
| Outbox / 事件可靠投递             | Debezium（Outbox Pattern）                        | [https://github.com/debezium/debezium](https://github.com/debezium/debezium) / [https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/)                                                      | outbox table / outbox event router / CDC                                   | outbox\_events + consumer         | 事务一致性地把“业务写入 + 事件发布/副作用”绑定                            | `services/platform-core-go/internal/outbox/` + `workers/task-runner-py/`                              |
| Outbox Forwarder（DB→执行器）    | Watermill Forwarder                             | [https://github.com/ThreeDotsLabs/watermill](https://github.com/ThreeDotsLabs/watermill) / [https://watermill.io/advanced/forwarder/](https://watermill.io/advanced/forwarder/)                                                                                                                                                            | forwarder / sql pubsub / tx publisher                                      | outbox forwarder                  | 抽象出“后台 forwarder 扫表并投递”的通用组件形态                        | `workers/task-runner-py/`（实现语义借鉴）                                                                     |
| Outbox（Go 参考实现）             | goharvest                                       | [https://github.com/obsidiandynamics/goharvest](https://github.com/obsidiandynamics/goharvest)                                                                                                                                                                                                                                             | outbox schema / scraper / publish loop                                     | outbox poller                     | 参考更完整的扫表、lease、并发与可靠性细节                               | 仅参照（不要求引入）                                                                                            |
| Outbox（轻量 Go 参考）            | oagudo/outbox                                   | [https://github.com/oagudo/outbox](https://github.com/oagudo/outbox)                                                                                                                                                                                                                                                                       | library API / storage-agnostic                                             | outbox helper                     | 参考 minimal API 设计（写入/拉取/ack）                          | 仅参照（不要求引入）                                                                                            |
| Observability               | OpenTelemetry                                   | [https://github.com/open-telemetry/opentelemetry-go](https://github.com/open-telemetry/opentelemetry-go) / [https://opentelemetry.io/docs/concepts/context-propagation/](https://opentelemetry.io/docs/concepts/context-propagation/)                                                                                                      | trace + context propagation + baggage                                      | trace\_id / correlation\_id       | 跨 Go/Py/WS/Async 的可观测关联                               | `services/platform-core-go/internal/observability/` + `services/agent-bridge-py/app/observability/`   |
| Trace 标准                    | W3C Trace Context                               | [https://github.com/w3c/trace-context](https://github.com/w3c/trace-context)                                                                                                                                                                                                                                                               | `traceparent` / `tracestate`                                               | trace headers                     | 统一跨系统 trace 头格式                                       | 作为规范约束（实现由 OTel 承担）                                                                                   |
| HTTP 缓存（规范）                 | RFC 9111（HTTP Caching）                          | [https://www.rfc-editor.org/rfc/rfc9111.html](https://www.rfc-editor.org/rfc/rfc9111.html)                                                                                                                                                                                                                                                 | Cache-Control / ETag / private caching                                     | client/server cache semantics     | 为 SOR 查询提供标准缓存控制口径                                    | 作为规范约束（handler 输出头）                                                                                   |
| HTTP 条件请求（规范）               | RFC 9110（HTTP Semantics — Conditional Requests） | [https://www.rfc-editor.org/rfc/rfc9110.html](https://www.rfc-editor.org/rfc/rfc9110.html)                                                                                                                                                                                                                                                 | conditional requests / If-Match / If-None-Match / 304                      | conditional GET                   | 为 SOR 查询提供标准“未变更不返回 body”的语义（RFC 7232 已被 RFC 9110 取代） | 作为规范约束（handler 输出与判定）                                                                                 |
| 版本化 watch（工程参照）             | Kubernetes API（resourceVersion）                 | [https://kubernetes.io/docs/reference/using-api/api-concepts/](https://kubernetes.io/docs/reference/using-api/api-concepts/)                                                                                                                                                                                                               | resourceVersion / watch / consistent read                                  | version cursor                    | 作为“版本游标 + 事件流”的工程参照（不要求实现 watch）                      | 仅作为参照（演进）                                                                                             |
| 契约治理                        | Buf                                             | [https://buf.build/docs/breaking/](https://buf.build/docs/breaking/)                                                                                                                                                                                                                                                                       | lint / breaking change detection                                           | proto 契约                          | 机械化识别破坏性变更，避免契约漂移                                     | `tools/buf/` + CI                                                                                     |
| CI Guardrails（代码）           | Semgrep                                         | [https://github.com/semgrep/semgrep](https://github.com/semgrep/semgrep) / [https://github.com/semgrep/semgrep-rules](https://github.com/semgrep/semgrep-rules)                                                                                                                                                                            | 规则扫描 / 阻断合并 / 自定义规则                                                        | guardrails                        | 禁止直连出站、禁止绕开 tx wrapper、禁止不安全 API                      | `ci/guardrails/semgrep/`                                                                              |
| Sandbox（可选）                 | Firecracker                                     | [https://github.com/firecracker-microvm/firecracker](https://github.com/firecracker-microvm/firecracker)                                                                                                                                                                                                                                   | microVM / KVM / isolation                                                  | sandbox runner                    | 高风险/不可信执行的隔离边界                                        | `infra/sandbox/`（可选）                                                                                  |

---

## 12. 风险、权衡与备选方案（Risks & Alternatives）

TBD

---

## 13. 开放问题（Open Questions）

- Q1：MVP 的 SOR 最小对象类型集合是什么？是否仅覆盖核心系统对象（session/workflow/job/artifact/receipt），还是也包含业务对象（来自 Marketplace/Workspace 的实体）？
- Q2：SOR 的版本化与兼容性策略如何与 `api-style-guide.md` 的兼容性要求对齐（例如：字段新增/废弃、status=deprecated 的行为）？
- Q3：SOR 写入渠道在 MVP 阶段采用哪一种：仅迁移脚本/管理员后台，还是开放 API（需更强 policy + 审计 + review gate）？
- Q4：从 SOR 演进到“完整 Ontology（对象/关系/动作）”的里程碑与触发条件是什么（例如：需要 link types / action side-effects 编排 / cross-domain object graph）？

---

## 附录 A：实现清单（Checklist）

- 是否新增/更新 ADR：是/否（ADR-xxx）
- 是否变更协议 SSOT：是/否（interaction-protocol / api-style-guide）
- 是否变更数据 SSOT：是/否（database-design）
- 是否需要新 reason\_code：是/否（需登记于治理文档）
- 是否引入新的 capability scope：是/否（需登记并可撤销）
- 是否新增外部出站目标：是/否（需更新 allowlist/策略）
- 是否新增/变更审计/计量/receipt 口径：是/否

## 附录 B：版本历史（Changelog）

| 版本   | 日期         | 修改人 | 变更摘要 |
| ---- | ---------- | --- | ---- |
| v0.1 | 2026-01-30 |     | 初始骨架 |

