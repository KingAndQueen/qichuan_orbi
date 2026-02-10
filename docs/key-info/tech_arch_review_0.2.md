# Tech Arch 对齐结论（临时中间文档）

> 说明：本文件为“产品需求 × 架构设计”对齐过程的临时结论汇总，用于后续修改 fullstack-architecture.md 与其他技术文档。
> - 不追求项目正式文档格式
> - 以“冻结（已确认）/不变量/边界/默认策略”为主

---

## 0. 复核发现的问题与修正建议（基于再次通读 + 外部最佳实践对照）

> 说明：以下为“已冻结结论”的一致性/可落地性复核清单。已按你的指示完成改进：P0-1/P0-2/P1-1/P1-2/P1-3/P2-1/P2-2/P2-3/P2-4/P1-6/P1-5/P1-4/P2-5 已融入对应 ADR 条目（保持结论不变，补足缺失约束/引用关系）。

### P0（会导致口径冲突/后续写 fullstack 会漂移）
- **P0-1：ADR-093 与 ADR-037/038 的重复与潜在漂移**
  - ADR-093 已定义“数据生命周期与保留清理”的通用策略，但 tech_arch_review_0.1 已有 **ADR-037 删除保留与 SLA**、**ADR-038 对象存储生命周期策略**。
  - **风险**：后续文档可能出现两套保留窗口/硬删 SLA/对象存储 Lifecycle 的表述。
  - **修正建议**：在 ADR-093 明确：
    - “删除/硬删窗口与 SLA 以 ADR-037 为准；对象存储生命周期与前者一致口径，以 ADR-038 为准；ADR-093 只定义全域框架（对象清单/retention_policy 表达/审计/索引跟随）”。

- **P0-2：ADR-075（pgvector 主路径）与 fullstack-architecture.md 的 ‘Vector DB’ 表述可能冲突**
  - ADR-075 冻结为 “MVP 主路径 pgvector”，但 fullstack-architecture.md 的拓扑中存在单独的 Vector DB（V）概念。
  - **风险**：团队可能误解为 MVP 需要引入独立向量库（增加运维与一致性成本）。
  - **修正建议**：在 ADR-075 增加一行明确：
    - “V=Postgres(pgvector) 为默认实现；独立向量库仅作为后续演进（Adapter），不进入 MVP 必选依赖”。

### P1（结论不变，但缺少关键不变量会影响可执行性/可观测性）
- **P1-1：ADR-078（SLO/SLA）缺少 ‘Error Budget Policy’ 的闭环要素**
  - 当前冻结了关键链路与统计口径，但未冻结“错误预算/燃烧率/发布节奏联动”的最小规则。
  - **修正建议**：在 ADR-078 增补：
    - “每条关键 SLO 必须映射 error budget；灰度/发布门禁（ADR-079）必须参考 burn rate/预算消耗进行收敛”。

- **P1-2：ADR-077（PITR/RPO/RTO）缺少 ‘备份可用性验证’ 与 ‘WAL 归档监控’ 的最小要求**
  - 已有月度恢复演练，但未明确备份链路的日常验证（例如备份完整性校验、WAL 归档健康）。
  - **修正建议**：在 ADR-077 增补：
    - “备份自动化（工具/作业化）、WAL 归档监控、备份完整性校验、定期演练为强制项（与 RPO/RTO 绑定）”。

- **P1-3：ADR-082 结构化日志字段中 `master_account_id` 标注为 ‘可选’ 可能与多租户归因目标冲突**
  - ADR-083/084 强调以主账号为第一维度聚合，但 ADR-082 在 app/job log 的最小字段集里把 `master_account_id` 写为可选。
  - **修正建议**：改为：
    - “对已鉴权/已绑定租户上下文的请求，`master_account_id` 必填；仅对匿名/未鉴权入口可为空。审计/计量事件中 `master_account_id` 必填不例外”。

### P2（建议性补强，避免后续实现产生隐含歧义）
- **P2-1：ADR-070/048 中 ‘幂等’ 的责任边界可更明确**
  - 当前约束了 Side-effect 必带 `idempotency_key`，但未明确 key 的生成口径、生命周期与去重窗口（Redis/DB）。
  - **修正建议**：补一句 “idempotency_key 以主账号域生效；去重窗口与副作用类型绑定；最终事实以 receipt/audit 为准”。

- **P2-2：ADR-072（Connector 三形态）建议补一句 ‘托管 Connector’ 的准入条件**
  - 已声明 MVP 不承诺，但建议补一句：未来若启用托管 Connector，必须满足供应链（签名/可信发布者）与强隔离（sandbox/配额/网络 allowlist）。

### 二次复核新增（再次通读 + 外部最佳实践对照）

#### P1（结论不变，但缺少关键不变量会影响安全基线/合规扩展）
- **P1-4：ADR-066 密码策略过“弱”且缺少“允许更长 + 反泄漏”条款**
  - 当前写法以 “长度 ≥ 8” 为硬门槛（对齐 IA PRD 可接受），但缺少：允许更长（如 64）、鼓励 passphrase、以及泄漏密码检测/拒绝常见弱密码等最低基线。
  - **修正建议**：保持“≥8（MVP PRD）”不变，同时冻结：允许长度至少 64；建议默认 ≥15（单因子）；支持空格与 Unicode；拒绝已泄漏/常见弱密码；禁止强制复杂度组合规则（以免适得其反）。

- **P1-5：ADR-093/037/036 未显式预留 legal hold 的系统语义**
  - tech_arch_review_0.1 在 ADR-036 已明确 “legal hold 等治理能力可后续迭代补齐，但墓碑结构需允许扩展”。
  - **风险**：后续合规需求（取证/保全）会反向逼迫重构删除链路。
  - **修正建议**：ADR-093 冻结一条扩展位：对象可被标记 `legal_hold=true`（或等价），命中时到期清理与硬删任务必须 fail-closed，并形成高风险审计。

- **P1-6：ADR-069/066 会话管理缺少“idle timeout + 风险事件 re-auth”最小不变量**
  - 当前描述了滑动过期与 30 天强制重新验证，但未冻结：空闲超时（idle timeout）与高风险事件（改密/权限变更/异常登录）触发重新认证。
  - **修正建议**：冻结最小规则：idle timeout（如 30~60 分钟可配置）；密码变更/权限提升/设备风险命中时必须 re-auth；并在 WS 续租失败时返回可机读 reason_code。

#### P2（建议性补强，主要为了协议一致性与实现可落地）
- **P2-3：ADR-086 的 reason_code 建议落到标准化 HTTP Error Envelope（RFC 7807/9457 风格）**
  - 你们已有 reason_code/reason_class/trace_context，但缺少对外 API 的统一错误体格式，会导致多语言 SDK/前端处理分叉。
  - **修正建议**：HTTP 层采用 Problem Details 作为外壳（type/title/status/detail/instance），并把 `reason_code`/`trace_context`/`receipt_ref` 放入扩展字段；WS/异步保持现有语义。

- **P2-4：ADR-068/069 Ticket 与 capability token 建议补“抗重放/一次性语义”**
  - 已写 audience/expiry，但未冻结：Ticket 一次性消费（jti/nonce）与重放保护；时钟偏差容忍；撤销后快速失效与缓存污染防护。
  - **修正建议**：WS Ticket 默认一次性使用（消费即作废）；capability token 带 jti + 短 TTL；执行面校验时必须记录消费/拒绝事件并可审计。

- **P2-5：ADR-078/094 建议补“burn-rate 多窗口告警”作为最小 Runbook 的一部分**
  - 已冻结 error budget policy，但未冻结“如何告警”口径。
  - **修正建议**：Runbook 最小集合里补：基于 burn rate 的多窗口告警（快窗/慢窗），避免噪音与漏报。

---

## A. 凭证、出站治理与副作用语义（ADR-059～073）

### ADR-059 Secrets 管理与注入冻结
**状态**：已冻结（存储、注入、隔离与脱敏口径已确认）

**冻结结论（已确认）**
- Secrets 范围：外部能力调用/生态接入所需凭证与敏感配置（LLM/API key、Remote Agent/MCP token、第三方系统密钥、Webhook 签名等）。
- 存储原则：
  - 执行面不得持久化明文 Secrets；业务数据库仅存 `secret_ref`（引用），不存明文。
  - Secrets 必须在受控 Secrets Store 中加密存储；访问控制与 `master_account_id` 强绑定。
  - Secrets 不得进入对话资产、长期记忆、RAG 索引与 prompt。
- 注入原则（运行期按需）：
  - 仅在运行期、受控治理点注入（优先收口到 Egress/Side-effect Gateway）。
  - 默认短 TTL + 最小权限；到期自动失效；解析与注入可审计、可撤销（与 ADR-061 联动）。
- Redaction 强制：日志/追踪/导出链路必须脱敏；仅记录指纹/摘要（可追溯但不可泄露）。
- 审计：Secrets 的创建/更新/删除/轮换/撤销为高风险审计（append-only）；Secrets 解析/注入至少记录“访问事件”（不含明文）。
- 失败语义：Secrets 缺失/过期/撤销/命中 kill-switch 一律 fail-closed，并在 receipt 返回 `reason_code`；必要时走“需要协助”。

### ADR-060 双轨凭证冻结
**状态**：已冻结

**冻结结论（已确认）**
- 外部调用凭证支持“双轨”：platform-managed（平台托管）与 tenant-provided（主账号自带）。
- 所有凭证遵循 ADR-059/061：不明文落盘、运行期注入、可撤销可审计。
- 选择策略需可解释：当同一出站目标存在多轨凭证时，选择必须可审计（trace/receipt 可追溯）。

### ADR-061 密钥轮换与撤销冻结
**状态**：已冻结（轮换归属、撤销传播与在途语义已确认）

**冻结结论（已确认）**
- 轮换归属：
  - platform-managed：平台必须支持轮换。
  - tenant-provided：主账号触发轮换；平台提供更新入口与即时生效能力。
- 撤销即时生效：撤销后对新请求 fail-closed；关键执行节点必须检查撤销状态（收口到 Egress/Side-effect/Export 等受控链路）。
- 在途语义：支持协作式取消（安全点终止），回写 receipt 状态与 `reason_code`；副作用类（Side-effect）撤销命中时优先终止。
- 缓存与传播：禁止长期缓存明文凭证；仅短 TTL 缓存；撤销信号需可广播到执行面（MVP 目标近实时，至少分钟级）。
- 审计：轮换/撤销为高风险审计（append-only）；撤销命中导致的拒绝/取消同样可审计并关联 receipt。

### ADR-062 审计证据链分级冻结
**状态**：已冻结（分级、最小字段集与不可篡改口径已确认）

**冻结结论（已确认）**
- 分级：普通 / 高风险 / 不可补偿。
- 最小证据字段集（必填）：`master_account_id`、actor、action、object_ref、decision（allow/deny）、time、`reason_code`、`trace_context`；涉及权限判定需 policy_ref/capability_ref；出站/副作用需 egress_target/side_effect_type/`idempotency_key`；关联 receipt_ref。
- 不可篡改：高风险/不可补偿事件必须 append-only；任何更正以“追加纠正事件”表达。
- 存储/查询：按 `master_account_id`/time/action/object_ref/trace_context 查询与导出（导出受权限与 kill-switch 约束）。
- 后续增强：可引入 WORM/对象存储留档或 hash 链等完整性证明。

### ADR-063 Prompt Injection 防线收口冻结
**状态**：已冻结（统一标记、隔离与净化口径已确认）

**冻结结论（已确认）**
- 默认不可信：工具/外部系统/Remote Agent/MCP 返回内容一律标记为 untrusted，不得作为指令或策略。
- 指令层隔离：tool output 与 system/user/developer 指令层严格分离；工具输出仅作为“数据/证据”引用。
- 进入 prompt 必须净化与裁剪：默认最小必要集 + allowlist 字段摘要；原文仅在显式声明需要且通过能力与审计门禁时允许引用。
- SENSITIVE 禁入：SENSITIVE 默认禁止进入 prompt/RAG/长期记忆；例外需 capability + 脱敏裁剪 + 事件化审计/计量 + 可撤销，且仅最小窗口使用。
- 可追溯：引用需在 receipt/audit 记录 object_ref/snapshot_ref 或摘要指纹，并贯通 `trace_context`。
- 失败与降级：疑似注入/越权 → fail-closed，返回 `reason_code`；必要时走“需要协助”。

### ADR-064 PII/合规数据处理冻结
**状态**：已冻结（识别方式、处理边界与导出门禁已确认）

**冻结结论（已确认）**
- 识别策略（MVP）：字段级显式标注为主；自动识别为后续增强。
- 处理边界：PII/SENSITIVE 默认不进长期记忆/RAG/prompt；不进对话资产的可共享/可导出形态；落盘遵循 ADR-073（默认 receipt+引用，敏感仅摘要/指纹）。
- 导出门禁：包含 PII/SENSITIVE 的导出必须 capability 校验 + 高风险审计 + kill-switch 约束 + `reason_code`。
- 日志/追踪/导出链路必须 redaction。
- 生命周期：PII/SENSITIVE 默认更短保留期；到期清理/用户删除必须可审计。

### ADR-065 Kill-switch（全局/租户/能力级）冻结
**状态**：已冻结

**冻结结论（已确认）**
- kill-switch 为强制覆盖层：优先级高于任何 feature flag。
- 命中即 fail-closed：阻断出站/副作用/导出等高风险动作，并回 `reason_code`；写入高风险审计。
- 必须可作用于：Egress/Side-effect/Export/特定能力（capability）等。

### ADR-070 Remote Agent 调用语义冻结
**状态**：已冻结（统一出站治理抽象已确认）

**冻结结论（已确认）**
- 统一抽象：Remote Agent/MCP/Connector/Third-party API/LLM 调用统一走 **Egress/Side-effect Gateway + receipt + 审计/计量事件**。
  - Egress Gateway：鉴权/凭证注入/kill-switch/超时重试/脱敏/trace。
  - Side-effect Gateway：副作用严格子集；强制 `idempotency_key` 与更高审计。
- 同步/异步：>5s 或可能重试默认异步作业化；明确可 5s 内完成且无需重试可同步。
- 流式：允许流式推送但必须可中断；中断后回写 receipt 状态与 `reason_code`。
- 超时/重试/幂等：默认 at-least-once + 幂等；副作用必须 Side-effect Gateway + `idempotency_key`；`idempotency_key` 以主账号域生效，去重窗口与副作用类型绑定；最终事实以 receipt/audit 为准。
- receipt 作为唯一事实回执：包含租户、actor、target_ref、status、`reason_code`、`trace_context`；副作用含 `idempotency_key`；含成本/计量引用。

### ADR-071 MCP Host/Client 角色冻结
**状态**：已冻结（MVP 仅消费外部 MCP Server，不对外提供 MCP Server）

**冻结结论（已确认）**
- 平台作为 MCP Host（含 MCP Client），以消费外部 MCP Servers/Tools 为主；MVP 不对外提供 MCP Server。
- MCP 配置与 Secrets 以 `master_account_id` 隔离；仅存 ref 不存明文；支持按工作流/订阅白名单可用 tool。
- 所有 MCP tool 调用受 ADR-070/065：走 Egress/Side-effect + receipt + 审计/计量。
- 工具输出 untrusted，进入 prompt 前净化裁剪（ADR-063）。

### ADR-072 Connector 执行形态冻结
**状态**：已冻结（MVP 只承诺“平台内置 + 远程托管”，第三方代码托管为后续增强）

**冻结结论（已确认）**
- 统一目标：Connector 只是“能力接入形态”，治理与证据链一律走 ADR-070/062/086（Egress/Side-effect + receipt + 审计/计量 + reason_code）。
- Connector 三形态（冻结边界）：
  1) **内置 Connector（平台代码）**：由平台维护与发布，运行在执行面（worker/agent-bridge）受控环境。
  2) **远程 Connector（对方环境）**：平台以 HTTP/MCP/Remote Agent 方式调用，对方在自己的环境运行。
  3) **托管 Connector（第三方代码上传到平台运行）**：MVP 不承诺；后续若做，必须满足供应链安全（签名/可信发布者/依赖审计）与更强隔离（sandbox/资源配额/网络 egress allowlist/审计）。
- 安全与隔离：
  - 内置 Connector：视为平台受信代码，但仍必须经过 capability/kill-switch/脱敏/审计门禁。
  - 远程 Connector：视为不可信边界；返回内容标记 untrusted（ADR-063），出站调用走 Egress/Side-effect。
- 版本与可用性：
  - 内置 Connector：随平台发布；变更需经过接口契约/变更审查（ADR-085）。
  - 远程 Connector：以目标端 SLA 为准；平台侧必须可熔断/降级/切换并通过 receipt 呈现（ADR-081）。

### ADR-073 工具调用结果存储冻结
**状态**：已冻结（落盘策略与边界已确认）

**冻结结论（已确认）**
- 默认不落盘原始 tool output；控制面仅落盘 receipt + 引用（object_ref/snapshot_ref）。
- 显式开启落盘（仅非敏感）必须声明：TTL/可检索策略/共享与导出策略。
- SENSITIVE：禁止进入对话资产；仅允许受控摘要/指纹；原文回放仅作为后续增强（受控对象存储 + 权限 + 短 TTL + 高风险审计）。
- 流式/中间态默认不落盘，仅保留最终 receipt 与必要引用。

---

## B. 身份、权限、会话与服务鉴权（ADR-066～069）

### ADR-066 身份源与登录形态冻结
**状态**：已冻结（与 IA PRD 的 MVP 规则口径一致）

**冻结结论（已确认）**
- 身份源（MVP）：平台自有账号体系；员工账号必须具备唯一 `login_identifier`（MVP 默认邮箱；可扩展手机号/工号/外部 IdP subject）。
- 登录主路径（MVP）：`login_identifier` + 密码。
  - 批量入职：支持批量导入；管理员下发临时密码。
  - 首次登录：必须修改密码后进入工作台（对齐 IA PRD R12）。
  - 忘记密码：不提供员工自助找回；需管理员重置临时密码（对齐 IA PRD R16）。
- 安全要求（MVP，保持 PRD 口径）：密码长度 ≥8；会话 7 天滑动过期；30 天强制重新验证；10 分钟内连续错 5 次锁 15 分钟（对齐 IA PRD R11）。
- 密码基线增强（不改变 MVP 硬门槛）：
  - 必须允许更长口令（建议最大长度至少 64），支持空格与 Unicode，鼓励 passphrase。
  - 建议默认更强最小长度（如 ≥15）作为可配置项（单因子场景）；但不得强制复杂度组合规则（避免适得其反）。
  - 必须拒绝常见弱密码；可选增强：拒绝已泄漏密码（后续可接泄漏库/安全服务）。
- 执行面边界：登录态映射为控制面会话；执行面仅信任 Ticket（短 TTL），不持有用户会话。
- 执行面边界：登录态映射为控制面会话；执行面仅信任 Ticket（短 TTL），不持有用户会话。

### ADR-067 主账号/子账号/员工账号权限模型冻结
**状态**：已冻结（控制面 RBAC 主路径 + 条件约束；执行面 capability 强制）

**冻结结论（已确认）**
- 控制面：RBAC 为主（角色→权限集合），条件约束扩展（高风险/敏感/跨范围门禁）。
- 三层账号边界：
  - 主账号：组织级策略/管理（订阅、授权分发、安全审计、全局开关）。
  - 子账号：资源范围与资产归属；默认跨子账号不可见/不可操作。
  - 员工账号：自然人主体；权限=当前子账号角色 + 主账号授予组织级角色。
- MVP 预置角色（最小闭环）：Org Admin / Security Admin / Sub-Account Admin / Member（后续可扩展）。
- 默认最小授权；跨子账号访问必须显式授权且审计升级。
- 强制不变量：UI 隐藏不等于授权；服务端必须做 PDP/PEP 校验。
- 证据权限一致性：能看到的证据必须具备来源权限（对齐 IA PRD R22）。
- 执行面不得做权限判定：仅接受控制面签发短期授权（capability/Ticket），关键系统调用点强制校验。

### ADR-068 服务到服务鉴权冻结
**状态**：已冻结（北南向会话鉴权 + 东西向服务身份鉴权；执行面仅信任 Ticket）

**冻结结论（已确认）**
- 北南向：Client→Gateway→控制面使用会话鉴权；Gateway 不替代授权判定；后端写/敏感读强制 PDP/PEP。
- 执行面→控制面：必须携带一次性/短 TTL Ticket（含 audience/expiry/`master_account_id`/scope/可选 sub_account_id/actor_ref），控制面校验签名/有效期/audience；撤销/风控/超限命中 fail-closed + `reason_code`。
- Ticket 抗重放（最小不变量）：
  - WS Ticket 默认一次性消费（消费即作废），必须携带 `jti`/nonce 并在执行面校验时记录消费；重放必须拒绝并可审计。
  - capability token 默认短 TTL，并建议携带 `jti`；执行面校验时记录允许/拒绝事件并可审计。
  - 时钟偏差：允许小范围 skew（可配置），超过阈值拒绝并返回 `reason_code`。
  - 撤销快速失效：撤销命中必须 fail-closed；缓存污染防护（禁止长时间缓存校验结果；校验应绑定短 TTL + 版本号/撤销水位）。
- 东西向：内部服务间必须有服务身份鉴权（MVP 主路径：服务签名/JWT + audience 校验）；mTLS 作为后续增强（通道安全 + 应用层身份）。
- 观测：边界统一透传 `trace_context`；拒绝失败可解释 `reason_code`；身份相关拒绝为高风险审计。

### ADR-069 Session 与 WebSocket 身份续期冻结
**状态**：已冻结（续期机制、拒绝语义与前端 UX 已确认）

**冻结结论（已确认）**
- WS 建连：Client 先取一次性/短 TTL WS Ticket；握手携带 Ticket；服务端校验后建连。
- WS 存续：定期续租（re-auth）+ 断线重连；续租需刷新 Ticket 并发送校验。
- idle timeout（最小不变量）：空闲超时必须存在（如 30~60 分钟可配置）；超时后必须 re-auth 或断开连接，并返回可机读 `reason_code`。
- 风险事件 re-auth（最小不变量）：密码变更/权限提升/设备风险命中/异常登录等高风险事件命中时，必须触发重新认证；续租失败需返回可机读 `reason_code`（例如 auth.reauth_required）。
- 失效语义：会话失效/Ticket 过期撤销/风控超限/kill-switch/权限收回 → 拒绝续期并主动断开；返回 `reason_code` 并记高风险审计。
- 并发登录：可配置；MVP 默认宽松；命中策略可回收旧连接并返回 `reason_code`（如 concurrent_session_evicted）。
- 在途语义：WS 断开不默认终止进程；若进程依赖交互无法继续 → 进入 [TERM-WS-010] 需要协助（Suspended）。

---

## C. 数据库迁移、配置中心与运行期降级（ADR-074/080/081）

### ADR-074 数据库迁移与版本治理冻结
**状态**：已冻结（expand/contract + 回滚语义 + 协议/事件版本闸门已确认）

**冻结结论（已确认）**
- schema migration 仅控制面执行；执行面/worker/外部接入不得直接改 schema。
- 发布主路径：expand/contract 两阶段（向后兼容→应用切换→清理旧字段/索引）。
- 回滚：MVP 默认应用回滚优先、数据前向兼容；不依赖 down-migration；破坏性变更仅能在 contract 独立发布并设观测窗口。
- 版本闸门：影响对外/跨进程契约必须同步启用兼容策略（OpenAPI/AsyncAPI 为 SSOT；receipt/audit/metering 优先 additive；不兼容通过新版本字段/新事件版本）。
- 混合版本：若多发布单元不同步升级，迁移与契约必须保证混合版本可运行；否则发布门禁强制同升同降。

### ADR-080 配置与特性开关冻结（Configuration Center / Feature Flags）
**状态**：已冻结（配置 SSOT、作用域与审计口径已确认）

**冻结结论（已确认）**
- SSOT：运行期开关/策略配置以控制面配置中心为唯一 SSOT；禁止服务本地长期“暗开关”。
- 作用域：支持环境/主账号/灰度百分比/能力（capability/出站目标）分层；MVP 至少覆盖环境+主账号。
- 审计：配置变更 append-only（高风险审计），记录 actor/scope/old/new/time/`reason_code`/`trace_context`。
- 优先级：kill-switch 高于任何 feature flag。
- 下发一致性：控制面签发 Ticket/能力令牌时下发策略快照/版本号；执行面仅基于快照执行。

### ADR-081 运行期降级策略冻结
**状态**：已冻结（通道降级、回放补拉与外部依赖切换口径已确认）

**冻结结论（已确认）**
- 通道：主路径 WebSocket；不可用时允许降级 SSE/HTTP 长轮询；前端需可解释呈现差异。
- 回放/补拉：断线/重连/通道切换时按 `trace_context`/游标补拉关键事件，恢复一致状态；失败需 `reason_code`。
- 外部依赖：provider/Remote Agent 故障时副作用优先 fail-closed；读类可控重试或切换（由控制面策略决定）；切换/熔断可审计可计量并通过 receipt 体现。
- 用户提示：所有降级/切换/熔断必须统一卡片呈现（对齐 ADR-087）。

---

## D. 检索与缓存（ADR-075～076）

### ADR-075 索引与检索体系冻结
**状态**：已冻结（MVP 主路径 pgvector；多租户隔离与成本模型口径已确认）

**冻结结论（已确认）**
- 主路径（MVP）：Postgres + pgvector。
- 实现映射：fullstack-architecture.md 中的 “Vector DB（V）” 在 MVP 默认实现为 Postgres（pgvector）；独立向量库仅作为 Adapter 演进选项，不作为 MVP 必选依赖。
- 多租户隔离：embedding/索引表含 `master_account_id`（可叠加 sub_account_id/scope）；检索必须先权限/范围判定再向量召回（不能只靠召回后过滤）。
- MVP：向量召回 + 结构化过滤闭环；重排为后续增强。
- 演进：预留 VectorStore Adapter；达到规模阈值再引入独立向量库。
- 审计：检索请求/返回可追溯（trace/query_ref/index_ref/topk/filter 摘要）并可计量。

### ADR-076 缓存一致性冻结
**状态**：已冻结（一致性语义、缓存边界与失效策略已确认）

**冻结结论（已确认）**
- Redis 边界：仅会话/限流/回放缓冲/队列/短期状态/幂等保护；不得作为业务事实来源。
- SoT：关键写/关键读一致性以 Postgres 为准；可审计/可回放/可对账事实必须落 Postgres（或派生事件/聚合）。
- 一致性三档：强一致（权限/归属/导出门禁/receipt/audit/metering）/最终一致（低风险 UI 状态）/会话一致（WS 推送与回放）。
- 失效优先：先写 DB→再失效缓存；默认 TTL + invalidation；禁止永不过期缓存作为唯一正确性。
- 幂等/回放：副作用必须 `idempotency_key`；Redis 仅短期去重窗口；断档回退 DB/事件补拉。
- 并发写：版本号/ETag 乐观并发为主；冲突返回 `conflict.version_mismatch`；分布式锁仅优化。
- Redis key：必须包含 `master_account_id`（必要时 sub_account_id/scope）；TTL 可控；删除/解绑等事件触发 key 清理。

---

## E. 错误语义与工作台降级体验（ADR-086～087）

### ADR-086 错误码与 reason_code 体系冻结
**状态**：已冻结（分类口径、命名规范与跨边界承载已确认）

**冻结结论（已确认）**
- 目标：失败/阻断可归因、可机读、可追溯；HTTP/WS/异步/出站一致表达。
- 结构：`reason_class`（低基数）+ `reason_code`（稳定枚举：`reason_class.specific_code`）+ `trace_context`（必填）+ 可选 `receipt_ref`/`action_hints`/`retryable`。
- 演进：`reason_class` 固定集合；`reason_code` 向后兼容（不改语义）；新增需登记字典（文案 key/action_hints/retryable/审计等级）。
- 承载：HTTP/WS/异步/receipt/审计必须可携带或关联 reason_code。
- HTTP 错误体（统一外壳）：控制面 HTTP 采用 Problem Details 风格作为统一错误外壳（稳定字段：type/title/status/detail/instance），并在扩展字段中承载 `reason_code`/`reason_class`/`trace_context`/可选 `receipt_ref`/`action_hints`/`retryable`；WS/异步保持现有语义不变。
- MVP 最小覆盖：permission/quota/risk/revoked/kill_switch/external_dependency/validation/conflict/system（含示例枚举）。

### ADR-087 权限失败与降级 UX 冻结
**状态**：已冻结（统一回执语义 + 统一前端卡片形态；与“需要协助”协同）

**冻结结论（已确认）**
- 统一原则：所有不可继续执行阻断必须以可机读回执表达（`reason_code`/`reason_class`/`trace_context`/可选 receipt_ref/action_hints），禁止静默失败。
- 统一卡片形态：
  1) 明确拒绝（不可补救）：缺 capability/权限不足/永久风控/kill-switch。
  2) 可补救阻断：需要 re-auth、切换子账号等；提供单一主 CTA。
  3) [TERM-WS-010] 需要协助：因必须用户输入/授权/确认无法继续（Suspended 强绑定）。
- 约束：权限失败/风控/kill-switch 不自动转“需要协助”，除非存在明确可补救动作与控制面流程。
- 降级：副作用 fail-closed + 幂等；WS 断连不默认终止进程，交互依赖进入需要协助。
- 审计：权限拒绝/风控/kill-switch/敏感导出拒绝等为高风险审计；前端原因可追溯到 reason_code/trace_context。

---

## F. 备份与灾备（ADR-077）

### ADR-077 备份与灾备冻结
**状态**：已冻结（MVP 单区域高可用 + 可恢复为主；跨区域为后续增强）

**冻结结论（已确认）**
- MVP 交付形态：**单区域（Region）+ 多可用区（Zone）高可用**；不承诺跨区域 active-active。
- 数据对象与主路径：
  - Postgres：启用 **PITR（Point-in-Time Recovery）** + 定期快照；作为所有关键事实的恢复基准。
  - Redis：不作为事实来源；仅需基础备份（或不备份）以支持快速恢复；故障可重建。
  - 对象存储（导出文件/大对象/回放原文若未来启用）：开启版本化/生命周期；与 `master_account_id` 隔离。
- RPO/RTO（MVP 冻结口径，内部目标）：
  - Postgres：RPO ≤ 15 分钟（依赖 WAL/PITR 配置）；RTO ≤ 4 小时（含回滚/恢复/验证/切流）。
  - 关键前台能力（工作台登录/会话/进程恢复）：RTO 目标优先于非关键链路（如历史导出重建）。
- 合规与地域：
  - 备份数据默认与主数据同 Region/同合规域存放；跨境/跨域复制默认关闭。
  - “China-led + Regionized delivery”：不同区域/合规域独立交付与独立备份；跨域 DR 作为后续专项。
- 演练与证据：
  - 备份链路日常验证（强制）：WAL 归档健康监控、备份完整性校验、备份作业自动化与失败告警；与 RPO/RTO 目标绑定。
  - 至少月度执行一次“恢复演练”（抽样租户/抽样表/抽样导出对象），记录结果与 `trace_context`/审计事件关联。
  - 恢复/演练属于高风险操作，必须写入高风险审计并可追溯。

---

## G. 可靠性与发布工程（ADR-078～079）

### ADR-078 SLO/SLA 冻结
**状态**：已冻结（MVP 关键链路 SLO 与观测口径已确认；不等价于对外 SLA 承诺）

**冻结结论（已确认）**
- 原则：先冻结“关键链路 + 统计口径 + 追踪维度”，再逐步把数值目标产品化。
- Error Budget Policy（最小闭环）：每条关键 SLO 必须映射 error budget；灰度/发布门禁（ADR-079）必须参考 burn rate/预算消耗收敛。
- MVP 关键链路（必须有 SLO Dashboard）：
  1) 工作台连接与交互：WS 建连成功率、续租成功率、消息投递延迟（端到端）。
  2) 任务/进程执行：进程成功率、失败分类（reason_class 分布）、P95 完成时延。
  3) 出站/副作用：Egress 成功率、Side-effect 幂等冲突率、receipt 完整率。
  4) 导出：导出提交成功率、P95 完成时延、失败分类。
  5) 回放/补拉：重连补拉成功率、断档率。
- 统计口径：必须以 `master_account_id` 为第一维度聚合；并提供环境/版本/区域等维度切片（对齐 ADR-083）。

### ADR-079 灰度发布与回滚冻结
**状态**：已冻结（四类对象统一灰度与回滚语义已确认）

**冻结结论（已确认）**
- 统一对象：
  1) 网关（Gateway）
  2) 控制面（platform-core）
  3) 执行面（agent-bridge/worker）
  4) 规则/门禁（Guardrail/PEP：策略配置、capability 模板、kill-switch）
- 灰度主路径：按环境→按 `master_account_id` 白名单→按百分比（渐进），由配置中心/Feature Flags 作为 SSOT（ADR-080）。
- 回滚主路径：
  - 首选“配置回滚/开关回退”（最小风险）；
  - 其次“应用回滚”（与 ADR-074 的前向兼容约束一致）；
  - 最后“kill-switch 强制止血”（ADR-065）。
- 一致性约束：
  - 若任一对象升级会影响对外契约/事件/receipt，必须先保证向后兼容（ADR-074/085），并确保混合版本可运行。
  - 灰度与回滚动作必须写入高风险审计，并可在 Dashboard 上被观察到（对齐 ADR-082/083）。

---

## H. 观测、日志与成本（ADR-082～084）

### ADR-082 日志分层与采样冻结
**状态**：已冻结（结构化日志最小字段集 + 采样与敏感红线已确认）

**冻结结论（已确认）**
- 分层：access log（网关）/app log（服务）/job log（worker）/audit&metering（证据事件）。
- 结构化最小字段：`trace_context`、service、env、region、actor_ref（若有）、object_ref（若有）、`reason_code`（失败时）。
- `master_account_id` 规则：对已鉴权且已绑定租户上下文的请求必填；仅匿名/未鉴权入口可为空。审计/计量事件中 `master_account_id` 必填不例外。
- 采样策略：
  - 成功路径可采样；失败/阻断/高风险事件不得采样（必须全量）。
  - 采样决策需要可配置并可审计（与 ADR-080 联动）。
- 敏感红线：所有日志必须 redaction；Secrets/PII/SENSITIVE 不得落日志明文（对齐 ADR-059/064）。

### ADR-083 指标与追踪命名规范冻结
**状态**：已冻结（低基数 + 主账号域优先 + 关键链路最小 Dashboard 集合已确认）

**冻结结论（已确认）**
- 命名与维度：以“主账号域（master_account）”为第一维度；避免高基数（禁止把 object_id、query 文本等作为维度）。
- 关键链路最小 Dashboard：WS/进程/出站/导出/回放 + 错误分布（reason_class/reason_code）+ 资源消耗。
- 追踪：端到端 trace 必须贯通 gateway→control-plane→execution-plane→egress，并以 `trace_context` 关联 receipt/audit。

### ADR-084 成本归因冻结
**状态**：已冻结（成本事件化 + 主账号对账口径已确认）

**冻结结论（已确认）**
- 成本项：LLM token、出站流量/调用次数、对象存储、队列与 worker 计算资源等。
- 归因口径：所有可计量成本必须在执行/出站/导出等环节生成 metering 事件，并至少包含 `master_account_id`、capability_ref、receipt_ref、用量与计费单位。
- 对账：支持按主账号聚合出月度/周期对账报表；与订阅/额度（产品侧）对齐。

---

## I. API 与协议（ADR-085）

### ADR-085 OpenAPI/AsyncAPI SSOT 冻结
**状态**：已冻结（契约为 SSOT + 变更审查门闸已确认）

**冻结结论（已确认）**
- SSOT：控制面 HTTP API 以 OpenAPI 为 SSOT；事件流/回执等异步契约以 AsyncAPI（或等价 schema）为 SSOT。
- 产物：允许自动生成 SDK/Client（workspace-web/agent-bridge/internal），但生成物不得反向成为 SSOT。
- 变更门闸：任何破坏性变更必须走“新增版本/向后兼容”路径（与 ADR-074 联动），并在灰度/回滚链路可控（ADR-079）。

---

## J. 部署拓扑与云厂商策略（ADR-088～090）

### ADR-088 多区域部署拓扑冻结
**状态**：已冻结（MVP 单区域多可用区；区域化交付为演进方向）

**冻结结论（已确认）**
- MVP：单 Region 多 Zone（active-standby/托管 HA 组件）；不做跨 Region active-active。
- 区域化：以 Region 为隔离边界（数据/审计/计量/对象存储/队列均不跨 Region 共享），按客户选择部署区域。
- 切流：跨 Region 切流属于灾备/迁移动作，必须审计并通过 runbook 执行。

### ADR-089 对象存储/消息队列/缓存的云替换层冻结
**状态**：已冻结（GCP 优先但提供可替换抽象边界）

**冻结结论（已确认）**
- GCP 优先映射：对象存储=GCS；消息队列=Pub/Sub；缓存=Memorystore/Redis。
- 可替换边界：通过 Adapter 抽象（S3/Kafka/Redis 等）替换底座，不改变上层“receipt/audit/metering/reason_code”语义与租户隔离规则。
- 约束：替换不得破坏审计证据链、幂等语义与数据保留策略。

### ADR-090 国内合规交付形态冻结
**状态**：已冻结（不改变核心域模型；差异收敛在基础设施与交付形态）

**冻结结论（已确认）**
- 交付形态：私有化/本地云/混合云作为合规选项；Regionized delivery 与海外版本保持同一核心域模型与术语。
- 差异点：基础设施替换（对象存储/队列/缓存/观测）、身份接入（可选）、网络与数据出境限制。
- 不变量：租户隔离、审计证据链、出站治理与 kill-switch 语义保持一致。

---

## K. 本地开发与工程化（ADR-091～092）

### ADR-091 本地开发一键启动冻结
**状态**：已冻结（最小依赖、种子数据与 CI 一致性已确认）

**冻结结论（已确认）**
- 主路径：docker/colima 一键启动（含 Postgres/Redis/必要网关）；最小依赖可在 macOS 复现。
- 种子数据：提供最小租户/账号/示例工作流/示例进程数据，确保新成员 30 分钟内可跑通关键链路。
- CI 一致性：本地与 CI 使用同一 compose/同一迁移脚本；禁止“只在 CI 能跑”的隐式依赖。

### ADR-092 Monorepo 边界与发布单元冻结
**状态**：已冻结（发布耦合度与版本号策略已确认）

**冻结结论（已确认）**
- 发布单元：workspace-web / platform-core / agent-bridge（含 worker）为三个主要发布单元。
- 耦合策略：
  - 协议/契约向后兼容（ADR-074/085）保证混合版本可运行；
  - 若出现不可避免的强耦合变更，必须在发布门禁中强制同升同降，并明确回滚路径。
- 版本标识：每个发布单元独立版本号 + 统一 build metadata（git sha / build id），用于追踪问题与回滚。

---

## L. 数据生命周期与保留清理（ADR-093）

### ADR-093 数据保留与清理冻结
**状态**：已冻结（对象清单、保留策略表达与清理审计口径已确认；默认期限可配置）

**冻结结论（已确认）**
- 统一目标：把“保留/清理”从实现细节提升为**可配置的系统不变量**，并与审计/计量/导出/合规策略一致。
- 与 ADR-037/038 的关系：删除/硬删窗口与 SLA 以 ADR-037 为准；对象存储 Lifecycle 与前者一致口径，以 ADR-038 为准；ADR-093 仅定义全域框架（对象清单/retention_policy 表达/审计/索引跟随）。
- 对象清单（必须覆盖）：
  - 控制面事实：对话资产、工作流实例、订阅实例、授权分发/额度、receipt、audit、metering。
  - 执行面派生：进程事件/回放片段、工具调用引用（snapshot_ref）、向量索引/embedding。
  - 文件类：导出文件、附件/大对象（若启用对象存储）。
  - 观测类：日志、指标与 trace（不含敏感明文）。
- 表达方式（Policy-as-config）：
  - 每类对象必须有 `retention_policy`（保留期/是否可检索/是否可导出/是否可共享/清理方式）。
  - 作用域支持：环境/主账号/子账号（可选）；敏感级别（PII/SENSITIVE）可覆盖默认策略（与 ADR-064 联动）。
- 默认原则（不变量）：
  - legal hold 扩展位：对象允许被标记 `legal_hold=true`（或等价语义）；命中时到期清理与硬删任务必须 fail-closed，并形成高风险审计（为后续合规/取证保全预留语义）。
  - SENSITIVE/PII 更短保留、默认不可检索/不可导出（除非 capability + 高风险审计）。
  - tool output 原文默认不落盘（ADR-073）；若落盘必须绑定 TTL，并可被一键清理。
  - 向量索引的生命周期必须与源对象一致（删除/到期清理必须触发索引清理）。
- 清理语义：
  - 支持到期自动清理；支持管理员发起“按主账号/按子账号/按对象类型”的主动清理。
  - 清理为高风险操作：必须写入审计事件（包含范围、对象数、执行结果、trace_context）。
- 兼容与复盘：
  - 清理不会破坏审计证据链：审计事件本身可单独配置更长保留；被清理对象以“引用断开/不可访问”语义呈现，并提供 reason_code（如 `data.retention_expired`）。
  - SENSITIVE/PII 更短保留、默认不可检索/不可导出（除非 capability + 高风险审计）。
  - tool output 原文默认不落盘（ADR-073）；若落盘必须绑定 TTL，并可被一键清理。
  - 向量索引的生命周期必须与源对象一致（删除/到期清理必须触发索引清理）。
- 清理语义：
  - 支持到期自动清理；支持管理员发起“按主账号/按子账号/按对象类型”的主动清理。
  - 清理为高风险操作：必须写入审计事件（包含范围、对象数、执行结果、trace_context）。
- 兼容与复盘：
  - 清理不会破坏审计证据链：审计事件本身可单独配置更长保留；被清理对象以“引用断开/不可访问”语义呈现，并提供 reason_code（如 `data.retention_expired`）。

---

## M. 运维闭环与应急（ADR-094）

### ADR-094 运维闭环（Runbook/告警/升级）冻结
**状态**：已冻结（最小 Runbook、告警分级与应急动作口径已确认）

**冻结结论（已确认）**
- 最小 Runbook（MVP 必须具备）：
  - 核心告警与阈值（WS 可用性/进程失败率/出站失败率/导出积压/队列堆积/DB/Redis 健康）。
  - burn-rate 多窗口告警（最小闭环）：对 ADR-078 的关键 SLO 至少覆盖 2~3 条（如 WS 可用性、进程失败率、出站失败率），采用快窗/慢窗多窗口 burn-rate 组合告警，减少噪音与漏报。
  - 标准处置步骤：定位→止血（kill-switch/回滚）→恢复（扩容/重启/切流）→复盘。
  - 变更与发布：灰度/回滚/kill-switch 的操作手册与审批门禁（对齐 ADR-079/065）。
  - 标准处置步骤：定位→止血（kill-switch/回滚）→恢复（扩容/重启/切流）→复盘。
  - 变更与发布：灰度/回滚/kill-switch 的操作手册与审批门禁（对齐 ADR-079/065）。
- 告警分级（MVP 口径）：P0（全局不可用/数据风险）/P1（关键链路大面积受损）/P2（局部或可降级）/P3（提醒）。
- 应急动作收口：
  - 所有止血动作（kill-switch、策略回滚、强制降级）必须可审计、可追溯（trace_context/actor）。
  - 恢复动作（DB restore、队列清理、重放/补拉）必须有演练记录与权限门禁。
- 复盘与度量：
  - 事故必须形成事件化记录（时间线、影响范围、根因、改进项），并与审计/指标/trace 关联。
  - 至少月度演练一次“恢复/回滚/kill-switch”，验证 Runbook 可执行。

