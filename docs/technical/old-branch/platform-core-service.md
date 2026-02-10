# **平台核心服务规范 (Platform Core Service)**

文档版本：v2.4

最后修改日期：2025-11-30

作者：JeafDean

相关文档：docs/technical/api/api-architecture.md

文档目的：定义 platform-core (原 site-auth) 服务在身份认证、多租户管理、应用市场 (Marketplace)、资产管理 (Assets)、计费订阅 (Billing)、会话管理 (Conversations) 及系统审计方面的核心职责与接口契约。

# **1\. 概述 (Overview)**

Platform Core Service 是 Orbitaskflow 系统的 **中央神经系统**。它基于 Go 语言构建，接管了原 Site Auth 的所有职责，并扩展了核心业务能力。它负责处理所有高并发的 I/O 密集型业务，包括用户身份验证、组织架构管理、应用市场的搜索与发现、静态资产的安全上传、企业的订阅支付以及会话历史数据的读取与管理。它是前端应用 (BFF) 的主要交互对象。

# **2\. 职责 (Responsibilities)**

* **身份中心 (Identity)**: 校验凭证，颁发双重令牌（Session \+ JWT），管理用户生命周期（登录、注册、强制改密）。  
* **多租户 (Tenancy)**: 维护组织架构，处理租户切换、成员邀请及权限分配。  
* **会话管理 (Conversations)**: **\[New\]** 负责会话列表的查询、元数据更新（重命名/归档）及历史消息的拉取（CQRS 中的 Read Model）。  
* **应用市场 (Marketplace)**: 提供 Agent 商品的**全文本搜索**、**分类筛选**、**排序**及详情查询，管理用户评价系统。  
* **资产管理 (Assets)**: 生成文件上传的预签名 URL (Presigned URL)，并校验上传结果 (HeadObject)，确保对象存储的安全性。  
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

* **Session Token (site\_auth\_token)**:  
  * **存储**: Redis (session:{token})  
  * **属性**: HttpOnly, Secure Cookie  
  * **用途**: 浏览器主凭证，包含完整 SessionData (UserId, TenantId, Roles)。  
* **JWT (site\_auth\_jwt)**:  
  * **存储**: Cookie  
  * **Payload**: { uid: "uuid", tenantId: "uuid", role: "admin", exp: 1710000000 }  
  * **用途**: Nginx 边缘鉴权，无状态快速校验。  
* **Personal Access Token (PAT)**: **\[New\]**  
  * **存储**: Database (api\_keys table) \+ Redis Cache  
  * **格式**: pat\_sk\_... (Opaque String)  
  * **用途**: 开发者脚本或第三方系统集成 (M2M Auth)。

## **4.2 交互票据 (Connectivity)**

* **WS Ticket**:  
  * **存储**: Redis (ticket:{uuid})  
  * **TTL**: 60秒  
  * **用途**: 建立 WebSocket 连接时的一次性握手凭证。

# **5\. API 规范 (API Spec)**

Base URL: /api (由 Nginx 转发，Auth 模块前缀 /api/auth，业务模块前缀 /api/v1)

## **5.1 认证模块 (Auth)**

### **POST /auth/v1/login**

**功能**: 用户登录，初始化会话。

* **Request**: { "email": "...", "password": "..." }  
* **Response**:  
  {    
    "data": {    
      "user": { "id": "...", "email": "...", "lastActiveTenantId": "..." },    
      "redirectUrl": "/workspace/tenant-1",    
      "requirePasswordChange": true // 提示前端强制跳转修改密码页    
    }    
  }

### **POST /auth/v1/logout**

**功能**: 销毁 Session 并清除 Cookies。

### **POST /auth/v1/refresh**

**功能**: 使用有效的 Session Cookie 刷新过期的 JWT。

* **Response**: 200 OK (Set-Cookie: site\_auth\_jwt=...)

### **GET /auth/v1/session**

**功能**: 前端初始化检查，返回当前上下文。

### **PUT /auth/v1/me/password**

**功能**: 用户修改自己的密码（或完成强制修改流程）。

* **Request**: { "oldPassword": "...", "newPassword": "..." }  
* **Behavior**: 修改成功后自动清除 is\_password\_reset\_required 标记。

### **GET /auth/v1/validate**

**功能**: Nginx 鉴权回调接口。

* **Response**: 204 OK (Pass) 或 401 Unauthorized (Block)。

## **5.2 身份与租户管理 (Identity & Tenancy)**

### **GET /v1/users/me**

**功能**: 获取当前用户详细资料及个性化设置。

* **Response**: { "data": { "settings": { "theme": "dark" } } }

### **PATCH /v1/users/me/settings**

**功能**: 更新用户偏好 (i18n, Theme)。

### **POST /v1/users/me/pats \[New\]**

**功能**: 生成个人访问令牌 (Personal Access Token)。

* **Request**:  
  {  
    "name": "CI Pipeline",  
    "expiresInDays": 30,  
    "scopes": \["agent:run", "conversation:read"\] // \[New\] 最小权限控制  
  }

* **Response**: { "data": { "token": "pat\_sk\_..." } } (Token 仅在创建时返回一次)

### **GET /v1/users/me/pats \[New\]**

**功能**: 列出当前用户的所有 PAT（不含 Token 明文）。

### **DELETE /v1/users/me/pats/{id} \[New\]**

**功能**: 撤销特定的 PAT。

### **GET /v1/tenants**

**功能**: 列出当前用户所属的所有租户。

### **POST /v1/tenants/{tenantId}/switch**

**功能**: 切换当前活跃租户，刷新 JWT 中的 tenantId Claim。

### **POST /v1/invitations/{token}/accept**

**功能**: 用户接受邀请加入租户。

* **Response**: 200 OK (加入成功，自动跳转)

### **GET /v1/tenants/{tenantId}/quotas **

**功能**: 查询当前租户的资源使用量与限制（基于 Resource Governance 策略）。

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

## **5.3 成员管理模块 (Admin Only)**

此模块接口仅供 **Admin** 或 **Owner** 角色调用。

### **GET /v1/tenants/{tenantId}/users**

**功能**: 列表查询租户下成员。

* **Response**:  
  {  
    "data": \[  
      {  
        "id": "...",  
        "fullName": "Jeff Dean",  
        "role": "member",  
        "departments": \[{ "id": "dept\_1", "name": "法务部" }\],  
        "status": "active" // active | pending | locked | force\_change\_password  
      }  
    \]  
  }

### **POST /v1/tenants/{tenantId}/users**

**功能**: 直接创建新员工账号并设置初始密码。

* **Request**:  
  {  
    "email": "new.employee@corp.com",  
    "fullName": "New Employee",  
    "initialPassword": "TempPassword123\!",  
    "role": "member",  
    "departmentIds": \["dept\_1"\] // 岗位绑定  
  }

* **Behavior**: 创建用户 \-\> 设置 is\_password\_reset\_required=true \-\> 自动加入租户 \-\> 关联部门。

### **POST /v1/tenants/{tenantId}/users/batch**

**功能**: 批量导入用户。

* **Request**:  
  {  
    "users": \[  
      { "email": "a@corp.com", "fullName": "A", "initialPassword": "...", "departmentIds": \["..."\] },  
      { "email": "b@corp.com", "fullName": "B", "initialPassword": "..." }  
    \]  
  }

### **POST /v1/tenants/{tenantId}/users/{userId}/password**

**功能**: 管理员强制重置员工密码。

* **Request**: { "newPassword": "..." }  
* **Behavior**: 设置新密码 \-\> 强制下线该用户 \-\> 设置 is\_password\_reset\_required=true。

### **POST /v1/tenants/{tenantId}/users/{userId}/sessions/revoke**

**功能**: 强制下线某用户（踢出）。

* **Behavior**: 删除 Redis 中的所有相关 Session Key，导致用户下次请求时 401。

### **POST /v1/tenants/{tenantId}/users/{userId}/unlock**

**功能**: 解锁因多次输错密码被锁定的账号。

* **Behavior**: 清除 Redis 中的错误计数器。

### **POST /v1/tenants/{tenantId}/invitations**

**功能**: 发送邮件邀请（适用于已有账号的外部协作者）。

* **Side Effects**:
  1. 发送邀请邮件 (Email)。
  2. 若目标邮箱已注册，触发 `invite.received` 类型的站内通知 (In-App Notification)。

## **5.4 部门与子账号模块 (Department Management)**

### **POST /v1/tenants/{tenantId}/departments**

**功能**: 创建新的部门（即子账号）。

* **Request**: { "name": "Legal Team" }

### **GET /v1/tenants/{tenantId}/departments**

**功能**: 列出租户下的所有部门及其基础统计（成员数、已分配 Agent 数）。

### **PATCH /v1/tenants/{tenantId}/departments/{deptId}**

**功能**: 修改部门名称。

### **DELETE /v1/tenants/{tenantId}/departments/{deptId}**

**功能**: 删除部门（仅当部门下无成员且无资产时允许）。

## **5.5 许可分配模块 (License Allocation)**

### **GET /v1/tenants/{tenantId}/licenses**

**功能**: 获取租户拥有的所有 Agent 资源池。

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

### **POST /v1/tenants/{tenantId}/licenses/{licenseId}/allocations**

**功能**: 分配席位给用户或部门。

* **Request**:  
  {  
    "assigneeType": "user", // or "dept"  
    "assigneeId": "user\_1"  
  }

### **DELETE /v1/tenants/{tenantId}/licenses/{licenseId}/allocations/{allocationId}**

**功能**: 回收席位。

## **5.6 系统审计模块 (Audit)**

### **GET /v1/tenants/{tenantId}/audit-logs**

**功能**: (Owner Only) 分页查询系统审计日志。

* **Query**: page=1\&pageSize=20\&filter\[action\]=member.create

## **5.7 应用市场模块 (Marketplace)**

此模块负责 Agent 商品的发现与详情。

### **GET /v1/market/workflows**

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

### **GET /v1/market/workflows/{id}**

**功能**: 获取 Agent 详情，包括介绍、价格、评价概览。

### **GET /v1/market/workflows/{id}/reviews**

**功能**: 分页加载用户评价。

### **POST /v1/market/workflows/{id}/reviews**

**功能**: 用户发表评价（需校验是否已使用过该 Agent）。

## **5.8 资产管理模块 (Assets)**

处理大文件上传的安全逻辑。

### **POST /v1/assets/upload-url**

**功能**: 获取对象存储上传凭证。

* **Request**:  
  {  
    "filename": "contract.pdf",  
    "sizeBytes": 1048576,  
    "contentType": "application/pdf",  
    "usage": "chat\_attachment" // 或 'avatar', 'knowledge\_base'  
  }

* **Response**:  
  {  
    "data": {  
      "uploadUrl": "\[https://s3.region.amazonaws.com/bucket/key?signature=\](https://s3.region.amazonaws.com/bucket/key?signature=)...",  
      "fileId": "file-uuid",  
      "method": "PUT",  
      "headers": { "Content-Type": "application/pdf" }  
    }  
  }

### **POST /v1/assets/{fileId}/confirm**

**功能**: 上传完成后通知服务端进行确认。

* **Behavior**: 服务端触发 HeadObject 检查文件是否存在且大小匹配。成功后将数据库状态由 uploading 更新为 ready。

## **5.9 计费与订阅模块 (Billing & Subscriptions)**

处理与支付网关 (Stripe) 的集成及订阅生命周期。

### **POST /v1/billing/subscriptions/checkout**

**功能**: 创建订阅支付会话 (Stripe Checkout Session)。

* **Request**:  
  {  
    "priceId": "price\_H5ggY...", // Stripe Price ID  
    "quantity": 10 // 购买席位数量  
  }

* **Response**: { "data": { "checkoutUrl": "https://checkout.stripe.com/..." } }

### **GET /v1/billing/subscriptions/portal**

**功能**: 获取客户门户链接 (Stripe Customer Portal)，供用户自行管理信用卡和发票。

* **Response**: { "data": { "portalUrl": "https://billing.stripe.com/..." } }

### **POST /v1/billing/webhook**

**功能**: (Public) 接收支付网关的异步通知（如 invoice.payment\_succeeded）。

* **Security**: 必须校验 Webhook Signature (e.g., Stripe-Signature)，防止伪造。

## **5.10 数据洞察模块 (Analytics)**

### **GET /v1/tenants/{tenantId}/analytics/usage**

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

### **POST /v1/agent/tickets**

**功能**: 申请 WebSocket 连接票据。

* **Response**: { "data": { "ticket": "ws-ticket-uuid", "expiresIn": 60 } }

## **5.12 会话管理模块 (Conversation Management)**

负责会话元数据的管理和历史消息的读取（CQRS Read Model）。

### **GET /v1/conversations**

**功能**: 获取当前用户的会话列表（侧边栏）。

* **Query Parameters**:  
  * page, pageSize: 分页。  
  * tenantId: 强制过滤。  
  * workflowId: (Optional) 筛选特定工作流。  
* **Response**:  
  {  
    "data": \[  
      { "id": "conv\_1", "title": "合同审查", "lastMessageAt": "2025-11-29T...", "workflow": {...} }  
    \]  
  }

### **GET /v1/conversations/{id}/messages**

**功能**: 获取特定会话的历史消息（支持无限滚动）。

* **Query Parameters**:  
  * limit: 条数 (Default: 20)。  
  * cursor: 游标（上一页返回的 meta.cursor）。  
  * direction: before (历史) | after (新消息)。  
* **Response**:  
  {  
    "data": \[  
      { "id": "msg\_1", "role": "user", "content": "...", "createdAt": "..." },  
      { "id": "msg\_2", "role": "assistant", "content": "...", "uiIntent": {...} }  
    \],  
    "meta": { "cursor": "next\_cursor\_xyz" }  
  }

### **PATCH /v1/conversations/{id}**

**功能**: 更新会话属性（重命名、归档）。

* **Request**: { "title": "New Title", "isArchived": true }

### **DELETE /v1/conversations/{id}**

**功能**: 软删除会话。

* **Behavior (Cascading Logic)**: **\[New\]**  
  1. 将 conversations 记录标记为删除 (deleted\_at).  
  2. 异步触发清理任务，将关联的 messages 标记为删除或移入冷存储。  
  3. 注意：关联的 files 暂不删除，以防其他会话引用（需检查引用计数）。

## **5.13 租户配置模块 (Tenant Configuration) \[New\]**

### **GET /v1/tenants/{tenantId}/settings**

**功能**: 获取租户的配置信息（品牌、安全策略）。

* **Response**:  
  {  
    "data": {  
      "branding": { "logoUrl": "...", "primaryColor": "\#000000" },  
      "security": { "mfaRequired": false }  
    }  
  }

### **PATCH /v1/tenants/{tenantId}/settings**

**功能**: (Admin Only) 更新租户配置。

* **Feature Gating**: **\[New\]** \* 必须校验租户当前的 Subscription Plan 是否包含 custom\_branding 或 advanced\_security 特性。  
  * 若不包含，返回 403 Forbidden，错误码 upgrade\_required。  
* **Request**: { "branding": { ... } }

## **5.14 通知服务模块 (Notification Service) [New]**

支持架构 V3.8 定义的 "Hybrid Push-Pull" 策略。前端在 WebSocket 连接建立后，或检测到掉线重连时，应调用列表接口进行“兜底拉取”。

### **GET /v1/notifications**

**功能**: 获取通知列表。

* **Query Parameters**:
  * `unread_only`: boolean (Default: `false`)
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
          "target_url": "/workspace/conv_888"
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

### **PATCH /v1/notifications/{id}
功能: 标记单条通知为已读。

Request: { "isRead": true }

Response: 200 OK

### **POST /v1/notifications/read-all
功能: 标记所有通知为已读。

Response: { "data": { "updatedCount": 15 } }


# **6\. 关键流程 (Key Flows)**

## **6.1 登录与强制改密流**

1. 用户 POST /auth/v1/login。  
2. 后端检查密码正确，但发现 is\_password\_reset\_required=true。  
3. 返回 200 OK，Body 中 requirePasswordChange: true。  
4. 前端拦截跳转至 /change-password 页面。  
5. 用户调用 PUT /auth/v1/me/password。  
6. 后端更新密码，清除标记，流程完成。

## **6.2 会话加载流 (Conversation Loading)**

1. 前端加载侧边栏：调用 GET /v1/conversations。  
2. 用户点击会话：调用 GET /v1/conversations/{id}/messages 加载最近 20 条历史。  
3. **并发操作**：同时前端建立 WebSocket 连接 (POST /tickets \-\> WS Connect) 准备接收新消息。  
4. 用户发送消息：通过 WebSocket 发送 chat.input。

## **6.3 安全文件上传流**

1. 前端调用 POST /v1/assets/upload-url。  
2. Platform Core 校验租户存储配额 \-\> 生成 OSS/S3 签名 URL \-\> 记录 files 表 (status=uploading)。  
3. 前端直接 PUT 文件到云存储。  
4. 前端调用 POST /v1/assets/{fileId}/confirm。  
5. Platform Core 校验云端文件 \-\> 更新 files 表 (status=ready)。

# **7\. 安全机制 (Security Model)**

* **上传安全**:  
  * 强制校验 Content-Type 和文件扩展名。  
  * 服务端 HeadObject 二次校验文件大小 (Size Consistency Check)。  
* **市场防刷**: 限制 reviews 接口的频率，仅允许已分配 License 的用户评价 (Verified Purchase)。  
* **Webhook 安全**: 计费回调接口强制校验 Stripe-Signature 签名及时间戳，防止重放攻击。  
* **Feature Gating**: 高级配置接口（如 Branding）强制检查订阅权益。  
* **双重验证**: 敏感操作需同时验证 Session 和 密码。  
* **租户隔离**: 所有业务接口必须校验 X-Orbit-Tenant-Id。  
* **账号锁定**: 连续输错 5 次密码，账号自动锁定 30 分钟。

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
* **ADR-S01 (Language)**: 选择 Go 以获得高性能并发 (Goroutines) 处理 WebSocket 连接。  
* **ADR-S02 (Auth)**: 采用 Session (Browser) \+ JWT (Nginx) 混合模式，兼顾安全性与性能。
