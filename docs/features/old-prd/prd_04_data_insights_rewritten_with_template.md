# PRD: 数据洞察（Data Insights）

> 品牌名称：新智流（Orbitaskflow）

---

## 0. 文档元信息

- 模块（Module）：Insights
- PRD Owner：<TBD>
- 参与方：<PM/Design/Eng/QA/DA>
- 状态（Status）：Frozen
- 优先级（Priority）：P1
- 版本（Version）：V5.7
- 最后更新：<TBD>
- 关联模块：工作流市场（Marketplace）、智能工作台（Workspace）
- 版本说明：V5.7 MVP —— 锁定导出格式为 Excel/CSV；通过“明细导出”满足历史记录查询需求，暂不做复杂的在线筛选列表。
- 相关文档（Links）：
  - 架构设计：<docs/architecture/...>
  - API 契约：<docs/api/...>
  - 数据模型：<docs/data/...>
  - 埋点/指标口径：<docs/data/metrics.md#...>
  - 测试与验收：<docs/quality/...>

---

## 1. Executive Summary（10 行以内）

- 我们要解决的问题：将 AI 的技术消耗（Token）转化为业务价值（Time Saved），实现“ROI 可视化（Return on Intelligence）”，帮助企业管理员回答：
  1) 我们采购的数字员工替团队干了多少活？
  2) 目前的席位分配是否合理，有无闲置浪费？
- 这次交付的范围（In）：
  - 效能看板（Efficiency Dashboard）：任务完成数、估算节省工时（北极星）、人类接管率、任务成功率、自治等级
  - 原始数据导出（Raw Data Export）：明细导出（Excel/CSV），提供时间范围选择器与导出按钮
  - 技术约束：数据时效性 < 15 分钟；明细留存 180 天；聚合指标永久保留
  - 数据埋点：dashboard_view、export_data
- 不做的范围（Out）：
  - 复杂的在线筛选列表与多维度在线分析（以明细导出替代）
  - 非 Excel/CSV 的导出格式
- P1 需求列表：IN-001 ~ IN-009（见第 6 章）
- 成功标准（关键体验口径）：
  - 管理员能在看板上直观看到“任务量、节省工时、人类接管率、成功率、自治等级”的趋势/状态。
  - 管理员能在 < 15 分钟数据延迟下完成“按时间范围导出明细（Excel/CSV）”用于审计与盘点。
- 最大风险与依赖：
  - 依赖 Workspace 的任务/进程状态、Regenerate 行为、编辑器手动修改等信号的稳定上报。
  - 依赖 Marketplace/Workflow 配置提供“标准工时”参数与默认值。

---

## 2. 背景与问题（Problem & Context）

### 2.1 背景

- B2B 客户需要把 AI 使用从“模型成本”转化为“业务价值”，否则难以证明采购合理性。
- 早期 MVP 以“明细导出”替代复杂在线查询，满足审计与深度盘点场景。

### 2.2 用户痛点（Evidence）

- 管理员：无法量化“数字员工替团队干了多少活”，难以持续采购与优化。
- 管理员：席位可能闲置/浪费，缺少可观测的使用与产出指标。
- 审计/盘点：需要按时间范围导出原始明细，做二次分析与留档。

### 2.3 目标用户与使用场景

- 角色（Roles）：Tenant Admin（主账号管理员）
- 核心场景（Top 3 Use Cases）：
  1) 管理员查看效能看板，评估数字员工 ROI（任务量、节省工时、接管率、成功率、自治等级）。
  2) 管理员按时间范围导出明细（Excel/CSV）用于审计与深度盘点。
  3) 管理员依据接管率/成功率等指标，识别需要优化 Prompt 的工作流。

---

## 3. 目标与成功指标（Goals & Success Metrics）

### 3.1 产品目标（Goals）

- G1：提供一张“效能看板”直观呈现 AI 对人力的增益。
- G2：以“估算节省工时（Estimated Hours Saved）”作为北极星指标，连接投入与价值。
- G3：提供“原始明细导出”满足审计/深度盘点需求，替代复杂在线查询。
- G4：满足 MVP 的数据时效性与留存约束（< 15 分钟延迟；明细 180 天）。

### 3.2 非目标（Non-Goals）

- NG1：不做复杂在线筛选列表与多维 OLAP 分析。
- NG2：不提供除 Excel/CSV 以外的导出格式。

### 3.3 成功指标（Metrics）

> 指标口径在本 PRD 内定义；如后续抽到统一口径文档，请在 `docs/data/metrics.md` 中建立章节并在此链接。

- 北极星指标（North Star）：Estimated Hours Saved（估算节省工时）
- 关键指标（Key Metrics）：
  - Tasks Completed（任务完成数）
  - Human Intervention Rate（人类接管率）
  - Task Success Rate（任务成功率）
  - Autonomy Level（自治等级分布）
- 护栏指标（Guardrails）：
  - Dashboard 数据延迟（< 15 分钟）
  - 明细导出成功率

---

## 4. 范围（Scope）

### 4.1 In Scope（本期要做）

- 效能看板（Efficiency Dashboard）
  - M1 任务完成数（Tasks Completed）
  - M2 估算节省工时（Estimated Hours Saved）+ FTE 换算卡片
  - M3 人类接管率（Human Intervention Rate）+ 阈值徽章/告警
  - M4 任务成功率（Task Success Rate）
  - M5 自治等级（Autonomy Level）
- 原始数据导出（Raw Data Export）
  - 导出格式：.xlsx / .csv
  - 字段包含：Task ID、Agent Name、User、Department、Start/End、Status、Estimated Time Saved
  - 交互：时间范围选择（本月/上月/全部）+ [📥 导出明细]
- 数据埋点：dashboard_view、export_data
- 技术约束：数据时效性、留存策略

### 4.2 Out of Scope（明确不做）

- 在线复杂筛选列表、在线钻取/多维分析（使用导出替代）
- 除 Excel/CSV 外的导出格式

### 4.3 里程碑（Milestones）

- M0：PRD Approved（TBD）
- M1：Design Ready（TBD）
- M2：Dev Complete（TBD）
- M3：QA Sign-off（TBD）
- M4：Release（TBD）

---

## 5. 用户旅程与关键流程（User Journeys & Flows）

### 5.1 Journey 1：查看效能看板（Admin）

- 触发：管理员进入数据洞察（Insights）
- 用户目标：快速理解 ROI 与可优化点
- 主流程（Happy Path）：
  1) 进入效能看板
  2) 查看 M1 任务完成数（本月总量 + 环比增长率 MoM）
  3) 查看 M2 估算节省工时与“相当于雇佣 X 位全职员工”的换算卡片
  4) 查看 M3 人类接管率与徽章/告警提示
  5) 查看 M4 任务成功率（排除用户主动取消）
  6) 查看 M5 自治等级定义与分布

### 5.2 Journey 2：按时间范围导出原始明细（Admin）

- 触发：管理员在看板右上角选择时间范围
- 用户目标：下载明细做二次分析（审计/深度盘点）
- 主流程（Happy Path）：
  1) 选择时间范围：本月 / 上月 / 全部
  2) 点击 [📥 导出明细]
  3) 系统生成并下载 .xlsx 或 .csv

---

## 6. 需求清单（Requirements Catalog）

> 说明：将原文 M1~M5 / 导出 / 埋点 / 技术约束映射为 IN-xxx，确保可追踪与可验收。

### 6.1 需求总览表

| Req ID | 标题 | 优先级 | 适用角色 | 依赖 | 验收入口 |
|---|---|---|---|---|---|
| IN-001 | 效能看板页面与展示框架（Efficiency Dashboard） | P1 | Admin | Metrics Store | AC-IN-001 |
| IN-002 | M1 任务完成数（Tasks Completed） | P1 | Admin | Task/Process Status | AC-IN-002 |
| IN-003 | M2 估算节省工时（Estimated Hours Saved）+ FTE 换算 | P1 | Admin | Workflow Config | AC-IN-003 |
| IN-004 | M3 人类接管率（Human Intervention Rate）+ 徽章/告警 | P1 | Admin | Workspace Signals | AC-IN-004 |
| IN-005 | M4 任务成功率（Task Success Rate） | P1 | Admin | Task/Process Status | AC-IN-005 |
| IN-006 | M5 自治等级（Autonomy Level） | P1 | Admin | Workflow/Runtime | AC-IN-006 |
| IN-007 | 原始数据导出（Excel/CSV + 字段） | P1 | Admin | Export Service | AC-IN-007 |
| IN-008 | 交互：时间范围选择器 + 导出按钮 | P1 | Admin | UI | AC-IN-008 |
| IN-009 | 技术约束：数据时效性与留存策略 | P1 | Eng | Storage/ETL | AC-IN-009 |

---

### 6.2 需求条目

#### IN-001：效能看板页面与展示框架（Efficiency Dashboard）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：2.1
- 描述（What）：
  - 提供“效能看板”用于直观展示 AI 带来的“人力增益”。
  - 看板聚合展示 M1~M5 指标（见 IN-002 ~ IN-006）。
- 验收标准：
  - AC-IN-001-1：Given 管理员进入 Insights，Then 必须看到效能看板入口与 M1~M5 指标展示区域。

#### IN-002：M1 任务完成数（Tasks Completed）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：M1
- 描述（What）：
  - 定义：所有 Agent 成功执行并结束的会话总数（排除试错/报错会话）。
  - 展示：本月总量 + 环比增长率（MoM）。
- 验收标准：
  - AC-IN-002-1：Given 选择“本月”，Then 显示本月任务完成数与 MoM。

#### IN-003：M2 估算节省工时（Estimated Hours Saved）+ FTE 换算

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：M2
- 描述（What）：
  - 核心价值：证明采购价值的“北极星指标”。
  - 计算逻辑：∑（任务完成数 × 该 Agent 的标准人工耗时）。
    - 管理员需在“工作流配置”中为每个 Agent 设定“标准工时”（例：合同审查 = 0.5 小时/次）。
    - 若未配置，取默认值 0.1 小时。
  - 可视化：大卡片展示“本月相当于雇佣了 X 位全职员工”（按每月 160 工时换算）。
- 验收标准：
  - AC-IN-003-1：Given 某 Agent 未配置标准工时，Then 计算时使用默认值 0.1 小时。
  - AC-IN-003-2：Given 有节省工时结果，Then 展示 FTE 换算（160 工时/月）。

#### IN-004：M3 人类接管率（Human Intervention Rate）+ 徽章/告警

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：M3
- 描述（What）：
  - 定义：衡量 Agent 交付质量的核心指标。
  - 计算公式：（用户点击 Regenerate 次数 + 编辑器内“手动修改”次数）/ 总任务数。
  - 可视化：
    - 低接管（<10%）：显示绿色徽章“🌟 卓越表现（L4 Autonomy）”。
    - 高接管（>50%）：显示红色警告“⚠️ 需优化 Prompt”，引导管理员调整工作流配置。
  - 价值：识别哪些 Agent 真的在干活，哪些只是在“添乱”。
- 验收标准：
  - AC-IN-004-1：Given 接管率 < 10%，Then 显示“卓越表现”徽章。
  - AC-IN-004-2：Given 接管率 > 50%，Then 显示“需优化 Prompt”告警提示。

#### IN-005：M4 任务成功率（Task Success Rate）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：M4
- 描述（What）：
  - 定义：（成功闭环的任务数）/（总启动进程数）。
  - 排除：排除由用户主动取消的任务；主要关注报错、死循环或逻辑错误导致失败的比例。
- 验收标准：
  - AC-IN-005-1：Given 用户主动取消的任务，Then 不计入失败分母/分子口径（按定义排除）。

#### IN-006：M5 自治等级（Autonomy Level）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：M5
- 描述（What）：
  - L1（Copilot）：人类发起，人类结束，全程监工。
  - L2（Autopilot）：人类发起，Agent 执行，仅出错时介入。
  - L3（Agentic）：Agent 基于监控触发主动发起，自主闭环。
- 验收标准：
  - AC-IN-006-1：Given 看板展示自治等级，Then 必须至少包含 L1/L2/L3 三档定义与对应数据展示。

#### IN-007：原始数据导出（Raw Data Export）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：2.2
- 描述（What）：
  - 目标：替代复杂在线查询，允许管理员下载明细进行二次分析（满足审计与深度盘点需求）。
  - 格式：.xlsx（Excel）或 .csv。
  - 字段包含：
    - Task ID（任务流水号）
    - Agent Name（使用的数字员工）
    - User（操作员姓名/子账号）
    - Department（所属部门）
    - Start Time / End Time
    - Status（Success/Failed）
    - Estimated Time Saved（该任务贡献的工时）
- 验收标准：
  - AC-IN-007-1：Given 导出 Excel/CSV，Then 字段必须完整包含以上列表。

#### IN-008：导出交互（时间范围选择器 + 导出按钮）

- 优先级：P1
- 目标用户：主账号管理员
- Legacy ID：2.2（交互）
- 描述（What）：
  - 看板右上角提供：
    - 简单时间范围选择器（本月/上月/全部）
    - [📥 导出明细] 按钮
- 验收标准：
  - AC-IN-008-1：Given 选择不同时间范围，When 点击导出，Then 导出数据范围与选择一致。

#### IN-009：技术约束（Technical Constraints）

- 优先级：P1
- 目标用户：研发/数据
- Legacy ID：4
- 描述（What）：
  - T1 数据时效性（Data Freshness）：管理员看板数据延迟应 < 15 分钟（Near Real-time）；无需秒级 T+0，但不可接受 T+1。
  - T2 数据留存（Retention Policy）：
    - 原始明细（Raw Data）：保留 180 天（满足半年审计需求）。
    - 聚合指标（Aggregated Stats）：永久保留（用于展示环比趋势）。
- 验收标准：
  - AC-IN-009-1：Given 看板查询，Then 数据更新时间延迟应满足 < 15 分钟口径。
  - AC-IN-009-2：Given 明细超过 180 天，Then 不再提供导出；聚合指标仍可用于趋势展示。

---

## 7. 权限、合规与审计（如适用）

- 权限：看板与导出仅面向管理员（Admin only）。
- 审计：导出行为需记录埋点（见附录 A）。

---

## 8. 风险、依赖与权衡（Risks & Trade-offs）

- 风险 1：接管率口径依赖 Workspace 对 Regenerate 与“编辑器手动修改”的准确计数。
  - 影响：中-高
  - 缓解：在 Workspace 侧建立稳定事件与去重/幂等；与数据口径文档对齐。
- 风险 2：标准工时配置缺失导致节省工时偏差。
  - 影响：中
  - 缓解：提供默认值 0.1 小时，并在 Workflow 配置中提供清晰提示。
- 权衡点：
  - 以“明细导出”替代在线复杂筛选，降低交付成本但提升管理员使用门槛（需要二次分析工具）。

---

## 9. 测试与发布（Testing & Release）

- 测试范围：单测 / 集成 / E2E / 回归
- 重点 E2E：
  - Admin 访问看板 → 指标展示（M1~M5）
  - 时间范围切换（本月/上月/全部）→ 导出明细（Excel/CSV）
  - 默认标准工时（未配置）时的 Hours Saved 计算
  - 接管率阈值（<10%、>50%）的徽章/告警展示
  - 数据留存 180 天边界行为

---

## 10. 开放问题（Open Questions）

| ID | 问题 | Owner | 截止日期 | 状态 |
|---|---|---|---|---|
| Q-IN-001 | “排除试错/报错会话”的判定口径是什么？（状态码/错误类型/重试次数） | TBD | TBD | Open |
| Q-IN-002 | “用户主动取消任务”的判定与上报事件口径是什么？ | TBD | TBD | Open |
| Q-IN-003 | “编辑器内手动修改次数”的计算方式：按保存次数/按 diff 次数/按时间段？ | TBD | TBD | Open |
| Q-IN-004 | Hours Saved 的“标准工时”配置入口具体位于哪里？（工作流配置页 / 市场订阅页） | TBD | TBD | Open |
| Q-IN-005 | “自治等级 L1/L2/L3”由谁标注与如何产生：工作流配置？运行时推断？ | TBD | TBD | Open |

---

# 附录 A：数据埋点（Analytics）

- dashboard_view：查看报表（Admin only）
- export_data：点击导出明细（参数：range='current_month'|'last_month'|'all'）

# 附录 B：术语表（Glossary）

| 术语 | 定义 |
|---|---|
| ROI 可视化（Return on Intelligence） | 将 Token 消耗转化为业务价值（Time Saved）的可观测体系 |
| Tasks Completed | 成功执行并结束的会话总数（排除试错/报错会话） |
| Estimated Hours Saved | ∑（任务完成数 × 标准人工耗时），并可换算为等价 FTE |
| Human Intervention Rate | （Regenerate 次数 + 编辑器手动修改次数）/ 总任务数 |
| Task Success Rate | 成功闭环任务数 / 总启动进程数（排除用户主动取消） |
| Autonomy Level | L1 Copilot / L2 Autopilot / L3 Agentic 三档自治等级 |

