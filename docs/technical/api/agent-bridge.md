# 智能体运行时桥接服务规范（Agent Bridge Service）

文档版本：v1.7（Draft）  
最后修改日期：2026-01-29  
作者：Billow
适用范围：`docs/technical/` 下 Agent Bridge（Python）服务设计与接口说明（运行时 / 流式交互 / 多云适配）  
相关文档：
- `docs/docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/contracts/agent-interface-spec.md`
- `docs/technical/api/core-service.md`
- `docs/technical/edge/nginx-gateway-arch.md`
文档目的：定义 agent-bridge（Python）作为**智能体运行时与实时交互通道**的职责与接口契约（runs / stream / cancel / job events 等），并说明其对多云（AWS/GCP/Aliyun/Volcengine）与多区域（CN/Global）外部 Agent Provider 的适配方式。Marketplace / Files / Conversations(History) 等业务域 HTTP API 由 Platform Core Service（Go）统一对外提供，本服务仅作为依赖方调用，避免契约分叉。


# **1\. 概述 (Overview)**

Agent Bridge Service 是系统**执行面（Execution Plane）**的运行时桥接服务，负责承载工作台的**实时交互通道**并提供统一的运行时编排入口。

- **WebSocket 为主通道**：对外主入口为 `/ws/agent`（Ticket-only），事件信封与事件类型以 `docs/technical/protocols/interaction-protocol.md` 为唯一 SSOT。
- **HTTP/SSE 为兼容层（fallback）**：仅用于特定场景的兼容访问与调试，不维护独立事件名集合，必须与相同的 `control.session_id` 对齐。

本服务通过适配器模式统一对接两类智能体：
1. **外部托管智能体 (External Managed Agents)**：通过 Adapter 接入 Coze（CN/Global）、Google Vertex AI Agent Builder 等平台能力。
2. **原生自研智能体 (Native Custom Agents)**：提供 Python 运行时环境，支持集成 LangChain/AutoGen/Google ADK 等框架，并屏蔽底层模型服务与云基础设施差异。

# **2\. 职责 (Responsibilities)**

* **混合运行时环境 (Hybrid Runtime Environment)**:  
  * **External Agents**: 代理调用外部平台 API（支持 Coze CN/Global, Google Vertex, Aliyun Bailian）。  
  * **Internal Agents**: 运行自研 Python 代码，支持集成 LangChain/AutoGen 并调用本地或云端模型。  
* **多云适配 (Multi-Cloud)**:  
  * **Model Layer**: 统一封装 Gemini (Google), Qwen (Aliyun), Doubao (Volcengine) 的调用接口。  
  * **Storage Layer**: 统一封装 AWS S3, Aliyun OSS, Volcengine TOS 的对象存储接口。  
* **协议归一化 (Normalization)**：将不同区域、不同厂商/平台的私有事件与流式响应，统一映射为 `docs/technical/protocols/interaction-protocol.md` 定义的 **CloudEvents Envelope + canonical type**（事件信封与事件类型注册表为唯一 SSOT）。
  * WebSocket 主通道：按 WS 事件信封与可靠性（ACK/去重/恢复）要求输出。
  * HTTP/SSE 兼容层：仅作为承载方式复用相同 canonical events，不维护独立事件名集合。 
* **（依赖）业务域 HTTP API（Delegated to Platform Core）**:
  * Agent Bridge **不对外提供** Marketplace / Files / Conversations(History) 等业务域 HTTP API。
  * 这些能力由 **Platform Core Service（Go）** 统一对外提供（含鉴权/审计/计量链路），Agent Bridge 在需要时仅作为运行时侧的**依赖方/调用方**使用。
  * 参考：`docs/technical/api/core-service.md`（Marketplace / Files / Conversations 契约）。


# **3\. 数据结构 (Data Structures)**

## **3.1 核心实体（仅引用 SSOT，不在本文重定义字段口径）**

- **Workflow**：用于描述一次运行所需的静态配置对象。其**字段定义/存储形态/枚举口径**以相关 SSOT 为准；本文不枚举 `provider`、不展开 `config` 的结构，避免形成第二口径。
- **Run**：代表一次完整执行实例；其状态机与对外可观测事件以 `docs/technical/protocols/interaction-protocol.md` 的 canonical events 为准。
- **Message**：消息语义对象；其结构与分块规则以 `docs/technical/contracts/agent-interface-spec.md` 为准。

说明：Provider-specific 的配置（例如不同云/不同 Agent 平台的私有参数）属于 Adapter 内部的实现细节；
对外契约只承诺“可被解析/可被审计/可被追踪”，不在本文固化字段列表，以满足 SSOT 单一口径要求。

## **3.2 事件流结构 (Event Stream)**

本服务的流式输出（SSE / WS 转译）**必须**遵循 `docs/technical/protocols/interaction-protocol.md` 的 canonical type 作为唯一 SSOT。
本节仅给出示例载荷形态；**不得**在本文中发明新的 canonical 事件名。

说明：外部 Provider（Coze / Vertex / Bailian / Ark 等）的平台私有事件，
由 Adapter 映射到 canonical type；映射索引参考 `agent-interface-spec.md` 的附录（Platform Mapping Matrix）。

### 示例：Server → Client（canonical events）

- `agent.task.update`
  - 含义：任务状态更新（queued/running/succeeded/failed/suspended 等，按 interaction-protocol 定义）
  - 示例：`{ "task_id": "task_...", "state": "RUNNING" }`

- `agent.message.delta`
  - 含义：消息内容增量（文本/分片）
  - 示例：`{ "message_id": "msg_...", "content_delta": "Hello" }`

- `agent.tool.call`
  - 含义：工具调用请求（由客户端/工具总线返回 result）
  - 示例：`{ "tool_call_id": "tc_...", "tool": "search", "input": { ... } }`

- `agent.tool.result`（Client → Server，或由 Tool Bus 注入）
  - 含义：工具调用结果回传（必须可与 call 关联）
  - 示例：`{ "tool_call_id": "tc_...", "result": { ... }, "is_error": false }`

- `agent.message.completed`
  - 含义：一条消息的完成提交点
  - 示例：`{ "message_id": "msg_..." }`

- `error`
  - 含义：错误事件；若同时导致任务失败，应额外发送 `agent.task.update(state=FAILED)`
  - 示例：`{ "code": "AGENT_RUNTIME_ERROR", "retryable": false, "details": { ... } }`

- `ack` / `pong`
  - 含义：可靠性回执 / 心跳（按 interaction-protocol 约定）

禁止：输出 `thought` 或任何“内部推理过程”类型事件。
若需要进度提示，请使用 `agent.task.update`（状态/百分比/阶段）或 `notification.event`（轻量通知）。

## **3.3 入口与鉴权前置约束（Transport & Auth Constraints）**

- **WebSocket 主入口（必须）**：`/ws/agent`
  - 必须采用 **Ticket-only**：`ticket=<ws_ticket>`（签发与权限口径由 Platform Core 提供；Bridge 仅校验并恢复隔离上下文）。
  - 禁止在握手 URL 上混入 `agent_id/target_agent_id` 等业务选择参数；会话/工作流选择必须在连接建立后通过 `session.update` 等事件完成（以 `docs/technical/protocols/interaction-protocol.md` 为准）。

- **HTTP 兼容入口（受限）**：`/api/v{N}/agent/*`
  - **对外暴露时必须受鉴权保护**：网关层需对该路径启用 `auth_request`，由 Platform Core 统一校验 JWT 并返回 200/401/403；或该路径仅允许内网访问（禁止公网暴露）。
  - 禁止通过该入口绕过 Platform Core 直接暴露“执行指令/工具调用”类能力（具体禁令以 `docs/technical/architecture/nginx-gateway-arch.md` 为准）。


# **4\. API 规范 (API Spec)**

Base URL: /api/v{N}/agent (由 Nginx 转发；版本策略以 api-style-guide.md 为准)

## **4.1 运行时模块 (Runtime)**

### **POST /runs**

**功能**: 创建并启动一个新的 Agent 执行任务 (Run)。

* **Request**:  
  {  
    "workflowId": "uuid-workflow-1",  
    "input": "生成周报",  
    "files": \["file-uuid-1"\]  
  }

* **Response**:
- Content-Type: text/event-stream
- 事件语义要求：event-stream 中输出的事件 必须复用 docs/technical/protocols/interaction-protocol.md 定义的 canonical events（CloudEvents Envelope + type registry），不得定义 SSE 专属事件名集合。
* **Behavior**:
- 根据 workflow.config.region 自动选择调用的上游 API 端点（例如 api.coze.cn 或 api.coze.com），并按 Adapter 的映射规则将上游流式输出归一化为 canonical events。
- 在受限网络环境中，使用配置好的 HTTP Proxy 访问上游（若启用），并确保 不会因为代理/跨区差异引入新的事件类型或字段分叉。
- 运行上下文边界以 control.session_id 为准（若由上层会话承载）；同一 session_id 下的事件语义与 WebSocket 主通道保持一致。

* **Error（强制统一）**:
- 若以 HTTP 方式返回错误（即未进入 event-stream 或在握手前失败），必须采用 docs/technical/api/api-style-guide.md 规定的 Problem Details (RFC 7807) 结构，并包含可机读 reason_code 与 traceparent。

### **POST /runs/{runId}/cancel**

**功能**: 强制停止正在运行的任务。

## **4.2 业务域 HTTP API（已迁移至 Platform Core）**

本文件历史版本包含 Marketplace / Files / Conversations(History) 的 HTTP API 示例，但在当前架构中：

- Marketplace（搜索/筛选/排序/评价）
- Files（预签名上传、上传校验）
- Conversations/History（会话列表、历史消息读取、元数据更新）

均由 **Platform Core Service（Go）** 作为唯一对外 HTTP API 契约提供。

Agent Bridge（Python）仅对外提供运行时相关接口与实时通道承载（如 runs / stream / cancel / job 事件等），
不再重复声明以上业务域 API，以避免契约冲突与实现分叉。

参考：`docs/technical/api/core-service.md`

## **4.3 异步任务（Async Jobs）**

为避免网关超时与提升可观测性，耗时 **> 5 秒** 的长时操作（如 RAG 索引、批量分析、导出）必须采用 **“异步提交 + 状态查询”**。

- **HTTP API 归属**：异步任务的 Create/Status/Cancel 统一由 **Platform Core** 提供（`/api/v{N}/jobs/*`），以符合网关路由边界与全局 API 治理口径。
- **Agent Bridge 职责**：当 Run 触发异步任务时，Bridge 负责在 runs/stream 通道内：
  - 透出 `jobId` 关联字段；
  - 按 `interaction-protocol.md` 发送 `agent.task.update`（state/progress/stage 等）作为实时进度提示；
  - 不定义任何 `/api/v{N}/jobs/*` 的 HTTP 端点，避免与 Platform Core 契约分叉。

参考：`docs/technical/api/core-service.md`（Jobs 契约）与 `docs/technical/edge/nginx-gateway-arch.md`（路由边界）。


# **5\. 智能体适配器架构 (Agent Adapter Architecture)**

## **5.1 Adapter Interface（规范性）**

本节定义 Provider Adapter 的最小可实现接口。**不得**在 Adapter 内部私造消息结构或事件类型：
- 消息语义：以 `docs/technical/contracts/agent-interface-spec.md` 的 `Message` / `InvocationOptions` / `SessionState` 为准。
- 流式事件：以 `docs/technical/protocols/interaction-protocol.md` 的 canonical events（CloudEvents Envelope + type registry）为准。

```python
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional, List

# SSOT 类型（引用，不在本文重定义）
# - Message / InvocationOptions / SessionState: agent-interface-spec.md
# - CanonicalEvent (CloudEvents envelope + canonical type): interaction-protocol.md

class AgentAdapter(ABC):
    """
    Provider 适配器：把外部/内部运行时的私有协议，映射为平台统一语义与 canonical events。
    """

    @abstractmethod
    async def stream(
        self,
        input_text: str,
        context: List["Message"],
        *,
        invocation_options: Optional["InvocationOptions"] = None,
        session_state: Optional["SessionState"] = None,
    ) -> AsyncGenerator["CanonicalEvent", None]:
        """
        流式执行：必须产出 interaction-protocol 的 canonical events（如 agent.message.delta / agent.task.update 等）。
        - 不得输出 thought 等内部推理过程事件。
        - 允许透传 vendor_overrides（由 invocation_options 承载），但必须在审计链路中可追踪。
        """
        raise NotImplementedError
```

## **5.2 支持的 Providers**

### **A. External Providers (API Proxy)**

1. **Coze (ByteDance)**:  
   * **CN**: 对接 api.coze.cn，支持飞书/微信生态。  
   * **Global**: 对接 api.coze.com，支持 Discord/Slack。  
2. **Google Vertex AI**:  
   * 适用于国际市场，提供企业级 Gemini 能力。  
3. **Aliyun Bailian (通义)**:  
   * 适用于中国市场，提供 Qwen-Max 等高性能模型。  
4. **Volcengine Ark (豆包)**:  
   * 适用于中国市场，提供高性价比推理。

### **B. Internal Providers (Self-Hosted)**

1. **Native Python**:  
   * 运行本地代码。  
   * 可集成 **LangChain**, **AutoGen**, **Google ADK (Python SDK)**。  
   * 通过环境变量配置底层的 DEFAULT\_LLM\_MODEL (如切换为 Qwen 或 Gemini)。

# **6\. 安全策略 (Security Model)**

## **6.1 区域合规 (Regional Compliance)**

* **数据驻留**: 中国区部署 (REGION=cn) 时，必须使用中国区的对象存储 (OSS/TOS) 和模型服务，严禁数据跨境。  
* **网络隔离**: 生产环境应配置 VPC Endpoint 连接云服务，避免公网传输。

## **6.2 凭证管理**

* **多套密钥**: 系统需支持同时配置多套 AK/SK (AWS \+ Aliyun \+ GCP)，根据 Workflow 配置动态选择。  
* **Vault 集成**: 敏感凭证必须加密存储。

# **7\. 非职责 (Out of Scope)**

* **用户认证/授权**：统一由 **Platform Core（Go）** 承担（身份与权限 SSOT 见 IA 模块与相关契约）；Agent Bridge 仅消费已校验的准入凭据（例如 Work Ticket / 上游注入的身份上下文）。
* **计费**：Agent Bridge 仅上报 Usage/运行时度量事件；计量/审计/回执与账务处理由 Platform Core 统一完成。

# **8\. 与其他服务关系 (Service Relationships)**

* **Platform Core（Go）**：控制面权威入口（鉴权、资源管理、策略、计量/审计/回执）；同时也是 Agent Bridge 的上游调用方之一。

# **9\. 未来扩展 (Future Work)**

* **Hybrid Deployment**: 支持控制面 (Control Plane) 在一处，数据面 (Data Plane) 分布在多云/多区域。  
* **Model Fallback**: 当主模型 (如 Gemini) 不可用时，自动降级到备用模型 (如 Qwen)。

# **10. 变更记录（Change Log）**

| 版本 | 日期 | 变更摘要 | 影响范围 | 兼容性 |
| --- | --- | --- | --- | --- |
| v1.7 | 2026-01-29 | 明确 WS 主通道 + SSE fallback；补齐入口鉴权约束；/runs 标注为兼容层并对齐 RFC7807 错误语义；新增变更记录 | Workspace Web / Agent Bridge / Nginx 路由与鉴权 | 向后兼容（语义不变，约束更明确） |

