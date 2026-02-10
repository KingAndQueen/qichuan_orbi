# PRD: <模块名称 / 功能名称>

> 文档类型：Product Requirements Document (PRD)  
> 适用范围：Orbitaskflow / Work-Agent  
> 目标：清晰描述“做什么、为什么做、做到什么程度算完成”，并可被研发/测试/设计一致理解与追踪。

---

## 0. 文档元信息

- 模块（Module）：<Identity / Workspace / Marketplace / Insights / ...>
- PRD Owner：<姓名>
- 参与方：<PM/Design/Eng/QA/DA>
- 状态（Status）：Draft / Review / Approved / Implementing / Done
- 版本（Version）：v0.1
- 最后更新：YYYY-MM-DD
- 相关文档（Links）：
  - 架构设计：<docs/architecture/...>
  - API 契约：<docs/api/...>
  - 数据模型：<docs/data/...>
  - 埋点/指标口径：<docs/data/metrics.md#...>
  - 测试与验收：<docs/quality/...>

---

## 1. Executive Summary（10 行以内）

- 我们要解决的问题：<一句话>
- 这次交付的范围（In）：<3-5 条>
- 不做的范围（Out）：<3-5 条>
- P0 需求列表：<REQ IDs 列表，例如 WS-001/WS-002/...>
- 成功标准（关键指标/体验口径）：<1-3 条>
- 最大风险与依赖：<1-3 条>

---

## 2. 背景与问题（Problem & Context）

### 2.1 背景
- <业务背景/现状>
- <为什么现在做（时机/驱动）>

### 2.2 用户痛点（Evidence）
- 痛点 1：<描述 + 证据/案例链接>
- 痛点 2：...
- 现有方案不足：<简述>

### 2.3 目标用户与使用场景
- 角色（Roles）：<Admin / Employee / ...>
- 核心场景（Top 3 Use Cases）：
  1) <场景>
  2) <场景>
  3) <场景>

---

## 3. 目标与成功指标（Goals & Success Metrics）

### 3.1 产品目标（Goals）
- G1：<目标>
- G2：...
- 非目标（Non-Goals）：
  - NG1：<明确不追求的目标>
  - NG2：...

### 3.2 成功指标（Metrics）
> 每个指标需要能量化、可观测、可解释。若涉及口径，请链接到 metrics 文档。

- 北极星指标（North Star）：<指标 + 口径链接>
- 关键指标（Key Metrics）：
  - M1：<定义/口径/期望阈值>
  - M2：...
- 护栏指标（Guardrails，例如性能/错误率/成本）：
  - GM1：...
  - GM2：...

---

## 4. 范围（Scope）

### 4.1 In Scope（本期要做）
- S1：...
- S2：...

### 4.2 Out of Scope（明确不做）
- OS1：...
- OS2：...

### 4.3 里程碑（Milestones）
- M0：PRD Approved（YYYY-MM-DD）
- M1：Design Ready（YYYY-MM-DD）
- M2：Dev Complete（YYYY-MM-DD）
- M3：QA Sign-off（YYYY-MM-DD）
- M4：Release（YYYY-MM-DD）

---

## 5. 用户旅程与关键流程（User Journeys & Flows）

> 建议用“从触发到完成”的叙述，避免把细碎 UI 细节散落在这里。UI 细节可放附录 A。

### 5.1 Journey 1：<名称>
- 触发：<When...>
- 用户目标：<I want... so that...>
- 主流程（Happy Path）：
  1) ...
  2) ...
- 关键状态/分支：
  - 分支 A：...
  - 分支 B：...
- 失败与恢复：
  - 网络失败：...
  - 权限不足：...
  - 资源不存在：...

### 5.2 Journey 2：...
### 5.3 Journey 3：...

---

## 6. 需求清单（Requirements Catalog）

> 本节是 PRD 的核心。每条需求必须可验收、可追踪、可实现。  
> 需求 ID 建议：IA-xxx / WS-xxx / MP-xxx / IN-xxx（或你们统一前缀）。

### 6.1 需求总览表（推荐）
| Req ID | 标题 | 优先级 | 适用角色 | 依赖 | 验收入口 |
|---|---|---|---|---|---|
| <WS-001> | <标题> | P0 | <Admin> | <API/Data> | <AC-001> |
| ... | ... | ... | ... | ... | ... |

### 6.2 需求条目模板（逐条写）

#### <REQ-ID>：<需求标题>
- 优先级：P0 / P1 / P2
- 目标用户：<角色>
- 背景/动机：<为什么要有这条需求>
- 描述（What）：
  - <清晰描述行为与边界>
- 业务规则（Rules）：
  - R1：...
  - R2：...
- 交互要点（UI Notes，可选）：
  - <仅写关键点；完整稿放附录 A>
- 数据与埋点（Data/Tracking）：
  - 事件：<event_name>
  - 属性：<properties>
  - 指标口径链接：<docs/data/metrics.md#...>
- 权限与安全（Security/Access）：
  - <权限控制点/审计/敏感操作>
- 性能与约束（NFR，可选）：
  - <延迟/吞吐/一致性/成本>
- 依赖（Dependencies）：
  - API：<链接>
  - 数据模型：<链接>
  - 外部系统：<链接>
- 验收标准（Acceptance Criteria）：
  - AC-<编号>-1（Given/When/Then）：
    - Given：...
    - When：...
    - Then：...
  - AC-<编号>-2：...
- 错误与降级（Failure & Fallback）：
  - E1：<错误码/提示/用户可操作性>
  - E2：...
- 未决问题（Open Questions）：
  - Q1：...

---

## 7. 权限、合规与审计（如适用）

- 权限模型概览：<RBAC/ABAC/租户隔离/资源级权限>
- 敏感操作审计：<需要记录哪些审计日志>
- 合规要求：<数据留存/导出/删除>

---

## 8. 风险、依赖与权衡（Risks & Trade-offs）

- 风险 1：<描述>  
  - 影响：<高/中/低>  
  - 缓解：<方案>
- 风险 2：...
- 权衡点（Trade-offs）：
  - T1：<例如一致性 vs 延迟、功能完备 vs 交付周期>

---

## 9. 测试与发布（Testing & Release）

> 本节只写“验收口径与发布策略”，具体测试用例放 `docs/quality/...`。

- 测试范围：单测 / 集成 / E2E / 回归
- 验收清单入口：<链接到对应 testing.md 或 qa-master 映射>
- 灰度与回滚：
  - 灰度策略：<比例/条件/开关>
  - 回滚策略：<开关/版本/数据迁移注意事项>
- 监控与告警：
  - 关键告警：<错误率/延迟/任务失败率>

---

## 10. 开放问题（Open Questions）

| ID | 问题 | Owner | 截止日期 | 状态 |
|---|---|---|---|---|
| Q-001 | ... | ... | ... | Open |

---

# 附录 A：关键页面与交互细节（可选）

> 放更细的 UI 状态、字段、表单校验、空/错/加载态等。

- 页面 A：...
- 页面 B：...

# 附录 B：数据字段与口径补充（可选）

> 如果本 PRD 引入新实体/字段/指标，先在这里汇总，再链接到 data 文档。

- 新增字段：...
- 新增事件：...

# 附录 C：术语表（Glossary，可选）

| 术语 | 定义 |
|---|---|
| Tenant | ... |
| Workspace | ... |
