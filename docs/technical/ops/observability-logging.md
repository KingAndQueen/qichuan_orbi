# **日志与可观测性标准 (Observability & Logging Standards)**

文档版本：v2.1 (Golden Master)  
最后修改日期：2025-12-02  
作者：JeafDean  
相关文档：docs/technical/architecture/fullstack-architecture.md  
文档目的：定义全栈系统（Go/Python/Frontend）的日志结构、追踪上下文（Trace Context）透传标准及隐私合规要求，确保系统具备 B2B 级的可审计性与故障排查能力。

# **1\. 概述 (Overview)**

本标准旨在消除“日志孤岛”和“非结构化日志”带来的运维难题。它强制所有服务输出 **结构化 JSON** 日志，并基于 **W3C Trace Context** 标准实现全链路追踪（Distributed Tracing）。通过统一的日志契约，支持下游的日志分析系统（如 ELK/Loki）自动解析和索引，同时满足企业级租户隔离审计需求。

# **2\. 职责 (Responsibilities)**

* **应用服务 (Service Layer)**: 负责产生携带 trace\_id 和 tenant\_id 上下文的结构化日志。  
* **网关层 (Gateway Layer)**: Nginx 负责生成初始 trace\_id 并注入 Request Header。  
* **基础设施 (Infra)**: 负责日志的采集 (Promtail/Filebeat)、轮转 (Logrotate) 和归档。  
* **开发人员**: 负责在错误处理代码中注入堆栈信息 (Stack Trace)，并避免打印敏感数据 (PII)。

# **3\. 边界 (Out of Scope)**

* **日志存储与检索**: 本文档不涉及 Elasticsearch 或 Loki 的具体搭建与配置。  
* **监控告警**: 指标 (Metrics) 和告警规则定义在 docs/technical/ops/monitoring-spec.md (规划中)。

# **4. 数据结构 (Data Models)**

所有日志必须符合以下 JSON Schema。

## **4.1 标准日志字段 (Standard Schema)**

{  
  "ts": "2025-12-01T12:00:00.123Z",    // [Required] ISO8601 UTC 时间戳 (UTC)  
  "level": "info",                     // [Required] debug, info, warn, error  
  "service": "agent-bridge",           // [Required] 服务名称 (e.g. platform-core, agent-bridge)  
  "component": "http.server",          // [Required] 模块/组件名称 (e.g. http.server, auth.service)  
  "env": "prod",                       // [Required] 运行环境 (dev/staging/prod)  
  "trace_id": "0af7651916cd43dd...",   // [Required] W3C Trace ID (32 hex)  
  "span_id": "b7ad6b7169203331",       // [Optional] W3C Span ID (16 hex)  
  "tenant_id": "uuid-tenant-123",      // [Mandatory for Business Logic] 租户隔离键  
  "user_id": "uuid-user-456",          // [Optional] 操作员 ID  
  "msg": "Contract analysis completed",// [Required] 人类可读的摘要  
  "error": {                             // [Optional] 仅在 level=error 时出现  
    "code": "RESOURCE_EXHAUSTED",      // 对应 API error.code  
    "stack": "..."                     // 堆栈信息 (已脱敏)  
  },  
  "data": {                              // [Optional] 业务特定的结构化负载  
    // 示例 1：HTTP 访问日志字段，详见 4.4 HTTP Schema  
    //   "http": { ... }  
    // 示例 2：LLM 调用明细  
    //   "duration_ms": 150,  
    //   "tokens_used": 500,  
    //   "model": "gpt-4"  
  }  
}

## **4.2 关键字段说明**

| 字段名    | 类型   | 说明                     | 约束 |
| :-------- | :----- | :----------------------- | :--- |
| trace_id  | String | 全链路唯一追踪 ID       | 必须从 HTTP Header `traceparent` 继承，若无则在网关层生成。 |
| tenant_id | String | 租户 ID                  | 涉及数据读写的操作**必须**包含，用于 B2B 审计与隔离。 |
| component | String | 模块/组件名称            | 推荐在 Logger 初始化时注入，例如：`log.With("component", "auth.service")` 或 `logger.bind(component="worker.rag")`。 |
| cost_usd  | Float  | 预估成本（单位：美元）  | 涉及 LLM 调用或其他按量计费资源的日志**必须**包含，用于 ROI 与配额治理（如 `tenant_quotas`, `workflow_runs.cost_usd`）。 |

## **4.3 日志级别定义 (Log Levels)**

为了保持生产环境的高信噪比，必须严格遵守以下分级标准：

| 级别  | 数值 | 使用场景 (When to use) |
| :---- | :--- | :---------------------- |
| DEBUG | 0    | 开发调试信息，如函数入参、复杂中间状态。**生产环境默认关闭**。 |
| INFO  | 1    | 关键业务事件（Happy Path），如“用户登录成功”、“任务创建”、“支付完成”。 |
| WARN  | 2    | 预期内的异常或边界情况，不影响主流程，如“配置缺省使用默认值”、“连接池忙重试”。 |
| ERROR | 3    | 预期外的错误，导致当前请求失败，如“数据库连接断开”、“上游 API 调用超时”、“空指针异常”。 |
| FATAL | 4    | 系统级致命错误，导致服务无法启动或进程崩溃，需要立即人工干预。 |

> 说明：
> - 线下环境允许使用 DEBUG 进行问题排查；
> - 线上环境禁止长时间开启 DEBUG 级别，以免产生高噪声与过量日志成本；
> - WARN/ERROR/FATAL 必须带有明确的 `msg` 和尽量结构化的 `data`，便于在 ELK/Loki 中做聚合。

## **4.4 HTTP Access Log Schema (Server-Side)**

对于 API 请求处理完毕后的 Access Log，`data` 字段中推荐使用如下标准结构，将 HTTP 相关属性统一收敛到 `data.http`：

```jsonc
{
"data": {
  "http": {
    "method": "POST",                 # HTTP 方法
    "path": "/api/v1/runs",           # 逻辑路由路径（去除域名与查询串）
    "status": 200,                    # 响应状态码
    "latency_ms": 450,                # 端到端耗时（毫秒）
    "remote_ip": "203.0.113.1",       # 客户端 IP（可视合规需求做脱敏，如只记录 /24 段）
    "user_agent": "Mozilla/5.0...",   # UA 字符串
    "req_size": 1024,                 # 请求体大小 (bytes)
    "res_size": 2048                  # 响应体大小 (bytes)
    }
  }
}
```
## **4.5 服务与组件命名约定 (Naming Conventions)**

为保证跨服务日志的一致性，以及便于在日志系统中做按服务/组件的聚合分析，`service` 与 `component` 字段需要遵循统一的命名规则：

### 4.5.1 `service` 命名规则

- 全小写，使用 **连字符 (`-`) 分隔单词**；  
- 与实际部署的服务/进程名称保持一致；  
- 示例：
  - `site-auth`：Go 身份与会话服务  
  - `agent-bridge`：Python 智能体编排服务  
  - `workspace-web`：Next.js 前端工作台  

> 说明：`service` 代表当前产生日志的“进程级服务”，用于在日志系统中做按服务聚合与过滤（例如筛选 `service="agent-bridge"`）。

### 4.5.2 `component` 命名规则

- 全小写，使用 **点 (`.`) 分隔层级**；  
- 一般对应代码中的模块/子系统，而不是物理文件路径；  
- 示例：
  - `http.server`：HTTP 入站请求处理逻辑  
  - `auth.service`：认证/授权核心模块  
  - `worker.rag`：RAG 异步任务 Worker  
  - `middleware.quota`：配额/限流中间件  

> 说明：`component` 代表“服务内部的逻辑模块”，建议在 Logger 初始化时一次性注入，例如：  
> - Go：`log := logger.With("service", "site-auth", "component", "auth.service")`  
> - Python：`logger = structlog.get_logger().bind(service="agent-bridge", component="worker.rag")`

通过 `service + component` 的二维组合，可以快速定位“哪台服务、哪个模块”在出现错误或延迟问题，与第 4.1 节中的标准字段定义保持一致。


# **5\. 关键流程 (Core Flows)**

## **5.1 追踪上下文透传 (Trace Propagation)**

sequenceDiagram  
    participant Client  
    participant Nginx  
    participant Go(Auth)  
    participant Python(Agent)  
    participant Worker(Arq)

    Client-\>\>Nginx: HTTP Request  
    Nginx-\>\>Nginx: Gen TraceID (t1)  
    Nginx-\>\>Go(Auth): Header \`traceparent: 00-t1-...\`  
    Go(Auth)-\>\>Go(Auth): Extract t1 \-\> Context  
    Go(Auth)--\>\>Log: {"trace\_id": "t1", "msg": "Auth OK"}  
    Go(Auth)-\>\>Python(Agent): HTTP \+ Header \`traceparent\`  
    Python(Agent)-\>\>Python(Agent): Extract t1 \-\> ContextVars  
    Python(Agent)-\>\>Worker(Arq): Enqueue Job \+ Payload{trace\_id: t1}  
    Worker(Arq)--\>\>Log: {"trace\_id": "t1", "msg": "Job Done"}

# **6\. 特殊场景规范 (Special Scenarios)**

## **6.1 异步任务审计 (Async Jobs)**

对应 async\_tasks 表，任务日志必须包含 job\_id 和标准的 job\_status。这允许运维通过日志快速统计任务成功率。
```jsonc
{
  "level": "info",
  "service": "agent-bridge",
  "component": "worker.rag",
  "trace_id": "0af7651916cd43dd...",
  "tenant_id": "uuid-tenant-123",
  "msg": "RAG Indexing Job Completed",
  "job_id": "job_123",
  "data": { 
    "job_type": "rag.index_document",
    "job_status": "completed", // pending | processing | completed | failed
    "progress": 100,
    "duration_ms": 4500
  }
}
```

## **6.2 配额与计费 (Resource Governance)**

当触发限流或扣费时，必须记录 cost\_usd、resource\_type 以及当前的配额周期状态，以便排查“额度刷新”问题。
```jsonc
{
  "level": "info",
  "service": "platform-core",
  "component": "middleware.quota",
  "trace_id": "0af7651916cd43dd...",
  "tenant_id": "t_1",
  "msg": "Quota deducted",
  "data": {
    "resource_type": "llm_tokens_monthly",
    "reset_period": "monthly", // monthly | daily | never
    "deducted": 150,
    "remaining": 9000,
    "cost_usd": 0.0002
  }
}
```

# **7\. 语言实现规范 (Implementation Spec)**

## **7.1 Go (Platform Core)**

* **Library**: 使用标准库 log/slog (Go 1.21+)。  
* **Handler**: 必须配置 JSONHandler。  
* **Context**: 编写中间件 TraceMiddleware，从请求头提取 Trace ID 并存入 context.Context。slog 打印时自动从 Context 读取。

## **7.2 Python (Agent Bridge)**

* **Library**: 推荐使用 structlog。  
* **Async**: 使用 contextvars 维护 Trace ID，确保在 async def 和线程池中不丢失上下文。  
* **FastAPI Middleware**: 拦截所有请求，初始化 structlog 的上下文绑定。

## **7.3 Frontend (Workspace Web)**

* **Library**: pino 或 console (Dev)。  
* **Production**: 捕获 Uncaught Exception 和 API Error，附带当前的 trace\_id (从 Response Header 获取) 发送至 Sentry 或日志收集端点。

# **8\. 安全机制 (Security Model)**

* **PII Masking**: 下列字段在写入日志前必须进行脱敏（掩码或哈希）处理：  
  * password, token, access\_key, secret\_key  
  * credit\_card, bank\_account  
  * phone\_number (中间4位掩码)  
* **Log Injection**: 确保 msg 字段经过转义，防止日志注入攻击。

# **9. 工程实施细则 (Engineering Guidelines)**

为了确保日志规范真正落地到各个服务，工程上需要统一命名规则、目录结构和实施检查清单。

## **9.1 日志文件命名规则 (File Naming)**

统一格式：`<service>.log` 或 `<service>-<type>.log`。

示例：

- `site-auth.log`：Go 身份与会话服务日志  
- `agent-bridge.log`：Python 智能体编排服务日志  
- `nginx-access.log`：网关访问日志  
- `nginx-error.log`：网关错误日志  

> 说明：如果某服务需要拆分多种日志类型（例如 access / error），可采用 `<service>-access.log` / `<service>-error.log` 形式，但必须在部署脚本和 logrotate 中保持一致。

## **9.2 推荐目录结构 (Directory Structure)**

在裸机或虚机部署场景中，日志目录推荐统一为：

```text
/var/log/orbitaskflow/
├── site-auth/
│   └── site-auth.log
├── agent-bridge/
│   └── agent-bridge.log
└── nginx/
    ├── nginx-access.log
    └── nginx-error.log
```
### 9.2.1 本地开发环境目录结构（参考）

在本地开发环境中，为了避免改动系统级日志目录，推荐在项目根目录下使用 `logs/` 作为统一入口：

```text
<project_root>/
├── logs/                    # 统一日志目录（仅本地 / 开发环境）
│   ├── app/                 # 应用服务日志
│   │   ├── backend/
│   │   │   ├── backend.log
│   │   │   └── backend.log.2025-11-13
│   │   ├── agent-bridge/
│   │   │   └── agent-bridge.log
│   │   └── frontend/
│   │       └── frontend.log
│   ├── nginx/               # Nginx 日志
│   │   ├── access.log
│   │   ├── error.log
│   │   └── access.log.2025-11-13
│   ├── deploy/              # 部署脚本日志
│   │   └── deploy.log
│   └── archive/             # 归档日志（可选）
│       └── 2025-11/
```
### **9.3 实施检查清单 (Checklist)**

在每一次新服务接入或重大版本发布前，建议对以下条目逐一核对：

- [ ] Go 服务使用 `log/slog` + JSONHandler 输出标准 JSON 日志，并包含 `trace_id` / `tenant_id` / `component` 字段；  
- [ ] Python 服务使用 `structlog`（或等价库）输出 JSON 日志，并通过 `contextvars` 维护 `trace_id`，确保在 async/线程池场景下不丢失上下文；  
- [ ] Nginx 日志路径统一归入 `/var/log/orbitaskflow/nginx/`，文件命名与 9.1 约定一致（如 `nginx-access.log` / `nginx-error.log`）；  
- [ ] 所有日志文件在部署脚本中已配置 logrotate（或容器日志 driver）策略，与 10.1 中的 Rotation 规范一致；  
- [ ] 关键业务路径（登录、会话创建、工作流执行、配额扣减）均有 INFO 级别日志，并能通过 `trace_id` 串联定位；  
- [ ] 涉及 LLM 或按量计费资源的调用均记录 `cost_usd`，可在 Data Insights 中与 `workflow_runs` 等表做对账与 ROI 分析；
- [ ] Workspace Web（Next.js）在前后端边界处统一错误日志格式：SSR / API Route / 前端捕获的严重错误应至少包含 `service="workspace-web"`、`component` 和 `trace_id`（从响应头或全局上下文中透传）；  
- [ ] 内部运维/开发使用的日志查看脚本或 Dashboards 已针对本规范的 JSON 结构进行适配，能够按 `service` / `component` / `trace_id` / `tenant_id` 等字段做过滤与聚合分析。
- [ ] 提供统一的日志查看与搜索脚本（如 `scripts/logs/view.sh`, `scripts/logs/tail.sh`, `scripts/logs/search.sh`, `scripts/logs/clean.sh`），并已适配本规范定义的 JSON 结构（按 `service` / `component` / `trace_id` / `tenant_id` 等字段检索与过滤）。  

# **10. 运维注意事项 (Ops Notes)**

## **10.1 日志轮转 (Rotation)**

* **Docker/K8s**: 推荐使用 `json-file` driver，配置 `max-size=100m`, `max-file=3`。  
* **Bare Metal**: 使用 logrotate，配置每日切割，保留 7 天，压缩旧日志。
### 10.1.1 本地开发环境简化策略

在本地开发环境中，若未使用系统级 logrotate，可采用以下简化约定：

- 单个日志文件超过 **100MB** 时触发轮转；
- 或按天切分生成新日志文件（如 `backend.log.2025-11-13`）；
- 保留最近 **30 天** 的本地日志文件，超出部分通过脚本自动清理；
- 超过 7 天的历史日志可选择自动压缩，以减少本地磁盘占用。

> 实现方式建议通过 `scripts/logs/clean.sh` 或 `scripts/logs/rotate.sh` 封装，避免开发者手动操作。
  

## **10.2 日志保留策略 (Retention)**

* **Hot Storage (ELK)**: 保留 30 天。  
* **Cold Storage (S3)**: 保留 1 年（满足合规审计）。

### 10.3 日志文件与版本控制注意事项

- 确保所有运行时生成的日志目录（例如 `/var/log/orbitaskflow/` 以及本地开发环境下的 `logs/` 目录）均已加入 `.gitignore` 或对应的 VCS 忽略配置，避免误将日志文件提交到代码仓库；  
- 日志文件会持续增长，应结合 10.1 的 Rotation 与 10.2 的 Retention 策略定期清理历史日志，防止占满磁盘空间；  
- 如需对历史日志进行分析或审计，建议在清理前将日志归档至冷存储（如对象存储）或集中式日志平台（参见 12 章集中式日志平台选型）。
  

# **11. 附录 (Appendix)**
## **11.1 Logrotate 配置示例 (Bare Metal)**
```conf
# /etc/logrotate.d/orbitaskflow
/var/log/orbitaskflow/*/*.log {
    daily
    rotate 7
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    create 0640 orbit orbit
    sharedscripts
    postrotate
        # Optional: Reload service to reopen log files if not using copytruncate
        # systemctl reload orbitaskflow-backend
    endscript
}
```
## **11.2 Python Structlog初始化参考**
```python
import structlog
import logging

def configure_logging(json_logs: bool = True):
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        # 统一注入服务名、环境等字段，可在此处 wrap
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ]

    if json_logs:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    # 此处省略 logging.basicConfig / handler 绑定等具体细节
    # 工程实现时需确保：
    # 1) 所有 logger 最终都走 structlog；
    # 2) 上下文中的 trace_id / tenant_id / component 能正确透传到每条日志中。
```

# **12\. 未来扩展 (Future Work)**

* **OpenTelemetry**: 未来将日志库完全迁移到 OTel SDK，实现 Metrics/Logs/Traces 的大一统。  
* **Audit Trail UI**: 基于结构化日志，在 Admin 后台开发可视化的“操作审计”页面。
- 提供一套统一的日志轮转与清理脚本（如 `scripts/logs/rotate.sh` / `clean.sh` / `stats.sh`），封装 logrotate / cron / systemd 等运维操作，降低本地开发和小规模裸机部署的接入门槛。
### 集中式日志平台选型与演进
当前阶段建议结合团队规模和运维能力，选择轻量可维护的集中式日志方案，推荐优先考虑 **Loki + Grafana** 组合，用于：
- 聚合来自 Nginx / Go / Python / Workspace Web 的 JSON 日志；  
- 按 `service` / `component` / `trace_id` / `tenant_id` 等字段做过滤与聚合；  
- 配合 Grafana Dashboards 实现常用查询与可视化。
