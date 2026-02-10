# 技术设计文档模板（Tech Design Template）
文档版本：v0.3（Draft）  
最后修改日期：2026-01-23  
作者：Billow
适用范围：`docs/technical/` 下所有 L2 技术设计与服务/子系统设计文档  
相关文档：
- `docs/docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
文档目的：作为本项目 L2 技术设计文档的统一模板，提供最小且通用的章节骨架与引用约束，用于描述某一能力/服务/子系统的设计（范围、接口、数据、安全、可观测、发布与风险等），并确保与 SSOT 术语口径一致、与文档分层边界一致。

---
## 0. 引用与标注规范（最小）
- **术语引用**：在正文首次出现时写全：`[TERM-XXX] 中文术语`（TERM 来自 `docs/standards/ssot-glossary.md`）。
  - **不要求穷举所有 TERM**；只需要覆盖“本设计文档中实际出现/依赖/定义边界相关”的术语。
- **PRD 需求引用**：当某段设计直接对应某条 PRD 需求时，在句末标注 `（需求：MOD-xxx）`。
  - **不要求列出全部需求**；仅标注“本设计覆盖或受其约束”的需求（尤其是接口、数据、权限、验收相关的需求）。
- **上游技术口径引用**：引用上游技术 SSOT/标准时，使用“文件相对路径 + 章节号”（例如：`docs/technical/.../xxx.md#x.y`）。
- **决策引用**：若存在 ADR，使用 `ADR-xxx`；若本设计引入新决策点，必须新增或更新 ADR 并在此处引用（避免在本文重复写“决策口径”）。
### 0.1 PRD → Architecture Coverage Matrix（Architecture-only）
目的：把 **L1(PRD 规则/验收口径)** 映射到 **L2(架构落点/契约锚点)**，用于责任归属与契约导航。
- 不复述 PRD 细则；不写字段/API/算法细节。
- 只写：Owner、契约锚点、架构层不变量（≤3条）。
锚点限制：
- `L2 Anchor` 只能引用 `docs-map.md` 已注册的 L2 技术 SSOT 文件名。
- 若锚点文档尚未形成对应章节，用 `§TBD` 标注“需要补齐的章节落点”，但不得引入未注册的新文件名。

| PRD Rule | Owner（组件/域） | L2 Anchor（文件名/章节） | Architecture Invariants（≤3条） |
|---|---|---|---|
| <MOD.R#> | <Owner components/domains> | <file.md §section> (+ <file2.md §section>) | 1) <invariant> 2) <invariant> 3) <invariant> |

---

## 1. 背景与范围（Context & Scope）
### 1.1 背景
- <为何需要这项设计；触发点；当前问题>

### 1.2 设计范围（In Scope）
- <本次交付覆盖的能力/模块/接口/数据>

### 1.3 非目标（Out of Scope）
- <明确不做的内容，防止范围漂移>

### 1.4 依赖（Dependencies）
- 上游依赖：<服务/组件/外部系统>
- 下游影响：<会受影响的服务/协议/数据>

---

## 2. 目标与验收（Goals & Acceptance）
### 2.1 目标
- G1：<可度量目标>
- G2：<可度量目标>

### 2.2 非功能目标（NFR）
- 性能：<P95/吞吐/资源上限>
- 可靠性：<SLO/重试/幂等>
- 安全与合规：<隔离/审计/数据分级>

### 2.3 验收口径（可测试）
- AC1：<可验证断言>
- AC2：<可验证断言>

---

## 3. 总体设计（High-level Design）
### 3.1 架构位置与边界
- 所属层级：Control Plane / Execution Plane / Edge / Data Plane
- 边界：<本组件负责什么、不负责什么>

### 3.2 关键不变量（Invariants）
- 隔离上下文：<是否必须携带 master/sub 上下文；缺失如何 fail-closed>
- 策略执行：<是否涉及 policy_check / capability；执行点（PEP）在哪里>
- 副作用与回执：<是否产生外部副作用；是否必须写 receipt；幂等策略>

### 3.3 拓扑与数据流
- 简图（可选 mermaid）：<组件/调用方向>
- 主数据流：<1..N>
- 错误/降级路径：<1..N>

---

## 4. 接口与协议（APIs & Protocols）
### 4.1 对外入口与路由
- HTTP：`/api/v{N}/...`（如适用；遵循项目 API 风格/治理 SSOT）
- WebSocket：`/ws/...`（如适用；事件语义遵循项目交互协议 SSOT）

### 4.2 请求/响应与错误语义
- 错误结构：统一 RFC 7807 + `reason_code`（口径以项目错误/治理 SSOT 为准）
- 幂等：<是否要求 Idempotency-Key；去重窗口；冲突返回>
- 并发控制：<ETag/If-Match 或等价机制>

### 4.3 事件（如适用）
- 事件类型：<列出新增/变更的 event type；其 schema 以项目协议 SSOT 为准>
- 兼容策略：<新增字段/废弃字段/版本协商>

---

## 5. 数据设计（Data Design）
### 5.1 数据对象与持久化
- SoT（权威事实）：<哪些表/对象属于 SoT；引用 data SSOT>
- 派生数据：<索引/聚合/缓存/derived_attributes 等；可重建性>

### 5.2 隔离与访问控制
- Postgres：<RLS/会话变量/SET LOCAL；若不适用说明原因>
- Redis：<key 前缀与隔离域>
- Vector/索引：<hard filter 约束>
- VFS/对象存储：<路径/ACL/Presigned URL>

### 5.3 迁移与兼容
- Schema Migration：<新增/变更/回滚策略>
- 数据回填/重建：<是否需要 backfill；如何重跑>

---

## 6. 安全、策略与治理（Security / Policy / Governance）
### 6.1 鉴权与上下文
- Ticket：<是否 Work Ticket / Job Ticket；校验点；TTL/撤销>
- 主体：<principal 类型；最小必要字段>

### 6.2 策略检查与能力授权
- policy_check：<涉及哪些动作域；PEP 位置>
- capability：<scope 列表；TTL；anti-replay；撤销>

### 6.3 外部出站与副作用
- Egress：<是否出站；allowlist/deny-by-default>
- Side-effect：<是否走 Side-effect Gateway；idempotency_key；补偿语义>

### 6.4 审计/计量/回执
- 审计事件：<何时写入；最小字段>
- 计量事件：<何时写入；口径>
- receipt：<started/succeeded/failed/denied/cancelled；reason_code>

---

## 7. 可观测与运维（Observability & Ops）
### 7.1 Trace 传播
- W3C Trace Context：<HTTP/WS/Async/Outbound>

### 7.2 指标与日志
- 最小指标：<QPS/错误率/P95/队列积压/出站成功率>
- 结构化日志字段：<trace_context/master_account_id/reason_code>

### 7.3 运行手册（Runbook）
- 常见告警与定位路径：<1..N>
- 降级开关：<feature flags/config>

---

## 8. 发布与演进（Rollout & Evolution）
### 8.1 发布计划
- 灰度策略：<按租户/按主账号/按环境>
- 回滚策略：<条件与步骤>

### 8.2 兼容与弃用
- 向后兼容：<策略>
- 弃用计划：<版本窗口与迁移路径>

---

## 9. 风险、权衡与备选方案（Risks & Alternatives）
- 风险清单：<风险 → 影响 → 缓解>
- 关键权衡：<成本/复杂度/时延/一致性>
- 备选方案：<A/B/C；选择理由>

---

## 10. 开放问题（Open Questions）
- Q1：<待确认事项>
- Q2：<待确认事项>

---

## 附录 A：相关变更清单（Checklist）
- 是否新增/更新 ADR：是/否（ADR-xxx）
- 是否变更协议 SSOT：是/否（interaction-protocol / api-architecture）
- 是否变更数据 SSOT：是/否（database-design-and-data-models）
- 是否需要新 reason_code：是/否（需登记于治理文档）
- 是否引入新的 capability scope：是/否（需登记并可撤销）
- 是否新增外部出站目标：是/否（需更新 allowlist/策略）
- 是否新增/变更审计/计量/receipt 口径：是/否

## 附录 B：版本历史（Changelog）
| 版本 | 日期 | 修改人 | 变更摘要 |
|---|---|---|---|
| v0.1 | YYYY-MM-DD | <Name/Team> | 初始版本 |

