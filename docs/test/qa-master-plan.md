# 质量保障总纲 (Quality Assurance Overview)

文档版本：v1.1 (reviewed)
最后修改日期：2026-01-29
作者：Billow
适用范围：Orbitaskflow L3 质量保障总纲；用于测试策略、质量红线与子测试文档分工。
相关文档：
- `docs-map.md`

- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`

- `docs/features/platform-overview.md`
- `docs/features/prd-identity-access.md`
- `docs/features/prd-workspace.md`
- `docs/features/prd-marketplace.md`
- `docs/features/prd-insights.md`

- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/data/database-design.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/api/agent-interface-spec.md`

- `docs/technical/ops/observability-logging.md`
- `docs/technical/release/deployment.md`
- `docs/technical/dev/local-development.md`

文档目的：在不引入额外“虚构功能 ID”的前提下，以现有 PRD 为唯一需求真相，统一 Orbitaskflow 的测试目标、测试层级与子文档分工，为 AI 生成测试代码与人工测试提供统一约束与入口。

---

## 1. 概述 (Overview)

本文件是 Orbitaskflow 的 **顶层测试规范** (QA Master Spec)，面向两类读者：

1. 人类工程师：理解系统整体的测试策略与质量红线；
2. AI 代码生成器：在生成测试代码时，明确使用什么框架、放在哪个目录、如何命名、如何引用 PRD 中的需求片段。

本总纲不重复产品需求或技术方案，而是定义：

- 统一的测试目标与质量基线；
- 基于 PRD 章节/功能编号的需求引用规则；
- 跨服务的测试框架约定与目录规范；
- 测试维度与金字塔层级；
- 顶层 CI / pre-push 测试矩阵；
- 子测试文档的索引。

---

## 2. 背景 (Background)

Orbitaskflow 是一个面向 B2B 场景的智能工作空间，包含：

- Workspace Web 前端；
- Core Service (Go)：承载身份与权限（IA）等后端核心能力；
- Agent Bridge (Python)：AI 编排与实时交互（与网关/协议对齐）；
- 日志与可观测性基础设施（统一 JSON 日志 + W3C Trace Context）。

对应的四份 PRD 文档分别覆盖：

- 智能工作台 (Intelligent Workspace)：超级输入框、会话管理、历史、Workflow 面板等；
- 工作流市场 (Workflow Marketplace)：工作流浏览/订阅/分发、**主账号级权限与分配**；
- 统一身份与通行证 (Identity & Access)：登录、**主账号/子账号**、权限与可见性规则；
- 数据洞察 (Data Insights)：效能看板、原始数据导出等。

这些 PRD 已经通过「章节号 + 功能编号/标题」（例如 F2.1.1 独立附件栏、F3.1.1 全量市场浏览）表达了需求结构。本测试总纲的原则是：

**不再引入额外的 `OF-FEAT-XXX` 功能 ID 体系，而是直接围绕 PRD 中已有的章节与功能编号组织测试。**

同时，项目会大量依赖 AI 自动生成测试代码，因此需要一套 **对 AI 友好**、约束清晰且与 PRD 强绑定的测试文档体系。

---

## 3. 职责 (Responsibilities)

本《质量保障总纲》负责：

1. 定义 Orbitaskflow 的整体测试目标与质量基线；
2. 规定“PRD → 测试代码”的引用与映射方式：
   - PRD 文档 & 章节是唯一需求真相；
   - 测试用例要显式标注其引用的 PRD 片段；
3. 约定跨服务统一的测试框架、目录与命名；
4. 定义测试维度（金字塔）与 CI / pre-push 测试矩阵；
5. 作为 AI 生成测试代码的 **入口文档**，指向子测试文档。

本总纲 **不负责**：

- 在文本中列出每个接口/组件的所有用例细节；
- 重新描述业务需求、交互或接口协议（由 PRD / 技术文档负责）；
- 定义每一个模块的具体 mock 策略（由子测试文档负责）。

---

## 4. 边界 (Out of Scope)

不在本文件范围内的内容包括：

- 具体业务需求、交互细节（详见对应 PRD 文档）；
- 接口参数、响应结构、错误码（详见 API / interaction-protocol 文档）；
- 全量测试用例列表（可在后续子测试文档或测试计划中逐步补充）；
- CI/CD 工具链具体配置（由 DevOps 文档与 CI 配置文件承担）。

当测试需求与本总纲或子测试文档存在冲突时，应以 **最新 PRD 与架构文档为准**，并尽快同步更新测试文档以消除偏差。

---

## 5. 数据结构 (Data Models)

本节只定义与测试体系相关的“元数据结构”，用于统一测试命名与需求引用方式。

### 5.1 需求引用标识 (Requirement Reference)

- 四份 PRD 文档已经通过章节号与功能编号/标题表达需求结构，例如：
  - 《智能工作台 (Intelligent Workspace)》：
    - 2.1 超级输入框；
    - F2.1.1 独立附件栏，F2.1.2 上下文智能补全 等；
  - 《工作流市场 (Workflow Marketplace)》：
    - 2.1 主账号视图；
    - F3.1.1 全量市场浏览，F3.1.2 订阅与分配 等；
  - 《统一身份与通行证 (Identity & Access)》：
    - 2.2 权限与可见性规则子章节；
  - 《数据洞察 (Data Insights)》：
    - 2.1 效能看板，2.2 原始数据导出等。
- 测试体系 **不再额外定义独立的 Feature ID 体系**，而是以「PRD 文档 + 章节号 + 功能编号/标题」作为唯一需求引用来源。
- 推荐使用的引用前缀：
  - `WS-PRD`：Intelligent Workspace PRD；
  - `WM-PRD`：Workflow Marketplace PRD；
  - `ID-PRD`：Identity & Access PRD；
  - `DI-PRD`：Data Insights PRD。
- 典型的需求引用标识示例：
  - `[WS-PRD F2.1.1] Super Composer 附件栏 - 单文件大小限制`；
  - `[WM-PRD F3.1.2] Workflow Marketplace 订阅与分配`；
  - `[ID-PRD 2.2.B] Conversation Visibility - team/public 场景`；
  - `[DI-PRD 2.1] 效能看板 - 会话维度统计`。
- 对于 PRD 中尚未显式编号的细节：
  - 可以在 QA 子文档或单独的“需求↔测试映射表”中维护「PRD 段落标题 → 测试用例」对应关系；
  - 不强制创造新的全局 ID，只要求引用能让读者/AI 确定唯一 PRD 段落。

### 5.2 测试用例命名规范

测试名称中应尽可能包含需求引用标识，以支持按 PRD 回溯。

- 前端 (Vitest)：

  ```ts
  it('[WS-PRD F2.1.1] shows attachment chips above composer', async () => {
    // ... 断言 Super Composer 附件栏行为
  });
  ```

- Go (testing)：

  ```go
  func TestLoginHandler_WS_PRD_Identity_2_1_CreateSession(t *testing.T) {
      // ... 断言登录与 Session 创建逻辑，对应 Identity PRD 2.1
  }
  ```

- Python (pytest)：

  ```py
  def test_agent_handles_rag_request_WS_PRD_2_3_history_panel():
      # ... 对应 Workspace PRD 历史面板相关功能
      ...
  ```

要求：
- 若 PRD 为某功能定义了显式编号（例如 F2.1.1），测试名称中应包含对应编号；
- 若为未显式编号的细节场景，测试名称中至少需要包含清晰的需求描述，并在注释中补充「PRD 段落引用」。

### 5.3 测试文件命名与目录结构

- 前端 Workspace Web：
  - 文件名：`*.test.tsx` / `*.test.ts`
  - 路径：
    - 与组件同目录的测试文件，或
    - 归档在 `src/**/__tests__` 目录中。
- Core Service (Go，Auth 模块)：
  - 文件名：`*_test.go`
  - 路径：与被测包同级目录。
- Python (agent-bridge)：
  - 文件名：`test_*.py`
  - 路径：`tests/` 目录或与模块同级。

AI 在生成测试文件时，必须遵循上述命名与路径约定，以便被现有的 `pnpm test` / `go test` / `pytest` 自动发现。

---

## 6. 关键流程 (Core Flows)

本节描述 **测试相关的关键流程**，而非业务用户流程。

### 6.1 从 PRD 到测试的流程

1. PRD 定义或更新某个功能（例如：F2.1.1 Super Composer 附件栏能力）。
2. 技术文档（架构 / interaction-protocol / logging）更新相关接口与数据流。
3. QA / 开发基于本总纲和子文档：
   - 规划对应的 Unit / Integration / E2E 测试集合；
   - 如涉及 LLM / Agent 行为，为其编写测评样本（RAG、Workflow、多轮对话、安全场景等）。
4. 人类或 AI 根据子测试文档生成测试代码：
   - 使用约定的测试框架与目录结构；
   - 在测试名称或注释中标注 PRD 引用标识（例如 `[WS-PRD F2.1.1]`）。
5. 测试代码接入 CI / pre-push 流程，成为回归保障的一部分。

### 6.2 AI 生成测试代码的流程

当 AI 被请求“为某模块编写测试”时，应按以下步骤执行：

1. 确定模块与语言，例如：`apps/workspace-web` 的 Chat Composer；
2. 查阅本总纲：
   - 确认测试框架、文件命名、目录结构与 PRD 引用规则；
3. 查阅对应子文档：
   - 前端 → `frontend-testing.md`；
   - 后端 → `backend-testing.md`；
   - LLM 行为 → `agent-evaluation.md`；
   - 非功能 → `nonfunctional-testing.md`；
4. 查阅 PRD & 技术文档：
   - PRD：获取预期行为、状态转换与边界条件；
   - 技术文档：获取接口协议、日志结构与 trace 约定；
5. 生成测试代码：
   - 避免引入未授权的新测试框架；
   - 避免依赖真实生产数据或外部未 mock 的服务；
   - 保证命名、目录结构与 PRD 引用符合本节要求。

### 6.3 关键产品能力体验定义（Experience Contracts）

本小节用于在「PRD ↔ 测试设计」之间增加一层明确的“体验合约（Experience Contract）”。

- 当对应测试文档中的用例全部通过时，可以认为本小节列出的体验在当前版本下是达标的；
- 当 PRD 调整影响到体验定义时，必须同步更新本小节，并据此调整对应测试文档。

当前版本（v5.x）优先保障以下产品能力的体验：

- 智能工作台（Intelligent Workspace）
- 工作流市场与工作流执行（Workflow Marketplace & Runtime）
- 统一身份与通行证（Identity & Access）
- 数据洞察（Data Insights v5.7）

下文分别给出各能力的体验定义。

#### 6.3.1 智能工作台（Intelligent Workspace）体验定义

对于智能工作台核心能力（特别是超级输入框 Super Composer、多轮会话与工具调用），如果下列体验全部成立，则认为本版本下智能工作台体验达标：

1. 超级输入框作为统一入口的可用性
   - 用户可以在 Super Composer 中稳定输入文本，粘贴大段内容，并附加多个文件（文档、图片等）；
   - 输入框在长文本与附件较多时仍保持流畅，不出现明显卡顿或输入丢失；
   - 输入框的提交行为有明确反馈（例如按钮状态、loading 提示），避免“按下回车无响应”的感受。

2. 会话上下文与历史记录体验
   - 用户可以在智能工作台中方便地查看、切换既有会话，会话列表的排序和未读状态行为可预测；
   - 每个会话中的消息顺序正确，历史记录加载渐进、清晰，不出现“消息乱序”或“部分消息消失”的情况；
   - 对于长会话，前端在截断/折叠时有明确提示，避免用户误以为数据丢失。

3. Agent 响应与流式输出体验
   - 发起提问后，用户可以在合理时间内看到 Agent 开始响应（如光标、正在思考提示或首段内容）；
   - 支持流式输出时，文本按顺序逐步显示，最终能形成完整、可复制的答案；
   - 响应过程中发生错误（如超时、服务不可用）时，有明确、可理解的错误提示，而不是静默失败或仅展示技术栈错误信息。

4. 工具调用与结果展示体验
   - 当 Agent 调用工具（例如搜索、知识库查询、工作流执行）时，前端能给出合适的中间状态提示（例如“正在检索文档”“正在执行工作流”）；
   - 工具结果和自然语言回答在 UI 上有清晰区分（例如卡片、标签或来源说明），用户能理解“哪部分是工具返回的数据”；
   - 工具调用失败时，用户能获得明确提示（包含失败原因的概括），不会误以为是 Agent 无响应。

5. 主账号/子账号隔离与权限在工作台中的体验
   - 用户在切换主账号/子账号上下文后，只能看到对应范围内的会话与数据；
   - 受权限限制的会话或工具在工作台中不可见或不可操作，不出现“点击后才发现没有权限”的情况；
   - 对于需要管理员权限的操作（如发布工作流到团队），前端有明确身份要求提示。

6. 与 Agent Bridge 协议的体验一致性
   - 工作台中所有 Agent 会话均通过统一的 SSE / 事件协议驱动，消息顺序、工具调用、错误状态与 `agent-bridge-service` 文档定义保持一致；
   - 当前端表现出“会话卡死”“消息重复”等异常时，可以通过 Agent Bridge 日志与 trace 在合理时间内定位问题来源。

对应测试设计与实现，详见：
- `docs/test/frontend-testing.md` 中“智能工作台 / Super Composer / 会话体验”相关章节；
- `docs/test/agent-bridge-testing.md` 中关于 SSE 事件协议的测试用例。

---

#### 6.3.2 工作流市场与工作流执行（Workflow Marketplace & Runtime）体验定义

对于工作流市场与工作流执行能力，如果下列体验全部成立，则认为本版本下相关体验达标：

1. 工作流发现与订阅体验
   - 管理员可以在工作流市场中浏览可用的标准工作流（按类别、标签或搜索），列表加载稳定、筛选行为可预测；
   - 订阅/启用某个工作流的流程清晰、可逆（例如订阅后可停用），界面有明确状态反馈；
   - 未订阅的工作流在工作台中不会误显示为“可用”，避免用户误触发。

2. 工作流分配与可见性体验
   - 管理员可以将已订阅工作流分配给指定子账号、团队或用户组；
   - 被分配工作流在目标空间中以清晰的方式出现（例如入口按钮、菜单项），未分配工作流对普通成员不可见；
   - 当权限被收回或工作流被下架时，前端有合理的降级行为和提示，不出现“入口存在但始终报错”的情况。

3. 工作流执行与结果反馈体验
   - 用户从智能工作台或指定入口触发工作流时，前后端能够在合理时间内给出“已接收任务”的确认反馈；
   - 对于执行时间较长的工作流，用户在 UI 中可以看到清晰的任务状态（排队中、执行中、已完成、失败等）；
   - 工作流执行成功时，结果以可理解的形式呈现（例如卡片、下载链接、跳转链接），失败时有包含原因概括的错误提示。

4. 异步执行与重试体验
   - 对于需要异步执行的工作流，系统会通过通知、任务列表或会话消息等方式在完成后告知用户结果，不要求用户持续手动轮询；
   - 内部重试机制不会导致重复副作用（例如重复发邮件、重复创建资源），用户体验层面不应看到“同一工作流执行多次”的异常现象；
   - 当重试仍失败时，错误信息中包含足够的上下文，便于后续排查和优化工作流配置。

5. 任务历史与可追溯体验
   - 管理员和有权限的用户可以查看工作流运行历史（至少包含时间、触发人、工作流名称、状态等）；
   - 历史记录中的失败任务可以通过日志或错误详情追溯到具体失败步骤，便于调整配置或修复 bug；
   - 历史记录与 Data Insights 的导出数据在核心指标上保持一致，不出现明显统计偏差。

对应测试设计与实现，详见：
- `docs/test/workflow-marketplace-testing.md`（未来子文档）；
- `docs/test/frontend-testing.md` 中“工作流触发与执行体验”相关章节。

---

#### 6.3.3 统一身份与通行证（Identity & Access）体验定义

对于登录、主账号切换、权限控制等 Identity & Access 能力，如果下列体验全部成立，则认为本版本下相关体验达标：

1. 登录与会话管理体验
   - 用户在输入正确凭证后，可以在合理时间内完成登录，并进入与其身份对应的默认工作区；
   - 登录失败时有明确的错误提示（账号不存在、密码错误、账号被禁用等），不会只展示模糊的“登录失败”；
   - 在同一浏览器中，登录状态和会话失效行为可预测（例如超时自动退出、刷新后仍保持登录等）。

2. 主账号/子账号切换体验
   - 对于拥有多个主账号/子账号访问权限的用户，系统提供稳定、易用的主账号/子账号切换入口；
   - 切换主账号/子账号后，工作台中展示的数据（会话、工作流、Data Insights 等）都随之切换，不出现跨主账号混淆；
   - 对于只属于单一主账号的用户，不会暴露无意义的切换 UI 元素。

3. 权限与可见性规则体验
   - 同一主账号内，不同角色（管理员、成员、访客）在会话列表、工作流和 Data Insights 中看到的内容符合 PRD 中的可见性规则；
   - 非授权用户无法访问或操作受保护的资源（例如其他团队的会话、未分配给本人的工作流、仅管理员可见的报表）；
   - 被拒绝访问时，前端提供明确的“无权限”提示，而不是泛化为“系统错误”。

4. 与外部身份系统的集成体验（如有）
   - 若与企业 SSO/IdP 集成，用户可以通过统一入口完成登录，无需重复创建本地账号；
   - SSO 登录失败或票据过期时，错误提示中清晰区分“身份系统问题”和“应用内部错误”；
   - 权限变更（例如用户被移出某主账号）在合理时间内反映到应用的可见性和访问控制上。

5. 审计与安全可追溯体验
   - 关键安全行为（登录失败、权限变更、敏感操作）都有结构化审计日志记录，包含时间、操作者、目标资源等信息；
   - 遇到安全相关问题（如越权访问怀疑）时，可以使用日志和 trace 在合理时间内还原用户行为链路；
   - 日志中不记录密码、Token 等敏感凭证，符合基础安全规范。

对应测试设计与实现，详见：
- `docs/test/identity-and-access-testing.md`（未来子文档）；
- `docs/test/frontend-testing.md` 中“登录与主账号切换体验”相关章节。

---

#### 6.3.4 数据洞察（Data Insights v5.7）体验定义

对于 Data Insights V5.7（当前仅交付“明细导出 + 埋点”能力），如果下列体验全部成立，则认为 Data Insights 模块在本版本下体验达标：

1. 管理员可按时间范围稳定导出可用明细文件
   - 主账号管理员可以在 Data Insights 看板中选择「本月 / 上月 / 全部」任一时间范围，并成功导出明细文件；
   - “全部”仅代表留存范围内全部明细（≤ 180 天），不得突破留存边界；
   - 导出的文件必须包含 PRD 定义的字段（Task ID / Agent Name / User / Department / Start Time / End Time / Status / Estimated Time Saved），字段命名与顺序稳定可预测；
   - 明细导出格式仅支持 `xlsx` 与 `csv`（允许两者都支持，但不得扩展为其它格式）。

2. 多主账号隔离与权限控制行为符合预期
   - 导出接口严格按 主账号 维度隔离，任何情况下不会导出其他主账号的数据；
   - 仅具有“管理员”角色的用户可以访问导出能力，普通成员/访客访问时得到明确的权限错误提示；
   - 当用户缺少有效主账号上下文（例如未选择主账号）时，导出请求会失败并返回清晰的错误信息，而不是返回空数据或模糊错误。

3. 节省工时（Estimated Time Saved）数据可信、可用于 ROI 分析
   - 所有导出记录中的 Estimated Time Saved 均为非负值，不会出现负数或异常极值；
   - status 为 failed / cancelled 的任务不计入节省工时；
   - 在无重复任务前提下，将两个时间范围导出的任务列表合并后，其总节省工时应等于各时间范围分别统计后求和（具有可加性），并在极端数据规模下保持计算稳定，不溢出、不崩溃。

4. 无数据场景下的导出与页面反馈体验清晰
   - 当某个时间范围内没有任何符合条件的任务记录时，导出接口仍然返回成功响应（HTTP 200），导出的文件包含表头但不包含数据行，结构稳定、可被 Excel / BI 正常打开；
   - Data Insights 页面在“无数据”场景下展示明确的提示（例如“当前时间范围暂无任务记录”），而不是空白页面或技术性报错，确保管理员能够理解当前状态。

5. 埋点行为满足后续 ROI 与计费分析需求
   - 当主账号管理员打开 Data Insights 看板时，系统会产生一次 `dashboard_view` 埋点事件，事件中至少包含 `master_account_id` / `principal_id` 以及当前时间范围等基础上下文；
   - 当管理员点击“导出明细”按钮时，系统会产生一次 `export_data` 埋点事件，事件中包含用于区分时间范围的 `range` 参数：`current_month` / `last_month` / `all`（取值范围与 PRD 保持一致）；
   - 埋点事件中不包含用户输入原文、业务敏感字段等隐私信息，仅记录必要元数据，以便后续做 ROI / 席位利用率 / 计费分析。

6. 错误处理与可观测性支撑排障体验
   - 当导出过程中发生系统错误（例如数据库不可用、内部异常）时，API 会返回明确的错误码与人类可读的错误信息，而不是静默失败或返回无意义的默认值；
   - 所有导出错误与异常都会按《observability-logging.md》规范产生日志，日志中包含 trace_id / master_account_id / principal_id（可选 sub_account_id），便于跨服务追踪；
   - 日志中不得记录用户输入原文、隐私配置等敏感信息，必要时仅记录摘要或截断后的内容，保证在排障与合规之间取得平衡。

---

## 7. 测试框架与约定 (Testing Frameworks & Conventions)

### 7.1 测试框架矩阵

- 前端 Workspace Web：
  - `Vitest` + `@testing-library/react` + `@testing-library/user-event`；
- Core Service (Go)：
  - 标准库 `testing`，可选 `testify`；
- Agent Bridge Service (Python)：
  - `pytest` + `pytest-asyncio`；
- 其它：
  - 若未在子测试文档中指定，默认沿用上述语言对应的框架。

### 7.2 日志与 Trace 约定

配合《日志与可观测性标准 (Observability & Logging Standards)》：

- 重要业务路径的测试应覆盖并验证：
  - 日志中包含 `service` / `component` / `trace_id` / `master_account_id` / `principal_id`（可选 `sub_account_id`）等关键字段；
  - 主账号隔离场景下不出现跨主账号日志混淆；
- 对于 WebSocket / Agent 流程测试，建议：
  - 在测试中捕获并记录 `trace_id`；
  - 使用日志系统回放端到端调用链，以辅助调试。

---

## 8. 安全机制 (Security Model)

测试体系应遵守以下安全约束：

1. **数据安全**
   - 测试数据不得包含真实客户的敏感信息（PII、密钥、银行卡等）；
   - 主账号隔离测试必须使用专用测试主账号（master_account）与测试子账号（sub_account），避免污染生产数据；
2. **访问与权限**
   - 自动化测试默认在隔离环境执行，不连接生产数据库或生产 LLM 终端；
   - 涉及管理操作（删除数据、变更配额）时，应使用测试环境的管理员账号；
3. **LLM / Agent 安全测试**
   - 针对 Prompt Injection、数据外泄、功能越权等场景，在 `agent-evaluation.md` 中定义红队样本与预期行为，并按计划执行回归。

---

## 9. 部署 / 运维注意事项 (Ops Notes)

测试与部署/运维之间的关键衔接点：

1. **环境配置**
   - 本地开发环境参考：`local-development.md`；
   - 生产/准生产环境参考：`deployment.md`；
   - 测试环境（如 staging）应尽量与生产配置一致，但使用独立数据库、Redis 与专用测试主账号/子账号数据集；

2. **可观测性集成**
   - 建议在测试环境中同样启用结构化日志与 Trace；
   - 对关键 E2E 和性能测试 run 进行采样，保留 trace 供分析；

3. **CI 集成**
   - CI 中的测试应：
     - 使用专用的 test DB / Redis 实例；
     - 确保 Nginx / Site Auth / Agent Bridge 在“测试环境配置”下启动；
     - 不向外部生产服务发起请求。

---

## 10. CI / pre-push 测试矩阵 (Execution Matrix)

> 本节定义在不同阶段（本地 pre-push / PR CI / 定期任务）必须执行的测试集合，具体命令在各服务 README 或子文档中保持同步。

### 10.1 开发者本地 pre-push（必须通过）

- 前端 Workspace Web：
  - `pnpm -C apps/workspace-web lint`；
  - `pnpm -C apps/workspace-web typecheck`；
  - `pnpm -C apps/workspace-web test`（核心模块行覆盖率 ≥ 设定阈值，例如 80%+）；
- Core Service (Go，Auth 模块)：
  - `go test ./...`；
- Python 服务（agent-bridge）：
  - `pytest`；
- 通用检查：
  - 代码格式 / Lint；
  - 冲突标记扫描（如 `<<<<<<< HEAD` 等）；
  - 依赖健康检查（如 `pnpm dedupe`、Go modules 校验等）。

### 10.2 CI（每个 PR 必须通过）

- Stage 1：Lint + typecheck + unit/component tests（所有服务）；
- Stage 2：Integration / contract tests（启用 test DB / Redis 等）；
- Stage 3：核心 E2E 流程（数量有限，但覆盖关键业务路径，例如“登录 → 进入工作台 → 创建会话 → 运行 Workflow”）。

### 10.3 定期任务（Daily / Weekly）

- LLM / Agent 回归评测（基于 `agent-evaluation.md` 中的数据集与评分规则）；
- 关键 API / Workflow 的性能基准测试；
- Web 安全 & LLM 安全红队样本扫描（基础 smoke 测试）。

---

## 11. 附录 (Appendix)

### 11.1 示例：前端测试用例骨架

```ts
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatComposer } from "../ChatComposer";

it("[WS-PRD F2.1.1] sends message on Enter and keeps focus", async () => {
  const user = userEvent.setup();
  render(<ChatComposer />);

  const input = screen.getByRole("textbox", { name: /message/i });
  await user.type(input, "hello world");
  await user.keyboard("{Enter}");

  // 断言：调用发送回调 / 出现新消息，对应 Intelligent Workspace PRD F2.1.1
  // expect(...)

  expect(input).toHaveFocus();
});
```

### 11.2 示例：Go Handler 测试用例骨架

```go
func TestLoginHandler_ID_PRD_2_1_CreateSession(t *testing.T) {
    // 准备 fake store / test DB
    // 发起 HTTP 请求
    // 断言状态码、响应体
    // 断言日志中包含 trace_id / master_account_id / principal_id
    // 对应 Identity & Access PRD 2.1 登录与会话创建
}
```

### 11.3 示例：pytest 异步测试骨架

```py
import pytest

@pytest.mark.asyncio
async def test_agent_handles_rag_request_WS_PRD_2_3_history_panel():
    # 准备 mock LLM / 向量检索
    # 调用 Agent Bridge 的异步入口
    # 断言输出结构与日志
    # 对应 Intelligent Workspace PRD 2.3 历史面板相关行为
    ...
```
## 12. 变更记录 (Change Log)

- 2026-01-29 | JeafDean | v1.1：
  - 修复头部元信息合规（补齐适用范围、去重相关文档、修正引用路径）；
  - 统一术语口径：主账号/子账号 + master_account_id/sub_account_id + principal_id；
  - Data Insights 导出规则补齐 PRD 约束（180 天留存、仅 xlsx/csv、range 取值、字段完整性）；
  - 修正可观测性字段要求与服务命名（Core Service）。
