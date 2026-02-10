# 对齐冻结清单（D1–D36）

> 说明：本页用于集中展示“历史文档 vs 现 PRD/架构”对齐后的**拍板结果**。所有条目均以“最小实现（MVP）+ 长期可扩展”为原则收口。

## 1. 冻结结论总表

| 编号 | 主题 | 拍板结果（冻结） | 关键不变量 / 影响范围 |
|---|---|---|---|
| D1 | 历史定义 vs 当前定义取舍 | **沿用项目最新定义**（历史仅作参考） | 避免再造术语；以 SSOT/PRD 为准 |
| D2 | Quick Assistant（飞书优先） | **最小接入原则**：MVP 先打通飞书；能力受平台限制；后续扩展钉钉/企微/海外办公软件 | 统一渠道适配层；能力差异通过 capability 显式声明 |
| D3 | PDP/PEP + Policy Check | **统一 policy_check**：关键动作前置校验；不可用 prompt 替代 | 与 RLS、Egress、审批（D29）联动 |
| D4 | Workflow Runtime（运行时） | **MVP 轻量可运行**：工作流编排可执行、可观测；后续可升级 | 运行态对象与状态机归 Core；执行归 Worker |
| D5 | （已在前序对齐中冻结） | **按已对齐版本执行** | —— |
| D6 | 洞察/计量/审计 | **事件化**：audit/metering 作为不变量；可复盘 | 与 Model Router（D15）/Egress+receipt（D8）联动 |
| D7 | 多渠道接入长期架构 | **渠道适配层抽象**：MVP 最小接入，长期可扩展 | 统一协议/事件模型，避免每个渠道一套逻辑 |
| D8 | 外部能力/副作用治理 | **Egress/Side-effect Gateway + receipt** 统一出站治理；provider 支持 proxy_only/delegated | 副作用必须可审计、可追溯、可计量 |
| D9 | 交互面板双模式（LLM vs Workflow） | **确认冻结**（按对齐稿） | 运行态模型与 UI 协议一致 |
| D10 | （按对齐版本冻结） | **确认冻结** | —— |
| D11 | 统一索引 | **SoT=Postgres；索引=派生**；pgvector 可重建；回源二次校验 | 与 D13/D25/D30 强绑定 |
| D12 | 端到端闭环（可追溯） | **确认冻结**：动作→receipt/audit/metering→洞察 | 证据链与 trace_id 一致 |
| D13 | 数据同步/ETL + 权限严格同步 | **确认冻结**：Webhook 优先 + Poll 兜底；append-only change log；ACL 严格同步；无法映射 ACL → 默认 **owner/admin 可见** | 影响 D11 重建、D6 口径、合规与越权风险 |
| D14 | 系统智能体/元智能体落点 | **确认冻结**：Orchestrator 落在 Agent Bridge（Planner+Router）；Core=控制面不变量；Worker=执行 | 避免三边都做一点；保证可替换 |
| D15 | Model Router + 成本/性能计量 | **确认冻结**：LLM 唯一入口；每次调用落 metering_event；provider_id 统一（llm|capability） | embedding 也必须走 Router；预算/额度可控 |
| D16 | 三方管理/资源连接归属 | **确认冻结**：Workspace=连接中心入口与运行态体验；IA=凭据/授权/secrets/撤销/审计；Marketplace=Provider 商品化与工作流绑定；连接 scope 预留 tenant/user | 避免入口混乱与凭据散落 |
| D17 | 知识中心/知识图谱是否必选 | **确认冻结（方案A）**：上下文服务是能力概念；MVP 不绑定知识图谱；对象态+派生检索+回源校验支撑 OAG；图谱 vNext 插拔 | 防止路线变重；对齐 D22/D30 |
| D18 | 架构标准绑定具体技术选型 | **确认冻结**：架构文档用抽象能力名；具体产品名仅出现在 ADR/参考实现；历史具名技术降级为示例或删除 | 防误导“已拍板必选”，提升可替换性 |
| D19 | 用户中心是否独立微服务 | **确认冻结**：MVP 不新增独立“用户中心”微服务；将 Identity & Access 作为 **CoreSvc 内 IA 模块**提供稳定 IA API（登录标识/login_identifier、OAuth、连接凭据、撤销、policy_check/ticket 等），其他模块不得绕过该 API 直接处理凭据/授权；vNext 如需隔离或扩缩容，再拆为独立 Identity Service，但 **API 契约保持兼容** | 避免重复体系；对齐 Ticket/Policy |
| D20 | 计费/支付边界 | **确认冻结**：MVP 只做“可商业化底座”，不集成具体支付通道。MVP=订阅/授权分发/额度（Quota）+ 计量（metering）+ 审计（audit）闭环跑通，并可在 Insights 复盘；支付通道（微信/支付宝/Stripe 等）作为 vNext 插拔，仅在商业化 ADR 选型，不写入架构标准；但一旦接入，必须纳入 receipts/metering/audit 证据链与对账口径。 | 不在标准绑定微信/支付宝 |
| D21 | Ontology 是否一等公民 | **确认冻结（方案A）**：Ontology 仅作对标注释；不引入新术语体系；用现 SSOT 表达 Object/Links/Actions/Scenarios | 避免重定义术语 |
| D22 | RAG → OAG 落点 | **确认冻结**：OAG=对象态+工具/动作闭环；标准链路 `plan→query→propose_action→user_confirm→execute_action` | 强化 grounding 与行动闭环 |
| D23 | Action Framework / Write-back | **确认冻结**：Actions=声明式副作用+可审计执行；规划只产出 action_intent；执行统一走 Egress 并落 receipt；MVP 幂等+重试+receipt 状态机；vNext saga | 与 D8/D6/D29 联动 |
| D24 | Schema Registry / OSDK | **确认冻结**：MVP 不做代码生成；冻结 Schema Registry 思想：对象类型 schema、Provider capabilities schema、UI renderables schema；关键边界校验+版本化 | 支撑 D28 契约与多语言协作 |
| D25 | AIP Control（权限继承） | **确认冻结**：LLM 权限继承不变量；所有 query/grounding 受 RLS/Policy；所有 Action 必经 PEP+Egress+receipt；允许挂接审批/阈值/速率（MVP 占位）；禁用 prompt 代替安全边界 | 安全治理核心 |
| D26 | Scenarios / What-if | **确认冻结（vNext）**：workflow_run 支持 branch_from；派生 run 默认 dry_run（只产 action_intent，不经 Egress）；UI/审计标记；可一键转 live | 为决策推演预留锚点 |
| D27 | 平台叙事收口（对标 Palantir） | **确认冻结**：一句话主张 + 三段式链路；落点：Platform Overview（主张/链路）+ Architecture（组件映射）+ PRD（引用+验收） | 防止对外承诺与对内实现不一致 |
| D28 | 三元输出统一契约 | **确认冻结**：`ExecutionResult(v1){ renderables[], action_intents[], artifacts[] }`；版本化/校验/向后兼容；action_intents 仅声明，执行走 Egress；artifacts 负责平台资产引用追溯 | 对齐 D24/D23/D12 |
| D29 | 审批/阈值/速率最小产品化 | **确认冻结**：`approval_required` obligation + `approval_request` 事件 + `pending→approved/denied/expired`；MVP 覆盖外部写/导出；最小待审批入口 | 防止退化为“只是确认” |
| D30 | 对象态优先的数据模型落点 | **确认冻结**：对象态来自 SoT typed view（object_view JSON，schema 版本化）；可选 object_snapshot（派生可重建）供低延迟；读取遵守权限继承+回源校验 | 防止退回纯 RAG |
| D31 | service account 越权防护 | **确认冻结**：外部读写必须绑定 acting_subject（user_delegated 优先；service_account 仅公共只读或管理员批准写）；写默认 user_confirm + 可选审批；receipt 记录 acting_subject_type | 避免“用户无权但服务账号有权” |

## 2. 新增对齐结论（D32–D36，本轮扫描产出）

> 说明：以下条目来自对历史 PDF（网关/工作流/洞察管道）与 Palantir 报告（Logic Binding / Dynamic Layer）的再次对照扫描，现已完成逐条对齐并**确认冻结**。

| 编号 | 主题 | 历史/对标差异摘要 | 拍板结果（冻结） |
|---|---|---|---|
| D32 | 通用网关层的横切能力缺口（限流/熔断/可观测） | 历史文档把“网关层”明确为：认证鉴权、流量控制（限流/熔断/降级）、系统监控等横切关注点；当前架构里虽有 Nginx + Ticket/Policy/RLS，但对“流量保护/分布式追踪/统一日志指标”未形成冻结级的不变量表述 | **拍板结果：确认冻结（按上述执行）**：网关层横切能力作为系统不变量：1) 入口限流：按 `tenant/actor/route/provider` 维度；拒绝需输出统一 `reason_code` 并可审计（audit/metering 至少其一）。<br>2) 出站韧性：对外 Provider/工具调用必须具备 `timeout/retry/circuit` 语义，并与 D23 幂等/receipt 状态机对齐；关键下游可降级。<br>3) 端到端可观测：`trace_id` 贯穿 WS/Job/receipt/audit/metering；统一结构化日志字段与最小指标集（QPS/错误率/P95/队列积压/出站成功率）。<br>4) 网关治理不取代 policy_check/权限继承（D3/D25）；所有拒绝必须归因（policy/approval/rate_limit/circuit/timeout/upstream）。 |
| D33 | 工作流引擎“自研状态机 vs Temporal/Camunda”占位 | 历史文档将“工作流引擎”视为纯流程控制器，并给出 Temporal/Camunda 作为实现路径；当前我们已收口为 Core 的 workflow_run 状态机 + Worker 执行，但需要补一条明确的“可替换契约/迁移路径”冻结表述 | **拍板结果：确认冻结（按上述执行）**：冻结“Workflow Runtime Adapter（引擎适配器）”为系统不变量：对外固定 workflow 定义/版本、run 状态机、step 事件与 timeout/retry 语义，使运行时实现引擎无关；MVP 用轻量状态机实现；vNext 如引入 Temporal/Camunda 仅替换 Adapter 内部实现，不改变外部 API、事件口径与审计/洞察链路；且任何动作执行仍必须遵循 `action_intent → PEP/Egress → receipt`。 |
| D34 | 洞察的数据管道（事件→聚合→OLAP）是否需要最小占位 | 历史文档对洞察给出“事件总线→流/批处理→OLAP”的演进路线；当前我们冻结了 audit/metering 事件化（D6）但未明确洞察聚合层的存储/查询形态（长期容易变成临时 SQL 拼表）  | **拍板结果：确认冻结（按上述执行）**：洞察采用“事实事件 → 聚合层 → 展示”三层。事实层以 `audit/metering/receipts(+workflow events)` 为唯一来源，append-only 可回放；MVP 聚合层默认落在 Postgres（增量聚合表/物化视图），每个指标必须冻结口径（source_events/filters/time_window/dedupe_key）；vNext 可引入 OLAP 作为派生存储加速，但不改变事实事件与口径定义；聚合由可重跑的 aggregator job 推进（watermark 驱动）。 |
| D35 | "Logic Binding"：AI 输出作为对象属性（而非静态报告） | Palantir 强调把模型输出“绑定”为对象的动态属性；当前我们有 object_view/object_snapshot（D30）但未冻结“派生属性/刷新触发/一致性”规则，容易导致 AI 结果只停留在交付物而无法被后续动作/洞察复用  | **拍板结果：确认冻结（按上述执行）**：冻结“Logic Binding”的最小落点：在 `object_view` 中引入可版本化的 `derived_attributes`（派生属性），用于承载 AI 输出并作为后续动作/洞察的可复用对象态；派生属性必须携带最小 provenance（source_refs/run_id/trace_id/inputs_hash/provider_id/generated_at/refresh_policy）以保证可追溯与可重建；MVP 支持 stale 标记 + on_demand 刷新，vNext 再扩展 on_change/ttl 调度与场景推演（兼容 D26）。 |
| D36 | 证据链/血缘（provenance/lineage）与重建策略的最小冻结 | 历史文档强调监控与可追溯；当前我们有 receipt/audit/metering，但对“对象态/派生索引/洞察聚合”的 lineage 规则仍偏隐含，后续做合规/复盘会缺一条统一口径  | **拍板结果：确认冻结（按上述执行）**：冻结 provenance/lineage 的最小口径：任何派生数据与洞察聚合都必须记录 `{trace_id, source_refs, query_plan_summary, acting_subject, policy_decision, receipts[]}` 并可回溯到事实事件；派生数据（索引/snapshot/derived_attributes/聚合）必须可重建（append-only 事实层 + 可重跑派生/聚合任务），对象派生与洞察聚合必须通过 trace/run/process 形成同一证据链；动作链必须落 receipt 并联动 audit/metering/approval。 |
