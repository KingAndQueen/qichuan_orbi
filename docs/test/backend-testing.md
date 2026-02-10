# 后端测试设计说明（Backend Testing Spec v0.2）

文档版本：v0.2  
最后修改日期：2026-01-30  
作者：JeafDean（待定）  
所属模块：平台核心后端（Platform Core / Auth）  
建议存放路径：`docs/technical/test/backend-testing.md`

相关文档（按 docs-map 注册表路径）：
- `docs-map.md`

- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`

- `docs/features/platform-overview.md`
- `docs/features/prd-identity-access.md`
- `docs/features/prd-wokrspace.md`
- `docs/features/prd-marketplace.md`
- `docs/features/prd-insights.md`

- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/architecture/nginx-gateway-arch.md`
- `docs/technical/architecture/core-service.md`
- `docs/technical/data/database-design.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/api/agent-interface-spec.md`

- `docs/test/qa-master-plan.md`

说明：本文件聚焦“后端可验收行为”（API 契约/隔离/幂等/审计/作业状态），不重复描述前端体验细节；前端可感知体验由 `frontend-testing.md` 覆盖。

---

## 1. 背景与目标 (Background & Goals)

Platform Core Service 是 Orbitaskflow 的“中央神经系统”，负责身份认证、**主账号/子账号**（隔离与上下文）、应用市场、资产管理、计费订阅、会话读取与系统审计等能力。其 API 契约与跨服务不变量由 L2 技术文档统一定义（如 `api-style-guide.md`、`fullstack-architecture.md`、`database-design.md`）。

本测试设计文档的目标：

- 将与 Platform Core 相关的 PRD 需求，转化为可维护的测试用例集合；
- 明确后端测试的分层策略（Unit / Integration / Contract / E2E / Logging）；
- 给出典型“需求 → 测试用例”映射示例，方便 AI 按既定风格生成更多测试；
- 确保测试通过后，既不违背现有技术方案，又足以支撑上层产品体验（参考 QA 总纲 6.3 节）。

说明：本文件 **不重新定义业务需求**。所有断言与覆盖口径必须可回溯到 SSOT：
- 产品/验收口径以 PRD（L1/L3）为准；
- 跨服务不变量与接口形态以技术契约（L2）为准；
- 实现细节（L4）仅用于落地参考。

若 PRD 与 L2/L4 出现冲突：先在 `docs-map.md` 规定的流程下回流修订（PRD 或 L2），本测试文档仅做同步更新，不自行裁决。

---

## 2. 范围 (In Scope / Out of Scope)

### 2.1 In Scope

当前 Backend Testing v0.2 版本覆盖：

1. **身份与 Session / JWT 流程**  
   - 登录 / 登出 / 刷新 会话；  
   - `auth_request` / `validate` 与 Nginx 网关配合；  
   - 强制修改密码流程。  

2. **主账号/子账号与成员管理**  
   - 当前用户上下文（例如 `GET /api/v{N}/users/me`）；  
   - 主账号/子账号列表与上下文切换；  
   - 成员管理（创建用户、批量导入、强制下线、解锁等）。

3. **部门与许可分配 (Departments & Licenses)**  
   - 部门 CRUD；  
   - License / 座位分配与回收逻辑。  

4. **Personal Access Token (PAT)**  
   - PAT 的创建、列出、撤销；  
   - 最小权限控制（Scopes）与安全约束。  

5. **资源配额与治理 (Quotas)**  
   - 主账号维度配额查询与状态计算（API 路径以 Core Service 契约为准）；  
   - 与 LLM 调用 / Token 消耗的基本联动（可通过业务记录与结构化日志侧验证）。

6. **资产管理 (Assets)**  
   - 上传 URL 获取与确认流程（Presigned URL）；  
   - 文件状态迁移（uploading → ready）；  
   - 基本安全约束（大小、类型、usage）。

7. **工作流市场基础能力 (Marketplace)**  
   - 工作流搜索 / 筛选 / 排序；  
   - 详情查询与评价读取；  
   - 评价创建的基础业务规则（如需使用过该 Agent）。

8. **系统审计 (Audit Logs)**  
   - 核心管理操作产生审计日志；  
   - 审计日志的查询接口行为；  
   - 日志结构与 `observability-logging.md` 的契约一致性（部分通过日志测试验证）。

9. **与网关 / Agent Bridge / 前端的契约边界**  
   - JWT 校验端点供 Nginx `auth_request` 使用；  
   - WS Ticket / 内部 Token 与 Agent Bridge 的通信；  
   - API 信封结构、错误码、Trace ID 等统一标准。

### 2.2 Out of Scope

以下内容暂不在 v0.2 自动化测试设计范围，可通过手工测试或后续 v0.3+ 补充：

- Stripe 等外部支付网关的真实集成与结算对账（当前只要求在 Sandbox / Mock 环境下做基本行为验证）；
- 超大规模主账号（百万级用户）的性能压测与资源消耗（归入 `nonfunctional-testing.md`）；  
- 与第三方 IdP / SSO 的深度集成（如 OIDC 联合登录），若后续实现将单独扩展测试小节；  
- 复杂报表 / 报告类 API（由 Data Insights 及相关测试文档覆盖）。
- **细粒度权限矩阵的完整验证**（由 `identity-and-access-testing.md` 承担主责任，本文件仅覆盖“后端接口可否被调用”和“返回内容是否受权限控制”这两类关键行为）。
---

## 3. 测试分层与框架 (Test Layers & Frameworks)

### 3.1 测试分层

1. **单元测试 (Unit Tests)**  
   - 示例：密码校验、**主账号/子账号上下文切换**逻辑、配额状态计算、License 分配规则、PAT Scope 校验等。  

2. **集成测试 (Integration Tests)**  
   - 示例：`/auth/v1/login` 到 Session 创建、主账号/子账号上下文下的成员创建并入库、资产上传 URL 生成与确认。  

3. **契约测试 / 协议测试 (Contract Tests)**  
   - 目标：验证 API 的响应信封、错误码、Header（如 Trace ID）等与 `docs/standards/api-style-guide.md` 保持一致。  
   - 示例：统一 `ApiResponse<T>` 结构、错误码 `UNAUTHORIZED` / `RESOURCE_EXHAUSTED` / `INTERNAL_ERROR` 等。  

4. **端到端测试 (E2E Tests)**  
   - 示例：完整登录 → 切换主账号/子账号 → 查看工作流市场 → 订阅工作流 → 分配 License → 在前端触发工作流。  

5. **日志 / 可观测性测试 (Logging / Observability Tests)**  
   - 目标：验证关键路径上的日志结构、Trace ID、**master_account_id**（可选 `sub_account_id`）等字段存在且符合 Schema；

### 3.2 异步任务引擎测试（Async Jobs / Task Engine）

> 目标：验证后端异步任务的**统一创建形态、状态机、幂等性、可观测性与可追溯性**。状态枚举与接口形态以 `docs/standards/api-style-guide.md` 为准；数据隔离维度以 `master_account_id`（可选 `sub_account_id`）为准。

#### 3.2.1 接口与契约断言（Contract）

- **创建任务（Create Job）**  
  - 断言：创建请求返回 `202 Accepted`。  
  - 断言：响应体包含 `jobId`（必填），并包含可轮询的状态资源引用（如 `statusUrl` 或等价字段；以 L2 契约为准）。  
  - 断言：若系统启用 Side-effect / Receipt 机制，响应应包含 `receiptId`（或可从日志/审计侧关联获得）。  
  - 断言：同一幂等键（如 `Idempotency-Key` 或业务幂等字段）重复提交时，不应创建重复任务，返回同一 `jobId`（或明确的幂等语义）。

- **查询任务状态（Get Job Status）**  
  - 断言：状态枚举仅使用 `queued | running | succeeded | failed | cancelled`（不使用 Pending/Processing/Completed/Archived）。  
  - 断言：响应包含 `createdAt`、`updatedAt`、终态时包含 `endedAt`（字段名以契约为准）。  
  - 断言：终态 `failed` 必须返回对用户可理解的 `error.code` / `error.message`（不得泄露内部堆栈）。

#### 3.2.2 状态流转完整性（State Transition）

1) **基础链路**  
- 断言：`queued`（已创建）→ `running`（Worker 认领）→ `succeeded|failed|cancelled` 的全链路状态变迁可被观察到。  
- 断言：`jobId` 在创建响应、队列 payload、数据库记录中一致。  
- 断言：终态一旦写入，不可回退到非终态。

2) **取消与超时**  
- 断言：取消请求将状态置为 `cancelled`，且 Worker 不再继续执行（或执行结果被丢弃；以实现策略为准，但必须可观测）。  
- 断言：超时策略触发后进入 `failed`（或 `cancelled`），并写入可追溯的原因字段（如 `error.code=timeout`）。

3) **失败重试策略（如适用）**  
- 断言：若启用重试，重试次数、退避策略与最终终态可被观测（例如 `attempt`/`maxAttempts` 字段或日志侧证据）。  
- 断言：重试不会导致重复副作用（若副作用存在，必须通过 receipt/幂等保护）。

#### 3.2.3 并发、幂等与去重（Concurrency & Idempotency）

- 断言：同一 `jobId` 只能被一个 Worker 认领执行（避免双执行）。  
- 断言：并发提交同一幂等键时，不会创建多个任务记录。  
- 断言：任务结果写入采用“最终一致但可重入”的方式（重复回调/重复完成信号不会破坏结果）。

#### 3.2.4 隔离与权限（Isolation & Authorization）

- 断言：所有 Job 资源的读写均受 `master_account_id`（可选 `sub_account_id`）隔离；跨主账号访问返回 `NOT_FOUND` 或 `PERMISSION_DENIED`（以统一错误口径为准）。  
- 断言：只有具备权限的主体可创建/查询/取消任务（例如管理员任务 vs 普通成员任务）。

#### 3.2.5 日志与可观测性（Logging / Observability）

- 断言：关键阶段产生结构化日志：创建（queued）、认领（running）、完成（succeeded/failed/cancelled）。  
- 断言：日志包含 `trace_id`、`jobId`、`master_account_id`（可选 `sub_account_id`）、`status`；失败时包含 `error.code`（不得包含敏感数据）。  
- 断言：若启用 receipt/审计链路，应能通过 `receiptId` 或等价关联键把“API 调用 → 异步任务 → 外部副作用（如有）”串起来。

#### 3.2.6 代码示例（Pytest + Arq，示意）

```python
@pytest.mark.asyncio
async def test_job_state_machine_happy_path(db_conn, redis_pool, http_client):
    # 1) Create job (contract shape per L2)
    resp = await http_client.post("/api/v1/jobs", json={"type": "ingest_pdf", "file_path": "test.pdf"})
    assert resp.status_code == 202
    body = resp.json()
    job_id = body["jobId"]

    # 2) Initial state must be queued
    row = await db_conn.fetchrow("SELECT status FROM async_tasks WHERE id=$1", job_id)
    assert row["status"] == "queued"

    # 3) Run worker once (in-process)
    worker = Worker(functions=[ingest_pdf], redis_pool=redis_pool)
    await worker.run_check()

    # 4) Final state must be succeeded/failed/cancelled; here assert succeeded for happy path
    final = await db_conn.fetchrow("SELECT status, result FROM async_tasks WHERE id=$1", job_id)
    assert final["status"] == "succeeded"
    assert final["result"]["chunks_created"] > 0
```
### 3.3 技术栈与约定

- 语言：Go（Platform Core / Auth 服务）  
- 测试框架：标准库 `testing`，可配合 `testify` 等断言库；  
- 测试文件命名：`*_test.go`，与被测包同级目录；  
- 测试环境：
  - 单元测试：使用内存实现或 Stub / Fake；  
  - 集成测试：连接测试用 Postgres / Redis（可由 `otf.py` 提供 test DB），或通过 docker-compose 启动。  
- 命名规范：
  - 测试函数名中推荐包含 PRD 引用标识，如：

    ```go
    func TestLoginHandler_ID_PRD_2_1_CreatesSession(t *testing.T) { ... }
    ```

  - 对应引用规则详见《质量保障总纲》5.2 节。

### 3.4 统一契约与跨服务协议测试（Cross-service Contracts）【新增】

本小节列出 Backend 与 Nginx 网关、Agent Bridge 等组件之间的关键契约测试场景，避免出现“接口实现改了，但跨服务协议未同步”的情况。

- **GW-CT-1：Auth Request 契约**  
  - 场景：Nginx 通过 `auth_request /auth/v1/validate` 对请求做访问控制；
  - 期望：
    - 有效 JWT → `/auth/v1/validate` 返回 204，无 Body；
    - 无效/过期 JWT → 返回 401 Unauthorized，Body 可选（不强制 JSON 信封），但必须带有标准安全 Header（如 `WWW-Authenticate` 或自定义错误头）；
    - 集成测试可通过 docker-compose 启动 Nginx + Platform Core，向受保护路径发起请求，断言 2xx/401 行为符合预期。

- **AB-CT-1：WS Ticket / 主账号上下文绑定契约**  
  - 场景：前端创建 WebSocket 连接时，通过 Ticket 与服务端建立一次性会话绑定；  
  - 期望：
    - Ticket 仅可使用一次，过期或重放应返回明确错误；
    - Ticket 绑定后，后续 WS 事件流的消息必须携带并可追溯到相同的上下文（至少 `master_account_id`，可选 `sub_account_id`）；
    - Ticket 内必须包含：`master_account_id`（可选 `sub_account_id`）、`user_id`、`expires_at`、`nonce`（或等价字段），并可与审计/日志的 `trace_id` 关联。

- **API-CT-1：统一响应信封（ApiEnvelope）契约（参考 `docs/standards/api-style-guide.md`）**  
  - 场景：所有 REST API 返回结构必须符合统一信封规范；  
  - 期望：
    - success 响应符合 `ApiResponse<T>`；
    - error 响应包含标准化 `code/message/request_id(trace_id)` 等字段（以规范为准）；
    - 契约测试应在 CI 中对关键 API 做 schema 断言，防止“结构漂移”。

---
## 4. 需求 → 测试覆盖示例矩阵 (PRD → Test Matrix)

> 说明：本节给出各能力的代表性“PRD 引用 → 测试用例”矩阵，**不是穷举列表**。后续可在同一结构下扩展更多行。
>
> 口径要求：
> - **不再引入独立 Requirement ID**（避免跨文档编号体系冲突）。
> - 每行必须绑定**可回溯的 PRD 引用**（优先显式编号；否则用 PRD 小节标题，且在本表保持唯一）。
> - “主账号/子账号”口径：隔离根字段使用 `master_account_id`（可选 `sub_account_id`）；不使用 `tenant/tenant_id`。

### 4.1 身份与 Session / JWT

| PRD 引用 | 需求描述（业务语言） | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [ID-PRD 2.1] | 用户使用有效邮箱和密码调用登录接口时，系统必须创建新的 Session，返回用户信息与重定向 URL，并设置 HttpOnly Cookie/JWT | TC-BC-001 | 集成测试 | `services/platform-core/auth/handlers_login_test.go::TestLoginSuccessCreatesSessionAndCookie` |
| [ID-PRD 2.1] | 使用错误密码连续多次登录时，账号应被临时锁定，返回明确错误码与消息（而非模糊失败），**并记录安全日志** | TC-BC-002 | 集成 + 日志 | TBD |
| [ID-PRD 2.1] | 登录成功后，会话接口应返回当前用户的基础信息与**主账号/子账号上下文**（用于前端初始化），且响应结构符合统一 API 信封规范（如适用） | TC-BC-003 | 契约 + 集成 | TBD |
| [ID-PRD 2.1] | 当 JWT 过期或无效时，校验接口必须返回 401 Unauthorized 状态码，以便网关阻断请求（是否返回 JSON 错误信封由实现决定，测试只断言状态码与必要 Header） | TC-BC-004 | 契约测试 | TBD |
| [ID-PRD 2.1] | 强制修改密码标记为 true 的用户，在完成密码修改前，不得访问需要正常 Session 的业务接口 | TC-BC-005 | 集成测试 | TBD |

### 4.2 主账号/子账号与用户管理

| PRD 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [ID-PRD 2.2] | 用户可以获取自己所属的所有**主账号/子账号**列表，每个主账号包含名称与基本配额状态摘要（API 路径以 Core Service 契约为准） | TC-BC-010 | 集成测试 | TBD |
| [ID-PRD 2.2] | 调用“上下文切换”接口成功后，后续请求中的上下文应切换到新主账号/子账号（从 JWT/Session 声明反映），并影响可见资源范围 | TC-BC-011 | 集成 + 契约 | TBD |
| [ID-PRD 2.3] | 仅 Admin/Owner 角色可以创建/修改成员；普通成员调用应返回 `PERMISSION_DENIED`（或等价业务错误） | TC-BC-012 | 集成测试 | TBD |
| [ID-PRD 2.3] | 调用强制下线接口后，该用户的所有 Session 应立即失效 | TC-BC-013 | 集成测试 | TBD |
| [ID-PRD 2.3] | 解锁接口应清除登录失败计数，并允许用户重新尝试登录 | TC-BC-014 | 集成测试 | TBD |
| [ID-PRD 2.2] | 在多主账号场景下，对业务资源（如 Licenses、Marketplace、Quotas）的查询必须严格基于当前 `master_account_id`（可选 `sub_account_id`），不允许通过手工构造 ID 越权访问其他主账号数据 | TC-BC-015 | 集成测试 | TBD |

### 4.3 部门与 License 分配

| PRD 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WM-PRD 3.2] | License 列表接口应返回主账号拥有的所有资源池及分配情况，数据结构与 Core Service API 契约一致 | TC-BC-020 | 契约 + 集成 | TBD |
| [WM-PRD 3.2] | 分配 License 时，不得超过 `totalQuantity`，否则返回 `RESOURCE_EXHAUSTED`（或等价业务错误） | TC-BC-021 | 集成测试 | TBD |
| [WM-PRD 3.2] | 删除分配后，席位应正确回收，后续可重新分配 | TC-BC-022 | 集成测试 | TBD |
| [WM-PRD 3.2] | 当某部门/用户失去某工作流的 License 后，再次查询该部门/用户可用工作流列表时，不应包含该工作流；相应前端入口应基于此结果做隐藏 | TC-BC-024 | 集成测试 | TBD |
| [WM-PRD 2.x] | 部门创建必须要求唯一名称，重复创建应返回 `VALIDATION_FAILED`（或等价业务错误） | TC-BC-023 | 单元 + 集成 | TBD |

### 4.4 PAT 与配额治理

| PRD 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [ID-PRD 3.x] | 创建 PAT 时，返回的 token 只在响应体出现一次，不应再可查询到明文 | TC-BC-030 | 集成测试 | TBD |
| [ID-PRD 3.x] | PAT 必须携带名称、过期时间与 Scope 列表，Scope 控制后续可调用的 API 范围 | TC-BC-031 | 单元 + 集成 | TBD |
| [ID-PRD 3.x] | 删除 PAT 后，使用该 PAT 调用任何受保护接口都应返回 `UNAUTHORIZED`（或等价） | TC-BC-032 | 集成测试 | TBD |
| [ID-PRD 3.x] | 创建/撤销 PAT 时，必须产生安全相关审计日志；日志中包含 `master_account_id`, `user_id`, `action`（`pat.create`/`pat.revoke`），但不得包含 token 明文 | TC-BC-033 | 日志测试 | TBD |
| [DI-PRD 2.x / QA 总纲 6.3] | 配额查询接口返回的配额状态应包含资源类型、已用值、总额度与 `status`（ok / warning / exhausted）；维度以当前 `master_account_id` 为准（API 路径以契约为准） | TC-BC-034 | 单元 + 集成 | TBD |
| [DI-PRD 2.x / QA 总纲 6.3] | 当触发一次 LLM 调用并产生 Token 消耗时，配额已用值应按规则增加；超过配额时返回 `RESOURCE_EXHAUSTED`，并写入配额相关结构化日志 | TC-BC-035 | 集成 + 日志 | TBD |

### 4.5 资产管理 (Assets)

| PRD 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WS-PRD 附件上传] | 生成上传 URL 的接口必须验证文件名、大小与用途（usage），对超出大小限制或非法类型返回 `VALIDATION_FAILED` | TC-BC-040 | 集成测试 | TBD |
| [WS-PRD 附件上传] | 上传 URL 与文件 ID 应可被后续确认接口正确确认；确认前文件状态为 `uploading`，确认成功后变为 `ready` | TC-BC-041 | 集成测试 | TBD |
| [WS-PRD 附件上传] | 确认时若对象存储中不存在文件或大小不匹配，应返回错误并保持状态为 `uploading` 或标记为 `failed`，同时记录 error 日志 | TC-BC-042 | 集成 + 日志测试 | TBD |
| [observability-logging] | confirm 过程中发生 HeadObject 失败或大小不匹配时，必须写入 `level=error` 的结构化日志，包含 `asset_id`, `master_account_id`, `error.code` 等字段，且不记录文件内容 | TC-BC-043 | 日志测试 | TBD |

### 4.6 工作流市场 (Marketplace) 基本行为

| PRD 引用 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|
| [WM-PRD 2.1] | 工作流列表支持关键字搜索、分类筛选、排序与分页，返回字段与 Core Service API 契约一致 | TC-BC-050 | 契约 + 集成 | TBD |
| [WM-PRD 2.1] | 未订阅的工作流列表对所有拥有访问权限的用户可见，但详情中的价格/订阅状态需准确反映**当前主账号**的订阅关系 | TC-BC-051 | 集成测试 | TBD |
| [WM-PRD 2.2] | 用户评价接口仅允许已使用过该工作流的用户调用，未使用用户调用应返回 `PERMISSION_DENIED` 或业务级错误 | TC-BC-052 | 集成测试 | TBD |
| [WM-PRD 2.2] | 未订阅的主账号调用与运行相关的内部接口（如运行统计、内部配置等）应返回 `PERMISSION_DENIED` 或业务级错误，避免通过 API 绕过订阅控制 | TC-BC-053 | 集成测试 | TBD |

### 4.7 审计与日志 (Audit & Logging)

| PRD 引用 | 参考文档 | 需求描述 | 测试用例 ID | 测试层级 | 对应测试实现（建议） |
|---|---|---|---|---|---|
| [observability-logging] | `observability-logging.md` | 管理员关键操作（创建用户、分配 License、修改主账号关键设置等）必须写入审计日志表，并可通过审计查询接口检索（API 路径以契约为准） | TC-BC-060 | 集成测试 | TBD |
| [observability-logging] | `observability-logging.md` | 审计日志与 JSON 日志中的 `trace_id` / `master_account_id` / `user_id` 字段应可关联同一次操作 | TC-BC-061 | 日志测试 | TBD |
| [observability-logging] | `observability-logging.md` | 下列动作必须被审计：创建/删除用户、创建/撤销 PAT、分配/回收 License、修改主账号关键配置；审计日志中需包含 `action`, `operator_id`, `target_id`, `master_account_id`, `trace_id` 等字段 | TC-BC-063 | 集成 + 日志 | TBD |
| [observability-logging] | `observability-logging.md` | 身份校验失败 / 配额耗尽等严重错误必须产生 `level=error` 的 JSON 日志，包含标准字段 | TC-BC-062 | 日志测试 | TBD |

### 4.8 智能体配置管理（Agent Management）

| PRD 引用 | 参考文档 | 需求描述 | 测试用例 ID | 测试层级 |
|---|---|---|---|---|
| [WM-PRD x.x] | `prd-marketplace.md` | 创建自定义 Agent 时需校验 Prompt 不为空且模型配置合法（API 路径以契约为准） | TC-BC-080 | 单元 + 集成 |
| [WM-PRD x.x] | `prd-marketplace.md` | Agent 列表应同时返回“市场订阅的 Agent”和“企业自研的 Agent” | TC-BC-081 | 集成测试 |
| [WM-PRD x.x] | `prd-marketplace.md` | 修改 Agent 配置应包含版本控制逻辑（例如更新 `version` 字段并做并发保护） | TC-BC-082 | 集成测试 |

### 4.9 会话与消息历史（Conversations）

| PRD 引用 | 参考文档 | 需求描述 | 测试用例 ID | 测试层级 |
|---|---|---|---|---|
| [WS-PRD 2.4] | `prd-wokrspace.md` | 会话列表接口应分页返回当前用户的历史会话列表，包含最后一条消息摘要和更新时间（可见性受 `master_account_id` 约束） | TC-BC-070 | 集成测试 |
| [WS-PRD 2.4] | `prd-wokrspace.md` | 会话消息接口返回特定会话的完整消息记录，需按时间正序排列 | TC-BC-071 | 集成测试 |
| [WS-PRD 2.4] | `prd-wokrspace.md` | 会话更新接口允许用户重命名会话标题或软删除会话 | TC-BC-072 | 集成测试 |
| [WS-PRD 2.4] | `prd-wokrspace.md` | 只有会话 Owner（或按 PRD 定义的共享规则）可以读取消息；跨主账号访问应返回 `NOT_FOUND` 或 `PERMISSION_DENIED` | TC-BC-073 | 安全测试 |

### 4.10 基础数据洞察（Insights）

| PRD 引用 | 参考文档 | 需求描述 | 测试用例 ID | 测试层级 |
|---|---|---|---|---|
| [DI-PRD 2.1] | `prd-insights.md` | Insights Dashboard 返回**当前主账号**的 Token 消耗总量和任务完成数（数据源可 Mock，但 API 结构需与 L2 契约一致） | TC-BC-090 | 契约测试 |

---

## 5. 实施建议 (Implementation Guidelines)

1. **从核心路径开始**：优先实现身份 / 主账号-子账号上下文 / License / 资产管理相关测试，确保“登录 → 切换主账号/子账号上下文 → 分配资源 → 上传文件”这一条链路在 CI 中稳定可回归。    
2. **将测试与 PRD 引用绑定**：在新增测试用例时，务必在测试名称或注释中添加对应 PRD 段落标识，便于未来变更时回溯。  
3. **利用日志测试补足体验保证**：对于难以直接通过 API 断言的行为（如 Trace ID 透传、配额扣减细节），可通过结构化日志测试进行补充。这些日志测试应与《observability-logging.md》中给出的字段和示例保持一致。  
4. **与前端 / Agent Bridge 测试对齐**：
   - 当前端或 Agent Bridge 依赖 Platform Core 的某个行为（如配额错误码、资产状态机、License 可见性）时，需确保两端测试文档与本文件中的契约描述一致；  
   - 若某行为已在 Agent Bridge 或前端测试中强约束，可在本文件中用“引用”而非重复定义。  
5. **与 QA 总纲体验定义联动**：当 QA 总纲（`qa-master-plan.md`）中某个体验定义更新时，需要检查本文件中对应的 PRD 引用覆盖是否需要补充或调整，确保“体验定义 ↔ 后端测试”之间没有断层。
6. **持续演进**：随着 Platform Core 能力扩展（如更复杂的计费模型、外部 IdP、更多报表 API），在本文件中新增章节或子表格，并同步更新测试代码。

---

## 6. 未来工作 (Future Work)

- v0.3：
  - 补充 Billing & Subscriptions 与 Stripe Sandbox 的契约测试示例；  
  - 增加更多安全相关测试（如 API 速率限制、内部 Token 校验等）；  
  - 引入 property-based testing 验证配额与 License 分配在边界条件下的稳定性。  

- v0.4：
  - 与 `nonfunctional-testing.md` 联动，定义性能与容量测试场景（高并发登录、高频 License 调整等）；  
  - 将部分高价值 E2E 测试集成到 pre-release CI 流程中；  
  - 若 `identity-and-access-testing.md` 成熟，可在本文件中减少重复描述，仅保留契约级别的约束。

