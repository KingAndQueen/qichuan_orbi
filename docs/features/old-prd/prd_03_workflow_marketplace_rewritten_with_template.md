# PRD: 工作流市场（Workflow Marketplace）

> 品牌名称：新智流（Orbitaskflow）

---

## 0. 文档元信息

- 模块（Module）：Marketplace
- PRD Owner：<TBD>
- 参与方：<PM/Design/Eng/QA/DA>
- 状态（Status）：Frozen
- 优先级（Priority）：P1
- 版本（Version）：V6.0
- 最后更新：<TBD>
- 关联模块：身份模块（Identity & Access）、智能工作台（Workspace）、数据洞察（Insights）
- 版本说明：V6.0 Asset Lifecycle —— 补全“手动回收”与“增购续费”功能，形成完整的 B2B 资产管理闭环；分配交互保持极简（无搜索）。
- 相关文档（Links）：
  - 架构设计：<docs/architecture/...>
  - API 契约：<docs/api/...>
  - 数据模型：<docs/data/...>
  - 埋点/指标口径：<docs/data/metrics.md#...>
  - 测试与验收：<docs/quality/...>

---

## 1. Executive Summary（10 行以内）

- 我们要解决的问题：构建一个分级可视、闭环驱动的 AI 能力分发中心，解决 B2B 场景下的“能力分发”与“资产管理”。
- 这次交付的范围（In）：
  - 双重视图：主账号视图（采购与管理）+ 员工视图（我的应用 Launchpad）
  - 管理员全量市场浏览（分类导航 + 卡片流 + 席位成本标签）
  - 订阅与分配：购买席位→支付→分配抽屉（对象=子账号/业务组或员工）
  - 资源回收：手动回收 + 可选 30 天不活跃自动回收
  - 订阅管理：增购席位、续费、发票与订单
  - 快速试用：固定策略试用 License，过期自动回收
  - 权限声明清单：订阅前弹窗确认（Networking / File System / Memory / Inter-Agent），默认拒绝未声明系统调用
  - Agent 通信协议：管道机制（Piping）+ manifest.json 声明 Input/Output Schema
- 不做的范围（Out）：<TBD>
- P1 需求列表：MP-001 ~ MP-009（见第 6 章）
- 成功标准（关键体验口径）：
  - 管理员可闭环完成“采购→分配→回收→增购/续费/订单发票”。
  - 员工仅看到已分配 Agent，并可一键进入 Workspace 开启新会话。
  - 订阅前必须展示权限清单；运行时默认拒绝未声明系统调用。
- 最大风险与依赖：
  - 依赖 IA 的子账号/员工体系与授权入口。
  - 依赖计费/订阅与 License 池/分配表的数据模型与一致性。
  - 依赖运行时沙箱与“权限声明→系统调用”强制约束。

---

## 2. 背景与问题（Problem & Context）

### 2.1 背景

- B2B 客户关注的不是 Token 成本，而是“席位/License”的可控采购、分配与回收。
- 初期版本采用“管理员主导（Admin-Driven）”：管理员统一采购、分配及回收席位；员工直接使用已分配资源。

### 2.2 用户痛点（Evidence）

- 管理员：需要全局掌控资源采购、分配与回收，否则成本与权限风险不可控。
- 员工：不需要复杂的市场浏览，仅需要“我能用什么工具”并一键启动。
- 运行时安全：需要在订阅/安装阶段明确权限边界，并在运行期默认拒绝未声明系统调用。

### 2.3 目标用户与使用场景

- 角色（Roles）：Tenant Admin（主账号管理员）、Employee（员工/操作员）
- 核心场景（Top 3 Use Cases）：
  1) 管理员在市场浏览与购买席位，并立即分配给子账号/员工
  2) 员工在“我的应用”看到已分配 Agent，一键进入 Workspace 开启会话
  3) 管理员对已分配席位进行回收/增购/续费，并对 Agent 版本做“安装锁定+手动升级”管理

---

## 3. 目标与成功指标（Goals & Success Metrics）

### 3.1 产品目标（Goals）

- G1：提供分级可视的能力分发中心（Admin 全量市场、Employee 我的应用）。
- G2：形成 B2B 资产管理闭环：购买→分配→回收→增购/续费→订单与发票。
- G3：支持“安装即锁定”的版本快照与“手动升级”的被动更新策略。
- G4：以权限声明清单 + 运行时沙箱隔离实现可控安全边界。
- G5：支持 Agent 间管道式协作，并用 manifest.json 声明 I/O Schema 以便系统编排。

### 3.2 非目标（Non-Goals）

- NG1：<TBD>

### 3.3 成功指标（Metrics）

> 原文仅给出埋点事件；量化指标口径建议后续在 `docs/data/metrics.md` 定义并在此引用。

- 关键漏斗（建议）：market_view → purchase_order → license_assign →（employee 启动会话）
- 关键指标（建议）：
  - 分配成功率 / 回收成功率 / 自动回收触发率
  - 试用转付费（试用 license → 订阅）

---

## 4. 范围（Scope）

### 4.1 In Scope（本期要做）

- 双重视图（Admin / Employee）
- 市场浏览（分类导航 + 卡片流 + 成本标签）
- 订阅与分配（购买席位、支付后弹分配抽屉、身份配置引导）
- 版本快照与升级策略（安装锁定、被动更新、手动升级版本）
- 手动回收 + 可选自动回收（30 天未活跃）
- 订阅管理（增购席位、续费、发票与订单）
- 快速试用（固定策略试用 License，过期自动回收）
- 权限声明清单（订阅前弹窗确认 + 运行时默认拒绝未声明系统调用）
- Agent 通信协议（Piping + manifest.json I/O Schema 声明）
- 数据埋点（第 6 章 + 附录）

### 4.2 Out of Scope（明确不做）

- <TBD>

### 4.3 里程碑（Milestones）

- M0：PRD Approved（TBD）
- M1：Design Ready（TBD）
- M2：Dev Complete（TBD）
- M3：QA Sign-off（TBD）
- M4：Release（TBD）

---

## 5. 用户旅程与关键流程（User Journeys & Flows）

### 5.1 Journey 1：管理员采购与分配（Admin-Driven）

- 触发：管理员进入市场页
- 用户目标：浏览→购买席位→支付→立即分配
- 主流程（Happy Path）：
  1) 进入市场页，左侧职能分类导航（法务/产研/营销/HR），右侧卡片流
  2) 卡片展示：图标、名称、简介、供应商；成本标签（例：[¥ 299/席位/月]）
  3) 点击 [购买席位] → 选择数量 → 支付
  4) 支付成功后自动弹出“资源分配”抽屉
  5) 下拉选择已存在的子账号/业务组（如“法务组”）或员工，确认后扣减可用席位库存并立即生效
  6) 若下拉列表为空或找不到目标，提供跳转链接 [+ 去创建新部门/员工] 到 01-身份管理

### 5.2 Journey 2：管理员回收、自动回收与订阅管理

- 触发：员工离职/转岗/资源优化，或团队扩张续费
- 用户目标：回收权限、释放席位、增购/续费与查看订单发票
- 主流程（Happy Path）：
  1) 在“已分配列表”中，对条目点击 [回收]
  2) 系统立即剥夺权限，席位释放回“可用库存池”，可重新分配
  3) 可配置“若 30 天未活跃，自动回收席位”
  4) 进入 [我的订阅]：增购席位（Add Seats）、续费（Renew）、发票与订单
  5) 版本策略：
     - 安装即锁定（Snapshot on Install）：订阅时锁定该 Agent 当前 Prompt/Workflow 版本快照
     - 被动更新：市场更新不自动覆盖企业已分配实例
     - 手动升级：管理员在订阅管理中点击 [升级版本] 才更新

### 5.3 Journey 3：员工“我的应用”启动会话

- 触发：员工进入“我的应用（My Apps）”
- 用户目标：只看到可用工具，一键启动
- 主流程（Happy Path）：
  1) 网格卡片布局展示已分配给当前员工的所有可用 Agent（类似 Okta/企业微信工作台）
  2) 点击卡片直接跳转至智能工作台（Workspace）并开启新会话
  3) 空状态：未分配任何 Agent 时提示“暂无可用工具，请联系企业管理员分配”

### 5.4 Journey 4：快速试用与权限声明

- 触发：管理员对未订阅 Agent 进行试用或订阅
- 用户目标：清晰理解权限边界并确认
- 主流程（Happy Path）：
  1) 卡片展示 [⚡ 免费试用]，点击后立即生效
  2) 系统在资源分配中获得一个“试用期 License”，到期自动回收
  3) 用户点击 [订阅] 时弹出“权限请求确认框”，列出该 Agent 申请的系统能力：
     - 🌐 Networking（白名单域名）
     - 📂 File System（例：读写 `/project/docs`）
     - 🧠 Memory（读取团队长期记忆库）
     - 🤖 Inter-Agent（调用其他 Agent）
  4) 安全约束：运行时必须沙箱隔离，默认拒绝未声明系统调用

---

## 6. 需求清单（Requirements Catalog）

> 说明：将原文 F3.x 映射为 MP-xxx；保留 Legacy ID 便于对照。

### 6.1 需求总览表

| Req ID | 标题 | 优先级 | 适用角色 | 依赖 | 验收入口 |
|---|---:|---|---|---|---|
| MP-001 | Admin 市场浏览：分类导航 + 卡片流 + 席位成本标签 | P1 | Admin | Marketplace Data | AC-MP-001 |
| MP-002 | 订阅与分配：购买席位→支付→分配抽屉（极简无搜索） | P1 | Admin | Billing/License | AC-MP-002 |
| MP-003 | 版本策略：安装即锁定 + 被动更新 + 手动升级版本 | P1 | Admin | Versioning | AC-MP-003 |
| MP-004 | 回收：手动回收 + 可选 30 天未活跃自动回收 | P1 | Admin | License Allocation | AC-MP-004 |
| MP-005 | 订阅管理：增购席位/续费/发票与订单 | P1 | Admin | Billing/Invoice | AC-MP-005 |
| MP-006 | 快速试用：固定策略试用 License + 到期自动回收 | P1 | Admin | Licensing | AC-MP-006 |
| MP-007 | 权限声明清单：订阅前确认 + 运行时默认拒绝未声明调用 | P1 | Admin | Runtime Sandbox | AC-MP-007 |
| MP-008 | 员工视图“我的应用”：仅展示已分配 Agent，跳转 Workspace 新会话 | P1 | Employee | IA/Workspace | AC-MP-008 |
| MP-009 | Agent 通信协议：Piping + manifest.json 声明 Input/Output Schema | P1 | Admin/Eng | Agent Runtime | AC-MP-009 |

---

### 6.2 需求条目

#### MP-001：全量市场浏览（Admin View）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.1
- 描述（What）：
  - 核心布局：左侧业务职能分类导航（法务、产研、营销、HR），右侧卡片流
  - 卡片信息：仅展示核心决策要素
    - 基础信息：图标、名称、简介、供应商
    - 成本标签：[¥ 299/席位/月]（强调席位成本，非 Token）
- 验收标准：
  - AC-MP-001-1：Given 管理员进入市场页，Then 必须出现分类导航 + 卡片流，并在卡片上展示席位成本标签。

#### MP-002：订阅与分配（Subscription & Assignment）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.2
- 描述（What）：
  - 订阅动作：点击 [购买席位] → 选择数量 → 支付
  - 分配动作（License Allocation）：
    - 支付成功后自动弹出“资源分配”抽屉
    - 分配流程：
      1) 下拉选择已存在的子账号/业务组或员工
      2) 确认分配后系统扣减可用席位库存并立即生效
    - 身份配置引导：若找不到目标，提供 [+ 去创建新部门/员工] 跳转至 01-身份管理
  - 约束：分配交互保持极简（无搜索）
- 验收标准：
  - AC-MP-002-1：Given 支付成功，When 返回市场，Then 自动弹出分配抽屉。
  - AC-MP-002-2：Given 选择对象并确认分配，Then 立即生效且库存扣减正确。

#### MP-003：版本快照策略（Versioning Strategy）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.2.C
- 描述（What）：
  - 安装即锁定（Snapshot on Install）：企业订阅某个 Agent 时锁定该 Agent 当前 Prompt/Workflow 版本快照
  - 被动更新：市场中原 Agent 的更新不自动覆盖企业已分配实例
  - 手动升级：管理员在“订阅管理”中手动点击 [升级版本] 后才升级
- 验收标准：
  - AC-MP-003-1：Given 市场侧 Agent 更新，When 企业已安装实例存在，Then 不应自动覆盖实例版本。
  - AC-MP-003-2：Given 管理员点击 [升级版本]，Then 实例版本才更新。

#### MP-004：回收（License Revocation）与自动回收

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.2（Revocation）
- 描述（What）：
  - 手动回收：在“已分配列表”条目点击 [回收]
  - 结果：立即剥夺权限，席位释放回“可用库存池”，可重新分配
  - 自动回收：可设置“若 30 天未活跃，自动回收席位”
- 验收标准：
  - AC-MP-004-1：Given 管理员回收席位，Then 权限立即撤销且席位回到可用库存。
  - AC-MP-004-2：Given 某分配对象 30 天未活跃且开启自动回收，Then 席位应被自动回收。

#### MP-005：订阅管理（Subscription Management）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.3
- 描述（What）：
  - 入口：市场页顶部 [我的订阅] 标签
  - 功能：
    - 增购席位（Add Seats）
    - 续费（Renew）
    - 发票与订单：查看历史采购记录并下载发票
- 验收标准：
  - AC-MP-005-1：Given 管理员进入 [我的订阅]，Then 必须提供增购/续费/发票订单入口。

#### MP-006：快速试用（Quick Trial）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.4
- 描述（What）：
  - 策略：基于运营配置的固定策略（例：默认 7 天全功能试用）
  - 交互：未订阅卡片显示 [⚡ 免费试用] 按钮
  - 行为：点击后立即生效，自动获得“试用期 License”，到期自动回收
- 验收标准：
  - AC-MP-006-1：Given 点击免费试用，Then 立即获得试用 License；到期后自动回收。

#### MP-007：权限声明清单（Permissions Manifest）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：F3.1.5
- 描述（What）：
  - 订阅前弹出“权限请求确认框”，列出该 Agent 申请的系统能力
  - 权限类型：Networking / File System / Memory / Inter-Agent
  - 安全约束：运行时必须实施沙箱隔离，默认拒绝未声明的系统调用
- 验收标准：
  - AC-MP-007-1：Given 点击订阅，When 弹出确认框，Then 必须展示该 Agent 权限清单。
  - AC-MP-007-2：Given 运行时发起未声明的系统调用，Then 必须默认拒绝。

#### MP-008：员工视图“我的应用”（Employee View / My Apps）

- 优先级：P1
- 目标用户：员工
- Legacy ID：F3.2.1
- 描述（What）：
  - 展示逻辑：仅展示已分配给当前员工的所有可用 Agent
  - 列表样式：网格卡片布局，展示图标与名称（类似 Okta/企业微信工作台）
  - 操作：点击卡片跳转至 Workspace 开启新会话
  - 空状态：未分配时提示“暂无可用工具，请联系企业管理员分配”
- 验收标准：
  - AC-MP-008-1：Given 员工进入 My Apps，Then 仅展示其已分配 Agent；点击可进入 Workspace 新会话。
  - AC-MP-008-2：Given 无分配 Agent，Then 展示规定空状态文案。

#### MP-009：Agent 通信协议（Inter-Agent Communication）

- 优先级：P1
- 目标用户：平台/研发（对外约束为上架规范）
- Legacy ID：3
- 描述（What）：
  - 管道机制（Piping）：允许将一个 Agent 的输出作为另一个 Agent 的输入
    - 场景示例：Research Agent（输出 JSON 报告）→ Report Writer Agent（生成 PDF）
  - 接口声明：所有上架 Agent 必须在 manifest.json 中声明 Input Schema 与 Output Schema，便于系统自动编排
- 验收标准：
  - AC-MP-009-1：Given 一个上架 Agent，Then manifest.json 必须存在并声明 Input/Output Schema。

---

## 7. 权限、合规与审计（如适用）

- 与 IA 的授权/可见性对齐：员工 My Apps 仅展示被分配/被授权内容。
- 权限声明清单与运行时强制：未声明系统调用默认拒绝；需要沙箱隔离与审计支撑。

---

## 8. 风险、依赖与权衡（Risks & Trade-offs）

- 风险 1：License 分配/回收/自动回收涉及库存一致性与并发。
  - 影响：高
  - 缓解：分配/回收幂等；库存校验；审计链路。
- 风险 2：权限清单与运行时行为不一致会造成安全漏洞。
  - 影响：高
  - 缓解：运行时默认拒绝 + 强校验；Schema/Manifest 校验；回归测试。
- 权衡点：
  - 分配交互“无搜索”提升极简，但在大组织场景可用性下降；本期保持原约束。

---

## 9. 测试与发布（Testing & Release）

- 测试范围：单测 / 集成 / E2E / 回归
- 重点 E2E：
  - 购买席位→支付成功→自动弹出分配抽屉→分配到子账号/员工
  - 手动回收→权限撤销→库存回流
  - 自动回收触发（30 天未活跃）
  - 订阅管理：增购/续费/订单发票
  - 免费试用→获得试用 License→到期自动回收
  - 订阅前权限清单弹窗 + 未声明系统调用默认拒绝
  - 员工 My Apps：展示与空状态；点击跳转 Workspace 新会话

---

## 10. 开放问题（Open Questions）

| ID | 问题 | Owner | 截止日期 | 状态 |
|---|---|---|---|---|
| Q-MP-001 | “30 天未活跃”的活跃口径如何定义？（打开/运行/调用/输出） | TBD | TBD | Open |
| Q-MP-002 | [升级版本] 的作用对象：仅新分配实例还是已分配实例整体升级？ | TBD | TBD | Open |
| Q-MP-003 | 权限清单与运行时沙箱的最小实现边界与审计字段口径？ | TBD | TBD | Open |
| Q-MP-004 | Piping 的编排粒度：是否支持多 Agent 串联与错误中断策略？ | TBD | TBD | Open |

---

# 附录 A：数据埋点（Analytics）

- market_view：进入市场页（Admin only）
- license_assign：管理员分配席位
- license_revoke：管理员手动回收席位
- subscription_add：增购席位
- purchase_order：管理员下单采购

# 附录 B：术语表（Glossary）

| 术语 | 定义 |
|---|---|
| Workflow Marketplace | 工作流市场：能力分发与资产管理中心，支持 Admin/Employee 双视图 |
| License / Seat | 席位：以“¥/席位/月”为主要成本单位的订阅资源 |
| License Allocation | 席位分配：将可用席位授权给子账号/业务组或员工 |
| License Revocation | 席位回收：撤销授权并回流到可用库存池 |
| Snapshot on Install | 安装即锁定：订阅时锁定 Agent 版本快照，市场更新不自动覆盖 |
| Permissions Manifest | 权限声明清单：订阅前列出系统能力，运行时默认拒绝未声明调用 |
| Piping | 管道机制：Agent 输出作为另一个 Agent 输入（Unix Pipe 思想） |
| manifest.json | 上架描述文件：声明 Input/Output Schema 以支持系统自动编排 |

