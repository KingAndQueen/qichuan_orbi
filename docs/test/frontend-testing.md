# 前端测试设计说明 (Frontend Testing Spec)

文档版本：v0.2 (Draft)  
最后修改日期：2026-01-30  
作者：Billow  
适用范围：智能工作台（Intelligent Workspace）Web 前端；覆盖前端可感知体验与 UI 层行为的测试设计与落地约束。  
相关文档（按 docs-map 注册表路径）：  
- `docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`

- `docs/features/platform-overview.md`
- `docs/features/prd-wokrspace.md`
- `docs/features/prd-marketplace.md`
- `docs/features/prd-identity-access.md`
- `docs/features/prd-insights.md`

- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/api/agent-interface-spec.md`
- `docs/technical/data/database-design.md`

- `docs/test/qa-master-plan.md`
文档目的：提供一套可执行、可回溯到 PRD 的前端测试方案，确保“工作台核心体验、身份与可见性、会话/消息渲染、SDUI/Intent 渲染、错误与降级”等前端行为在迭代中可稳定回归；不重复描述后端协议与内部实现细节。  

建议存放路径：`docs/test/frontend-testing.md`  
所属模块：智能工作台（Intelligent Workspace） & Web 前端  

说明：本文件仅定义前端侧应验证的体验与 UI 行为边界；跨服务契约与其他模块测试入口以 `qa-master-plan.md` 的测试文档清单为准。

---

## 1. 背景与目标

智能工作台（Intelligent Workspace）是 Orbitaskflow 面向终端用户的主入口，承担了：

- Super Composer（超级输入框）：承接文本、长文粘贴、文件上传等多模态输入；
- 会话管理：列表、历史记录、多主账号/子账号切换；
- Agent 交互：通过 WebSocket 长连接承载的 SSE 风格事件流，展示思考状态、工具调用结果；
- 工作流触发：作为工作流市场与运行时的入口；
- 管理员能力入口：访问 Data Insights、Agent 配置等。

本测试设计文档的目标：

- 将智能工作台相关 PRD 中的体验要求（见 QA 总纲 6.3.1）转化为前端可执行的测试用例；
- 明确前端层面的测试分层（组件测试 / 集成测试 / E2E 测试）；
- 与 `agent-bridge-testing.md` 等后端测试文档形成“前后端分治但不缺口”的契约：
  - 后端测试保证协议与数据正确；
  - 前端测试保证 UI 行为与用户体验正确。

- 与后端/其他模块测试形成“前后端分治但不缺口”的契约：
  - 后端测试保证协议与数据正确；
  - 前端测试保证 UI 行为与用户体验正确；
  - 具体后端/模块测试文档与责任边界以 `docs/test/qa-master-plan.md` 的测试文档清单为准。

---

## 2. 范围（In Scope / Out of Scope）

### 2.1 In Scope

- Super Composer（超级输入框）及其附件栏的交互体验；
- 会话列表与历史记录加载、滚动、折叠行为；
- Agent 消息流式展示、思考状态提示、错误提示；
- 工具调用的中间状态与结果展示（如搜索结果卡片、知识库命中卡片、工作流执行结果卡片）；
- 工作台中触发工作流的入口与任务状态展示（与 Workflow Runtime 整体体验相关部分）；
- 多主账号/子账号切换后，工作台 UI 中数据可见性的变化；
- 空状态（无会话、无数据）与基本导航（如进入 Data Insights、打开 Agent 配置等）。

### 2.2 Out of Scope

- Agent Bridge 事件流顺序、Run 状态机等后端协议细节（由 QA 总纲中“后端/Agent Bridge 测试文档”覆盖）；
- Data Insights 报表统计逻辑与导出接口行为（由 QA 总纲中“Data Insights 测试文档”覆盖）；
- 登录流程、SSO 集成等身份认证细节（由 QA 总纲中“Identity & Access 测试文档”覆盖）；
- 工作流市场后台逻辑与资源生命周期（由 QA 总纲中“Workflow Marketplace 测试文档”覆盖）。

---
## 3. 需求 → 测试覆盖矩阵

需求引用口径：本文件不再引入独立的 Requirement ID。
每条测试覆盖必须绑定到 PRD 的唯一可回溯引用（优先使用 PRD 内显式编号，如 `[WS-PRD F2.1.1]`）。
若 PRD 段落无编号，则以「PRD 小节标题」作为引用，并在本表中保持唯一。

每条需求用“用户体验语言”描述，并映射到具体页面组件与测试用例。

### 3.1 Super Composer 输入与提交体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WS-PRD Super Composer：输入与发送] | 用户在 Super Composer 中输入短文本时，输入框响应流畅；按回车或点击“发送”按钮可以稳定触发一次请求（不重复、不丢失） | TC-FW-001 | 组件测试 + 集成测试 | TBD |
| [WS-PRD Super Composer：输入与发送] | 用户粘贴长文本（例如 > 10k 字符）时，输入框仍能正常展示全部内容，滚动行为可控，不会导致页面整体卡顿或浏览器无响应 | TC-FW-002 | 组件测试 | TBD |
| [WS-PRD Super Composer：附件] | 用户可以在输入框中添加多个附件（文档、图片等），附件列表清晰可见（文件名/大小/删除按钮），删除附件不会影响文本内容 | TC-FW-003 | 组件测试 | TBD |
| [WS-PRD Super Composer：提交状态] | 在请求进行中（等待 Agent Bridge 响应）时，发送按钮应显示 loading 状态或被禁用，防止用户连点造成重复请求 | TC-FW-004 | 集成测试 | TBD |
| [WS-PRD 错误与重试] | 请求失败时（如网络错误），输入框保留原始输入文本和附件；错误提示清晰可见，方便用户重试或修改 | TC-FW-005 | 集成测试 | TBD |

### 3.2 会话列表与历史记录体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WS-PRD 会话列表：排序规则] | 会话列表按最近活跃时间排序，最新会话在顶部，保持与 PRD 定义的排序规则一致 | TC-FW-010 | 组件测试 | TBD |
| [WS-PRD 会话详情：历史记录与消息顺序] | 用户在会话列表中点击某会话条目时，主区域应加载该会话的全部可见历史记录；消息顺序正确，不出现乱序或重复 | TC-FW-011 | 集成测试 | TBD |
| [WS-PRD 长会话：加载/分页/折叠策略] | 对于消息数量较多的长会话，历史记录支持懒加载/分页或折叠策略；滚动体验流畅，并在 UI 上有明确“加载更多”或“已到达顶部”提示 | TC-FW-012 | 集成测试 + E2E | TBD |
| [WS-PRD 空状态与引导] | 当用户首次进入工作台且尚无任何会话时，主区域展示清晰的空状态文案和引导（例如引导用户从 Super Composer 开始或选择一个 Agent），而不是空白页面 | TC-FW-013 | 组件测试 | TBD |
| [IA-PRD 主账号/子账号切换] / [WS-PRD 会话可见性] | 在多主账号/子账号场景下，切换主账号/子账号后会话列表与当前会话内容应同步切换，不再展示前一上下文的会话数据 | TC-FW-014 | E2E 测试 | TBD（建议：`e2e/workspace/account-switching.spec.ts`） |
| [WS-PRD 未读规则（如适用）] | 对于支持“未读会话”标记的版本，未读会话在列表中有明确视觉标识；点击进入后重置该会话的未读状态，行为与 PRD 中未读规则一致 | TC-FW-015 | 组件测试 + E2E | TBD |

### 3.3 Agent 响应与流式输出体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WS-PRD 发送后状态提示] | 用户发送请求后，前端在合理时间内展示“正在思考”或类似状态提示（例如 skeleton、typing indicator），避免长时间无反馈 | TC-FW-020 | 集成测试 | TBD |
| [PROTO interaction-protocol：SSE 事件流顺序与组装] / [WS-PRD 消息渲染] | 在 SSE 流式响应模式下，前端按顺序渲染服务端推送的消息片段，最终形成完整、连续的回答文本，不出现乱序或明显闪烁 | TC-FW-021 | 集成测试 | TBD |
| [PROTO interaction-protocol：状态事件展示] / [WS-PRD 非打扰状态提示] | 当 SSE 中包含表示 Agent 当前状态/阶段的事件时（例如“正在检索文档”），前端以非打扰方式展示并在阶段完成后更新或隐藏 | TC-FW-022 | 集成测试 | TBD |
| [PROTO interaction-protocol：Run 结束态] / [WS-PRD 失败态展示] | 当 Run 以失败状态结束时，前端在消息区域展示清晰的错误提示，而不是仅显示空白或部分回答 | TC-FW-023 | 集成测试 | TBD |
| [WS-PRD 消息操作] | 用户可对回答执行基本操作（复制、重新提问、继续追问等）；这些操作在 UI 上可发现，且不会影响原有消息内容 | TC-FW-024 | 组件测试 + E2E | TBD |

### 3.4 工具调用与结果展示体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WS-PRD 工具调用：中间态] / [PROTO interaction-protocol：tool 相关事件] | 当 Agent 触发工具调用事件时，前端在对话中展示“正在调用工具”的中间状态，不让用户误以为 Agent 卡死 | TC-FW-030 | 集成测试 | TBD |
| [WS-PRD 工具结果展示] | 工具成功返回结果后，前端以结构化卡片或明确区域展示工具数据，并与自然语言回答在视觉上区分开（例如卡片、标签或来源说明） | TC-FW-031 | 集成测试 + E2E | TBD |
| [WS-PRD 错误态与信息屏蔽] | 工具调用失败时（如 timeout/error），前端展示简短的用户可理解错误说明，不暴露后端原始错误栈 | TC-FW-032 | 集成测试 | TBD |
| [WS-PRD 可重试操作] | 对于可再次触发的工具（例如“重新检索”“重新执行工作流”），前端提供清晰可见的重试入口，并确保重复触发不会造成 UI 状态混乱 | TC-FW-033 | 集成测试 + E2E | TBD |
| [DI-PRD Data Insights：入口与跳转] / [WS-PRD 跨页面跳转] | 当工具结果与 Data Insights 或后台统计数据相关时，前端正确跳转到对应页面，并在必要时带上合理的过滤参数 | TC-FW-034 | E2E 测试 | TBD |

### 3.5 工作流触发与执行状态展示体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WM-PRD 工作流：触发入口] / [WS-PRD 入口展示] | 用户在工作台中通过入口（按钮、菜单或 Agent 卡片）触发某个工作流时，前端立即给出“任务已接收”的反馈（例如状态条或气泡提示） | TC-FW-040 | 集成测试 | TBD |
| [WM-PRD 工作流：执行状态] / [WS-PRD 状态展示] | 对于执行时间较长的工作流，用户可持续看到状态更新（排队中、执行中、已完成、失败），状态文案与图标符合 PRD 定义 | TC-FW-041 | 集成测试 + E2E | TBD |
| [WM-PRD 工作流：结果呈现] / [WS-PRD 结果卡片] | 工作流执行成功后，前端提供访问结果的入口（例如结果卡片、下载链接或跳转链接），且不会生成多余或重复的结果卡片 | TC-FW-042 | E2E 测试 | TBD |
| [WM-PRD 工作流：失败态与原因概括] / [WS-PRD 失败态展示] | 工作流执行失败时，用户可看到错误提示或失败标记，并能通过任务详情或日志链接了解失败原因概括 | TC-FW-043 | E2E 测试 | TBD |

### 3.6 多主账号/子账号切换与可见性体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [IA-PRD 主账号/子账号切换] / [WS-PRD 工作台上下文] | 对于拥有多个主账号/子账号访问权限的用户，工作台提供稳定易用的主账号/子账号切换入口，点击后当前标识立即更新 | TC-FW-050 | 组件测试 + E2E | TBD（建议：`e2e/workspace/account-switching.spec.ts`） |
| [IA-PRD 主账号/子账号切换] / [WS-PRD 可见性与数据刷新] | 切换主账号/子账号后，会话列表、工作流入口、Data Insights 等内容均应与新上下文保持一致，不再显示前一上下文的数据 | TC-FW-051 | E2E 测试 | TBD |
| [IA-PRD 单主账号体验] | 对于仅属于单一主账号的用户，工作台不显示无意义的切换 UI（例如空下拉列表），避免造成困惑 | TC-FW-052 | 组件测试 | TBD |
| [IA-PRD 权限变更生效] / [WS-PRD 入口可见性] | 当用户因权限变更失去某个主账号/子账号的访问权时，刷新页面后不再显示对应数据与入口，并在必要时提供“权限变更”提示 | TC-FW-053 | E2E 测试 | TBD |
| [IA-PRD 角色可见性] / [DI-PRD 入口权限] | 仅管理员可见入口（如 Data Insights、Agent 配置）只在具备权限的用户登录时展示；普通成员/访客登录时不显示这些入口，避免“点了才发现没权限”的体验 | TC-FW-054 | E2E 测试 | TBD（建议：`e2e/workspace/role-visibility.spec.ts`） |

### 3.7 错误提示与空状态体验

| PRD 引用 | 体验/行为说明 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WS-PRD 错误态提示] | 对于常见错误（网络错误、后端不可用、权限不足），工作台展示简洁明确的错误提示文案，并在可能的情况下提供重试或联系管理员的建议 | TC-FW-060 | 组件测试 + 集成测试 | TBD |
| [WS-PRD 未知错误降级] | 对于未知错误或异常情况，前端展示通用的“系统繁忙/发生异常”提示，并避免显示技术细节（如堆栈信息、内部服务名） | TC-FW-061 | 集成测试 | TBD |
| [WS-PRD 空状态体验] | 当某类资源为空（例如没有可用 Agent、没有工作流、工作流历史为空）时，工作台展示清晰的空状态与下一步引导，而不是直接显示空列表 | TC-FW-062 | 组件测试 | TBD |

---

## 4. 测试分层与策略

本模块测试设计遵循《质量保障总纲》中定义的测试分层策略，这里对前端进行具体化说明。

### 4.1 组件测试（Unit / Component Tests）

主要针对：

- Super Composer 输入框与附件子组件；
- 会话列表、会话 item、消息气泡组件；
- 工具结果卡片、工作流状态条等 UI 组件；
- 主账号切换组件、错误提示组件。

策略：

- 使用 React Testing Library + Jest/Vitest，对组件的行为和渲染进行断言；
- 尽量避免对内部实现细节（如 hooks 调用顺序）做强依赖，关注“用户可见行为”；
- 对关键组件（如 Super Composer）使用属性测试或多种输入组合，验证在长文本、多附件等复杂场景下行为稳定。

### 4.2 生成式 UI 契约测试 (Generative UI Contract Testing) [新增]

**背景**：
系统采用 Intent-Driven Rendering（Server-Driven UI, SDUI）模式：后端在事件流中下发结构化的 UI Intent（JSON Schema），前端解析并映射到组件体系进行渲染。
本节测试用于验证前端对 UI Intent Schema 的解析稳健性、映射正确性与降级策略。

**测试范围**：
- **Schema Validation (Zod)**：验证后端下发的 JSON 是否符合前端定义的 Zod Schema（如 `visualization_intent`）。
- **Intent-to-Component Mapping**：验证特定的 Intent（如 `type: "smart_editor"`）是否触发了正确的 UI 行为（如侧边栏收起、编辑器展开）。
- **Resilience (韧性)**：验证当后端下发不合规的 Payload（如缺少字段、类型错误）时，前端是否能优雅降级（显示 Error Banner 或 Fallback 文本），而不是白屏崩溃。

**代码示例 (Vitest)**：
```ts
import { render, screen } from '@testing-library/react';
import { IntentParser } from '../utils/IntentParser';

it('renders Smart Editor when intent type is smart_editor', () => {
  const payload = {
    type: 'smart_editor',
    action: 'open',
    data: { content: 'Initial draft' }
  };
  
  // 1. 验证 Schema 解析通过
  const intent = IntentParser.parse(payload);
  expect(intent).not.toBeNull();
  
  // 2. 模拟渲染逻辑
  render(<Layout intent={intent} />);
  
  // 3. 断言 UI 状态变化 (参考 PRD F2.4.1.1 侧边栏收起规则)
  expect(screen.getByTestId('smart-editor-panel')).toBeVisible();
  expect(screen.getByTestId('sidebar')).toHaveClass('collapsed');
});

it('handles malformed payload gracefully', () => {
  const badPayload = { type: 'unknown_chart', data: {} };
  
  // 验证不抛出未捕获异常，并显示通用消息
  render(<Layout intent={badPayload} />);
  expect(screen.getByText(/不支持的组件类型/i)).toBeInTheDocument();
});
```

### 4.3 集成测试（Integration Tests）

主要针对：

- Super Composer 与 Agent Bridge API 的交互（模拟 SSE 客户端）；
- 会话列表与消息区域的联动（点击会话加载对应历史）；
- 工具调用的前后端交互路径（包括成功、超时、失败等）；
- 工作流触发与状态更新在单页内的联动效果。

策略：

- 在前端测试环境中使用 Mock Service Worker (MSW) 或自定义 mock 拦截 WebSocket 连接，
  或直接注入模拟的 SSE 事件；
- 利用模拟的 SSE 事件（`run_start` / `thought` / `message_delta` / `run_completed`）驱动 UI 状态变化；
- 验证组件之间的协作行为（而非单个组件的渲染）。


### 4.4 端到端测试（E2E Tests）

主要针对：

- 用户从登录后进入工作台，发起一次完整的 Agent 会话；
- 用户在工作台中触发一个工作流，并观察执行状态直至完成/失败；
- 用户在多主账号场景下切换主账号，并确认数据和入口变化；
- 前端在常见错误场景下的整体体验（如 Agent Bridge 不可用、权限不足）。

策略：

- 使用 Playwright / Cypress 等 E2E 框架，在接近真实的浏览器环境中执行；
- 尽量通过配置指向测试环境的后端服务，必要时配合后端 mock 数据；
- 将关键用户路径（happy path + 1~2 条核心失败路径）纳入 CI 必跑集合。

---

## 5. 测试数据与环境依赖

### 5.1 测试账号与主账号/子账号

- 至少准备以下类型的测试账号：
  - 多主账号管理员（可切换多个主账号/子账号，具备 Data Insights 与工作流管理权限）；
  - 单主账号管理员；
  - 普通成员；
  - 仅访客权限（只读或受限）。

- 对应测试主账号/子账号应预先配置：
  - 不同数量和类型的 Agent；
  - 不同订阅状态的工作流（已启用 / 已停用）；
  - 有/无历史会话、工作流执行记录等场景。

### 5.2 SSE / API Mock 策略

- 集成测试与 E2E 测试中，需要对 Agent Bridge 的事件流
  （由 WebSocket 承载的 SSE 风格事件）进行可控模拟：
  - 提供固定的成功/失败/超时场景；
  - 提供带有 `thought`、工具调用和 `run_completed` 的复合场景；
- Data Insights 跳转相关测试可使用固定的 URL 模板与查询参数，避免依赖后端实时统计。

### 5.3 本地与 CI 环境

- 本地开发环境参考《local-development.md》启动 Workspace Web 与必要后端服务；
- CI 环境中：
  - 前端单测与集成测试可以使用 headless 浏览器（如 Playwright/Chromium）；
  - E2E 测试可以在合并前或 nightly 任务中运行，避免占用过多流水线时间。

---

## 6. 与 CI/CD 集成方式

### 6.1 测试代码组织建议

建议在 `apps/workspace-web/` 目录中组织测试如下（示例）：
规则：若测试文件/函数名尚未落库，本文中“对应测试实现”字段统一写 `TBD`，不得使用 `...`/`.::` 形式的伪路径。
测试函数名需包含 PRD 引用（例如 `it('[WS-PRD F2.1.1] ...', ...)`），以满足回溯要求。

```text
apps/workspace-web/
  src/
    components/
    pages/
    ...
  src/__tests__/
    super-composer.test.tsx
    conversation-list.test.tsx
    agent-response.test.tsx
    tool-calls.test.tsx
    workflow-trigger.test.tsx
    error-states.test.tsx
  e2e/
    workspace/
      basic-chat.spec.ts
      account-switching.spec.ts
      workflow-status.spec.ts
      navigation-to-data-insights.spec.ts
      message-actions.spec.ts
      role-visibility.spec.ts
```

### 6.2 CI 执行策略

- 每次提交（push / PR）：
  - 必跑：前端组件测试 + 关键集成测试（Super Composer 提交、会话切换、基本 Agent 响应）；
- 主干分支 / 预发环境：
  - 建议增加：部分 E2E 测试（基本会话路径、工作流触发与状态）；
- Nightly / 定时任务：
  - 可运行更完整的 E2E 场景（多主账号切换、复杂工具链、多错误路径）。

CI 配置应与《质量保障总纲》中定义的项目级测试矩阵保持一致，确保智能工作台作为用户主入口具有更高的测试覆盖优先级。

---

## 7. 未决问题与后续扩展

- Super Composer 对极端长文本与大文件组合的体验是否需要专门的性能测试（可放入 `nonfunctional-testing.md`）；
- 工作台是否需要支持“离线草稿”能力（例如浏览器刷新后保留未发送内容），如需支持则需新增相关体验定义与测试用例；
- 多人协作（实时光标、消息标记）等功能在 PRD 明确前暂不纳入本测试设计；
- 移动端或小屏适配的专门测试策略（可在后续版本中单独补充“responsive-testing.md” 或在本文件中扩展对应章节）。

本文档为前端测试设计说明 v0.2（Draft），后续会随 PRD 与前端实现的演进持续更新。


