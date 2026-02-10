# 非功能测试设计说明（Nonfunctional Testing Spec v0.2）

文档版本：v0.2  
最后修改日期：2026-01-30  
作者：Billow  
所属模块：全局非功能测试（Performance / Reliability / Security / Cost）  
建议存放路径：`docs/test/nonfunctional-testing.md`

相关文档（按 docs-map 注册表路径）：
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
- `docs/technical/architecture/nginx-gateway-arch.md`
- `docs/technical/architecture/core-service.md`
- `docs/technical/data/database-design.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/api/agent-interface-spec.md`

- `docs/technical/ops/observability-logging.md`
- `docs/technical/release/deployment.md`
- `docs/technical/dev/local-development.md`

- `docs/test/qa-master-plan.md`
- `docs/test/frontend-testing.md`
- `docs/test/backend-testing.md`
- `docs/test/agent-bridge-testing.md`
- `docs/test/data-insights-testing.md`
- `docs/test/agent-evaluation.md`

文档目的：定义 Orbitaskflow 平台在 **性能（Performance）**、**容量与伸缩性（Capacity & Scalability）**、**可靠性与可用性（Reliability & Availability）**、**安全性（Security）**、**主账号隔离（Isolation）** 与 **成本控制（Cost Efficiency）** 等非功能维度上的测试策略与代表性场景。
当本文件所列的核心非功能测试全部通过时，可以认为在当前版本下，平台的关键非功能体验满足 QA 总纲中对各产品能力的体验定义要求。

---

## 1. 背景与目标 (Background & Goals)

与功能测试不同，非功能测试关注的是**系统“如何”提供能力**：是否足够快、是否稳定、是否安全、在多主账号高并发场景下行为是否可预期。行业通行做法通常会围绕性能、伸缩性、安全和可靠性等维度进行系统化测试与度量。

Orbitaskflow 当前架构采用：

- Nginx 作为统一边界网关；  
- Next.js (Workspace Web) 作为 BFF / 前端；  
- Go (Platform Core Service) 提供身份、多主账号、市场、资产、计费等控制面能力；  
- Python (Agent Bridge Service) 提供 WebSocket / SSE 连接管理与 AI 编排；  
- PostgreSQL + Redis 作为核心存储与缓存层。  

本非功能测试设计文档的目标：

1. 将 PRD 与架构文档中对**体验**和**容量**的隐含要求，沉淀为可执行的非功能测试场景与指标；  
2. 给出性能 / 可靠性 / 安全等维度的 **SLO 建议与测试方法**，便于 AI 与人类统一生成测试代码与压测脚本； 
3. 与前端 / 后端 / Agent Bridge / Data Insights 等子测试文档形成分工明确的关系：
   - 子文档：保证**正确性**与体验细节；
   - 本文档：保证在典型负载与异常条件下，系统整体仍然满足体验定义，不出现灾难性退化。  

说明：本文件 **不重新定义业务需求与接口契约**。所有指标口径必须可回溯到 SSOT：
- 产品/验收口径以 PRD（L1/L3）为准；
- 跨服务不变量与接口形态以技术契约（L2）为准；
- 实现细节（L4）仅用于落地参考。

若 PRD 与 L2/L4 出现冲突：先按 `docs-map.md` 规定流程回流修订（PRD 或 L2），本文件仅做同步更新，不自行裁决。

---

## 2. 范围 (In Scope / Out of Scope)

### 2.1 In Scope

当前 Nonfunctional Testing v0.2 覆盖以下维度：

1. **性能与容量 (Performance & Capacity)**  
   - HTTP API / BFF 接口吞吐与延迟；  
   - WebSocket / SSE 长连接的并发能力与消息延迟；
   - 说明：对外公开的 Agent 对话协议以 SSE 为主（见 `docs/test/agent-bridge-testing.md`）；WebSocket 仅在内部链路或前端侧交互中出现时，按架构文档约束进行压测与验证。 
   - 关键报表（如 Data Insights 导出）的处理时间与资源占用。  

2. **可用性与可靠性 (Availability & Reliability)**  
   - 关键路径在单实例故障 / 下游依赖异常时的退化与恢复策略；  
   - 超时、重试、熔断策略在真实流量下的行为。  

3. **主账号隔离与数据安全 (Master-account Isolation & Security)**  
   - 在高并发与异常场景下，不同**主账号**之间的数据与资源隔离是否仍然成立（边界键：`master_account_id`，可选 `sub_account_id`）；  
   - 基于 OWASP ASVS / WSTG 的基础安全验证与攻击模拟（弱口令爆破、权限绕过、常见 Web 漏洞等）。

4. **资源与成本治理 (Resource & Cost Governance)**  
   - 配额 (Quotas) 与限流策略在高负载下的表现；  
   - LLM 调用与任务执行对成本指标（如 tokens / cost_usd）的影响与可控性。  

### 2.2 Out of Scope

- LLM / Agent 生成内容的**准确性与有用性**（由 `docs/test/agent-evaluation.md` 定义与评估）； 
- 细粒度的组件级性能微优化（由各服务内部基准测试与 Profiling 文档负责）；  
- 复杂、多云多区域 HA 场景（当前 MVP 主要关注单区域 / 单集群部署的可靠性）。  

---

## 3. 质量属性与 SLO 建议 (Quality Attributes & SLO Suggestions)

本节给出 Orbitaskflow 当前阶段可参考的非功能指标与 SLO（Service Level Objective）建议，用于指导后续压测与回归测试。实际数值可依据环境与硬件调整，但**必须显式写入测试脚本与报告**，便于持续回归。

> 行业中通常使用 p90 / p95 / p99 延迟、吞吐量 (RPS)、错误率、CPU/内存利用率等指标来衡量性能与容量。

### 3.1 指标定义 (Key Metrics)

- **延迟 (Latency)**：  
  - p50 / p95 / p99 请求延迟（毫秒）；  
  - SSE / WebSocket 场景下：从客户端发送请求到**首个有效事件**到达的时间。
- **吞吐量 (Throughput)**：  
  - HTTP 请求数 / 秒 (RPS)、活跃 WebSocket 连接数；  
- **错误率 (Error Rate)**：  
  - HTTP 5xx 比例、应用级错误码（如 `RESOURCE_EXHAUSTED`、`INTERNAL_ERROR`）比例；
- **资源利用率 (Resource Utilization)**：  
  - 关键服务的 CPU、内存、网络带宽、PostgreSQL / Redis 连接数。
- **可用性 (Availability)**：  
  - 按业务定义的成功率（包括重试后的成功），例如 99.5% / 99.9%；  
- **安全性 (Security)**：  
  - 基于 OWASP ASVS 的控制项覆盖率（例如认证、访问控制、输入验证等章节通过率）。 

### 3.2 核心体验相关 SLO 建议

> 以下为当前阶段建议值，可视为压测脚本默认断言阈值；如 PRD 或业务方有更明确约束，应以业务侧要求为准。  

1. **智能工作台 / Super Composer（WS-PRD）**  
   - 在典型工作主账号（100–300 活跃员工）下：
     - Super Composer 文本输入与回车提交：  
       - 从点击“发送”到收到首个 SSE token 的 p95 延迟 ≤ **1500 ms**；  
       - p99 延迟 ≤ **3000 ms**；  
     - SSE 流过程中，单条消息的总完成时间（首 token → 完整回复）在普通提问场景下 p95 ≤ **8 秒**。  

2. **Agent Bridge WebSocket / SSE（WS-PRD + Agent 交互）**  
   - 单实例支持至少 **1000 个并发会话连接**，在 p95 延迟满足上述要求的前提下，CPU 利用率不超过约定阈值（例如 70%）。

3. **登录与身份认证（ID-PRD）**  
   - 在 100 RPS 登录请求（模拟高峰登录）下，p95 登录接口延迟 ≤ **500 ms**，错误率 ≤ **1%**；  
   - 密码错误或权限不足场景返回 `401/403`，不泄露敏感错误信息。  

4. **Data Insights 导出（DI-PRD）**  
   - 在单主账号 10 万条任务记录规模下：
     - 导出接口 p95 完成时间 ≤ **15 秒**；  
     - 导出失败率 ≤ **0.5%**；  
     - 导出过程对在线会话延迟无显著影响（WebSocket 和正常 CRUD p95 延迟不恶化超过 20%）。  

5. **Workflow Marketplace & Runtime（WM-PRD）**  
   - 浏览工作流市场与订阅操作，在 50 并发管理员操作时：
     - 列表页加载 p95 ≤ **1 秒**；  
     - 订阅 / 取消订阅操作在 p95 ≤ **2 秒** 内完成并在前端可见。  

> 说明：上述 SLO 仅用于指导当前阶段的压测与调优，未来可根据监控数据与业务需求调整，并同步更新本节与测试脚本。

---

## 4. 测试类型与工具选型 (Test Types & Tooling)

### 4.1 性能与负载测试 (Performance & Load Testing)

- 测试类型：
  - **Load Test**：在预期正常峰值负载下验证 SLO；  
  - **Stress Test**：逐步提升负载，找出系统瓶颈与降级点；  
  - **Soak Test**：在中高负载下长时间运行（例如 1–4 小时），观察内存泄漏与资源耗尽。 

- 工具建议：
  - HTTP / API：
    - `k6` 或 `JMeter`，便于脚本化与 CI 集成；
  - WebSocket / SSE：
    - `k6` WebSocket / streaming APIs、`JMeter` WebSocket 插件、支持 SSE 的 Gatling； 
  - 指标采集：
    - 通过 `observability-logging.md` 中的结构化日志与指标上报，结合 Grafana / Prometheus 观察 p95/p99 延迟、RPS、错误率和资源利用率。  

要求：压测脚本中需显式声明目标 SLO 与断言条件，避免“只看曲线不看阈值”。

### 4.2 可靠性与故障注入 (Reliability & Chaos Testing)

- 典型故障注入场景：
  - 关闭或降级 PostgreSQL / Redis；  
  - 模拟 Nginx → Platform Core / Agent Bridge 之间的高延迟与丢包；  
  - 强制终止单个服务实例，观察重启与重连行为。  

- 验证点：
  - 对用户的影响是否可控（例如：适当的错误提示、不会导致整站无响应）；  
  - 日志和监控是否足以定位问题（trace_id / master_account_id / user_id 是否贯通）；  
  - 重试与超时策略是否按架构设计生效，避免级联故障放大。

### 4.3 安全与多主账号测试 (Security & Multi-master_account Testing)

- 参考标准：
  - OWASP ASVS（Application Security Verification Standard）；
  - OWASP Web Security Testing Guide（WSTG）。

- 覆盖要点：
  - 认证与会话管理：登录 / 登出、Session 固定、JWT 校验；  
  - 访问控制：多主账号隔离、RBAC 权限控制、API 越权访问测试；  
  - 输入验证与输出编码：防止 XSS / SQL 注入等常见漏洞；  
  - 敏感数据保护：密码、API Token、Access Token 不出现在日志与响应中；  
  - 多主账号数据隔离在高并发与异常场景下是否仍然成立（例如缓存 / 日志 / 导出任务中不泄露其他主账号数据）。

- 工具：
  - 静态分析 / SAST：语言对应工具（Go / Python / TypeScript）；  
  - 动态扫描 / DAST：基于 WSTG 的脚本化扫描配合手工渗透测试；  
  - 自定义脚本：重点验证多主账号隔离与配额限制。

---

## 5. 代表性非功能测试场景 (Representative Scenarios)

本节定义一组“平台级”非功能测试场景，覆盖当前 PRD 中的关键产品能力（智能工作台、工作流、身份与访问、数据洞察）。这些场景不替代各服务内部的性能测试，而是作为**端到端体验合约**存在。  

> 场景 ID 命名：`NF-<模块>-<编号>`，例如 `NF-WS-01`。

### 5.1 智能工作台实时交互 (Workspace Realtime Chat)

**NF-WS-01：单会话响应延迟基线**

- 场景：  
  - 单主账号、单用户，从登录进入智能工作台；  
  - 在 Super Composer 中发送 20 条典型查询（PRD 示例中的代表场景）。  
- 验证：  
  - 每条消息从点击“发送”到首个 SSE token 的 p95 ≤ 1500 ms；  
  - 消息完成时间 p95 ≤ 8 秒；  
  - 前端无 UI 冻结，错误提示可读。  

**NF-WS-02：多会话 WebSocket / SSE 并发**

- 场景：  
  - 100 / 300 / 1000 并发用户，每个用户建立 1 个 SSE 或 WebSocket 会话；  
  - 每个用户以固定节奏（例如 10s 一条）发送查询。  
- 验证：  
  - Agent Bridge 和 Platform Core 的 CPU / 内存在预期范围内；  
  - p95 SSE 首 token 延迟与单用户场景相比退化不超过 30%；  
  - 错误率（HTTP 5xx / 应用级错误）≤ 1%。  

### 5.2 工作流市场与执行 (Workflow Marketplace & Runtime)

**NF-WM-01：工作流市场列表加载**

- 场景：  
  - 主账号内存在 200+ 工作流；  
  - 模拟 50 并发管理员浏览市场列表与搜索。  
- 验证：  
  - 列表 / 搜索接口 p95 ≤ 1 秒；  
  - 前端在持续滚动与筛选时仍保持流畅。  

**NF-WM-02：长时工作流执行下的系统稳定性**

- 场景：  
  - 批量触发 100 个长时 Workflow（例如调用外部 API / 需要多次工具调用）；  
  - 同时保持 50 个日常聊天会话。  
- 验证：  
  - 长时任务在预期时间内完成，超时与重试行为遵循架构设计；  
  - 普通聊天会话的 p95 延迟退化不超过 30%；  
  - 无明显资源泄漏（内存、连接数）。  

### 5.3 身份与访问 / 多主账号 (Identity & Access, Multi-master_account)

**NF-ID-01：登录高峰性能与安全**

- 场景：  
  - 100 RPS 有效登录请求 + 20 RPS 错误密码请求，持续 10 分钟；  
- 验证：  
  - 有效登录 p95 ≤ 500 ms，错误率 ≤ 1%；  
  - 错误密码场景返回的错误信息不泄露敏感细节；  
  - 平台在高错误尝试下仍然稳定，不出现资源耗尽或锁死。  

**NF-ID-02：多主账号隔离下的高并发访问**

- 场景：  
  - 10 个主账号，分别有 50 并发用户执行查询、订阅、会话浏览等操作；  
- 验证：  
  - 任一主账号的操作不会影响其他主账号的数据与资源（通过日志 / DB 采样验证）；  
  - 在高并发下，API 层仍然正确使用 `master_account_id` 做隔离，不出现跨主账号数据泄露。  

### 5.4 Data Insights 与报表导出 (Data Insights & Exports)

**NF-DI-01：大数据量导出性能**

- 场景：  
  - 单主账号 10 万条任务记录，执行 Data Insights 导出；  
- 验证：  
  - 导出 p95 ≤ 15 秒；  
  - 导出过程不显著影响其他用户的聊天与工作流操作（延迟退化不超过 20%）；  
  - 导出错误会按 `observability-logging.md` 规范记录日志，且不包含敏感数据。  

**NF-DI-02：长时间报表使用下的资源稳定性**

- 场景：  
  - 每分钟触发一次导出任务，持续 1–2 小时；  
- 验证：  
  - 无明显内存泄漏（监控中内存使用保持稳定或可接受的锯齿波动）；  
  - Postgres / Redis 连接在任务结束后能正确释放。  

---

## 6. 执行策略与 CI 集成 (Execution Strategy & CI Integration)

### 6.1 执行频率建议

- **每个重要版本发布前（Release Candidate）**：
  - 至少执行一次完整的端到端性能与安全基线测试（5.x 中定义的核心场景）。
- **每日 / 每周定时任务**：
  - 轻量级性能基线（如 NF-WS-01、NF-ID-01 的缩减版）；  
  - 安全扫描（OWASP Top 10 相关项）与 LLM 红队样本可并行执行。  
- **本地 / PR CI**：
  - 不建议在 PR 中执行重型压测，可保留少量快速的“性能冒烟测试”（例如 20 并发、1–2 分钟），用于发现明显的性能回退。  

### 6.2 报告与基线管理

- 每次非功能测试需要生成结构化报告，至少包含：
  - 测试场景 ID / 日期 / 环境；  
  - 核心指标（p95/p99 延迟、RPS、错误率、CPU/内存）；  
  - 与上一轮基线的对比（是否回退 / 是否接近阈值）。  

- 建议将报告摘要持久化到仓库（例如 `docs/test/nonfunctional-reports/`），并在发现显著回归时建立 Issue 与跟踪。

---

## 7. 未来工作 (Future Work)

- v0.3：
  - 引入更精细的 SLO 分层（按环境：dev / staging / prod）与按主账号规模的分级指标；  
  - 与 `monitoring-spec.md`（规划中）对齐，定义从监控系统自动生成“非功能健康日报”的机制。  
- v0.4：
  - 根据真实生产数据调整场景与阈值，补充多区域部署与灾备演练场景；  
  - 将部分关键非功能测试脚本集成到自动化 Release Gate 中。  
- v0.5：
  - 探索基于 property-based testing 与混沌工程 (Chaos Engineering) 的自动化非功能测试框架，持续验证在随机故障与极端输入下的系统韧性。

本文件为 Nonfunctional Testing Spec v0.2。  
后续如 PRD、架构或监控数据有重大变化，应同步更新本文件与对应的压测脚本、SLO 配置，避免“文档与指标脱节”。

