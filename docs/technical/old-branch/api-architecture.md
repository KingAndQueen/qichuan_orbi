# **API 架构与治理规范 (API Architecture & Governance)**

文档版本：v1.8  
最后修改日期：2025-11-28  
作者：JeafDean  
相关文档：docs/technical/architecture/fullstack-architecture.md  
文档目的：定义 Orbitaskflow 全栈系统的 API 设计原则、路由拓扑、通信协议及服务间鉴权标准，防止接口蔓延 (API Sprawl) 和协议不一致。

# **1\. 概述 (Overview)**

本文档作为后端微服务与前端 BFF 交互的“宪法”，确立了 **Layer 7 Gateway Pattern** 的架构模式。它强制执行统一的通信协议（SSE/REST）、数据交换格式（CamelCase Envelope）以及全链路可观测性标准（W3C Trace Context），确保系统在快速迭代中保持高内聚、低耦合。

# **2\. 背景 (Background)**

本系统采用 Next.js (Frontend/BFF) \+ Go (Auth) \+ Python (AI) 的多语言微服务架构。为解决异构技术栈带来的协作挑战，本规范旨在解决以下核心问题：

* **协议一致性**：统一不同语言服务间的错误码格式、分页标准及命名风格（CamelCase vs SnakeCase）。  
* **全链路可观测性**：确立跨服务的分布式追踪标准 (Trace ID)，消除监控盲区。  
* **通信可靠性**：定义统一的重试策略、幂等性机制及限流标准，保障系统稳定性。

# **3\. 架构视图 (Architecture View)**

## **3.1 路由拓扑 (Routing Topology)**

系统采用 Nginx 作为唯一的流量入口，负责 SSL 卸载和路由分发。

graph TD  
    Client\[Web Client / Mobile\] \--\>|HTTPS :443| Nginx\[Nginx Gateway\]  
      
    subgraph "Private Network (Docker/K8s)"  
        Nginx \--\>|/api/auth/\*| SiteAuth\[Site Auth Service (Go)\]  
        Nginx \--\>|/api/agent/\*| AgentBridge\[Agent Bridge (Python)\]  
        Nginx \--\>|/api/workspace/\*| Workspace\[Workspace Web (Next.js)\]  
        Nginx \--\>|/\*| Workspace  
    end  
      
    SiteAuth \-.-\>|Auth Headers| AgentBridge  
    Workspace \-.-\>|Internal API| AgentBridge  
      
    Client \-.-\>|Direct Upload| ObjectStorage\[S3/MinIO\]

## **3.2 路由规则表**

| URL 前缀 | 上游服务 | 技术栈 | 默认端口 | 环境变量 (Config) | 职责 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| /api/v1/notifications* | site-auth | **Go** | 异步通知拉取 (Pull)、状态标记 |
| /api/agent/jobs* | agent-bridge | **Python** | 长时任务提交、状态轮询 |
| /api/auth/\* | site-auth | **Go** | :8081 | SERVER\_PORT | 身份认证、Session 管理、OAuth 回调 |
| /api/agent/\* | agent-bridge | **Python** | :8000 | PORT | LLM 交互、Agent 编排、SSE 流式生成 |
| /api/workspace/\* | workspace-web | **Next.js** | :3000 | PORT | 业务逻辑 (BFF)、非流式 CRUD 操作 |
| / (其余请求) | workspace-web | **Next.js** | :3000 | PORT | 前端页面资源 (HTML/JS/CSS) |

# **4\. API 规范 (API Standards)**

## **4.1 通信协议**

### **Agent 交互：WebSocket + SSE 事件语义**

由于 LLM 生成具有明显的流式特性，Agent 交互接口采用
**WebSocket 长连接承载 SSE 风格事件流** 的方式：

* **Workspace Web / 第一方客户端**：  
  * 通过 WebSocket 连接网关公开的 `/ws/agent`（由 Nginx 转发至 Agent Bridge）；  
  * 事件语义遵循统一的 SSE 事件格式
    （`run_start`、`thought`、`message_delta`、`tool_call`、`run_completed` 等）。

* **兼容 / 外部集成客户端（可选）**：  
  * 为简化集成，可以提供 HTTP SSE 形式的兼容接口，例如 `POST /api/agent/chat/completions`；  
  * 其事件格式与 WebSocket 通道中的事件语义完全一致。

> 注意：对内协议统一以“事件语义（SSE 风格）”为主，
> 具体传输层可为 WebSocket 或 HTTP SSE。
> Workspace Web 优先使用 WebSocket，
> HTTP SSE 主要用于脚本、CI 或第三方集成场景。

* **事件格式**:  
```text
event: thought
data: {"content": "正在检索用户文档...", "duration_ms": 120}

event: message_delta
data: {"content": "根据文档分析，", "delta": true}

event: run_completed
data: {"usage": {"tokens": 150}, "cost": 0.002}
```
### **常规业务：RESTful over JSON**

对于 CRUD 操作，遵循标准 REST 语义。

* **Success**: 200 OK, 201 Created, 202 Accepted  
* **Error**: 400 Bad Request, 401 Unauthorized, 429 Too Many Requests, 500 Internal Error，402 Payment Required,429 Too Many Requests

## **4.2 数据契约 (Data Contract)**

所有 JSON API (非 SSE) 必须包裹在统一的信封结构中，并强制执行 **snake\_case (DB) \-\> camelCase (API)** 的转换。

### **数据类型规范**

* **Date/Time**: 必须使用 **ISO 8601 UTC** 字符串格式 (e.g., "2025-11-28T12:00:00Z")。严禁使用 Unix 时间戳或非 UTC 时间。

### **响应信封结构**

interface ApiResponse\<T\> {  
  // 业务数据，键名必须转换为 camelCase  
  data: T;  
    
  // 元数据  
  meta?: {  
    page?: number;  
    total?: number;  
    cursor?: string; // \[V1.8\] Base64 编码的不透明字符串  
    traceId: string; // \[W3C Standard\]  
  };  
    
  // 错误信息 (成功时为 null)  
  error?: {  
    code: string;    // e.g., "VALIDATION\_FAILED"  
    message: string; // 人类可读消息 (已本地化)  
    // 结构化验证错误详情  
    details?: Array\<{  
      field: string; // e.g., "user.email"  
      issue: string; // e.g., "INVALID\_FORMAT"  
      message: string;  
    }\>;  
  } | null;  
}
### **标准错误码 (Standard Error Codes) [NEW]**

为了保证前端错误处理的一致性，系统保留以下核心错误码 (error.code)：

| Code | 说明 | 对应 HTTP |
| :--- | :--- | :--- |
| `VALIDATION_FAILED` | 参数校验失败（通常伴随 details 字段） | 400 |
| `UNAUTHORIZED` | 未登录或 Token 无效 | 401 |
| `PERMISSION_DENIED` | 无权访问该资源 | 403 |
| `RESOURCE_NOT_FOUND` | 请求的资源不存在 | 404 |
| `RESOURCE_EXHAUSTED` | **[NEW]** 租户资源配额（如 Token/存储）已用尽 | 402 |
| `JOB_NOT_FOUND` | **[NEW]** 异步任务 ID 不存在或已过期 | 404 |
| `INTERNAL_ERROR` | 服务器内部错误 | 500 |

## **4.3 版本控制**

* **URI Versioning**: /api/v1/agent/...  
* **策略**: 破坏性变更必须升级版本号；非破坏性变更在原版本迭代。

## **4.4 文件上传协议 (File Upload Protocol)**

为了减轻 API 网关的流量压力，文件上传**禁止**通过 API 透传二进制流 (Multipart)，必须采用 **预签名 URL (Presigned URL)** 模式。

1. **Request Upload**: 客户端 POST /api/workspace/files/upload-url (带文件名、大小)。  
2. **Generate URL**: 服务端验证权限，生成 S3/MinIO PUT Presigned URL (TTL 15min)。  
3. **Direct Upload**: 客户端直接 PUT 文件到该 URL。  
4. **Confirm**: 客户端 POST /api/workspace/files/confirm 通知服务端文件已上传。  
   * **后端行为**: 服务端必须通过 HeadObject 校验文件实际大小和存在性，严禁信任前端传入的元数据。

## **4.5 复杂查询标准 (Query Standards)**

对于列表接口，根据业务场景选择分页模式。

### **A. 游标分页 (Cursor-based)**

**适用场景**: 聊天记录 (messages)、活动流 (audit\_logs)、无限滚动列表。

* **Request**:  
  * GET /messages?limit=20 (获取最新)  
  * GET /messages?limit=20\&cursor=eyJ0cyI6... (获取历史，cursor 为 Base64 编码的不透明字符串)  
* **Response**: meta.cursor 返回下一页的锚点。  
* **优势**: 避免数据实时插入导致的分页漂移 (Offset Shift)，支持基于时间戳或联合主键的灵活实现。

### **B. 传统分页 (Offset-based)**

**适用场景**: 管理后台表格 (users, workflows)、需要跳页的场景。

* **Request**: GET /workflows?page=1\&pageSize=20  
* **Response**: meta.total 返回总条数。

### **C. 过滤与排序**

* **Search**: q=contract (全文检索)  
* **Filtering**: filter\[status\]=active (LHS Brackets)  
* **Sorting**: sort=-created\_at (倒序)

## **4.6 并发控制 (Concurrency Control)**

对于 Workflow 编辑或 User Profile 更新等易冲突操作，采用 **乐观锁 (Optimistic Locking)**。

* **Read**: GET 响应头包含 ETag: "v123"。  
* **Write**: PUT/PATCH 请求头必须包含 If-Match: "v123"。  
* **Conflict**: 若版本不匹配，返回 412 Precondition Failed，前端提示用户刷新。

## **4.7 国际化支持 (i18n)**

后端错误消息必须支持动态翻译。

* **Request**: 客户端发送 Accept-Language (e.g., zh-CN,zh;q=0.9,en;q=0.8)。  
* **Response**: 后端必须解析权重 (q-factor)，返回最匹配语言的 error.message。若不支持则回退到英文。

## **4.8 批量操作标准 (Batch Operations)**

为减少 RTT，针对集合资源支持批量操作。

* **Endpoint**: POST /api/{resource}/batch  
* **Action**: 通过 Query 参数指定动作，如 ?action=delete。  
* **Body**: { "ids": \["uuid1", "uuid2"\] }  
* **Response**: 返回 207 Multi-Status 或简化的成功/失败统计。

# **5\. 安全机制 (Security Model)**

## **5.1 服务间鉴权 (Service-to-Service Auth)**

* **身份传递 (Identity Propagation)**: Nginx (通过 auth\_request) 或 BFF 验证 Cookie 后，注入 X-Orbit-User-Id 和 X-Orbit-Tenant-Id Header。下游服务无条件信任。  
* **内部调用签名**: 所有微服务必须校验 X-Internal-Secret: \<ENV\_INTERNAL\_API\_KEY\>，缺少此 Header 直接返回 403 Forbidden。

## **5.2 幂等性控制 (Idempotency)**

对于涉及资金或副作用的写操作 (POST/PATCH)，客户端 **必须** 提供 Idempotency-Key Header。后端需缓存执行结果 (TTL 24h) 以防止重复执行。

## **5.3 Webhook 接收安全**

对于外部系统 (如 Stripe) 回调，必须验证签名。

* **Verification**: 校验 Stripe-Signature 或自定义 X-Orbit-Signature (HMAC-SHA256)。  
* **Anti-Replay**: 必须校验 Timestamp 窗口 (\< 5min)。

# **6\. 部署 / 运维注意事项 (Ops Notes)**

## **6.1 动态配置机制**

系统遵循 **The Twelve-Factor App** 原则。

* **Source of Truth**: deploy\_config.toml。  
* **Injection**: 端口通过环境变量 (SERVER\_PORT, PORT) 注入。  
* **Gateway Binding**: Nginx 使用 proxy\_pass http://${HOST}:${PORT} 并通过 envsubst 启动。

## **6.2 全链路可观测性 (Distributed Tracing)**

强制使用 **W3C Trace Context** 标准。

* **Header**: traceparent: 00-{trace-id}-{parent-id}-{trace-flags}  
* **行为**: Nginx 生成初始 Trace ID，所有服务透传并记录日志。

## **6.3 流量控制 (Rate Limiting)**

遵循 **IETF Draft** 标准。

* **Headers**: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset。

## **6.4 健康检查 (Health Checks)**

所有微服务必须暴露无鉴权端点：

* **Liveness**: GET /healthz (进程存活)  
* **Readiness**: GET /readyz (依赖就绪)

## **6.5 CORS 策略 (CORS Policy)**

* **Development**: 允许 localhost:\[ANY\_PORT\]。  
* **Production**: **严禁** 使用通配符 \*。必须显式白名单允许 workspace-web 的域名。  
* **Headers**: 必须暴露 ETag, RateLimit-\* 等自定义头。

## **6.6 长连接与超时配置 (Streaming & Timeouts)**

针对 Agent 流式接口
（WebSocket `/ws/agent` 以及兼容的 HTTP SSE `/api/agent/*`），
由于 LLM 推理耗时较长：

* **Nginx Proxy Timeout**：
  对 WebSocket 与 SSE 路径均需设置为 **300s (5分钟)** 以上，
  避免 60s 默认超时切断连接。  
* **Buffering**：
  对 HTTP SSE 接口必须关闭缓冲 (`proxy_buffering off;`)，
  以确保 Token 实时到达前端。  
* **Disconnect**：
  后端应监听客户端断开事件（WebSocket close / HTTP 连接关闭），
  立即停止 LLM 推理以节省成本。

# **7\. 附录 (Appendix)**

## **7.1 版本历史**

| 版本 | 日期 | 修改人 | 变更内容 |
| :---- | :---- | :---- | :---- |
| **v1.8** | 2025-11-28 | JeafDean | 修正游标分页参数为通用 cursor；增强上传确认安全校验；规范 i18n 权重解析。 |
| **v1.7** | 2025-11-28 | JeafDean | 新增游标分页标准 (Cursor-based) 及 SSE 长连接超时运维配置。 |
| **v1.6** | 2025-11-28 | JeafDean | 新增 ISO8601 日期强制、结构化验证错误、Search 参数及 CORS 策略。 |
| **v1.5** | 2025-11-28 | JeafDean | 补齐并发控制 (ETag)、国际化 (i18n) 及批量操作规范；新增未来扩展章节。 |
| **v1.4** | 2025-11-28 | JeafDean | 新增文件上传协议 (Presigned URL)、复杂查询语法及 Webhook 签名标准。 |
| **v1.3** | 2025-11-28 | JeafDean | 依照文档规范重构章节结构；合并部分技术细节。 |
| **v1.2** | 2025-11-28 | JeafDean | 新增 W3C 追踪、幂等性键、IETF 限流头及健康检查标准。 |
| **v1.1** | 2025-11-28 | JeafDean | 定义动态端口配置机制。 |
| **v1.0** | 2025-11-28 | JeafDean | 初始草稿。 |

# **10\. 未来扩展 (Future Work)**

随着系统规模增长，API 架构将向以下方向演进：

1. **GraphQL Federation**: 当 REST 接口变得过于复杂（如 Dashboard 聚合查询）时，考虑引入 Apollo Federation 作为 BFF 层。  
2. **gRPC Internal**: 将 Python 与 Go 服务之间的高频内部调用（如 Token 计数）迁移至 gRPC 以提升性能。  
3. **密钥轮转 (Key Rotation)**: 实现 X-Internal-Secret 的自动轮转机制，配合 Vault 管理密钥生命周期。  
4. **OpenAPI 自动生成**: 在 CI/CD 流水线中集成 Swagger 生成步骤，确保文档与代码 100% 同步。
