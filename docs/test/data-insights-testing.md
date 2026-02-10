# Data Insights 测试设计说明（Data Insights Testing Spec v0.2）

文档版本：v0.2  
最后修改日期：2026-01-30  
作者：Billow  
所属模块：Data Insights（数据洞察）  
建议存放路径：`docs/test/data-insights-testing.md`

相关文档（按 docs-map 注册表路径）：
- `docs-map.md`

- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`

- `docs/features/prd-insights.md`
- `docs/features/prd-identity-access.md`

- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/data/database-design.md`
- `docs/technical/ops/observability-logging.md`

- `docs/test/qa-master-plan.md`
- `docs/test/backend-testing.md`

---

## 1. 背景与目标

Data Insights 模块面向**主账号管理员**，提供“数字员工产出与 ROI”的基础数据能力。当前版本以 **导出明细数据** 为核心，通过导出到 CSV/XLSX 的方式，支持管理员在外部 BI / Excel 中进行分析。

本测试设计文档的目标是：

- 将 Data Insights PRD 中的可验证需求，转化为可执行、可维护的测试用例；
- 明确本模块在不同测试层级（Unit / Integration / E2E / 日志）的覆盖策略；
- 为 AI 生成和重构代码提供清晰的“行为约束”，确保实现始终符合 PRD 预期。

---

## 2. 范围（In Scope / Out of Scope）

### 2.1 In Scope

本测试设计 v0.2 聚焦于当前 MVP / v5.7 中已确认的后端能力：

- 导出明细 API 行为（HTTP 接口层）；
- 时间范围过滤逻辑：本月 / 上月 / 全部；
- 多租户隔离与权限控制；
- 导出文件字段正确性与基本格式（CSV 为主）；
- Estimated Time Saved（节省工时）计算逻辑；
- 错误处理与日志记录（包含 trace_id / master_account_id / principal_id（可选 sub_account_id））。

### 2.2 Out of Scope

以下内容当前版本不在自动化测试设计范围内（可做手工验证或后续补充）：

- 未来计划的 Data Insights 在线可视化看板与交互图表；
- 复杂的统计聚合与预测分析（例如多维度 KPI 排序、趋势预测）；
- 大规模导出下的性能压测与资源消耗评估（将归入性能专项测试文档）。

---
## 3. 需求 → 测试覆盖矩阵

说明：本节给出代表性“PRD/QA 体验定义 → 测试用例”矩阵，**不是穷举列表**。
- 需求引用：优先使用 PRD 的显式编号（如 F#/R#），否则使用稳定小节标题（`<...>`）保持可追溯。
- 可选追加 QA 总纲条目编号（例如 `[QA 6.3.4-1]`），用于对齐“体验定义”。

### 3.1 导出明细字段与内容

| PRD / QA 引用 | 需求描述（业务语言） | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [DI-PRD <导出明细字段>] / [QA 6.3.4-1] | 导出明细必须包含至少以下字段：Task ID、Agent Name、User、Department、Start Time、End Time、Status、Estimated Time Saved | TC-DI-001 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_contains_required_columns` |
| [DI-PRD <字段命名与顺序>] / [QA 6.3.4-1] | 字段顺序与命名应与 PRD/对外文档保持一致，避免影响管理员使用既有 Excel 模板 | TC-DI-002 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_column_order_and_headers` |
| [DI-PRD <一行一任务>] | 每一行记录应对应一条任务执行记录，不得合并多任务或拆分单一任务 | TC-DI-003 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_one_row_per_task` |

### 3.2 时间范围过滤

| PRD / QA 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现 |
|---|---|---|---|---|
| [DI-PRD <本月过滤>] / [QA 6.3.4-1] | 当选择“本月”时，导出结果中所有任务的 Start Time 必须落在“本月第一天 00:00:00 至本月最后一天 23:59:59”之间（时区以系统定义为准） | TC-DI-010 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_this_month_range` |
| [DI-PRD <上月过滤>] / [QA 6.3.4-1] | 当选择“上月”时，导出结果中所有任务必须落在上一个自然月范围内（时区以系统定义为准） | TC-DI-011 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_last_month_range` |
| [DI-PRD <全部与留存边界>] / [QA 6.3.4-1] | 当选择“全部”时，仅导出留存范围内全部明细（例如 ≤ 180 天），不得突破留存边界 | TC-DI-012 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_all_range_respects_retention` |
| [DI-PRD <DST/时区一致性>] | 时间过滤逻辑在跨时区 / DST 情况下仍保持一致，不出现边界偏移或漏数 | TC-DI-013 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_time_range_timezone_consistency` |

### 3.3 主账号隔离与权限

| PRD / QA 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现 |
|---|---|---|---|---|
| [DI-PRD <主账号隔离>] / [QA 8.3.4] | 导出接口必须按主账号边界隔离，任何情况下不得出现其他主账号的任务记录 | TC-DI-020 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_is_master_account_isolated` |
| [DI-PRD <管理员权限>] / [QA 6.3.4-1] | 仅具有管理员权限的用户可以访问导出接口；普通成员/访客访问应返回权限错误 | TC-DI-021 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_requires_admin_role` |
| [IA-PRD <主账号/子账号上下文要求>] | 当请求缺少主账号/子账号上下文时（例如缺少可解析的上下文声明），导出应失败并给出明确错误 | TC-DI-022 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_requires_account_context` |

### 3.4 Estimated Time Saved（节省工时）计算

| PRD / QA 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现 |
|---|---|---|---|---|
| [DI-PRD <节省工时非负>] | Estimated Time Saved 必须为非负数，不允许出现负值 | TC-DI-030 | 单元 + 属性测试 | `backend/tests/test_data_insights_time_saved.py::test_time_saved_non_negative` |
| [DI-PRD <失败/取消不计入>] | 当任务 status 为 failed/cancelled 时，不计入节省工时 | TC-DI-031 | 单元测试 | `backend/tests/test_data_insights_time_saved.py::test_failed_tasks_not_counted` |
| [DI-PRD <可加性性质>] | 合并两个时间段的任务列表时，总节省工时应等于分别计算后求和（无重复任务的前提下） | TC-DI-032 | 单元 + 属性测试 | `backend/tests/test_data_insights_time_saved.py::test_time_saved_additivity_property` |
| [DI-PRD <极端数据稳定性>] | 在极端数据（大量任务、任务时长边界值）下，计算结果仍然稳定、不溢出 | TC-DI-033 | 属性测试 | `backend/tests/test_data_insights_time_saved.py::test_time_saved_stress_property` |

### 3.5 错误处理与日志记录

| PRD / QA 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现 |
|---|---|---|---|---|
| [DI-PRD <系统错误处理>] / [QA 8.2] | 当导出过程中出现系统错误（如数据库不可用），API 应返回明确的错误码与错误信息 | TC-DI-040 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_handles_system_error` |
| [OBS <结构化错误日志字段>] | 导出错误必须产生一条 `level=error` 的结构化日志，日志中包含 trace_id、master_account_id、principal_id（可选 sub_account_id）等字段 | TC-DI-041 | 集成 + 日志测试 | `backend/tests/test_data_insights_export_logging.py::test_export_error_logged_with_trace` |
| [OBS <敏感信息脱敏>] / [QA 8.3] | 不得在日志中记录敏感数据（例如用户输入原文、私密配置），仅记录必要元数据（IDs/类型/状态） | TC-DI-042 | 日志测试 | `backend/tests/test_data_insights_export_logging.py::test_export_error_logs_are_sanitized` |

### 3.6 Analytics 埋点与空数据体验

> 本小节补充验证埋点事件与“无数据”场景下的用户体验，确保通过测试后，体验定义可以落地到数据与行为层面。

#### 3.6.1 Analytics 埋点事件

| PRD / QA 引用 | 需求描述（业务语言） | 测试用例 ID | 测试层级 | 对应测试文件 |
|---|---|---|---|---|
| [DI-PRD <看板访问埋点>] | 当主账号管理员打开 Data Insights 看板页面时，必须发送一次 `dashboard_view` 埋点事件，事件中至少包含 master_account_id、principal_id 与当前时间范围信息 | TC-DI-050 | 集成测试 | `backend/tests/test_data_insights_analytics.py::test_dashboard_view_event_emitted` |
| [DI-PRD <导出埋点>] | 当管理员触发“导出明细”时，必须发送一次 `export_data` 埋点事件，并携带 `range` 参数（取值限定为 `current_month` / `last_month` / `all`） | TC-DI-051 | 集成测试 | `backend/tests/test_data_insights_analytics.py::test_export_data_event_with_range` |
| [OBS <埋点脱敏>] / [QA 8.3] | Analytics 埋点事件中不得包含用户输入原文、任务内容等敏感信息，只能记录必要元数据（IDs、时间范围、状态） | TC-DI-052 | 日志测试 | `backend/tests/test_data_insights_analytics.py::test_analytics_events_are_sanitized` |

#### 3.6.2 空数据体验（No Data UX）

| PRD / QA 引用 | 需求描述（业务语言） | 测试用例 ID | 测试层级 | 对应测试文件 |
|---|---|---|---|---|
| [DI-PRD <空范围导出>] / [QA 6.3.4-1] | 当某个时间范围内没有任何任务记录时，导出接口应返回成功响应（HTTP 200），导出文件包含表头但不包含数据行 | TC-DI-060 | 集成测试 | `backend/tests/test_data_insights_export.py::test_export_empty_range_returns_header_only` |
| [DI-PRD <空状态提示>] / [QA 6.3.4-2] | 当某个时间范围内没有任何任务记录时，Data Insights 页面应展示明确的“暂无数据”提示，而不是空白页面或报错 | TC-DI-061 | E2E 测试 | `frontend/tests/test_data_insights_e2e.spec.ts::test_empty_state_message_for_no_data` |

---

## 4. 测试分层与策略

本模块的测试设计遵循 `docs/test/qa-master-plan.md` 中定义的测试分层与体验验收口径，这里对 Data Insights 进行具体化说明。

### 4.1 单元测试（Unit Tests）

主要针对：

- Estimated Time Saved（节省工时）等纯计算逻辑：`calculate_time_saved(tasks)` 等函数。

策略：

- 使用属性测试框架（如 Python 的 Hypothesis）定义不变式：
  - 总节省时间非负；
  - 失败任务不计入；
  - 合并列表时可加性；
- 单元测试不关心数据库和 HTTP，只验证纯业务逻辑；
- 单元测试建议在每次提交和 CI 中必跑。

### 4.2 集成测试（Integration Tests）

主要针对：

- 导出接口 `GET /api/data-insights/export`（具体路径以实际实现为准）；
- 时间范围过滤、多租户隔离、权限校验；
- 导出文件格式与字段。

策略：

- 在测试环境中使用真实数据库（可用测试 schema 或事务回滚）；
- 通过 HTTP 客户端（如 `httpx` / FastAPI TestClient）发起请求；
- 校验响应状态码、头部（如 `Content-Type`, `Content-Disposition`）以及 CSV 内容；
- 关键集成测试建议在每次提交 / PR CI 中执行。

### 4.3 E2E 测试（端到端测试）

主要针对管理员在 Workspace Web 界面上的完整链路：

- 登录 → 选择租户 → 打开 Data Insights 页面 → 选择时间范围 → 点击导出 → 浏览器开始下载文件。

策略：

- 使用前端 E2E 框架（如 Playwright / Cypress）模拟真实用户行为；
- 验证：
  - 页面交互路径是否符合 PRD；
  - 权限控制是否正确（非管理员不显示导出按钮或点击后权限错误）；
  - 导出的文件可以下载成功并通过基本字段检查；
- E2E 用例可在主干分支或预发环境的定时 CI 任务中运行。

### 4.4 日志与可观测性测试

- 针对错误场景：
  - 人为模拟 DB 故障或内部异常，检查日志系统是否按《observability-logging.md》要求输出 JSON 日志；
  - 检查日志中包含 trace_id、master_account_id、principal_id（可选 sub_account_id）等字段；
  - 使用测试工具解析日志文件或通过日志采集的本地端点进行验证；
- 日志测试可以作为集成测试的一部分，或在非功能测试文档中进一步扩展。

---

## 5. 测试数据与环境依赖

### 5.1 测试数据准备

建议在测试环境中准备以下数据：

- 至少两个**主账号**（Master Account A, Master Account B）；
- 每个主账号下：
  - 若干用户：Admin / Member；
  - （可选）若干子账号（Sub Account 1/2），用于验证上下文切换与可见性；
  - 若干任务记录，覆盖：
    - 不同时间范围（本月、上月、更早，且“全部”不超过留存边界）；
    - 不同 status（success/failed/cancelled）；
    - 不同 Agent Name / Department 组合。

数据获取方式：

- 使用迁移脚本 + seed 脚本在测试环境预置；
- 或在测试代码中按需创建，并在测试结束时清理（事务回滚或工厂方法）。

### 5.2 环境依赖

- 数据库：PostgreSQL 测试实例；
- 应用服务：
  - Platform Core / Data Insights API 部署在测试环境；
- 日志：
  - 本地环境可将日志写入文件，测试通过读取文件验证；
  - CI 环境可通过特定输出端点或 sidecar 收集验证。

> 具体环境配置与启动方式参见《local-development.md》和《deployment.md》。

---

## 6. 与 CI/CD 集成方式

### 6.1 测试代码组织

建议在后端项目中按如下方式组织 Data Insights 相关测试代码：

```text
backend/
  src/
    ...
  tests/
    test_data_insights_export.py
    test_data_insights_time_saved.py
    test_data_insights_export_logging.py
```

命名约定：

- 将 Requirement ID 通过注释或标记与测试函数关联，例如：

```python
import pytest

@pytest.mark.prd_ref("[DI-PRD <导出明细字段与顺序>]")
@pytest.mark.qa_ref("[QA 6.3.4-1]")
def test_export_contains_required_columns():
    ...
```

- 这样可以在缺陷跟踪和报告中，将失败的测试直接映射回 PRD 条目和本 Test Spec。

### 6.2 在 CI 流水线中的执行策略

- 每次提交（push / PR）：
  - 必跑：Data Insights 相关单元测试 + 关键集成测试（导出接口、多租户隔离）；
- 主干分支 / 预发环境：
  - 建议增加：少量关键 E2E 测试（导出操作完整链路）；
- Nightly / 定时任务：
  - 可运行更重的属性测试、边界条件测试以及与日志相关的完整场景。

具体执行矩阵与优先级应与 `docs/test/qa-master-plan.md` 中定义的项目级别策略保持一致。

---

## 7. 未决问题与后续扩展

- 导出文件格式是否需要兼容多种类型（CSV / XLSX），当前测试设计默认 CSV，若新增格式需补充相应测试；
- 是否在导出明细中增加更多字段（如模型类型、Token 消耗等），一旦 PRD 确认需同步更新本 Test Spec 与测试用例；
- 性能测试（大规模任务导出）暂未在本 v0.2 中展开，后续可在 `nonfunctional-testing.md` 中补充相应场景；
- 未来若引入 Data Insights 在线可视化看板，需要新增图表正确性与交互行为测试设计，并在本文件或新建文档中进行扩展；
- 是否需要为 Data Insights 模块引入 mutation testing，以评估现有测试对计算逻辑的保护能力（可在后续版本评估）。

---

> 本文档为 Data Insights 模块的测试设计说明 v0.2（对齐最新版 `documentation_guidelines.md`），后续可根据 PRD 演进与实现反馈进行迭代更新。

