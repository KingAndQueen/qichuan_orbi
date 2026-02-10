# Orbitaskflow Agent 语义接口协议规范 (Agent Semantic Protocol Specification)

文档版本：v0.3（Draft）  
最后修改日期：2026-02-01  
作者：Billow
适用范围：`docs/technical/protocols/` 下的 L2 语义层契约（跨 Adapter/Runtime 的统一语义对象与最小规范）
相关文档：
- `docs/docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/api/core-service.md`
- `docs/technical/api/agent-bridge.md`
文档目的：
定义 Orbitaskflow 系统中“智能员工（Agent）”的统一语义协议（Semantic Layer）。本规范作为跨 Agent、跨运行时（Coze / LangGraph / ADK）的语义契约（Semantic Contract），用于抹平异构实现差异，支撑互操作、治理、评测与长期演进。

说明：本规范仅覆盖 Agent 语义层协议，不等价于 Orbitaskflow 的系统级 API/交互协议总集。系统级交互事件与传输细节见 `interaction-protocol.md`；各服务 API 见对应 API 契约文档。
---

## 1. 概述 (Overview)

### 1.1 第一性定义 (First Principle)

在 Orbitaskflow 体系中，Agent 被定义为：

**Agent 是一个可发现（Discoverable）、可调用（Invocable）、可组合（Composable）的协作实体。**\
它通过暴露 **Profile**（身份与能力边界），消费与产出 **标准化消息（Message）**，推进 **任务（Task）** 状态机，并生成可引用的 **制品（Artifact）**。

该定义是本协议的唯一语义锚点。

---

### 1.2 语义层与执行层边界 (Semantic vs Execution Boundary)

- **语义层（本规范关注）**

  - 定义：对象的数据结构与含义
  - 覆盖对象：`Message`、`ContentPart`、`Task`、`Artifact`、`Profile`
  - 核心问题：**“传的是什么（What）”**

- **执行层（本规范不关注）**

  - 例如：HTTP / WebSocket / SSE、RPC、流式分片、重试、超时、限流
  - 核心问题：**“怎么传（How）”**

本规范**不定义**任何执行细节。\
所有运行时行为由 `interaction-protocol.md` 与 Adapter 实现负责。
执行层信封与事件类型枚举以 `interaction-protocol.md` 为准，语义层不复述 Envelope。

---

### 1.3 统一类型约定 (Common Conventions)

本节定义所有对象共享的基础约定，以便跨语言实现一致。

- 为保证跨团队/跨 Adapter 一致性，必须保留一个标准键位：
  - extensions.extension_attributes: Record<string, any>
- 该保留键用于承载平台通道扩展/非标准元数据（等价于 Bot Framework / Copilot 生态的 channelData 语义），不得与未来标准字段语义冲突。
- 约束：
  - Consumer 必须忽略 extensions 内未知字段；
  - 业务逻辑不得依赖 extension_attributes 的平台私有字段做关键分支（只允许用于调试、审计、对齐与灰度）。
  - 落点约束（强制）：任何平台私有/通道私有字段**必须**放入 `extensions.*`（优先 `extensions.extension_attributes`），不得新增顶层 `x_*` 字段。
  - 前向兼容：Adapter 可以写入 `extensions`，但 Consumer 必须忽略未知字段；业务关键分支不得依赖平台私有字段。

#### 1.3.1 ID 命名与格式 (Identifiers)

本规范对 ID 的约束以 `docs/standards/ssot-glossary.md` 与 `docs/standards/api-style-guide.md` 为准；本协议仅要求所有 `*_id` 字段类型为 `string`，且 ID 的唯一性默认受 [TERM-IA-035] 主账号边界键约束（`master_account_id` + 可选 `sub_account_id`）。


#### 1.3.2 时间戳 (Timestamps)

- 所有时间戳字段使用 **ISO8601 + UTC**，例如：`2025-12-12T14:23:11Z`。
- 协议层不定义时钟同步机制；实现层应保证必要的时间校准。

#### 1.3.3 扩展字段 (Extensions)

- 语义对象允许增加扩展字段，但必须满足：
  - **只新增，不改变既有字段语义**
  - 扩展字段不得与未来标准字段冲突
- **统一扩展口径（强制）**：
  - 任何平台私有/通道私有字段 **必须** 放入 `extensions.*`（优先 `extensions.extension_attributes`）
  - **不得** 新增任何顶层 `x_*` 字段（例如 `x_<vendor>_<name>` 一律禁用），以避免破坏跨 Adapter 一致性与后续标准化演进
- 兼容性要求：
  - Consumer 必须忽略 `extensions` 内未知字段；
  - 业务关键分支不得依赖 `extensions.extension_attributes` 的平台私有字段（仅允许用于调试、审计、对齐与灰度）。


#### 1.3.4 会话主键（规范性）

- **Canonical**：所有语义对象、引用与上下文锚点的会话主键一律使用 `session_id`。
- **Legacy alias**：`conversation_id` 仅作为某些外部运行时返回的历史字段存在，必须标注 deprecated/legacy，并在业务层映射回 `session_id`。不得将 `conversation_id` 作为新的契约字段继续扩散。
- **执行层耦合**：执行层事件的 `control.session_id` 是路由锚点；若外部返回 `conversation_id`，可写入 `control.legacy.conversation_id` 便于兼容调试，但以 `session_id` 为准。

---

### 1.4 兼容性与版本策略概览 (Compatibility & Versioning)

- **后向兼容原则：**
  - 消费者（Consumer）必须**忽略未知字段**。
  - 若遇到未知枚举值（例如未来新增 `Task.state`），消费者必须以**保守策略**处理（例如视为“不可推进/需人工检查”或“未知终态”）。
- **版本策略：**
  - **MAJOR**：破坏兼容的修改。
  - **MINOR**：新增字段/新增枚举（后向兼容）。
  - **PATCH**：文案/示例/非语义修订。
---
### 1.5 调用选项（Invocation Options）（规范性)

说明：语义层不规定传输形态（SSE/WS/HTTP），但允许调用方表达“期望的执行形态”和“工作流变量输入”等跨平台公共语义，从而让 Adapter 少写平台特例。
- invocation_options 用于表达：
  - 响应模式（blocking vs streaming）
  - 执行模式（sync vs async）
  - 工作流变量输入（inputs）与自然语言 query 的分离
  - 检索/RAG 透传控制（retrieval_config）
  - 供应商兜底透传（vendor_overrides）
具体字段定义见 2.3.2 InvocationOptions。
---
### 1.6 会话状态（Session State）（规范性）
说明：部分运行时（尤其云厂商/对话托管服务）要求显式传递会话状态。为避免 Adapter 私有字段分叉，语义层定义最小公共结构 SessionState。
- session_state 用于区分：
  - session_attributes：跨回合持久化属性
  - turn_attributes：仅本回合有效的临时属性
具体字段定义见 2.3.3 SessionState。
---
## 2. 核心对象定义 (Core Data Models)

### 2.1 统一消息 (Unified Message)

**派生定义（Derived Definition）：**

**Message 是 Agent 在 Session 上交换的最小语义载体；可选关联 Task（当进入执行单元时）。**
它只描述“说了什么 / 引用了什么”，不描述“发给谁 / 怎么执行 / 何时调度”。

Message 的设计目标是：在不同运行时（Coze / LangGraph / ADK）之间保持内容语义一致，并作为审计、评测与可视化的稳定输入。

`AgentMessage` 是智能体之间、智能体与用户之间交换信息的**最小语义单元**。 **Message 本身不包含任何路由或控制逻辑。**

#### 2.1.1 字段定义 (Field Definitions)

| 字段           | 类型                                        | 必填 | 说明                                                                                |
| ------------ | ----------------------------------------- | -- | --------------------------------------------------------------------------------- |
| `message_id` | `string`                                  | 是  | 消息唯一标识。建议 UUIDv4（或可排序的 ULID），在同一主账号边界键范围内全局唯一（`master_account_id` + 可选 `sub_account_id`）。                                           |
| `role`       | `"user" \| "agent" \| "tool" \| "system"` | 是  | 消息语义角色。`tool` 表示工具输出或工具相关消息；`system` 表示系统注入的控制性内容（仍不包含 routing）。                  |
| `session_id` | `string`                                  | 是  | 所属会话上下文 ID。用于将消息归档到同一上下文容器。                                                       |
| `task_id`    | `string`                                  | 否  | 所属任务上下文 ID。用于将多轮消息绑定到同一任务生命周期。**纯对话消息允许省略；进入执行单元时必须提供。** |
| `process_id`      | `string` | 否 | 执行锚点（可选）：若消息属于某次“进程/执行链路”，用于指向该执行单元的稳定 ID。 |
| `workflow_run_id` | `string` | 否 | 执行锚点（可选）：若消息属于一次 workflow 运行实例，用于指向该运行实例的稳定 ID。 |
| `agent_id`   | `string`                                  | 条件 | 产生该消息的实体 ID。`role=agent/tool/system` 时必须提供；`role=user` 可选（通常由 Envelope/鉴权层确定发起方）。 |
| `parts`      | `ContentPart[]`                           | 是  | 多模态内容分块数组。顺序有意义（用于渲染与引用定位）。                                                       |
| `provenance` | `object`                                  | 是  | 来源追溯信息（见下表）。                                                                      |
| `citations`  | `Citation[]`                              | 否  | Grounding/溯源引用列表。用于将生成内容对齐到 Artifact 或外部来源（可审计）。                                  |

**字段定义：**

说明：`role` 表示**消息在对话语义中的角色**（如何被模型/渲染理解），而 `provenance` 表示**消息内容的产生与进入系统的来源链路**（用于审计/归因/合规）。 在多数情况下两者一致，但在以下场景会不同：

- **系统代发**：`role=system`（系统注入/策略提示），但 `provenance.producer=agent`（由某个 Agent/Orchestrator 生成并被系统注入）。
- **代理转述**：`role=agent`（Agent 发言），但 `provenance.producer=tool`（Agent 直接转述工具输出作为结论的一部分，供审计区分）。

**规范性规则（Normative Rule）：**

- **默认要求**：实现方必须使 `provenance.producer` 与 `role` 保持一致。
- **允许例外**：仅在以下情况允许不一致，并且必须在 `provenance.producer_id` 中提供可审计的归因线索：
   1. 系统代发/系统注入（`role=system`，但内容由 Agent/Orchestrator 生成）；
   2. 代理转述工具输出（`role=agent`，但内容主要来源于 tool 输出）；
   3. 兼容外部运行时的桥接消息（Adapter 需要保留原始产出方信息）。
- **消费者要求**：Consumer 不得依赖不一致作为业务分支逻辑，仅可用于审计、归因与可观测性。

| 字段            | 类型                                        | 必填 | 说明                                               |
| ------------- | ----------------------------------------- | -- | ------------------------------------------------ |
| `producer`    | `"user" \| "agent" \| "tool" \| "system"` | 是  | 内容的直接产出方类别（审计归因用途）。默认情况下可与 `role` 保持一致。          |
| `producer_id` | `string`                                  | 否  | 产出方标识（如 `agent_id`、`tool_name`、或用户主体 ID）。用于精确归因。 |
| `created_at`  | `string`                                  | 是  | ISO8601 UTC 时间戳，例如 `2025-12-12T14:23:11Z`。       |

**字段定义：**

| 字段            | 类型                                 | 必填 | 说明                             |
| ------------- | ---------------------------------- | -- | ------------------------------ |
| `type`        | `"artifact_ref" \| "external_url"` | 是  | 引用类型：内部 Artifact 或外部 URL。      |
| `artifact_id` | `string`                           | 条件 | `type=artifact_ref` 时必填。       |
| `url`         | `string`                           | 条件 | `type=external_url` 时必填。       |
| `span`        | `object`                           | 是  | 对应到 `parts` 的精确位置（用于可视化高亮与审计）。 |

**字段定义：**

| 字段           | 类型       | 必填 | 说明                                    |
| ------------ | -------- | -- | ------------------------------------- |
| `part_index` | `number` | 是  | 引用发生在哪个 `parts[i]`。从 0 开始。            |
| `start`      | `number` | 是  | 字符偏移起点（仅适用于 `type=text` 的 `text` 字段）。 |
| `end`        | `number` | 是  | 字符偏移终点（不含）。                           |

**任务与执行锚点规则（Normative Rules for task/execution anchoring）：**

1. **纯对话消息**：当消息不属于任何执行单元时，`task_id` / `process_id` / `workflow_run_id` 均可省略。
2. **执行内消息**：当消息属于某次执行单元（例如一次任务/流程运行、工具调用、异步作业）时：
   - `task_id` **必须**提供；并且
   - `process_id` 与 `workflow_run_id` **至少提供一个**作为执行锚点（推荐同时提供）。
3. **消费者约束**：Consumer 不得假设每条 Message 都存在 `task_id`；仅当存在 `task_id` 或执行锚点（`process_id`/`workflow_run_id`）时，才可进行执行态聚合、计量归因、回放与审计链路拼接。



**规范性说明（Normative Semantics of span）：**

1. **适用范围限制**：
    - `span` **仅适用于** `ContentPart.type="text"`。
    - 对于 `image` / `file_ref` / 其他非文本 Part，不得使用字符型 `span`。
2. **计数规则（强制）**：
    - `start` / `end` 必须以 **Unicode code point** 为计数单位（而非 UTF-8 字节或 UTF-16 code unit）。
    - 该规则用于保证跨语言（Python / Go / JS）的一致性。
3. **区间语义**：
    - `span` 采用 **半开区间** `[start, end)` 语义，与主流编程语言字符串切片保持一致。
4. **顺序与稳定性要求**：
    - `span.part_index` 必须指向 Message 中稳定存在的 Part。
    - 实现方不得在不更新 `span` 的情况下，对已引用的 `parts` 内容做重排或合并。
5. **消费者约束**：
    - Consumer **不得**因为无法精确渲染 `span`（例如字符集不支持）而拒绝整个 Message。
    - 在无法精确高亮的情况下，应降级为“整段引用”。
6. **前向扩展策略**：
    - 未来若支持非文本引用定位（如图像 bbox、PDF page+offset），必须通过新增 `span.kind` 或并行字段实现， **不得改变**当前字符型 `span` 的语义。

```jsonc
{
  "message_id": "msg_uuid_v4",
  "role": "user | agent | tool | system",
  "session_id": "sess_uuid_v4",
  "task_id": "task_uuid_v4",
  "workflow_run_id": "wr_uuid_v4",
  "agent_id": "agent.finance.reimbursement",

  "parts": [
    { "type": "text", "text": "请分析该报销是否合规" },
    { "type": "file_ref", "file_id": "file_123", "mime_type": "application/pdf", "purpose": "input" }
  ],

  "provenance": {
    "producer": "user | agent | tool | system",
    "producer_id": "optional_id",
    "created_at": "2025-12-12T14:23:11Z"
  },

  "citations": [
    {
      "type": "artifact_ref",
      "artifact_id": "art_policy_v3",
      "span": { "part_index": 0, "start": 0, "end": 8 }
    }
  ]
}
```

**强约束：**

- Message **不得**包含 routing / target\_agent / strategy 等控制信息
- Message **不得**内嵌大文件（Base64）
- Message 是**内容语义**，不是命令或执行指令

---

### 2.2 内容分块类型系统 (Content Parts Schema)

**派生定义（Derived Definition）：**

**ContentPart 是 Message 内部的原子内容单元。**
它用于表达多模态输入/输出，并为引用、工具调用与结果回传提供稳定的结构边界。

`Message.parts` 定义多模态内容的**类型系统**。 该系统是 **可扩展但不可破坏兼容性** 的。

#### 2.2.1 通用约束 (Common Rules)

- `parts` 中每个元素必须包含 `type` 字段。
- 禁止在任意 `ContentPart` 中内嵌大文件 Base64（音视频除外也不建议；如需实时音频请走执行层 WebSocket 协议）。
- `file_id` 指向 Orbitaskflow 的统一文件/对象存储抽象（由 Artifact 或 File Service 管理）。
- 扩展类型必须遵循：**只新增，不修改既有字段语义**。

#### 2.2.2 Text Part

| 字段     | 类型       | 必填 | 说明          |
| ------ | -------- | -- | ----------- |
| `type` | `"text"` | 是  | 固定值。        |
| `text` | `string` | 是  | UTF-8 文本内容。 |

```json
{ "type": "text", "text": "string" }
```

#### 2.2.3 Image Part

| 字段          | 类型        | 必填 | 说明                            |
| ----------- | --------- | -- | ----------------------------- |
| `type`      | `"image"` | 是  | 固定值。                          |
| `file_id`   | `string`  | 是  | 图片文件引用 ID（需可下载/可鉴权读取）。        |
| `mime_type` | `string`  | 是  | `image/png` / `image/jpeg` 等。 |
| `alt`       | `string`  | 否  | 无障碍/说明文本。                     |

```json
{
  "type": "image",
  "file_id": "file_img_123",
  "mime_type": "image/png",
  "alt": "optional description"
}
```

#### 2.2.4 File Reference（统一引用）

| 字段          | 类型                                 | 必填 | 说明                      |
| ----------- | ---------------------------------- | -- | ----------------------- |
| `type`      | `"file_ref"`                       | 是  | 固定值。                    |
| `file_id`   | `string`                           | 是  | 文件引用 ID（如 PDF/表格/压缩包等）。 |
| `mime_type` | `string`                           | 是  | 例如 `application/pdf`。   |
| `purpose`   | `"input" \| "output" \| "context"` | 是  | 文件用途：输入/输出/上下文引用。       |

```json
{
  "type": "file_ref",
  "file_id": "file_456",
  "mime_type": "application/pdf",
  "purpose": "input | output | context"
}
```

#### 2.2.5 Tool Call（语义级，非执行）

| 字段          | 类型            | 必填 | 说明                             |
| ----------- | ------------- | -- | ------------------------------ |
| `type`      | `"tool_call"` | 是  | 固定值。                           |
| `call_id`   | `string`      | 是  | 调用相关联 ID，用于和 `tool_result` 配对。 |
| `tool_name` | `string`      | 是  | 工具名称（与工具注册表/Manifest 对齐）。      |
| `arguments` | `object`      | 是  | 工具入参对象（结构由工具 schema 定义）。       |

```json
{
  "type": "tool_call",
  "call_id": "call_uuid",
  "tool_name": "expense_checker",
  "arguments": { "amount": 100, "currency": "USD" }
}
```
##### 2.2.5.X 保留工具名（Reserved tool_name for Ontology）

为支持未来与 Ontology 类语义对象系统演进（仅语义锚点，不定义执行层细节），本规范 **保留** 以下 `tool_name`：

- `ontology.query`：查询/获取对象视图（Object View）或对象集合
- `ontology.action.submit`：提交动作意图（Action Intent），返回 `action_ref`（并可异步生成 receipt）

**占位约束：**
- 未实现这些工具的 Adapter/Consumer 必须以“未知工具”处理（忽略或按执行层错误策略返回），不得自行发明同名但不同语义的实现。
- `arguments` 与 `result` 的详细 schema 在后续 Ontology/SOR 专项契约中冻结；本规范仅在语义层保留稳定命名空间与最小字段建议。

**建议的最小 arguments 形态（非规范性，供实现对齐）：**

`ontology.query`：
```jsonc
{
  "object_type_key": "contract",
  "query": { "by_id": "obj_01H..." },
  "consistency": { "revision": "etag:sha256:..." }
}
```
`ontology.action.submit`：
```jsonc
{
  "action_type_key": "send_email",
  "input": { "to": "a@b.com", "subject": "hi" },
  "idempotency_key": "idem_01H...",
  "object_refs": [
    { "type": "object_ref", "object_type_key": "customer", "object_id": "obj_01H..." }
  ]
}
```
**建议的最小 result 形态（非规范性）：**
```jsonc
{
  "action_ref": { "type": "action_ref", "action_type_key": "send_email", "action_id": "act_01H..." },
  "receipt_id": "rcpt_01H...",
  "status": "accepted | denied | queued"
}
```

#### 2.2.6 Tool Result

| 字段         | 类型              | 必填 | 说明                                        |
| ---------- | --------------- | -- | ----------------------------------------- |
| `type`     | `"tool_result"` | 是  | 固定值。                                      |
| `call_id`  | `string`        | 是  | 对应 `tool_call.call_id`。                   |
| `result`   | `object`        | 是  | 工具输出对象（结构由工具 schema 定义）。                  |
| `is_error` | `boolean`       | 是  | 是否错误结果。为 `true` 时，`result` 仍应包含可序列化的错误信息。 |

```json
{
  "type": "tool_result",
  "call_id": "call_uuid",
  "result": { "status": "ok" },
  "is_error": false
}
```

说明：\
`tool_call` / `tool_result` 仅表达**语义意图与结果**，\
不等价于任何具体函数调用或 RPC。
#### 2.2.7 Object Reference（对象引用，占位）

**派生定义（Derived Definition）：**

ObjectRef Part 用于在消息中**稳定引用**某个“类型化对象实例/对象视图”，避免在 Message 中嵌入大对象 payload。
对象 payload 的获取/展开由执行层工具（例如 `ontology.query`）或其他 API 完成；本规范只定义引用形态。

| 字段              | 类型            | 必填 | 说明 |
|-------------------|-----------------|------|------|
| `type`            | `"object_ref"`  | 是   | 固定值。 |
| `object_type_key` | `string`        | 是   | 对象类型 key（对齐 SSOT：Object Type / SOR）。 |
| `object_id`       | `string`        | 是   | 对象实例 ID（或对象视图 ID）。 |
| `revision`        | `string`        | 否   | 可选：版本/修订号（如 etag / revision），用于一致性读取。 |
| `hint`            | `object`        | 否   | 可选：渲染/读取提示（不得承载业务关键语义）。 |

```jsonc
{
  "type": "object_ref",
  "object_type_key": "contract",
  "object_id": "obj_01H...",
  "revision": "etag:sha256:...",
  "hint": { "view": "summary" }
}
```

#### 2.2.8 Action Reference（动作引用，占位）

**派生定义（Derived Definition）：**

ActionRef Part 用于在消息中引用某次“动作意图/动作执行”的稳定指针，便于幂等、追踪与回执关联。
动作执行细节与副作用结果应以 Receipt / Audit 等事实为准；本规范只定义引用形态。

| 字段              | 类型             | 必填 | 说明 |
|-------------------|------------------|------|------|
| `type`            | `"action_ref"`   | 是   | 固定值。 |
| `action_type_key` | `string`         | 是   | 动作类型 key（对齐 SSOT：Action Type / SOR）。 |
| `action_id`       | `string`         | 是   | 动作实例 ID（一次提交/一次执行的稳定标识）。 |
| `receipt_id`      | `string`         | 否   | 可选：关联回执 ID（如已生成）。 |
| `hint`            | `object`         | 否   | 可选：渲染/查询提示（不得承载业务关键语义）。 |

```jsonc
{
  "type": "action_ref",
  "action_type_key": "send_email",
  "action_id": "act_01H...",
  "receipt_id": "rcpt_01H...",
  "hint": { "state": "accepted" }
}
```

---

### 2.3 任务与上下文指针 (Task & Context Pointer)

**派生定义（Derived Definition）：**

**Task 是 Agent 协作的执行单元（Unit of Work）。**
它通过状态机描述推进与挂起，并借助 `context_pointer` 保证在异构运行时中的可恢复性（Recoverability）。

`AgentTask` 表示一次协作单元，用于承载状态、挂起与副作用。

#### 2.3.1 字段定义 (Field Definitions)

| 字段                | 类型                                                                 | 必填 | 说明                                                            |
| ----------------- | ------------------------------------------------------------------ | -- | ------------------------------------------------------------- |
| `task_id`         | `string`                                                           | 是  | 任务唯一标识。建议 UUIDv4/ULID。                                        |
| `kind`            | `"task"`                                                           | 是  | 固定值（为未来扩展保留）。                                                 |
| `scope`           | `"session" \| "global"`                                            | 是  | 任务作用域：`session` 表示任务隶属于会话上下文；`global` 表示跨会话的全局任务（必须显式声明输入来源）。 |
| `state`           | `"CREATED" \| "RUNNING" \| "SUSPENDED" \| "COMPLETED" \| "FAILED" \| "CANCELLED"` | 是  | 标准任务状态机。允许未来新增终态（见 Freeze Policy）。`CANCELLED` 表示用户/系统主动停止，不是错误终态。                            |
| `invocation_options`|`InvocationOptions`|否|调用选项：响应模式/执行模式/工作流 inputs/检索透传/供应商兜底透传等（见 2.3.2）。|
| `session_state`|`SessionState`|否|会话状态：区分跨回合持久属性与仅本回合属性（见 2.3.3）。|
| `suspension`      | `object`                                                           | 否  | 当 `state=SUSPENDED` 时必填，描述挂起原因与恢复所需输入。                        |
| `context_pointer` | `ContextPointer`                                                   | 是  | 状态恢复凭证：黑盒引用或白盒快照引用。                                           |
| `artifacts`       | `ArtifactRef[]`                                                    | 否  | 本任务产出物引用列表。                                                   |

**字段定义：**

| 字段               | 类型                                                             | 必填 | 说明                                      |
| ---------------- | -------------------------------------------------------------- | -- | --------------------------------------- |
| `reason`         | `"user_input" \| "approval_required" \| "external_dependency"` | 是  | 挂起原因：等待用户输入/等待审批/等待外部依赖（如工具输出）。         |
| `required_parts` | `string[]`                                                     | 是  | 恢复任务所需的内容类型提示（例如 `text`、`tool_result`）。 |

**字段定义：**

| 字段         | 类型                               | 必填 | 说明                                                                                            |
| ---------- | -------------------------------- | -- | --------------------------------------------------------------------------------------------- |
| `kind`     | `"opaque_ref" \| "snapshot_ref"` | 是  | `opaque_ref`：外部黑盒（如 Coze 的 conversation\_id）；`snapshot_ref`：内部白盒（如 LangGraph checkpoint\_id）。 |
| `ref`      | `string`                         | 是  | 引用值（Conversation ID / Checkpoint ID / Thread ID 等）。                                           |
| `metadata` | `object`                         | 否  | Adapter 内部可用的辅助信息。**不得承载业务语义**，Consumer/业务层不得依赖。                                              |

**规范性规则（Normative Rule）：Coze 等外部运行时句柄映射**

- 当 `kind="opaque_ref"` 且 provider 为 Coze 时：
   - `ref` **应**存放 `session_id`（执行级关联句柄）。如外部运行时仅返回 `conversation_id`，需将其标注为 legacy 并在业务层映射回 `session_id`。
   - Adapter **必须**默认以显式注入方式提供上下文，并默认设置 `auto_save_history=false`（参考 Appendix A）。
   - `metadata` **可以**包含（仅供 Adapter 恢复与续跑）：
     - `chat_id`：当前轮次执行实例 ID（如工具调用恢复时需要）；
     - `section_id`：若执行过 clear-context/分段，则记录当前分段；
     - `coze_user_id`：外部运行时所需的 user_id（映射规则参考 Appendix A）；
     - `provider` / `region` / `endpoint`：便于排障与观测；如需保留 legacy `conversation_id`，仅可写入 `metadata` 并标注 deprecated。
- 以上字段**不得**被业务逻辑当作稳定契约使用；如需稳定承诺，必须提升为标准字段并升级版本。

**字段定义：**

| 字段            | 类型       | 必填 | 说明                                        |
| ------------- | -------- | -- | ----------------------------------------- |
| `artifact_id` | `string` | 是  | 制品 ID。                                    |
| `type`        | `string` | 是  | 制品类型（例如 `report`/`dataset`/`code_patch`）。 |
| `file_id`     | `string` | 条件 | 若制品以文件形式存储则必填。                            |
**示例 A：执行内消息（含 task_id + 执行锚点）**

```jsonc
{
  "message_id": "msg_uuid_v4",
  "role": "user | agent | tool | system",
  "session_id": "sess_uuid_v4",

  "task_id": "task_uuid_v4",
  "workflow_run_id": "wr_uuid_v4",

  "agent_id": "agent.finance.reimbursement",
  "parts": [
    { "type": "text", "text": "请分析该报销是否合规" },
    { "type": "file_ref", "file_id": "file_123", "mime_type": "application/pdf", "purpose": "input" }
  ],
  "provenance": {
    "producer": "user | agent | tool | system",
    "producer_id": "optional_id",
    "created_at": "2025-12-12T14:23:11Z"
  },
  "citations": [
    {
      "type": "artifact_ref",
      "artifact_id": "art_policy_v3",
      "span": { "part_index": 0, "start": 0, "end": 8 }
    }
  ]
}
```
```jsonc
{
  "message_id": "msg_uuid_v4",
  "role": "user",
  "session_id": "sess_uuid_v4",
  "parts": [
    { "type": "text", "text": "我们先讨论下方案的风险点。" }
  ],
  "provenance": {
    "producer": "user",
    "created_at": "2025-12-12T14:23:11Z"
  }
}
```
**设计原则：**

- 协议目标是 **可恢复（Recoverable）**，而非强制无状态
- `opaque_ref`：用于外部黑盒系统（如 Coze）
- `snapshot_ref`：用于内部白盒系统（如 LangGraph）

#### 2.3.2 InvocationOptions（调用选项）（规范性）

**设计意图：**
- 将“快速适配多平台”时常见但容易分叉的字段收敛为统一语义：
  - 工作流变量 `inputs`
  - `streaming` vs `blocking`
  - `sync` vs `async`
  - RAG/检索透传
  - vendor 兜底透传

**字段定义：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `response_mode` | `"streaming" \| "blocking"` | 否 | 期望响应模式。未提供时由执行层默认（推荐默认 `streaming` 用于 Chat）。 |
| `execution_mode` | `"sync" \| "async"` | 否 | 期望执行模式。`async` 表示允许运行时返回 job/handle，并通过后续事件/轮询获取结果。 |
| `query` | `string` | 否 | 自然语言 query 的显式覆盖值。未提供时，可由 Adapter 从最新 `role=user` 的 `text` parts 聚合得到。 |
| `inputs` | `Record<string, any>` | 否 | 工作流变量输入（如 Dify/Flowise/LangFlow 的 `inputs/custom_variables/tweaks`）。必须可 JSON 序列化。 |
| `retrieval_config` | `RetrievalConfig` | 否 | 检索/RAG 控制参数（见 **2.3.2.1**）。 |
| `vendor_overrides` | `Record<string, any>` | 否 | 供应商/运行时兜底透传（Adapter 专用）。不得承载业务语义，仅用于对齐平台字段差异。 |

**规范性规则（Normative Rules）：**
- Consumer 不得依赖 `vendor_overrides` 作为业务分支，仅允许用于调试/审计/灰度。
- Adapter 若将 `inputs` 映射到平台工作流字段，必须保证：
  - key 名与工作流变量名严格匹配；
  - 不得将 `inputs` 自动写入长期记忆（Memory SSOT 原则不变）。

##### 2.3.2.1 RetrievalConfig（检索透传）（推荐）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `serving_config` | `string` | 否 | 供应商检索配置引用（如某些平台的 `serving_config` / `dataset_id` 等）。 |
| `filter` | `string \| object` | 否 | 检索过滤条件（允许平台表达式字符串或结构化对象）。 |
| `boost_spec` | `object` | 否 | 结果加权/boost 描述（结构由 Adapter 透传/解释）。 |
| `top_k` | `number` | 否 | 期望返回数量（若平台支持）。 |
| `vendor_overrides` | `Record<string, any>` | 否 | 检索域的兜底透传（仅 Adapter 使用）。 |

---

#### 2.3.3 SessionState（会话状态）（规范性）

**字段定义：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `session_attributes` | `Record<string, string>` | 否 | 跨回合持久化属性。仅用于“会话级”状态表达，是否落盘由执行层/记忆策略决定。 |
| `turn_attributes` | `Record<string, string>` | 否 | 仅本回合有效属性。**不得**自动写入长期记忆或历史存储。 |

**规范性规则（Normative Rules）：**
- `turn_attributes` 必须在该 Task 生命周期结束后失效。
- Adapter 可以将 `session_attributes/turn_attributes` 映射到平台的 `sessionState` / `custom_attributes` / `conversation_state` 等字段，但不得改变其“持久 vs 临时”的语义。

---

#### 2.3.4 AgentRef（版本引用）（推荐）

目的：支持云厂商 alias / Marketplace 安装锁定 / 手动升级等版本引用场景。

**字段定义：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `agent_id` | `string` | 是 | Agent 全局标识符（与 Profile.agent_id 一致）。 |
| `agent_alias_id` | `string` | 否 | 别名/别名版本（例如云厂商 `aliasId` / deployment slot）。 |
| `agent_version` | `string` | 否 | 明确版本号（SemVer 或内部版本）。 |
| `release_tag` | `string` | 否 | Marketplace / 发布标签（如 `stable` / `canary` / `master_locked`）。 |

---

### 2.4 智能体画像 (Agent Profile & Runtime Manifest)

**派生定义（Derived Definition）：**

**Profile 是 Agent 的能力与身份边界声明。**
Static Profile 描述能力上限；Runtime Manifest 描述在当前主体/主账号边界键/策略下可实际使用的能力投影。

#### 2.4.1 Static Agent Profile（能力上限）

Static Profile 描述 Agent 的能力上限（不考虑具体调用者/主账号边界键的裁剪）。

**字段定义：**

| 字段             | 类型       | 必填 | 说明                                                    |
| -------------- | -------- | -- | ----------------------------------------------------- |
| `agent_id`     | `string` | 是  | Agent 全局标识符（建议稳定且可读，如 `agent.finance.reimbursement`）。 |
| `version`      | `string` | 是  | Agent 版本号（建议 SemVer）。                                 |
| `capabilities` | `object` | 是  | 能力声明（见下表）。                                            |

**字段定义：**

| 字段                       | 类型         | 必填 | 说明                                                         |
| ------------------------ | ---------- | -- | ---------------------------------------------------------- |
| `modalities`             | `string[]` | 是  | 支持的输入/输出模态集合（示例：`text`、`file`、`image`）。建议未来可扩展到 MIME/更细粒度。 |
| `tools`                  | `string[]` | 是  | 可用工具名称列表（与工具注册表/工具 schema 对齐）。                             |
| `supports_human_in_loop` | `boolean`  | 否  | 是否支持 HITL（审批/补全输入等）。                                       |

```json
{
  "agent_id": "agent.finance.reimbursement",
  "version": "1.0.0",
  "capabilities": {
    "modalities": ["text", "file"],
    "tools": ["expense_checker"],
    "supports_human_in_loop": true
  }
}
```

#### 2.4.2 Runtime Manifest（运行时投影）

Runtime Manifest 是 Static Profile 的**同构投影**，经主账号边界键、角色、策略过滤（RBAC/ABAC）。

**字段定义：**

| 字段             | 类型       | 必填 | 说明                                   |
| -------------- | -------- | -- | ------------------------------------ |
| `agent_id`     | `string` | 是  | 对应的 Agent ID。                        |
| `principal_id`    | `string` | 是  | 当前调用主体 ID（与 `Envelope.control.principal_id` 同源/同值）。 |
| `master_account_id` | `string` | 是 | 主账号 ID（与 `Envelope.control.master_account_id` 同源/同值；客户端不得伪造）。 |
| `sub_account_id` | `string` | 否 | 子账号 ID（与 `Envelope.control.sub_account_id` 同源/同值；如存在子账号上下文则必填）。 |
| `capabilities` | `object` | 是  | 裁剪后的能力集合（字段同 Static Profile）。        |
| `limits`       | `object` | 否  | 运行时限制（token budget、风险等级、并发等）。字段为扩展点。 |
| `agent_alias_id` | `string` | 否 | 运行时别名/部署槽位（用于云厂商 alias 或 Marketplace 安装锁定）。 |
| `release_tag` | `string` | 否 | 发布标签（`stable`/`canary`/`master_locked` 等）。 |

```json
{
  "agent_id": "agent.finance.reimbursement",
  "principal_id": "principal_123",
  "master_account_id": "master_abc",
  "sub_account_id":"sub_legal_001",

  "capabilities": {
    "modalities": ["text"],
    "tools": []
  },

  "limits": {
    "risk_level": "restricted",
    "max_tokens": 2048
  }
}
```

---

### 2.5 错误模型 (Error Model)

**派生定义（Derived Definition）：**

**Error 是对失败语义的统一表达。**
语义层错误用于跨运行时一致地描述“失败是什么、是否可重试”，而不关心具体的执行层异常形式。

本规范定义**语义层错误对象**，用于跨运行时一致表达错误与可重试性。执行层（HTTP 状态码、gRPC code）由 Adapter 负责映射。

#### 2.5.1 标准错误对象 (AgentError)

```jsonc
{
  "code": "AGENT_RUNTIME_ERROR",
  "message": "Human-readable summary.",
  "retryable": false,
  "details": {
    "provider": "coze_cn",
    "raw_error": "..."
  }
}
```

| 字段          | 类型        | 必填 | 说明                                                       |
| ----------- | --------- | -- | -------------------------------------------------------- |
| `code`      | `string`  | 是  | 错误码（稳定、可枚举）。建议前缀化：`AGENT_*` / `TOOL_*` / `VALIDATION_*`。 |
| `message`   | `string`  | 是  | 面向人类的简要说明（可用于 UI/日志）。                                    |
| `retryable` | `boolean` | 是  | 是否建议重试（语义建议，不等同于执行层重试策略）。                                |
| `details`   | `object`  | 否  | 可选扩展信息（如 provider、原始错误、trace 线索）。不得包含敏感信息。               |

#### 2.5.2 错误在协议中的承载位置

- \*\*工具错误：\*\*当 `ContentPart.type="tool_result"` 且 `is_error=true` 时，`result` 应包含 `AgentError` 或其等价结构。
- \*\*任务失败：\*\*当 `Task.state="FAILED"` 时，建议在实现层事件载荷中携带 `error: AgentError`（不改变本规范核心对象的纯洁性）。

#### 2.5.3 标准错误码枚举 (Error Code Registry)

以下错误码作为 **v0.1 推荐枚举集合**。实现方可以新增错误码，但必须遵循命名规范，并保证语义清晰、稳定。

##### A. AGENT\_\*（Agent 级错误）

| 错误码                   | 含义               | retryable | 说明                |
| --------------------- | ---------------- | --------- | ----------------- |
| `AGENT_RUNTIME_ERROR` | Agent 执行时发生未分类异常 | false     | 默认兜底错误，用于未知运行时异常。 |
| `AGENT_TIMEOUT`       | Agent 执行超时       | true      | 建议可重试，具体由执行层策略决定。 |
| `AGENT_INTERRUPTED`   | Agent 执行被中断      | true      | 例如用户打断或调度器中断。     |
| `AGENT_NOT_AVAILABLE` | Agent 当前不可用      | true      | 例如实例不可达、熔断、维护中。   |

##### B. TOOL\_\*（工具调用错误）

| 错误码                     | 含义       | retryable | 说明                      |
| ----------------------- | -------- | --------- | ----------------------- |
| `TOOL_NOT_FOUND`        | 请求的工具不存在 | false     | 工具名未注册或不在当前 Manifest 中。 |
| `TOOL_INVALID_ARGUMENT` | 工具参数非法   | false     | 参数校验失败。                 |
| `TOOL_EXECUTION_ERROR`  | 工具执行失败   | false     | 工具内部异常（语义层不关心细节）。       |
| `TOOL_TIMEOUT`          | 工具执行超时   | true      | 可考虑重试或降级。               |

##### C. VALIDATION\_\*（协议/输入校验错误）

| 错误码                      | 含义          | retryable | 说明                               |
| ------------------------ | ----------- | --------- | -------------------------------- |
| `VALIDATION_ERROR`       | 输入不符合协议规范   | false     | 缺字段、类型错误、枚举非法等。                  |
| `VALIDATION_UNSUPPORTED` | 当前不支持的能力/模态 | false     | 例如请求了 Agent 不支持的 ContentPart 类型。 |

##### D. AUTH\_\*（鉴权/权限错误，语义层可选）

| 错误码                 | 含义      | retryable | 说明                     |
| ------------------- | ------- | --------- | ---------------------- |
| `AUTH_UNAUTHORIZED` | 未通过身份认证 | false     | 身份无效或过期。               |
| `AUTH_FORBIDDEN`    | 权限不足    | false     | 不具备调用该 Agent/Tool 的权限。 |

**命名规范：**

- 错误码必须全大写，使用下划线分隔。
- 前缀表示错误域（AGENT / TOOL / VALIDATION / AUTH）。
- 新增错误码不得改变既有错误码语义。

---

## 3. 会话上下文与记忆 (Session Context & Memory)

本规范在对象层面通过 `session_id`、`task_id` 与 `context_pointer` 支持“可恢复性”。

### 3.0 核心原则：Memory SSOT 在 Orbitaskflow（规范性）

- **单一事实源（SSOT）**：长期记忆（Memory）与可回放上下文的事实源必须由 Orbitaskflow 内部系统持有（数据库/制品库/知识库/日志）。
- **外部运行时（如 Coze）定位**：仅作为“执行引擎/推理后端”，**不得**成为你们的长期记忆系统。
- **治理目标**：可审计、可复现、可替换。即使外部运行时行为变化，也不影响你们的记忆资产与调试能力。

说明：该原则是本规范的工程约束，优先级高于任何 Adapter 的默认实现。

### 3.1 为什么 Message 里不放 `user_id`？以及为什么使用 `principal_id`

- **语义层目标**是跨运行时统一：不同运行时对“身份”的命名与语义并不一致。
  - Coze 需要 `user_id` 作为运行时隔离键；
  - LangGraph/ADK 不要求同名字段，但仍需要可审计的调用主体。
- 因此本规范采用更上位、可扩展的身份概念：**`principal_id`（主体 ID）**。
  - `principal_id` 表示“可被授权、可被审计、可发起操作的实体”，既可表示人类用户，也可表示服务账号。
- **当目标运行时需要外部运行时 user_id（如 Coze）时，可将 `control.principal_id`/`master_account_id +（可选）sub_account_id` 映射为 Provider 所需的用户句柄，示例见 Appendix A。**
  - 如需续跑，可将 provider 侧 user 句柄写入 `context_pointer.metadata.legacy.*`（仅 Adapter 使用）。

> 术语关系：在“人类用户直接调用”的常见场景中，`principal_id` 等价于业务语义上的 user_id；但在代办/自动化等场景中，`principal_id` 仍保持一致语义而无需新增一堆 `user_*` 字段。

### 3.2 上下文组装计划 (Context Assembly Plan)（规范性）

本节定义一次 Agent 调用中，“模型实际看到的输入上下文”应如何被组装。

**总体要求：**

- 上下文必须由 Orbitaskflow 内部根据 `session_id` / `task_id` / `control` 进行**显式组装**。
- 组装产物必须可审计（至少可记录：选取了哪些消息、哪些摘要、哪些 memory 片段、哪些 artifact 引用）。
- 外部运行时不可被信任为上下文的唯一持有者。

**推荐顺序（从高到低优先级）：**

1. **System Policy（系统策略/主账号边界键政策）**：由系统注入（`role=system` 的 `Message` 或等价结构）。
2. **Memory Snippets（长期记忆片段）**：由你们内部记忆系统检索得到（可来自 KB/Artifacts/用户偏好/历史摘要）。
3. **Recent Turns（短期上下文）**：同一 `session_id` 下最近 N 轮消息，或“最近 N 轮 + 摘要”的组合。
4. **Current User Input（本轮输入）**：用户当前 `AgentMessage`（`role=user`）。
5. **Attachments / Artifacts（引用制品）**：通过 `file_ref` / `artifact_ref` 引用，必要时在注入中附带“可控摘要/索引”。

注：本规范不强制具体 N 值与摘要策略；这些属于执行层策略，但必须遵守“显式组装、可记录”的要求。

---

#### 3.2.1 上下文输入快照 (ContextInputSnapshot)（规范性）

仅有“组装规则（Plan）”不足以支撑可复现调试与审计。本规范要求在关键场景下记录**组装结果（Snapshot）**，以回答：

“本次调用中，模型究竟看到了哪些输入上下文？”

**规范性要求：**

- 当目标运行时为 Coze（`control.provider_hints.provider=coze_*`）时：建议生成并持久化 `ContextInputSnapshot`。
- 当目标运行时为内部白盒（如 LangGraph/ADK）时：同样建议生成并持久化 `ContextInputSnapshot`（白盒已有 checkpoint，但 snapshot 对审计/对照仍有价值）。
- Snapshot 的记录默认遵循“最小化与可复现”原则：优先记录 **引用 + 不可逆哈希（digest）+ 顺序**，避免记录任何可还原原文的内容；如需全文，仅可在受控 Debug 模式下启用（并执行脱敏/合规策略）。

**规范性说明（Normative Note）**：
`digest` 字段为内容的不可逆哈希值（例如 SHA-256 的十六进制输出），仅用于一致性校验与复现验证。
文档示例中使用 `sha256:...` 作为占位符表示哈希结果，**不表示也不得存储原始文本或其可逆编码**。

##### A. 字段定义（推荐最小集合）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `snapshot_id` | `string` | 是 | 快照唯一 ID（UUIDv4/ULID）。 |
| `session_id` | `string` | 是 | 关联会话。 |
| `task_id` | `string` | 是 | 关联任务（一次执行/协作单元）。 |
| `principal_id` | `string` | 条件 | 与 `control.principal_id` 同源；当涉及记忆/个性化或 Coze provider 时必填。 |
| `master_account_id` | `string` | 是 | 与 `control.master_account_id` 同源；服务端 Ticket 恢复后回填，客户端不得伪造。 |
| `sub_account_id` | `string` | 否 | 与 `control.sub_account_id` 同源；如存在子账号上下文则必填。 |
| `policy_refs` | `object[]` | 否 | 注入的系统策略引用（例如 `artifact_id` 或 policy 版本号），不建议存全文。 |
| `selected_messages` | `object[]` | 是 | 选入上下文的消息清单（message_id + 摘要/哈希 + 顺序）。 |
| `memory_snippets` | `object[]` | 否 | 选入的长期记忆片段引用（artifact_id/kb_ref + 哈希）。 |
| `attachments` | `object[]` | 否 | 本次输入涉及的文件/制品引用（file_id/artifact_id）。 |
| `rendered_provider_input` | `object` | 否 | 可选：记录“实际注入到某个 provider 的输入结构摘要”（建议存 count+hash；必要时存精简结构）。 |

`rendered_provider_input` 记录要求（当存在时）：

- Snapshot 必须记录 role normalization 的说明与映射细节（至少说明是否存在 agent/tool 角色被转写/降级）；（可选）记录被注入的 `additional_messages` 数量。
- 当本轮使用 Coze `content_type=object_string` 时，应记录 `content_type`、本轮 `content` 数组的元素数量（parts 数量）；（可选）记录本轮使用到的 Coze `file_id` 列表（用于审计/复现）。

##### B. JSON 示例

```jsonc
{
  "snapshot_id": "ctxsnap_01H...",
  "session_id": "sess_uuid_v4",
  "task_id": "task_uuid_v4",
  "principal_id": "principal_123",
  "master_account_id": "master_abc",
  "sub_account_id": "sub_legal_001",
  "policy_refs": [
    { "kind": "artifact_ref", "artifact_id": "art_policy_v3" }
  ],

  "selected_messages": [
    {
      "order": 1,
      "message_id": "msg_001",
      "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "role": "user"
    },
    {
      "order": 2,
      "message_id": "msg_002",
      "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "role": "agent"
    }
  ],

  "memory_snippets": [
    { "kind": "internal_kb", "artifact_id": "art_kb_policy_v3", "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" }
  ],

  "attachments": [
    { "type": "file_ref", "file_id": "file_123", "mime_type": "application/pdf" }
  ],

  "rendered_provider_input": {
    "provider": "coze_cn",
    "mode": "A",
    "additional_messages_count": 6,
    "additional_messages_digest": "sha256:...",
    "notes": "role normalization applied (coze additional_messages are user-role)."
  }
}
```

## Appendix A. Coze Adapter Notes（Non-normative）

本附录仅提供 Coze 适配的实现示例，描述性的 “may/can/example” 语气，不增加新的规范性约束。

### A.1 流式映射与事件

- 适配器可以将 Coze SSE 或 Realtime WebSocket 事件转译为 `interaction-protocol.md` 的 `type/data/control` 事件，不需要维护独立事件名。
- 需要流式输出时，可使用 `stream=true` 并按顺序转译增量；完成/错误/工具请求等可以映射为 `agent.message.delta/completed`、`agent.task.update`、`agent.tool.call` 等现有类型。
- 未识别的 Provider 事件可忽略或作为调试信息记录。

### A.2 会话与上下文句柄

- 对外主键仍为 `session_id`；Coze 返回的 `conversation_id/chat_id/section_id` 等句柄可以放入 `context_pointer.metadata.legacy.*` 或 Envelope `control.legacy.*` 以便续跑，不必升格为新字段。
- 清理上下文或分段时，可结合这些 legacy 句柄与 `context_pointer.ref=session_id` 维护映射关系。

### A.3 追加消息与对象编码

- 适配器可以使用 Coze `additional_messages` 复用本地组装的上下文快照，也可以按需缩减以做 A/B 对照。
- 若目标使用多模态输入，建议将 `Message.parts` 渲染为 `content_type=object_string`，其中 `file_ref/image` 可映射到上传后的 `file_id`；长期资产仍以平台 `file_ref/artifact_ref` 为 SSOT，需要时重新上传。
- `meta_data` 可用于透传 trace/task 关联信息，容量与敏感字段由实现自行裁剪，必要时可截断或脱敏。
- Coze `file_id` 存在保留期，适配器可以在本地缓存与刷新，也可以在需要时重新上传以保持与 `file_ref` 对齐。
- 追加消息时可以按 Coze 约束将 role 归一化为 `user`，系统提示可转写为文本；如需记录，可在 `rendered_provider_input` 中标注注入模式与条数。

### A.4 身份与路由提示

- 可以将 `master_account_id`、`principal_id`（可选 `sub_account_id`）组合成稳定的 Coze `user_id`...
  - 示例：`user_id = stable_id(master_account_id, principal_id, sub_account_id?)`
- `bot_id` 路由信息可从 `(master_account_id, workflow_id, sub_account_id?)` 或安装配置查询得到...

### A.5 可靠性与告警

- 调用 Coze 接口时可以采集 `logid` 并写入 `AgentError.details` 作为审计线索。
- 常见错误码可映射到 `RATE_LIMIT`/`AUTH`/`PERMISSION`/`PROVIDER_INTERNAL` 等统一分类，重试或熔断策略由实现自行决定。
- 访问令牌来源、限流/并发控制、重连/取消等治理策略可参考平台统一要求，但均属于实现细节。

### A.6 请求协商示例

- 调用 Coze API 时可以使用 `Authorization: Bearer <access_token>`，具体鉴权方式由控制面决定。
- `/v3/chat`、`/v3/chat/submit_tool_outputs` 等 JSON 接口通常使用 `application/json`；上传类接口可以采用 `multipart/form-data`。
- 需要流式返回时可设置 `stream=true` 并使用 `Accept: text/event-stream`，与 SSE fallback 的事件语义保持一致。

### A.7 记忆的协议表达（推荐）

为了兼容“内部白盒记忆”与“外部运行时句柄”，本规范推荐以 **MemoryRef（引用）** 的方式表达（作为扩展点）：

```jsonc
{
  "memory_refs": [
    { "kind": "internal_kb", "artifact_id": "art_kb_policy_v3" },
    { "kind": "internal_profile", "ref": "profile:user:principal_123" },
    { "kind": "runtime_handle", "ref": "session_id=sess_xxx", "metadata": { "legacy_conversation_id": "coze_conv_xxx" } }
  ]
}
```

- `internal_*`：Orbitaskflow 内部可审计、可迁移的记忆形态；
- `runtime_handle`：外部运行时句柄（用于续跑/恢复），不承诺可复现其内部状态。

注意：`memory_refs` 是推荐扩展点，可通过 `extensions` 承载，或在后续 MINOR 版本提升为正式字段。

---

## 4. 协议映射参考 (Non-Normative Mapping) 

| 场景     | 外部系统                   | 语义映射结果                                                  |
| ------ | ---------------------- | ------------------------------------------------------- |
| 工具调用阻断 | Coze `requires_action` | `Message.parts=[tool_call]` + `Task.state=SUSPENDED`    |
| 图中断    | LangGraph `interrupt`  | `Task.state=SUSPENDED` + `context_pointer=snapshot_ref` |
| 黑盒状态   | Coze `conversation_id`（legacy） | `context_pointer.kind=opaque_ref`（ref=canonical `session_id`，metadata.legacy_conversation_id 保留原值） |
| 白盒状态   | LangGraph checkpoint   | `context_pointer.kind=snapshot_ref`                     |
| 身份隔离 | Coze `user_id` | `user_id = stable_id(master_account_id, principal_id, sub_account_id?)`（参考 Appendix A） |
| Bot 路由  | Coze `bot_id`  | `(master_account_id, workflow_id, sub_account_id?) -> bot_id`（参考 Appendix A） |

### Coze Workflow / Dataset API 的边界声明（非规范性）

1. 本协议 v0.x **仅**对齐 Coze 的 **Chat v3（含 SSE）** 与 **Realtime WebSocket** 的对话、事件、工具调用、上下文治理与可观测能力。
2. Coze 的 `workflow/*` 与 `datasets/*` 属于平台能力 API，其 SSOT 应在独立文档（如《CozeAdapter 实现说明》/《Workflow Runtime API 契约》/《Knowledge Hub / RAG API 契约》）中定义，本协议不定义其输入/输出 schema。
3. 若未来需要将 Coze `workflow/stream_run` 的 node 事件映射为 Orbitaskflow Task 进度事件，应在独立文档中定义映射；本协议仅保留扩展点。

---

## 5. 冻结策略与扩展点 (Freeze Policy)

**本规范已冻结其核心语义（Frozen – Core Semantic）。**

允许的受控扩展包括：

1. **新增 ContentPart 类型（仅追加，不破坏兼容）**
2. **新增 Task 状态（消费者必须忽略未知终态）**
3. **扩展 Control 字段（不得影响 Message / Task 语义）**

任何破坏兼容性的修改必须提升 MAJOR 版本。

---

## 6. 附录 (Appendix)

- 本规范是 Orbitaskflow Agent 系统的**唯一语义契约**
- 所有 Adapter（CozeAdapter / LangGraphAdapter / FutureAdapter）**必须严格遵循本规范**
#### 附录 X：Platform Mapping Matrix（平台字段映射矩阵）（非规范性）

目的：把“语义字段”到各平台字段（Coze / OpenAI / Bedrock / Vertex / Dify / Copilot …）做可维护的映射索引，Adapter 只做状态机与序列化。

**X.1 Request 映射（示例骨架）**

| 语义字段 | Coze | OpenAI | Bedrock | Vertex | Dify | Copilot |
|---|---|---|---|---|---|---|
| `Task.invocation_options.inputs` | `custom_variables / inputs` | `metadata`（视实现） | `sessionState.*`（视实现） | `request.*` | `inputs` | `channelData`（经 `extensions.extension_attributes`） |
| `Task.session_state.session_attributes` | `chat_config / memory`（视策略） | `metadata` | `sessionState.sessionAttributes` | `conversation_state` | `conversation_variables` | `conversationState` |
| `control.target_agent_ref.agent_alias_id` | `provider_hints.*`（必要时） | `model/assistant_id`（视实现） | `aliasId` | `serving_config`/deployment | workflow_id/version | bot/skill version |

**X.2 Streaming/Event 映射（示例骨架）**

统一事件（Canonical type）**必须以 `docs/technical/protocols/interaction-protocol.md` 为准**。本表仅做平台 → canonical 的“工程映射索引”，不得发明新的 canonical 事件名。

| 平台事件 | 统一事件（interaction-protocol canonical type） | 说明 |
|---|---|---|
| `requires_action` | `agent.task.update` | 将任务状态更新为 `SUSPENDED`（等待外部输入/工具结果/人工确认）；平台私有语义可落 `control.legacy.*` 或 `extensions.extension_attributes`。 |
| `message_delta` | `agent.message.delta` | 文本/内容增量。 |
| `response.completed` | `agent.message.completed` | 一条消息完成提交点。 |
| `error` | `error` | 错误事件；若同时引起任务失败，应另发 `agent.task.update(state=FAILED)`。 |

注：该附录是“工程加速器”，不影响语义层冻结；但其 canonical 事件名必须与 `interaction-protocol.md` 保持一致。

