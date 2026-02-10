# 发布前端到端体验验证清单（Release E2E Experience Checklist v0.2）

文档版本：v0.2  
最后修改日期：2026-01-30  
作者：Billow
所属模块：L3 测试与质量（Release Verification）  
适用范围：用于 Orbitaskflow 发布前端到端体验验收（以 PRD + QA 总纲为唯一需求真相）  
适用版本（Target Release）：TBD（按迭代填写）  
执行角色：主执行=QA/产品；协助=前端/后端/Agent 负责人  
建议存放路径：`docs/test/release-testing.md`

相关文档（按 docs-map 注册表路径）：
- `docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`
- `docs/standards/contributing.md`
- `docs/features/prd-identity-access.md`
- `docs/features/prd-workspace.md`
- `docs/features/prd-marketplace.md`
- `docs/features/prd-insights.md`
- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/ops/observability-logging.md`
- `docs/technical/release/deployment.md`
- `docs/test/qa-master-plan.md`
- `docs/test/frontend-testing.md`
- `docs/test/backend-testing.md`
- `docs/test/agent-bridge-testing.md`
- `docs/test/data-insights-testing.md`
- `docs/test/agent-evaluation.md`
- `docs/test/nonfunctional-testing.md`

文档目的：提供“发布前端到端体验（E2E）验收”的最小可执行清单；每一项必须可回溯到 PRD/QA 总纲定义，并能映射到对应测试文档与必要的测试证据（截图/日志/trace/报表）。

---

## 2. 范围与原则 / Scope & Principles

### 2.1 范围 / Scope

- 本清单仅覆盖**关键端到端用户路径**，从浏览器进入到结果体验闭环：
  - 登录与工作空间进入
  - 会话与 Agent 协作（含代码生成）
  - Data Insights 全链路（数据到可视化）
  - 日志 / 监控 / 错误处理可观察性
  - 关键非功能特性（性能、稳定性、容错）
- **不重复**单元测试与模块测试细节，仅验证「**整条链路的体验是否符合 PRD 约定**」。

### 2.2 原则 / Principles

- **PRD 驱动**：每一条 E2E 场景都应能映射到对应模块 PRD 的体验定义（L1 SSOT）：
  - Identity & Access → `docs/features/prd-identity-access.md`
  - Workspace → `docs/features/prd-workspace.md`
  - Marketplace → `docs/features/prd-marketplace.md`
  - Data Insights → `docs/features/prd-insights.md`

---

## 3. 执行前准备 / Pre-conditions

- **环境 / Environment**
  - `env`: `staging`（推荐）/ `pre-prod`
  - 部署方式与生产尽量一致（含 Nginx、Postgres、Redis、agent-bridge 等完整链路）。
- **账号 / Accounts**
  - 至少 2 个测试账号（覆盖不同**主账号**；如产品支持“工作空间”切换，则覆盖不同**子账号**），用于验证主账号隔离与上下文切换（如 PRD 有要求）。
- **浏览器 / Browser**
  - Chrome 最新稳定版（必测）
  - Safari / Edge（如 PRD 或技术文档要求）
- **测试数据 / Test Data**
  - Data Insights 所需的示例数据集（大小、字段、格式与 PRD 示例一致）。
  - 用于 Agent 测试的典型用户任务用例（代码生成、文档撰写等），参考 `docs/test/agent-evaluation.md` 中的场景定义（如已存在）。

---

## 4. 功能覆盖矩阵 / Feature–Scenario Mapping

本表以「PRD 引用（优先显式编号，否则用稳定小节标题）」为唯一需求引用，不再引入独立 Feature ID（对齐 `docs/test/qa-master-plan.md` 的追溯口径）。

| PRD 功能组 / Feature Group | PRD 章节 / PRD Ref | E2E 场景 ID | 说明 / Notes |
|----------------------------|--------------------|-------------|--------------|
| 登录与工作空间进入 | `TBD: PRD §x.x` | E2E-001, E2E-002 | 覆盖登录成功 / 失败、会话保持 |
| 会话创建与基础对话 | `TBD: PRD §x.x` | E2E-010, E2E-011 | 基础聊天与多轮上下文保持 |
| AI 代码生成与结果落地 | `TBD: PRD §x.x` | E2E-020, E2E-021 | 遵守 `docs/standards/contributing.md` 的代码生成约束 |
| Data Insights 全链路 | `TBD: PRD §x.x` | E2E-030, E2E-031 | 数据导入 → 分析配置 → 图表展示 |
| Agent Workflow / 模板复用 | `TBD: PRD §x.x` | E2E-040 | 使用预设工作流完成任务 |
| 观察性与日志 / Observability | `TBD: PRD §x.x` | E2E-050 | 日志、错误提示与 Trace 串联 |
| 非功能特性 / Non-functional | `TBD: PRD §x.x` | E2E-060, E2E-061 | 性能、稳定性、容错体验 |

实际落地时：
- `PRD 章节 / PRD Ref` 列应填写类似 `[WS-PRD F2.1.1] Super Composer 附件栏`、`[WM-PRD F3.1.2] Workflow Marketplace 订阅与分配` 这样的标识；
- 并按 `docs/test/qa-master-plan.md` 中的体验定义补充完整引用。

---

## 5. 端到端场景清单 / E2E Scenario Checklist

每个场景建议在执行时建一个小表：`结果(PASS/FAIL) + 备注`。下面给出推荐 baseline 场景集合。

### E2E-001 首次登录与工作空间进入 / First Login & Workspace Access

**目标**：验证新用户从登录页到进入主工作台的体验，是否符合 PRD 的首登流程与安全要求。

- [ ] 使用「新用户」账号访问登录页：
  - 登录页面加载时间在可接受范围内（例如 <3s，具体参考非功能测试门槛）。
  - UI 元素与 PRD 原型一致（品牌元素、文案、错误提示）。
- [ ] 输入正确账号密码：
  - 成功跳转到主工作空间首页 / 预期的默认视图。
  - 浏览器刷新后仍保持登录态（会话管理符合理想状态）。
- [ ] 输入错误密码：
  - 显示清晰的错误提示，**不暴露具体安全信息**。
  - 不出现浏览器白屏或奇怪状态。
- [ ] 主账号隔离/上下文切换（如 PRD 有要求）：
  - 切换主账号/子账号后，侧边栏数据 / 历史记录 / Data Insights 资源均随上下文切换，不出现跨主账号混淆。

---

### E2E-010 基础会话创建与多轮对话 / Basic Conversation & Multi-turn Chat

**目标**：验证用户从进入工作空间到发起一次完整对话的体验。

- [ ] 从首页点击「发起新对话」/ 等价入口：
  - 新对话面板出现，输入框与提示文案符合 PRD 要求。
- [ ] 输入一个普通问题（非代码）：
  - 首 token 响应时间在约定范围内（参考非功能测试）。
  - 响应内容正确、连贯，没有明显格式错误。
- [ ] 连续追问 3 轮：
  - 模型能够保持足够上下文，一致性符合 PRD 的预期。
  - 未出现前端崩溃或 WebSocket/SSE 断流而无提示的情况（若断流，前端有友好重试/提示）。

---

### E2E-020 AI 代码生成体验 / AI Code Generation Experience

**目标**：验证 AI 在代码生成场景下的整体交互体验，符合 `docs/standards/contributing.md` 中约束（架构、技术栈、防御性编码等）。

- [ ] 在对话中输入一个「创建功能」类需求（例如：实现一个简单的 Data Insights 前端组件或 Go handler）：
  - 响应中使用的技术栈与 `docs/standards/contributing.md` 一致（如：Next.js App Router；Go + Chi；FastAPI + asyncio 等）。
  - 未出现被禁止的库或模式（例如：Python `requests` 替代 `httpx`）。
- [ ] 代码结构：
  - 文件路径建议合理，符合项目结构（`apps/workspace-web` / `services/site-auth` / `services/agent-bridge` 等）。
  - 单文件代码量不过分集中（遵守「文件不超过 ~400 行需要拆分」的思路）。
- [ ] 错误处理：
  - 对网络调用、解析等有基本防御性处理（例如 try/except 或错误分支），不生成过于脆弱的实现。
- [ ] 如将建议代码实际粘贴到项目（可选步骤）：
  - 本地运行测试 / 构建能够通过（或仅因已有 TODO 而失败），说明生成代码未明显破坏项目结构。

---

### E2E-030 Data Insights 全链路体验 / Data Insights End-to-End

对齐 `docs/test/data-insights-testing.md` 的用例，但这里要求从 UI → 后端 → 数据结果的完整体验。

**目标**：验证典型用户从数据源到结果可视化的端到端路径。

- [ ] 进入 Data Insights 模块入口：
  - 导航路径清晰（侧边栏 / 顶部导航），模块命名与 PRD 一致。
- [ ] 选择 / 创建一个数据源：
  - 可用数据源列表展示正确（名称、更新时间）。
  - 新建数据源时的表单校验友好（错误提示明确、不会卡死页面）。
- [ ] 配置一个典型分析任务（例如：按日期聚合 + 指标统计）：
  - 字段选择、过滤条件 / 分组等交互流畅，操作顺序符合 PRD 预期。
- [ ] 执行分析：
  - 执行过程有 Loading 状态提示。
  - 在合理时间内返回结果（参考 `docs/test/nonfunctional-testing.md` 中的 SLA）。
- [ ] 结果展示：
  - 表格 / 图表与 PRD 定义的默认可视化类型一致（例如折线、柱状等）。
  - 关键指标数值正确（可和预置数据预期进行比对）。
  - 用户可以进行简单交互（如 hover 查看详情、切换图表类型，如果 PRD 有说明）。
- [ ] 错误场景：
  - 当数据源配置错误或超时，前端给出可理解的错误提示，不出现白屏。
  - 后端有对应日志记录（参见 E2E-050）。

---

### E2E-040 Agent Workflow / 预设工作流使用体验（如 PRD 有）

**目标**：验证用户使用预设工作流（例如「代码审查 + 单测补全」、「PRD → 测试用例生成」）的体验。

- [ ] 在 UI 中找到工作流入口（如「模板中心 / Workflow Library」）。
- [ ] 选择一个典型工作流，按引导完成参数配置：
  - 所有步骤的描述清晰，用户知道下一步做什么。
- [ ] 执行工作流：
  - 工作流执行状态可见（步骤进度、当前环节）。
  - 中途出错时有明确提示，并给出恢复方式（重试某一步 / 重新执行）。
- [ ] 输出结果：
  - 结果形式与 PRD 描述一致（例如：生成一份 Markdown 文档 / 代码补丁 / 测试列表）。
  - 结果能被后续流程直接使用（例如复制到编辑器 / 一键应用）。

---

### E2E-050 观察性与日志链路 / Observability & Logging

**目标**：验证在典型操作和错误场景下的日志、监控与错误反馈是否满足诊断需求，并与日志规范保持一致。

- [ ] 正常操作（例如完成一次 Data Insights 分析）：
  - 检查 backend / agent-bridge / frontend 日志目录（如 `logs/app/backend/`, `logs/app/agent-bridge/`, `logs/app/frontend/`）中有对应请求日志。
  - Nginx 有 access / error 日志记录该次请求。
- [ ] 触发一个可控错误（例如提供错误数据源配置）：
  - 前端展示清晰的错误信息（不泄露内部堆栈 / 连接串）。
  - 后端日志中能看到对应错误、stack 信息或结构化日志。
- [ ] Trace / Correlation ID（如技术文档有定义）：
  - 在前后端或 Nginx 日志中能够通过请求 ID / Trace ID 串联端到端调用。
- [ ] 日志目录结构：
  - 日志目录结构与日志规范一致（`logs/app/backend`, `logs/nginx` 等），不会写到临时或未预期目录。

---

### E2E-060 非功能体验 / Non-functional Experience

对齐 `docs/test/nonfunctional-testing.md` 的定量测试，这里更关注**感知体验**与可用性。

- [ ] 首屏加载体验：
  - 登录后进入工作台的「感知加载时间」符合期望（可结合 Lighthouse 或内置监控做定量；此处记录主观感受 + 实测指标）。
- [ ] 峰值期间的响应：
  - 模拟同时执行多个 Data Insights 任务 / 多个会话请求时，前端仍然可用，没有明显卡死。
- [ ] 断网 / 慢网体验：
  - 人为关闭网络后尝试发起请求：
    - 前端能给出「网络异常」提示，而不是一直 Loading 或报 JS 错误。
  - 恢复网络后，页面能恢复正常使用，无需刷新（若 PRD 有此要求）。
- [ ] 安全相关体验：
  - 会话超时后，再次访问页面会回到登录页，而不是静默失败。
  - 输入恶意或异常字符（例如长文本 / 特殊符号）不会导致明显 UI 崩溃。

---

## 6. 验证记录模板 / Execution Log Template

建议在同文件尾部维护一个简单记录表，用于每次发布前复用：

```markdown
## 执行记录 / Execution Log

| 日期 / Date | 环境 / Env | 版本 / Version Tag | 执行人 / Owner | E2E 场景通过率 | 是否准予发布 / Go? | 备注 |
|-------------|------------|--------------------|----------------|----------------|--------------------|------|
| 2025-xx-xx  | staging    | v0.1.0             | Alice          | 10/10          | ✅ 是              | 无   |
```

---

## 7. 通过标准 / Release Gate Criteria

要允许版本发布，至少需满足：

1. 本清单中列出的 **所有「必须」场景**（按实际标注）均通过；
2. 无 P0 / P1 问题；
3. 日志与观察性要求满足基础排障需求；
4. 与 `docs/test/qa-master-plan.md` 中的体验定义**不存在明显冲突**；若有差异，已在 PRD 或 QA 文档层面对齐并更新。

