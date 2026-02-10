# PRD: 智能工作台（Intelligent Workspace）

> 品牌名称：新智流（Orbitaskflow）

---

## 0. 文档元信息

- 模块（Module）：Workspace
- PRD Owner：<TBD>
- 参与方：<PM/Design/Eng/QA/DA>
- 状态（Status）：Frozen
- 优先级（Priority）：P0
- 版本（Version）：V9.5
- 最后更新：<TBD>
- 关联模块：统一身份与通行证（Identity & Access）
- 版本说明：V9.5 Final —— 确立“服务端驱动（Server-Driven）”交互原则；明确追问建议与图表渲染均由 Agent 工作流动态决策，移除前端硬逻辑；整合 UI 视觉规范。
- 相关文档（Links）：
  - 架构设计：<docs/architecture/...>
  - API 契约：<docs/api/...>
  - 数据模型：<docs/data/...>
  - 埋点/指标口径：<docs/data/metrics.md#...>
  - 测试与验收：<docs/quality/...>

---

## 1. Executive Summary（10 行以内）

- 我们要解决的问题：构建 AI Native 的协同执行环境，让用户通过自然语言与文件轻松下达指令，并以可视化进度与自适应结果呈现获得透明、高效、可信的工作体验，同时具备 IDE 级布局管理与多业务线导航能力。
- 这次交付的范围（In）：
  - Workspace as OS：会话=进程、上下文=虚拟文件系统（VFS），进程持久化 + 断点续传
  - 超级输入框（Super Composer）：附件栏、多模态上传、工作流选择器、混合输入、生成控制
  - 自适应流式反馈：文本流、Server-Driven UI（动态微件/交互式表单）、智能编辑器（Agent 触发）、逐条反馈、引用溯源、智能追问、请求协助卡片
  - 推理透明化（Reasoning Steps）：可折叠、流式步骤、失败高亮可介入
  - 全局导航与侧边栏：会话列表、临时对话、主题切换、历史加载、任务管理器（进程仪表盘）
  - 隐私与共享：默认私有、团队公开、临时对话不入库且禁用分享
  - UI/UX Guidelines + 异常体验规范 + 埋点需求
- 不做的范围（Out）：
  - <TBD>
- P0 需求列表：WS-001 ~ WS-013（见第 6 章）
- 成功标准（关键体验口径）：
  - 前端不内置“追问/图表/组件”硬逻辑，展示完全以服务端（Agent）输出为准（Server-Driven）。
  - 用户可以：上传/粘贴文件 → 选择工作流 → 发起任务 → 看到进程状态与结果组件 → 需要时进入编辑器交付 → 导出与溯源。
- 最大风险与依赖：
  - Server-Driven UI 需要稳定的 UI Schema、版本兼容与安全沙箱。
  - VFS 写入/补丁与编辑器锁需要与权限（IA）与审计（Syscall/操作日志）对齐。

---

## 2. 背景与问题（Problem & Context）

### 2.1 背景

- 目标是把“聊天”升级为“协同执行环境”：任务可后台运行、可暂停等待人工、可恢复继续。
- 需要支持多业务线（Marketplace/Insights/Settings）导航、以及 IDE 级布局管理（侧边栏/编辑器分屏）。

### 2.2 用户痛点（Evidence）

- 纯对话交互难以表达复杂任务：缺少进度、缺少结构化输出组件、缺少可持续编辑交付物。
- 前端硬编码“建议追问/图表”会导致不可扩展、不可灰度、不可按工作流差异化。
- 文件与上下文管理弱：仅 token 上下文不够，需要工作区文件系统作为“任务资产载体”。

### 2.3 目标用户与使用场景

- 角色（Roles）：企业员工/操作员、租户管理员（审计与共享）、Agent 工作流（服务端）
- 核心场景（Top 3 Use Cases）：
  1) 用户上传/粘贴文件 + 自然语言指令，Agent 后台执行并持续反馈进度与结果
  2) Agent 判定产出为“交付物”，用户一键进入编辑器精修、导出 PDF/Word/Markdown
  3) 对话引用文件与联网来源可追溯；需要时发起团队共享或临时对话不留痕

---

## 3. 目标与成功指标（Goals & Success Metrics）

### 3.1 产品目标（Goals）

- G1：用“进程生命周期 + 持久化”承载任务执行，支持断点续传与人机协同挂起。
- G2：以“Server-Driven UI”实现生成式 UI：组件/表单/追问均由 Agent 决策与下发。
- G3：提供统一超级输入框：附件、工作流选择、多模态、生成控制。
- G4：提供智能编辑器：与聊天解耦、可版本/差异、可导出、可局部协作。
- G5：提供完整工作区导航、会话管理与进程仪表盘。
- G6：完善 UI/UX 规范、异常体验规范与埋点，为后续迭代打基础。

### 3.2 非目标（Non-Goals）

- NG1：<TBD>

### 3.3 成功指标（Metrics）

> 原文未给出量化指标口径；建议后续在 `docs/data/metrics.md` 定义并在此引用。

- 北极星指标（建议）：关键任务完成率（发起任务→结果交付→导出/复制/共享）
- 关键指标（建议）：
  - 首字延迟 < 1s 达成率（F2.2.1）
  - 编辑器打开率（editor_open）与导出率（editor_export）
  - suggestion_chips 展示率与点击率
  - 临时对话启用率与“无入库”一致性（chat_temp_mode）
- 护栏指标（建议）：
  - Server-Driven UI 渲染失败率
  - 文件上传失败率（file_upload）
  - 断线重连失败率（异常体验）

---

## 4. 范围（Scope）

### 4.1 In Scope（本期要做）

- Workspace as OS（会话→进程 / 上下文→VFS）
- Super Composer（附件栏、多模态上传、工作流选择器、混合输入、生成控制）
- Adaptive Response（文本流、Server-Driven UI、智能编辑器、反馈、引用、追问、协助卡片）
- 推理透明化 Reasoning Steps 折叠面板
- Sidebar & Navigation（会话列表、临时对话、主题切换、历史加载、任务管理器）
- 新对话零态 + 懒创建 Session
- 隐私与共享（默认私有、团队分享、临时对话不入库且禁用分享）
- UI/UX Guidelines + 异常体验规范
- 埋点需求（第 6 章 + 附录）

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

### 5.1 Journey 1：发起任务（文件 + 指令 + 工作流）

- 触发：用户在 Super Composer 输入指令并携带附件/粘贴内容
- 用户目标：快速选择正确工作流并发送任务；可中断/停止并保留草稿
- 主流程：
  1) 用户拖拽/点击/粘贴添加附件（显示独立附件栏卡片）
  2) 选择工作流（下拉列表，仅展示订阅工作流）
  3) Shift+Enter 换行编辑长文本，支持 Markdown
  4) 点击发送后按钮变为“停止（■）”，用户可随时停止/取消并恢复草稿
- 失败与恢复：
  - 文件失败：附件卡片变红 + Tooltip
  - 网络中断：见第 6 章 WS-012（异常体验规范）

### 5.2 Journey 2：任务执行与结果交付（生成式 UI + 编辑器）

- 触发：Agent 开始流式输出文本/组件，或判定产出为交付物
- 用户目标：实时看到进度与结构化结果；需要时进入编辑器精修并导出
- 主流程：
  1) 文本流打字机特效，首字延迟 < 1s
  2) 若服务端下发 UI 描述 JSON：渲染动态微件/交互式表单，并将用户操作回调给进程
  3) 若 Agent 判定为交付物：展示“📝 在编辑器中打开”按钮；用户点击后右侧展开编辑器
  4) 用户编辑、触发行内意图（局部润色/缩短/翻译/自定义 Prompt），系统做局部更新
  5) 需要导出时，从编辑器右上角导出 PDF/Word/Markdown 或复制格式化内容
- 失败与恢复：
  - 生成失败：消息底部显示 Regenerate
  - 权限不足/信息缺失：Agent 挂起并弹出 Assistance Required 卡片（WS-007）

### 5.3 Journey 3：会话管理、隐私与共享

- 触发：用户创建新对话、切换临时模式、分享给团队、管理会话列表
- 用户目标：控制隐私、快速定位历史、后台任务可控
- 主流程：
  1) 新建对话进入零态并展示动态快捷指令；懒创建 Session（首次发送才入库）
  2) 会话列表按时间分组，Hover 显示更多菜单（重命名/删除/置顶可选）
  3) 默认私有；点击分享按钮确认后变为团队公开（只读）
  4) 开启临时模式后顶部/输入框出现明显提示；消息不入库且禁用分享

---

## 6. 需求清单（Requirements Catalog）

> 说明：为确保信息不遗漏，本节将原文编号（F2.x / Gx / 埋点等）映射为 WS-xxx 需求条目；并保留 Legacy ID。

### 6.1 需求总览表

| Req ID | 标题 | 优先级 | 适用角色 | 依赖 | 验收入口 |
|---|---|---|---|---|---|
| WS-001 | Workspace as OS（进程 + VFS） | P0 | All | Storage/VFS/Agent | AC-WS-001 |
| WS-002 | Super Composer：附件栏 + 多模态上传 + 限制规则 | P0 | All | Upload/VFS | AC-WS-002 |
| WS-003 | Super Composer：工作流选择器（Simplified）与切换行为 | P0 | All | Subscription/IA | AC-WS-003 |
| WS-004 | Super Composer：混合输入与生成控制（Stop/恢复草稿） | P0 | All | Streaming | AC-WS-004 |
| WS-005 | 自适应流式反馈：文本流（首字延迟） | P0 | All | Streaming | AC-WS-005 |
| WS-006 | Server-Driven UI：UI JSON + 动态微件 + 交互式表单 | P0 | All | Agent Protocol/UI Schema | AC-WS-006 |
| WS-007 | 人机协同中断：Assistance Required（Suspend + 操作按钮） | P0 | All | Process State/Permissions | AC-WS-007 |
| WS-008 | 智能编辑器：Agent 触发、分屏、导出、锁定、行内意图 | P0 | All | Doc Storage/Locks | AC-WS-008 |
| WS-009 | 版本与差异：快照、Toast、修订模式高亮 | P0 | All | Versioning/Diff | AC-WS-009 |
| WS-010 | 反馈、引用与追问：Per-message、Citations、suggestion_chips | P0 | All | Telemetry/Search | AC-WS-010 |
| WS-011 | 推理透明化：Reasoning Steps 折叠面板（流式/失败高亮） | P0 | All | Agent Reasoning Log | AC-WS-011 |
| WS-012 | Sidebar & Navigation：布局、主题、会话管理、历史加载、任务管理器 | P0 | All | Session/Process | AC-WS-012 |
| WS-013 | 隐私与共享：默认私有、团队分享、临时对话不入库 | P0 | All | IA/Storage | AC-WS-013 |

---

### 6.2 需求条目

#### WS-001：Workspace as OS（核心隐喻）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：2.0
- 描述（What）：
  - Session → Process（进程）：
    - 交互不再是简单对话，而是启动一个或多个智能进程
    - 生命周期：Created → Running（后台执行）→ Suspended（挂起/等待人工）→ Completed
    - 持久化：所有进程状态必须持久化存储，支持断点续传（类比 `kubectl exec` 连接到运行中的 Pod）
  - Context → File System（虚拟文件系统 VFS）：
    - Agent 记忆不只依赖 token，上下文必须具备对工作区文件系统（VFS）的读写权限
    - Agent 是“员工”，可直接修改项目文件（Write/Patch），而不仅是提出建议
- 验收标准：
  - AC-WS-001-1：Given 一个进程 Running，When 断线重连，Then 可恢复继续并保持状态一致。
  - AC-WS-001-2：Given Agent 拥有写权限，When 输出 patch/write 操作，Then 可作用于 VFS 并被审计/追踪。

#### WS-002：附件栏（Attachment Area）与多模态输入

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.1.1 / F2.1.2
- 描述（What）：
  - 独立附件栏：位于文本输入框正上方（当有文件被选中时出现）
  - 附件展示：缩略图卡片横向排列，不与文本混排；包含类型图标、文件名、删除按钮
  - 多模态输入：
    - A 拖拽上传：全屏响应，拖入浏览器任意区域显示“释放以添加”遮罩
    - B 按钮上传：点击工具栏 [➕] 选择文件
    - C 剪贴板粘贴：复制截图/文件/文本，在输入框聚焦下 Ctrl+V（Cmd+V），自动识别并转换为附件卡片
  - 限制规则：
    - 单文件最大 512 MB（Benchmark: ChatGPT/Microsoft 365）
    - 单次对话最多 10 个文件，超限 Toast 阻断提示
- 验收标准：
  - AC-WS-002-1：Given 粘贴截图/文件/文本，When 输入框聚焦并粘贴，Then 自动生成对应附件卡片。
  - AC-WS-002-2：Given 超过文件数量/体积限制，When 用户上传，Then Toast 阻断并不进入附件栏。

#### WS-003：工作流选择器（Workflow Selector）- Simplified

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.1.3
- 描述（What）：
  - 布局结构：垂直分层布局（Vertical Layout）
    - 上层：多行文本输入区域
    - 下层（Bottom Toolbar）：工具栏（包含附件与选择器）
  - 具体位置：底部工具栏的最左侧
  - 视觉流向：

    ```text
    ......................................
    ........... 文本输入区域 ...............
    ......................................
    ------------------------------------------
    [➕ 附件] [🤖 合同审查 ⌄]               [➤ 发送]
    ```

  - 形态：透明背景胶囊按钮（Ghost Pill），显示 [图标] 当前工作流名 + 下拉箭头
  - Hover：显示浅色背景
  - 交互：点击弹出简单下拉列表（Dropdown Menu）
    - 内容：仅展示用户已订阅的工作流（通常 <10）
    - 操作：点击列表项切换
  - 切换行为：
    - 场景 A（零态/新对话）：立即更新当前 Agent 设定，UI 无跳转
    - 场景 B（对话进行中）：选择新工作流后自动开启新会话，避免上下文污染
- 验收标准：
  - AC-WS-003-1：Given 对话进行中，When 切换工作流，Then 自动新建会话且不污染当前上下文。

#### WS-004：混合输入能力与生成控制

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.1.4 / F2.1.5
- 描述（What）：
  - 混合输入：Shift+Enter 换行；支持 Markdown
  - 生成控制：
    - 发送后按钮变为“停止（■）”
    - 点击停止：
      - 生成中：立即断开连接，保留已生成内容
      - 等待中：取消请求，自动恢复输入框内草稿
- 验收标准：
  - AC-WS-004-1：Given 发送后进入生成中，When 点击停止，Then 保留已生成内容并停止继续输出。
  - AC-WS-004-2：Given 请求等待中，When 点击停止，Then 取消请求并恢复草稿。

#### WS-005：文本流（Streaming Text)

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.2.1
- 描述（What）：
  - 打字机特效
  - 首字延迟 < 1s
- 验收标准：
  - AC-WS-005-1：Given 正常网络，When 发起生成，Then 首字延迟满足 <1s（在可观测链路上验证）。

#### WS-006：Server-Driven UI（生成式界面）

- 目标：根据 Agent 的决策智能切换展示形态，实现生成式 UI

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.2.2
- 描述（What）：
  - 核心定义：Agent 输出动态 UI 描述 JSON（Server-Driven UI），而非静态 Markdown
  - 动态微件（Dynamic Widgets）：例如渲染 `<DashboardCard type="sales_overview" data={...} />`，支持筛选和钻取
  - 交互式表单（Interactive Forms）：例如 `<ApprovalForm fields={[...]} />`，包含 [✅ 批准] [❌ 驳回]，用户操作回调给 Agent 进程
- 验收标准：
  - AC-WS-006-1：Given 服务端下发 UI JSON，When 前端渲染，Then 必须按 Schema 渲染对应组件并可交互回调。

#### WS-007：人机协同中断（Request for Help / Syscall）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.2.7
- 描述（What）：
  - 定义：当 Agent 权限不足/信息缺失/置信度低时，主动挂起进程（Suspend）并请求介入
  - UI 表现：消息流中弹出“需要协助（Assistance Required）”卡片
    - 明确阻碍：例如“无法访问 `/finance/2025_salary.csv`，权限被拒绝”
    - 操作按钮：[✅ 授权访问] [❌ 拒绝并终止] [✍️ 手动输入数据]
- 验收标准：
  - AC-WS-007-1：Given 进程进入 Suspended，When 用户点击授权/拒绝/手动输入，Then 必须回调到对应进程并继续/终止。

#### WS-008：智能编辑器（Smart Editor）- Creative/Biz Edition

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.2.3
- 描述（What）：
  - 核心定义：与聊天上下文解耦、支持富文本编辑的持久化工作区
  - Agent 驱动触发：
    - 判定源头：是否可打开编辑器由 Agent 根据任务性质决定
    - UI：当判定为交付物时，消息卡底部显示（显眼的操作按钮）[📝 在编辑器中打开]
    - 仅用户点击后右侧面板展开
  - 交互模式：
    - 编辑态：右侧分屏打开，内容提拔进入编辑器
    - 纯净体验：模拟 A4 纸/白板的无干扰书写区；悬浮工具栏仅在选中文字时浮出（加粗/斜体/标题/列表/引用）
    - 交付工具栏：编辑器顶部右侧常驻
      - [📋 复制格式化内容]（Copy as HTML/Markdown）
      - [📥 导出]（PDF/Word/Markdown）
    - 锁定逻辑：用户键入时锁定 Agent 写入；超时 60 秒或断网自动释放锁
    - 行内意图（Inline Intent / Co-authoring）：
      - 选中文字自动浮出 AI 指令气泡（类似 Notion AI / Google Docs Comment）
      - 快捷指令：[✨ 润色] [📏 缩短] [🌐 翻译] 或输入自定义 Prompt
      - 局部更新：仅流式刷新被选中段落，不全篇重写，保持上下文连贯性
- 验收标准：
  - AC-WS-008-1：Given Agent 下发“可交付物”信号，When 用户点击打开编辑器，Then 右侧展开并载入内容。
  - AC-WS-008-2：Given 用户在编辑器输入，When Agent 尝试写入，Then 写入被锁定阻止；超时/断网后自动释放。
  - AC-WS-008-3：Given 选中一段文字并触发润色，When Agent 返回，Then 仅更新选中段落。

#### WS-009：版本与差异（Version & Diff）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.2.3.C
- 描述（What）：
  - 快照机制：每次 Agent 或用户完成一次编辑，系统自动保存版本快照（Snapshot）
  - 更新反馈：当左侧 Chat 要求修改后，Agent 更新编辑器内容，顶部短暂显示 ✅ 已更新 Toast
  - 差异高亮：修订模式下，绿色背景标记新增，红色删除线标记移除
  - 上下文管理：Agent 生成回答时仅读取编辑器当前最新版本（Current State）
- 验收标准：
  - AC-WS-009-1：Given 多次编辑，When 查看历史，Then 存在快照并可进行差异展示。

#### WS-010：反馈、引用与追问（Feedback / Citations / Follow-up）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.2.4 / F2.2.5 / F2.2.6
- 描述（What）：
  - 评价与反馈（Per-Message）：消息卡底部 Action Bar 与复制并列
    - 👍 点赞：高亮；后端记录为高价值资产，用于最佳实践榜排名
    - 👎 点踩：图标变红；可选弹出 [不准确] [不安全] [格式错误]
  - 引用与溯源（Citations）：
    - 规则：当基于上传文件或联网搜索，文中必须包含 [1][2] 引用角标
    - Hover：显示来源摘要（文件名/网页标题）
    - Click：滚动到附件区高亮文件或打开来源网页
  - 智能追问（Agent 驱动）：
    - 触发：依赖后端流式 `suggestion_chips` 事件；为空则前端不展示
    - 时机：仅在 AI 输出结束（`final: true`）后显示
    - 形态：消息卡片下方独立胶囊按钮行
    - 交互：点击即填入输入框并自动发送
- 验收标准：
  - AC-WS-010-1：Given suggestion_chips 为空，When 消息结束，Then 不展示追问 UI。
  - AC-WS-010-2：Given 有 citation，When Hover/Click，Then 显示摘要并定位到来源。

#### WS-011：推理透明化（Thought Transparency / CoT）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：2.3
- 描述（What）：
  - UI：消息卡片顶部默认展示“思考过程（Reasoning Steps）”折叠面板
  - 进行中：实时流式展示步骤（例：查阅员工手册→比对条款）
  - 已完成：自动折叠为摘要“✅ 已完成 4 步推理”，点击展开完整日志
  - 错误处理：若步骤失败，自动展开并高亮卡点，允许用户手动干预（如授权访问云盘）
- 验收标准：
  - AC-WS-011-1：Given 推理步骤流式输出，When 完成，Then 自动折叠为摘要并可展开。

#### WS-012：全局导航与侧边栏（Sidebar & Navigation）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：F2.4.x / 3 / 4 / 2.5
- 描述（What）：
  - 侧边栏布局架构：展开宽度固定 240px；收起（图标/Compact Mode）宽度固定 60px（与 UI/UX Guidelines 一致）
    - 顶部固定区：
      - [+] 新建对话（主按钮）
      - [Toggle] 临时对话（无痕模式）
      - 系统导航菜单：
        - [🏪 工作流市场] Marketplace
        - [📊 数据洞察] Insights
        - [⚙️ 组织设置] Settings：原“三方连接”入口升级，进入身份管理后台（成员/部门/连接）
    - 中部滚动区：历史会话列表（按时间分组）
    - 底部固定区：身份卡片（当前子账号信息）+ 个人设置菜单（点击卡片弹出）
  - 响应式折叠：当右侧智能编辑器展开时，侧边栏自动收起（或仅图标 Compact Mode）；编辑器关闭后恢复
  - 主题切换：移入底部身份卡片的弹出菜单，支持 ☀浅色 / 🌙深色 / 💻跟随系统
  - 会话列表管理：Hover 会话项显示 [•••] 菜单
    - ✏️ 重命名（默认标题由 Agent 自动摘要生成）
    - 🗑️ 删除（软删除/回收站或隐藏）
    - 📌 置顶（可选 MVP）
  - 历史消息加载策略：进入会话预加载最近 20 条；向上滚动触顶触发无感加载（Infinite Scroll）
  - 任务管理器（Process Dashboard）[NEW]：
    - 入口：侧边栏顶部常驻“任务管理器（Activity Monitor）”图标
    - 面板：Running（展示后台 Agent 状态与时长）；Suspended（等待用户确认）
    - 控制：支持 [⏸️ 暂停] [▶️ 恢复] [⏹️ 强制终止（Kill）]
  - 发起新对话（Start New Chat）：
    - 零态视图：清空主界面，展示品牌 Logo
    - 动态快捷指令：基于当前选定工作流展示 3-4 个特定 Prompt 建议
    - 懒创建：仅用户发送第一条消息时才在数据库创建 Session ID
  - UI/UX Guidelines（全局基准）：
    - 布局尺寸：侧边栏展开 240px、收起 60px；Header 高度 64px
    - 视觉状态：浅色 Hover 变暗一级；深色 Hover 变亮一级；所有交互元素 cursor:pointer
    - 消息渲染：生成中末尾闪烁光标符 ▍直到 `final: true`；代码块语法高亮；右上角常驻复制按钮并有“✅ 已复制”反馈
  - 异常体验规范：
    - 网络中断：输入框上方红条提示，自动重连
      - Reconnecting：顶部黄条“连接中断，正在尝试重连...”，禁止发送但可浏览历史
      - 30 秒未恢复：红条“连接失败，请刷新页面” + [刷新] 按钮
    - 生成失败：消息底部显示 Regenerate
    - 文件失败：附件卡片变红，Tooltip 显示原因
- 验收标准：
  - AC-WS-012-1：Given 编辑器展开，When 进入分屏，Then 侧边栏自动收起/紧凑；关闭编辑器恢复。
  - AC-WS-012-2：Given 进入会话，When 首次加载，Then 仅预加载 20 条；上滚触顶继续加载。

#### WS-013：隐私与共享（Privacy）

- 优先级：P0
- 目标用户：所有用户
- Legacy ID：2.6
- 描述（What）：
  - 隐私默认值：所有新会话默认 🔒 私有（Private），仅当前用户（及租户管理员审计）可见
  - 团队分享：
    - 入口：顶部 Header 右上角 [🌐 分享] 按钮
    - 操作：点击弹出确认框“是否将此对话对团队成员公开？”
    - 变更：确认后图标变为“🌐 团队公开”，同子账号/业务组同事可只读查看
  - 临时对话模式（Temporary/Incognito）：
    - 触发：侧边栏临时对话开关
    - 视觉反馈：Header 变深灰/特殊色，显示“🚫 临时模式 - 内容不保存”；输入框水印“当前对话历史将在刷新后消失”
    - 数据逻辑：消息仅在内存流转，不写入 PostgreSQL 历史记录表
    - 无历史：刷新或新建对话后彻底销毁不可恢复
    - 功能限制：禁用团队公开分享
- 验收标准：
  - AC-WS-013-1：Given 临时模式开启，When 刷新或新建对话，Then 历史不可恢复且数据库无记录。
  - AC-WS-013-2：Given 临时模式开启，When 点击分享，Then 分享入口应被禁用。

---

## 7. 权限、合规与审计（如适用）

- 权限与租户隔离：与 IA 模块对齐；会话/共享范围应满足“子账号维度可见性”。
- 敏感操作审计：
  - VFS 写入/补丁、表单审批、授权访问等需要可审计（与 Syscall/工具调用审计对齐）。

---

## 8. 风险、依赖与权衡（Risks & Trade-offs）

- 风险 1：Server-Driven UI Schema 迭代导致前后端兼容风险。
  - 影响：高
  - 缓解：Schema 版本化 + 向后兼容策略；灰度开关。
- 风险 2：编辑器锁与进程状态一致性（断线/多端）。
  - 影响：高
  - 缓解：分布式锁 + 心跳 + 超时释放；状态机单测。
- 风险 3：临时对话“不入库”与追溯/审计的边界。
  - 影响：中
  - 缓解：明确 UI 提示 + 禁用共享 + 监控校验（DB 侧断言）。

---

## 9. 测试与发布（Testing & Release）

- 测试范围：单测 / 集成 / E2E / 回归
- 验收清单入口：<docs/quality/...>
- 重点 E2E：
  - 上传/粘贴文件 → 附件栏 → 发送 → Stop 行为
  - 切换工作流（新会话）
  - Server-Driven UI 渲染与表单回调
  - 编辑器打开/锁定/行内意图/导出/版本差异
  - 断线重连提示与 30 秒失败路径
  - 临时对话不入库与禁用分享

---

## 10. 开放问题（Open Questions）

| ID | 问题 | Owner | 截止日期 | 状态 |
|---|---|---|---|---|
| Q-WS-001 | Server-Driven UI 的标准 JSON Schema/组件白名单与安全策略是什么？ | TBD | TBD | Open |
| Q-WS-002 | Process Dashboard 与“进程”后端数据模型、权限边界如何定义？ | TBD | TBD | Open |
| Q-WS-003 | 引用溯源：网页来源打开策略（新窗口/内置 webview）与安全限制？ | TBD | TBD | Open |
| Q-WS-004 | 临时对话：是否允许文件上传？若允许，文件是否写入 VFS/缓存策略？ | TBD | TBD | Open |
| Q-WS-005 | Sidebar 宽度口径已统一：展开 240px、收起 60px；Header 高度 64px（以 UI/UX Guidelines 为准） | TBD | TBD | Closed |

---

# 附录 A：关键页面与交互细节（补充）

- Super Composer：附件栏在输入框上方；底部工具栏左侧为工作流选择器；发送后 Stop
- Identity/Settings：侧边栏导航包含 [⚙️ 组织设置]，链接到身份管理后台
- Editor：右侧分屏，顶部右侧导出工具栏；选中文字出现行内 AI 气泡

# 附录 B：数据埋点需求（Analytics）

- chat_new：创建新会话（参数：workflow_id）
- chat_temp_mode：开启/关闭临时模式
- chat_share：私有会话转为公开
- msg_like / msg_dislike：消息点赞/点踩（参数：msg_id, workflow_id）
- file_upload：上传文件（参数：count, file_type, size, source='paste'|'drag'|'click'）
- editor_open：点击按钮打开智能编辑器（原 canvas_open）
- editor_edit：用户手动编辑内容
- editor_export：用户点击导出/复制
- workflow_switch：切换工作流（参数：from_id, to_id）
- sidebar_nav_click：点击系统导航（marketplace/insights/settings）
- theme_change：主题切换

# 附录 C：术语表（Glossary）

| 术语 | 定义 |
|---|---|
| Workspace as OS | 工作区即操作系统：会话=进程；上下文=虚拟文件系统 |
| Process | 智能进程，具备 Created/Running/Suspended/Completed 生命周期并需持久化 |
| VFS | 工作区虚拟文件系统，Agent 可读写/补丁，作为任务资产载体 |
| Server-Driven UI | 服务端（Agent）下发 UI JSON 描述，前端按 Schema 渲染组件/表单 |
| Smart Editor | 与聊天解耦的持久化编辑器，支持导出、锁定、行内意图、版本与差异 |
| suggestion_chips | 后端流式事件，驱动智能追问 UI 的展示与交互 |

