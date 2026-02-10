# Platform Core Service API 契约 (Platform Core Service API Contract)
文档版本：v2.5（Contract / L2）  
最后修改日期：2026-01-28  
作者：Billow  
适用范围：`docs/technical/api/core-service.md`（Platform Core / Go）对外 HTTP API 契约与鉴权/票据端点约束  
相关文档：
- `docs/docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`
- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/ops/nginx_gateway_architecture.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/data/database-design.md`
- `docs/features/prd-identity-access.md`
- `docs/features/prd-workspace.md`
- `docs/features/prd-marketplace.md`
- `docs/features/prd-insights.md`
文档目的：定义 platform-core (原 site-auth) 服务在身份认证、主账号/子账号管理、应用市场 (Marketplace)、资产管理 (Assets)、计费订阅 (Billing)、会话管理 (Conversations) 及系统审计方面的核心职责与接口契约。

# **1\. 概述 (Overview)**

Platform Core Service 是 Orbitaskflow 系统的 **中央神经系统**。它基于 Go 语言构建，接管了原 Site Auth 的所有职责，并扩展了核心业务能力。它负责处理所有高并发的 I/O 密集型业务，包括用户身份验证、组织架构管理、应用市场的搜索与发现、静态资产的安全上传、企业的订阅支付以及会话历史数据的读取与管理。它是 Workspace Web（Next.js）的主要 HTTP 交互对象；实时交互（WebSocket 消息帧）由 Agent Bridge 承担，Platform Core 仅提供握手鉴权与业务域 CRUD。

# **2\. 职责 (Responsibilities)**

* **身份中心 (Identity)**: 校验凭证，颁发双重令牌（Session \+ JWT），管理用户生命周期（登录、注册、强制改密）。  
* **主账号/子账号 (Account Scope)**: 维护组织结构与成员归属，处理主账号/子账号切换、成员邀请及权限分配。 
* **会话管理 (Conversations)**: **\[New\]** 负责会话列表的查询、元数据更新（重命名/归档）及历史消息的拉取（CQRS 中的 Read Model）。  
* **应用市场 (Marketplace)**: 提供 Agent 商品的**全文本搜索**、**分类筛选**、**排序**及详情查询，管理用户评价系统。  
* **文件管理 (Files)**: 生成文件上传的预签名 URL (Presigned URL)，并校验上传结果 (HeadObject)，确保对象存储的安全性。 
* **计费与订阅 (Billing)**: 集成支付网关 (Stripe)，管理企业订阅生命周期 (Checkout/Portal)、处理 Webhook 回调及用量结算。  
* **网关鉴权 (Gateway Auth)**: 为 Nginx 提供高性能的 auth\_request 校验端点。  
* **Agent 接入 (Connectivity)**: 发放 WebSocket 一次性票据 (Ticket)，并代理前端与 Agent Bridge (Python) 的连接。  
* **系统审计 (Audit)**: 记录关键操作（如权限变更、成员邀请）到审计日志。

# **3\. 边界 (Out of Scope)**

* **Agent 业务逻辑**: 不处理任何 LLM 推理、Prompt 拼接（属于 agent-bridge）。  
* **实时消息生成**: 不负责生成新的 AI 消息（Write Model 属于 agent-bridge），但负责**读取**已生成的历史消息。  
* **实时消息路由**: 不直接处理 WebSocket 消息帧的广播（由 agent-bridge 负责，platform-core 仅负责握手鉴权）。


# **4\. 数据结构 (Data Structures)**

## **4.1 核心凭证 (Identity Credentials)**

* **Session Token（Browser Session）**：
  * **载体**：HttpOnly, Secure Cookie（建议名：`orbit_session`）
  * **存储**：Redis（key: `session:{token}`）
  * **用途**：仅用于浏览器登录态维持与刷新 Access Token；不作为跨客户端通用凭证。

* **Access Token（JWT）**：
  * **载体（Primary）**：`Authorization: Bearer <JWT>`
  * **载体（Optional）**：HttpOnly Cookie（仅用于 Workspace Web 的同站请求；若启用，Nginx 与 CoreSvc 必须支持从 Cookie 读取并标准化为 Bearer 语义）
  * **Payload（最小）**：
    `{ uid: "uuid", masterAccountId: "uuid", subAccountId: "uuid", roles: ["owner"|"admin"|"member"], exp: 1710000000 }`
  * **用途**：HTTP API 的统一鉴权凭证；网关仅负责准入与转发，语义校验由 Platform Core 完成。

* **Personal Access Token (PAT)**：
  * **载体**：`Authorization: Bearer <PAT>`（PAT 为不透明字符串，前缀建议 `pat_sk_`）
  * **存储**：Database（`api_keys`）仅保存 **hash**（不可逆），可选 Redis 缓存（key: `pat:{hash_prefix}`）
  * **用途**：脚本/CI/第三方系统的 M2M 集成；权限必须最小化（scopes）。

## **4.2 交互票据 (Connectivity)**

* **WS Ticket**:  
  * **存储**: Redis (ticket:{uuid})  
  * **TTL**: 60秒  
  * **用途**: 建立 WebSocket 连接时的一次性握手凭证。


# **5. API 规范 (API Spec)**
## **5.0 通用约束（Errors/Trace/Idempotency）**

### 错误结构（强制）
- 所有非 2xx 响应必须返回 RFC 7807 Problem Details，并包含可机读 `reason_code`。
- `traceparent` 必须可获取（Header 优先；如需 body 回传必须与 W3C Trace Context 对齐）。

### CoreSvc 扩展 reason_code（本服务特有）
- INVALID_CREDENTIALS：登录凭证错误（401）
- PASSWORD_RESET_REQUIRED：需要强制改密（403 或 409，以实现一致为准）
- SUBSCRIPTION_UPGRADE_REQUIRED：订阅不含特性（403，detail 指向升级路径）
- WEBHOOK_SIGNATURE_INVALID：Webhook 签名不通过（400/401）
- 约束：服务可扩展 reason_code，但不得与跨服务标准 reason_code 表冲突；客户端分流必须以 reason_code 为主依据。

### 范围键（Scope Keys）命名约束
- HTTP JSON（本契约）对外字段：统一使用 `masterAccountId` +（可选）`subAccountId`。
- WebSocket 事件信封 `control`：统一使用 `master_account_id` +（可选）`sub_account_id`，由握手 `ticket` 在服务端恢复并回填；客户端不得伪造或覆盖。

Base URL：`/api/v1`
- 本服务所有 HTTP 端点必须挂载在 `/api/v{N}/*`（N=1）之下。
- 下文端点标题与示例 **均写完整路径**（包含 `/api/v1`），禁止省略，以避免路由/SDK 歧义。

## **5.1 认证模块 (Auth)**

### **POST /api/v1/auth/login**

**功能**: 用户登录，初始化会话。

* **Request**: { "email": "...", "password": "..." }  
* **Response**:
  {
    "data": {
      "user": {
        "id": "...",
        "email": "...",
        "lastActiveMasterAccountId": "...",
        "lastActiveSubAccountId": "..."
      },
      "redirectUrl": "/workspace",
      "requirePasswordChange": true
    }
  }


### **POST /api/v1/auth/logout**

**功能**: 销毁 Session 并清除 Cookies。

### **POST /api/v1/auth/refresh**

**功能**: 使用有效的 Session Cookie 刷新过期的 JWT。

* **Response**: 200 OK（返回新的 Access Token；若启用 Cookie 模式则 `Set-Cookie: orbit_access_token=...`）

### **GET /api/v1/auth/session**

**功能**: 前端初始化检查，返回当前上下文。

### **PUT /api/v1/auth/me/password**

**功能**: 用户修改自己的密码（或完成强制修改流程）。

* **Request**: { "oldPassword": "...", "newPassword": "..." }  
* **Behavior**: 修改成功后自动清除 is\_password\_reset\_required 标记。

### **GET /api/v1/auth/validate**

**功能**：供 Nginx `auth_request` 调用的鉴权校验端点（内部子请求）。

**约束（必须）**：
- 只能通过 Nginx 内部子请求路径（例如 `/_auth_validate`）转发调用；禁止公网直接暴露该子请求路径。
- 只做“凭证有效 + 权限最小判定”，不得在此端点执行业务逻辑。
- 注意：`/_auth_validate` 为 Nginx 内部子请求入口（不得对外暴露）；而本端点 `/api/v1/auth/validate` 为网关转发的后端目标路由（由网关策略保证不可被绕过）。

**输入**：
- `Authorization: Bearer <JWT|PAT>`（Primary）
- 可选：从 Cookie 读取（若启用 Cookie 模式）

**成功响应**：
- `204 No Content`（推荐）或 `200 OK`

**失败响应（RFC 7807 + reason_code）**：
- `401` + `reason_code=UNAUTHORIZED`
- `403` + `reason_code=PERMISSION_DENIED`

## **5.2 身份与主账号管理 (Identity & Master Account)**

### **GET /api/v1/users/me**

**功能**: 获取当前用户详细资料及个性化设置。

* **Response**: { "data": { "settings": { "theme": "dark" } } }

### **PATCH /api/v1/users/me/settings**

**功能**: 更新用户偏好 (i18n, Theme)。

### **POST /api/v1/users/me/pats \[New\]**

**功能**: 生成个人访问令牌 (Personal Access Token)。

* **Request**:  
  {  
    "name": "CI Pipeline",  
    "expiresInDays": 30,  
    "scopes": \["agent:run", "conversation:read"\] // \[New\] 最小权限控制  
  }

* **Response**: { "data": { "token": "pat\_sk\_..." } } (Token 仅在创建时返回一次)

### **GET /api/v1/users/me/pats \[New\]**

**功能**: 列出当前用户的所有 PAT（不含 Token 明文）。

### **DELETE /api/v1/users/me/pats/{id} \[New\]**

**功能**: 撤销特定的 PAT。

### **GET /api/v1/master-accounts**

**功能**: 列出当前用户所属的所有主账号。

### **POST /api/v1/master-accounts/{masterAccountId}/switch**

**功能**: 切换当前活跃主账号，刷新 JWT 中的 masterAccountId Claim。

### **POST /api/v1/invitations/{token}/accept**

**功能**: 用户接受邀请加入主账号。

* **Response**: 200 OK (加入成功，自动跳转)

### **GET /api/v1/master-accounts/{masterAccountId}/quotas**

**功能**: 查询当前主账号的资源使用量与限制（基于 Resource Governance 策略）。

* **Response**:
```json
  {
    "data": [
      {
        "resourceType": "llm_tokens_monthly",
        "limit": 1000000,   // -1 表示无限制
        "used": 450000,
        "resetPeriod": "monthly",
        "status": "ok"      // ok, warning, exhausted
      },
      {
        "resourceType": "storage_gb",
        "limit": 50,
        "used": 12.5,
        "resetPeriod": "never",
        "status": "ok"
      }
    ]
  }
```
## **5.3 成员管理模块 (Admin Only)**

此模块接口仅供 **Admin** 或 **Owner** 角色调用。

### **GET /api/v1/master-accounts/{masterAccountId}/users**

**功能**: 列表查询主账号下成员。

* **Response**:  
  {  
    "data": \[  
      {  
        "id": "...",  
        "fullName": "Jeff Dean",  
        "role": "member",  
        "subAccounts": [{ "id": "sub_1", "name": "法务部" }],  
        "status": "active" // active | pending | locked | force\_change\_password  
      }  
    \]  
  }

### **POST /api/v1/master-accounts/{masterAccountId}/users**

**功能**: 直接创建新员工账号并设置初始密码。

* **Request**:  
  {  
    "email": "new.employee@corp.com",  
    "fullName": "New Employee",  
    "initialPassword": "TempPassword123\!",  
    "role": "member",  
    "subAccountIds": \["sub\_1"\] // 岗位绑定  
  }

* **Behavior**: 创建用户 -> 设置 is_password_reset_required=true -> 自动加入主账号 -> 关联子账号。

### **POST /api/v1/master-accounts/{masterAccountId}/users/batch**

**功能**: 批量导入用户。

* **Request**:  
  {  
    "users": \[  
      { "email": "a@corp.com", "fullName": "A", "initialPassword": "...", "subAccountIds": \["..."\] },  
      { "email": "b@corp.com", "fullName": "B", "initialPassword": "..." }  
    \]  
  }

### **POST /api/v1/master-accounts/{masterAccountId}/users/{userId}/password**

**功能**: 管理员强制重置员工密码。

* **Request**: { "newPassword": "..." }  
* **Behavior**: 设置新密码 \-\> 强制下线该用户 \-\> 设置 is\_password\_reset\_required=true。

### **POST /api/v1/master-accounts/{masterAccountId}/users/{userId}/sessions/revoke**

**功能**: 强制下线某用户（踢出）。

* **Behavior**: 删除 Redis 中的所有相关 Session Key，导致用户下次请求时 401。

### **POST /api/v1/master-accounts/{masterAccountId}/users/{userId}/unlock**

**功能**: 解锁因多次输错密码被锁定的账号。

* **Behavior**: 清除 Redis 中的错误计数器。

### **POST /api/v1/master-accounts/{masterAccountId}/invitations**

**功能**: 发送邮件邀请（适用于已有账号的外部协作者）。

* **Side Effects**:
  1. 发送邀请邮件 (Email)。
  2. 若目标邮箱已注册，触发 `invite.received` 类型的站内通知 (In-App Notification)。

## **5.4 部门与子账号模块 (Department Management)**

### **POST /api/v1/master-accounts/{masterAccountId}/sub-accounts**

**功能**: 创建新的部门（即子账号）。

* **Request**: { "name": "Legal Team" }

### **GET /api/v1/master-accounts/{masterAccountId}/sub-accounts**

**功能**: 列出主账号下的所有子账号及其基础统计（成员数、已分配 Agent 数）。

### **PATCH /api/v1/master-accounts/{masterAccountId}/sub-accounts/{subAccountId}**

**功能**: 修改部门名称。

### **DELETE /api/v1/master-accounts/{masterAccountId}/sub-accounts/{subAccountId}**

**功能**: 删除部门（仅当部门下无成员且无资产时允许）。

## **5.5 许可分配模块 (License Allocation)**

### **GET /api/v1/master-accounts/{masterAccountId}/licenses**

**功能**: 获取主账号拥有的所有 Agent 资源池。

* **Response**:  
  {  
    "data": \[  
      {  
        "id": "lic\_123",  
        "workflow": { "id": "wf\_1", "name": "Contract Review" },  
        "totalQuantity": 10,  
        "assignedQuantity": 2,  
        "allocations": \[  
          { "id": "alloc\_1", "type": "user", "assigneeId": "user\_1", "assigneeName": "Jeff" }  
        \]  
      }  
    \]  
  }

### **POST /api/v1/master-accounts/{masterAccountId}/licenses/{licenseId}/allocations**

**功能**: 分配席位给用户或部门。

* **Request**:  
  {  
    "assigneeType": "user", // or "subAccount"  
    "assigneeId": "user\_1"  
  }

### **DELETE /api/v1/master-accounts/{masterAccountId}/licenses/{licenseId}/allocations/{allocationId}**

**功能**: 回收席位。

## **5.6 系统审计模块 (Audit)**

### **GET /api/v1/master-accounts/{masterAccountId}/audit-logs**

**功能**: (Owner Only) 分页查询系统审计日志。

* **Query**: page=1\&pageSize=20\&filter\[action\]=member.create

## **5.7 应用市场模块 (Marketplace)**

此模块负责 Agent 商品的发现与详情。

### **GET /api/v1/market/workflows**

**功能**: 搜索与筛选市场中的 Agent。

* **Query Parameters**:  
  * q: 搜索关键词 (全文检索)  
  * category: 分类筛选 (e.g., 'legal', 'dev')  
  * sort: 排序字段 (e.g., '-rating\_avg', '-usage\_count')  
  * page, pageSize: 分页参数  
* **Response**:  
  {  
    "data": \[  
      {  
        "id": "wf-uuid",  
        "slug": "contract-review",  
        "name": "Contract Reviewer",  
        "description": "...",  
        "pricePerSeat": 0,  
        "rating": 4.8,  
        "tags": \["legal", "pdf"\]  
      }  
    \],  
    "meta": { "total": 100 }  
  }

### **GET /api/v1/market/workflows/{id}**

**功能**: 获取 Agent 详情，包括介绍、价格、评价概览。

### **GET /api/v1/market/workflows/{id}/reviews**

**功能**: 分页加载用户评价。

### **POST /api/v1/market/workflows/{id}/reviews**

**功能**: 用户发表评价（需校验是否已使用过该 Agent）。

## **5.8 文件管理模块 (Files)**

处理大文件上传的 Presigned URL 流程（禁止网关透传二进制）。

### **POST /api/v1/files/presign**

**功能**: 申请上传的 Presigned URL。

* **Request**:
  { "filename": "contract.pdf", "sizeBytes": 1048576, "contentType": "application/pdf", "usage": "chat_attachment" }

* **Response**:
  { "data": { "uploadUrl": "https://s3...X-Amz-Signature=...", "fileId": "file-uuid", "method": "PUT", "headers": { "Content-Type": "application/pdf" } } }

* **Constraints**:
  * `uploadUrl` 必须设置较短过期时间（例如 5~15 分钟）。
  * 上传必须强制匹配签发时约定的 `Content-Type`（必要时连同自定义 metadata 一并约束）。

### **POST /api/v1/files/{fileId}/confirm**
说明：L1 治理文档使用 `/files/confirm` 作为形态示例；本 L2 契约选择在路径中显式携带 `fileId`（`/files/{fileId}/confirm`）以减少 body 重复与便于审计定位，均满足“必须确认 + HeadObject 校验”的治理要求。

**功能**: 上传完成后通知服务端进行确认。

* **Behavior**: 服务端触发 HeadObject 检查文件是否存在且大小匹配。成功后将数据库状态由 uploading 更新为 ready。

## **5.9 计费与订阅模块 (Billing & Subscriptions)**

处理与支付网关 (Stripe) 的集成及订阅生命周期。

### **POST /api/v1/billing/subscriptions/checkout**

**功能**: 创建订阅支付会话 (Stripe Checkout Session)。

* **Request**:  
  {  
    "priceId": "price\_H5ggY...", // Stripe Price ID  
    "quantity": 10 // 购买席位数量  
  }

* **Response**: { "data": { "checkoutUrl": "https://checkout.stripe.com/..." } }

### **GET /api/v1/billing/subscriptions/portal**

**功能**: 获取客户门户链接 (Stripe Customer Portal)，供用户自行管理信用卡和发票。

* **Response**: { "data": { "portalUrl": "https://billing.stripe.com/..." } }

### **POST /api/v1/billing/webhook**

**功能**: (Public) 接收支付网关的异步通知（如 invoice.payment\_succeeded）。

* **Security**:
  1. 必须使用 **原始 request body**（未被 JSON parse 改写）进行签名验证。
  2. 必须校验 `Stripe-Signature`，并启用 timestamp 校验（默认 5 分钟容忍窗口，可配置）。
  3. 必须做事件幂等去重：以 `event.id` 作为幂等键（写入事实表/去重表），重复事件直接 2xx 返回但不重复执行业务副作用。

## **5.10 数据洞察模块 (Analytics)**

### **GET /api/v1/master-accounts/{masterAccountId}/analytics/usage**

**功能**: 获取每日资源消耗与 ROI 统计。

* **Query Parameters**:  
  * startDate, endDate: 日期范围 (e.g., '2024-01-01')  
  * workflowId: (Optional) 筛选特定 Agent  
* **Response**:  
  {  
    "data": \[  
      {  
        "date": "2024-01-01",  
        "totalRuns": 150,  
        "totalDurationSeconds": 4500,  
        "estimatedTimeSaved": 12.5,  
        "costUsd": 2.50  
      }  
    \]  
  }

## **5.11 Agent 连接模块**

### **POST /api/v1/agent/tickets**

**功能**: 申请 WebSocket 连接票据。

* **Response**: { "data": { "ticket": "ws-ticket-uuid", "expiresIn": 60 } }

## **5.12 会话管理模块 (Conversation Management)**

负责会话元数据的管理和历史消息的读取（CQRS Read Model）。

### **GET /api/v1/conversations**

**功能**: 获取当前用户的会话列表（侧边栏）。
* **Query Parameters**:
  * `page`, `pageSize`: 分页。
  * `workflowId`: (Optional) 筛选特定工作流。
会话列表按服务端解析出的当前工作环境过滤：`subAccountId` 来自认证上下文（JWT claims），客户端不得通过 query/body 指定 scope。
* **Response**:  
  {  
    "data": \[  
      { "id": "conv\_1", "title": "合同审查", "lastMessageAt": "2025-11-29T...", "workflow": {...} }  
    \]  
  }

### **GET /api/v1/conversations/{id}/messages**

**功能**: 获取特定会话的历史消息（支持无限滚动）。

* **Query Parameters**:  
  * limit: 条数 (Default: 20)。  
  * cursor: Base64 不透明字符串（上一页返回的 meta.cursor）。 
  * direction: before (历史) | after (新消息)。  
* **Response**:  
  {  
    "data": \[  
      { "id": "msg\_1", "role": "user", "content": "...", "createdAt": "..." },  
      { "id": "msg\_2", "role": "assistant", "content": "...", "uiIntent": {...} }  
    \],  
    "meta": { "cursor": "next\_cursor\_xyz" }  
  }

### **PATCH /api/v1/conversations/{id}**

**功能**: 更新会话属性（重命名、归档）。

* **Request**: { "title": "New Title", "isArchived": true }

### **DELETE /api/v1/conversations/{id}**

**功能**: 软删除会话。

* **Behavior (Cascading Logic)**: **\[New\]**  
  1. 将 conversations 记录标记为删除 (deleted\_at).  
  2. 异步触发清理任务，将关联的 messages 标记为删除或移入冷存储。  
  3. 注意：关联的 files 暂不删除，以防其他会话引用（需检查引用计数）。

## **5.13 主账号配置模块 (Master Account Configuration) [New]**

### **GET /api/v1/master-accounts/{masterAccountId}/settings**

**功能**: 获取主账号的配置信息（品牌、安全策略）。

* **Response**:  
  {  
    "data": {  
      "branding": { "logoUrl": "...", "primaryColor": "\#000000" },  
      "security": { "mfaRequired": false }  
    }  
  }

### **PATCH /api/v1/master-accounts/{masterAccountId}/settings**

**功能**: (Admin Only) 更新主账号配置。

* **Feature Gating**: [New] 必须校验主账号当前的 Subscription Plan 是否包含 custom_branding 或 advanced_security 特性。
* **Request**: { "branding": { ... } }

## **5.14 通知服务模块 (Notification Service) [New]**

支持架构 V3.8 定义的 "Hybrid Push-Pull" 策略。前端在 WebSocket 连接建立后，或检测到掉线重连时，应调用列表接口进行“兜底拉取”。

### **GET /api/v1/notifications**

**功能**: 获取通知列表。

* **Query Parameters**:
  * `unreadOnly`: boolean (Default: `false`)
  * `limit`: int (Default: 20)
  * `cursor`: string (Base64)

* **Response**:
```json
{
  "data": [
    {
      "id": "notif_uuid_123",
      "type": "workflow.completed",
      "title": "合同审查任务已完成",
      "content": {
        "summary": "耗时 3分钟，发现 2 处风险。",
        "targetUrl": "/workspace/conv_888"
      },
      "isRead": false,
      "createdAt": "2025-12-01T12:00:00Z"
    }
  ],
  "meta": {
    "unreadCount": 5,
    "cursor": "next_page_token"
  }
}
```
### **PATCH /api/v1/notifications/{id}**

**功能**: 标记单条通知为已读。

* **Request**: { "isRead": true }
* **Response**: 200 OK

### **POST /api/v1/notifications/read-all**

**功能**: 标记所有通知为已读。

* **Response**: { "data": { "updatedCount": 15 } }

# **6\. 关键流程 (Key Flows)**

## **6.1 登录与强制改密流**

1. 用户 POST /api/v1/auth/login。  
2. 后端检查密码正确，但发现 is\_password\_reset\_required=true。  
3. 返回 200 OK，Body 中 requirePasswordChange: true。  
4. 前端拦截跳转至 /change-password 页面。  
5. 用户调用 PUT /api/v1/auth/me/password。  
6. 后端更新密码，清除标记，流程完成。

## **6.2 会话加载流 (Conversation Loading)**

1. 前端加载侧边栏：调用 GET /api/v1/conversations。  
2. 用户点击会话：调用 GET /api/v1/conversations/{id}/messages 加载最近 20 条历史。  
3. 并发操作：同时前端申请 Ticket：`POST /api/v1/agent/tickets`，再与 Agent Bridge 建立 WebSocket。  
4. 用户发送消息：通过 WebSocket 发送 chat.input。

## **6.3 安全文件上传流**

1. 前端调用 POST /api/v1/files/presign。
2. Platform Core 校验主账号存储配额 -> 生成 OSS/S3 签名 URL -> 记录 files 表 (status=uploading)。
3. 前端直接 PUT 文件到云存储。
4. 前端调用 POST /api/v1/files/{fileId}/confirm。
5. Platform Core 校验云端文件 -> 更新 files 表 (status=ready)。

# **7\. 安全机制 (Security Model)**

* **上传安全**:  
  * 强制校验 Content-Type 和文件扩展名。  
  * 服务端 HeadObject 二次校验文件大小 (Size Consistency Check)。  
* **市场防刷**: 限制 reviews 接口的频率，仅允许已分配 License 的用户评价 (Verified Purchase)。  
* **Webhook 安全**: 计费回调接口强制校验 Stripe-Signature 签名及时间戳，防止重放攻击。  
* **Feature Gating**: 高级配置接口（如 Branding）强制检查订阅权益。  
* **双重验证**: 敏感操作需同时验证 Session 和 密码。  
* **隔离域校验（Scope Isolation）**: 所有业务接口必须在服务端从认证上下文解析 **主账号/子账号 scope** 并强制校验；客户端不得通过 query/body 自行指定 scope 来绕过权限校验。
- `masterAccountId/subAccountId` 必须从认证上下文（JWT/PAT + ticket 恢复信息）解析得到；客户端不得通过 query/body 传入来影响授权决策。
* **账号锁定**: 连续输错 5 次密码，账号自动锁定 30 分钟。
* **Session Cookie 安全属性**:
  * 必须设置：`HttpOnly; Secure; SameSite=Lax`（跨站场景若必须支持，需改为 `SameSite=None; Secure` 并强化 CSRF 防护）。
  * 必须限制 Cookie `Path` 与 `Domain`，避免跨子域滥用。
* **CSRF 防护（对所有状态改变接口）**:
  * 若使用 Cookie 作为浏览器主凭证：所有写接口（POST/PUT/PATCH/DELETE）必须启用 CSRF 防护（框架内置优先；否则使用 CSRF Token / Double-Submit 等模式）。


# **8\. 部署 / 运维注意事项 (Ops Notes)**

* **环境变量**:  
  * STORAGE\_PROVIDER: s3 | oss | tos  
  * STORAGE\_ENDPOINT, STORAGE\_BUCKET, STORAGE\_AK, STORAGE\_SK  
  * STRIPE\_SECRET\_KEY, STRIPE\_WEBHOOK\_SECRET  
  * HTTP\_PORT: 服务监听端口 (Default: 8081\)  
  * DATABASE\_URL, REDIS\_URL  
  * AGENT\_BRIDGE\_URL: Python 服务内网地址  
  * AGENT\_BRIDGE\_INTERNAL\_TOKEN: 服务间调用共享密钥  
* **CORS**: 生产环境必须配置严格的 Allowed Origins。

# **9\. 未来扩展 (Future Work)**

* **SSO 集成**: 支持 SAML/OIDC 以对接企业级 IDP (Okta/AD)。  
* **MFA**: 引入多因素认证 (TOTP/SMS)。  
* **SCIM**: 支持跨域身份管理，自动同步企业组织架构。

# **10\. 附录 (Appendix)**

## **10.1 内部包结构 (Internal Packages)**

| 包名 | 职责 |
| :---- | :---- |
| internal/service/auth | 身份认证逻辑 |
| internal/service/market | 市场搜索与评价逻辑 |
| internal/service/billing | 支付集成与订阅管理 |
| internal/service/conversation | 会话 CRUD 与历史记录 |
| internal/service/asset | 签名 URL 生成与文件确认 |
| internal/repository | 数据库访问 (pgx) |
| internal/provider/storage | 对象存储适配器接口 |
| internal/session | Redis 会话管理 |
| internal/jwt | JWT 签发与验证 |

## **10.2 架构决策记录 (ADRs)**

* **ADR-C01 (Consolidation)**: 将 Auth, Market, Asset, Billing, Conversations 合并入单一 Go 服务，以减少微服务数量，降低运维复杂度，提高数据一致性。
* **ADR-S01 (Language)**: 选择 Go 以获得高性能并发的 HTTP 管理类接口能力（鉴权/票据签发/auth_request/业务域 CRUD），并降低网关准入链路延迟与资源占用；实时消息帧处理由 Agent Bridge 承担。
* **ADR-S02 (Auth)**: 采用 Session (Browser) \+ JWT (Nginx) 混合模式，兼顾安全性与性能。
