# Nginx 网关架构规范（Nginx Gateway Architecture）
文档版本：v0.2 (Draft)  
最后修改日期：2026-01-27  
作者：Billow  
适用范围：`docs/technical/ops/` 下的网关拓扑、统一入口与路由边界（与 `api-style-guide.md` 一致）  
相关文档：
- `docs/docs-map.md`
- `docs/standards/doc-guidelines.md`
- `docs/standards/ssot-glossary.md`
- `docs/standards/api-style-guide.md`
- `docs/technical/architecture/fullstack-architecture.md`
- `docs/technical/protocols/interaction-protocol.md`
- `docs/technical/ops/observability-logging.md`
- `docs/technical/api/core-service.md`
- `docs/technical/api/agent-bridge.md`
- `docs/features/prd-identity-access.md`

文档目的：定义 Nginx 在 Orbitaskflow 的“唯一流量入口”角色、端口与路由边界、鉴权前置约束（JWT/Ticket）与可观测性职责，并声明与部署配置的最小契约，供实现与运维文档引用。

---

## 0. 本次修订要点（Diff Summary）
- 对齐 `doc-guidelines.md`：补齐头部元信息、追加“变更记录”。
- 对齐 `docs-map.md` 与 `api-style-guide.md`：将路由边界收敛为 `/api/v{N}/*` -> Platform Core，`/ws/agent` 与 `/api/v{N}/agent/*` -> Agent Bridge；移除与该边界冲突的“site-auth 独立服务”表述。
- 对齐 `fullstack-architecture.md`：移除“通过 BFF 承担治理能力”的描述；不引入独立 BFF 作为结构性组件。
- 对齐身份与治理术语：补充 [TERM-IA-033] 工作票据（Work Ticket）在 WebSocket 建连中的角色（Ticket-only）。
- 收敛密钥口径：Nginx 不持有 JWT 密钥；JWT/Ticket 的签发与校验归属 Platform Core 与 Agent Bridge 的服务契约。
- 规范表达：移除 blockquote（以 NOTE/约束条目表达）。
---
## 1. 概述（Overview）
Nginx 在 Orbitaskflow 中扮演 **边界网关（Edge Gateway）** 的角色，是浏览器、第三方系统与内部工具访问平台的统一入口。

网关的核心目标：
- 统一入口：对外仅暴露稳定的 HTTP/HTTPS 端口，隐藏内部服务拓扑。
- 协议与路由中枢：按“入口路径 + 协议”将请求转发到 Platform Core（Go）与 Agent Bridge（Python）等上游服务。
- 横切关注点：TLS 终止、CORS 与安全 Header、WebSocket Upgrade、统一 trace_id 透传与接入日志落盘。

NOTE：本文件仅定义“架构视图层”的边界与契约，不给出具体 Nginx 指令与运维命令；实现与排障细节在运维文档中承载。

---

## 2. 范围（Scope）
### 2.1 In Scope
- Nginx 在系统拓扑中的位置与职责边界。
- 对外端口策略（HTTP/HTTPS）与对内上游服务连接关系。
- 路由边界（入口路径到上游服务的唯一归属）。
- 鉴权前置约束（JWT / Work Ticket）在网关层的“准入与转发”规则。
- 可观测性：trace_id 透传与 access log 最小字段约束。
- 与 `deploy_config.toml` 的最小契约（仅网关相关）。

### 2.2 Out of Scope
- Nginx 的安装、服务管理命令（systemd/brew 等）。
- 具体 Nginx 配置指令、模板与脚本实现细节。
- 故障排查 checklist（见 `docs/technical/ops/nginx-troubleshooting.md`）。
- 日志轮转、集中式日志平台、监控指标的采集落地细节（见 `docs/technical/ops/observability-logging.md` 与后续监控规范）。

---

## 3. 拓扑与端口规划 (Topology & Ports)

### 3.1 外部视角（External View）

从外部客户端（浏览器、第三方集成、CLI 等）视角看，入口统一为 Nginx：

- 开发环境：`http://<host>:<listen_port>`（默认可为 9080）。
- 生产环境：`https://<host>:<https_port>`（默认推荐 443；端口是否为 443 由部署与合规环境决定）。

约束：
- 外部流量必须先到达 Nginx；不得直接暴露内部应用端口。
- 对外端口必须由部署配置显式声明，前端与外部集成只能依赖 `public_base_url` / `public_ws_url`。

### 3.2 内部上游服务（Upstreams）

当前架构下，核心上游服务：

- Platform Core（Go）：控制面权威入口（身份与安全、资源管理、策略平面、计量/审计/回执等）。
- Agent Bridge（Python）：执行面交互入口（WebSocket 事件流、推理编排、工具调用、异步任务入口等）。
- Workspace Web（Next.js）：前端应用（SSR + 静态资源）。

约束：
- Nginx 不与应用服务复用监听端口；内部服务端口仅在内网可达。

---

## 4. 路由与服务映射 (Routing & Service Mapping)

### 4.1 高层逻辑视图 (High-level Logical View)

```text
[ Browser / API Client ]
          │
          ▼
   ┌───────────────────┐
   │      Nginx        │
   │   Gateway Layer   │
   └──────┬──────┬─────┘
          │      │
          │      ├──────────────► Workspace Web (Next.js)
          │
          ├──────────────► Platform Core (Go)
          │
          └──────────────► Agent Bridge (Python)

```

### 4.2 路由规则（Routing Rules）
本节为网关“入口边界”口径，必须与 `docs/standards/api-style-guide.md` 保持一致。

- 前端应用：
  - `/`、`/app/**`、`/assets/**` 等路由到 Workspace Web。
  - 静态资源缓存/压缩策略属于运维层，不在本文展开。

- 管理类 REST API（Control Plane）：
  - `/api/v{N}/*` 路由到 Platform Core（Go）。

- 执行面交互入口（Execution Plane）：
  - WebSocket：`/ws/agent` 路由到 Agent Bridge（Python）。
  - HTTP 兼容入口：`/api/v{N}/agent/*` 路由到 Agent Bridge（Python）。

- 文件直传：
  - 客户端使用 Platform Core 签发的 Presigned URL 直接与对象存储交互；禁止网关透传二进制流。

- 健康检查：
  - 推荐对外暴露 `/healthz`（网关自身健康）。
  - 对内部服务健康检查策略属于运维层（可通过 blackbox 等方式），不在本文展开。

NOTE：具体 API 端点、请求/响应字段与鉴权前置条件必须落在 L2 的 `docs/technical/api/*.md`，本文仅定义跨文档一致的边界规则。
约束（必须）：
- `/api/v{N}/agent/*` 属于执行面入口，必须与 `/api/v{N}/*` 一样受到鉴权保护：
  - 要么在 Nginx 对该路径启用 `auth_request`，由 Platform Core 统一校验 JWT 并返回 200/401/403；
  - 要么该路径仅允许内网访问（禁止公网暴露），对外仅保留 `/ws/agent`。
- 禁止绕过 Platform Core 直接对 Agent Bridge 暴露“执行指令/工具调用”类 HTTP 端点。

---

## 5. 认证与授权架构 (Auth Architecture)

### 5.1 JWT：HTTP API 访问的统一凭证（JWT for HTTP APIs）
规则：
- 对 `/api/v{N}/*` 的受保护资源，客户端使用 `Authorization: Bearer <JWT>`。
- Nginx 仅作为准入与转发点，不解析 JWT 语义；JWT 的签发与校验归属 Platform Core。

推荐模式（auth_request）：
1. 客户端携带 JWT 访问受保护 API。
2. Nginx 在对应 `location` 上启用 `auth_request`，向内部子请求路径（例如 `/_auth_validate`）发起校验。
3. `/_auth_validate` 由 Nginx 转发到 Platform Core 的“鉴权校验端点”（端点路径以 `docs/technical/api/core-service.md` 为准）。
4. Platform Core 返回 200/401/403，Nginx 据此放行或拒绝。

约束（必须）：
- `/_auth_validate` 必须是“仅供 Nginx 内部 auth_request 使用”的子请求路径：
  - 不得对外暴露为可直接访问的公共 API；
  - 必须仅转发到 Platform Core 的鉴权校验端点；
  - 对任何外部直访应返回 404/403（以实现为准）。

约束：
- Nginx 不持有 JWT 私钥/公钥；密钥管理与校验策略不在网关层实现。
- 所有拒绝必须返回 machine-readable 的 `reason_code`（落点以 Platform Core 错误语义为准；网关仅透传）。

### 5.2 Work Ticket：WebSocket 建连的 Ticket-only（[TERM-IA-033]）
规则：
- `/ws/agent` 为工作区核心交互入口，必须采用 Ticket-only。
- Agent Bridge 仅接受带票据的连接（票据由 Platform Core 签发），不得接受裸 WebSocket 直连执行面。

最小链路：
1. 客户端先通过 Platform Core 获取 [TERM-IA-033] 工作票据（Work Ticket）。
2. 客户端携带 Ticket 建立到 `/ws/agent` 的 WebSocket 连接（Ticket 的承载方式以 `interaction-protocol.md` 与 Agent Bridge 契约为准）。
3. Agent Bridge 在握手阶段向 Platform Core 校验 Ticket（Validate Ticket），校验通过才进入会话。

NOTE：Ticket 的签发/撤销/TTL/绑定范围键等口径以 `ssot-glossary.md` 与 `prd-identity-access.md` 为准。

---

## 6. 配置结构与生成机制 (Config Layout & Generation)

### 6.1 配置文件布局 (Logical Layout)

不区分具体操作系统，Nginx 配置在逻辑上拆分为：

- **主配置文件**：`nginx.conf`
  - 包含 `events {}` 和顶层 `http {}` 配置；
  - 必须 `include` Orbitaskflow 的 server 配置，例如：
    - `include sites-enabled/orbitaskflow;`
    - 或 `include servers/orbitaskflow.conf;`；
- **Orbitaskflow 专用 server 配置**：`orbitaskflow.conf`
  - 声明对外监听端口：`listen <listen_port>;` 以及可选的 `listen <https_port> ssl;`（最终值由 `deploy_config.toml` 的 `[nginx]` 段生成）。
  - 定义 `/`、`/api/**`、`/ws/**` 等路径的 `location` 与上游 `upstream`；
  - 配置 `auth_request`、CORS、WebSocket 相关指令。

架构级约束：

- 主配置文件不直接绑定业务 domain / 路由逻辑，所有与 Orbitaskflow 相关的 server 均由 `orbitaskflow.conf` 统一维护；
- 任何环境中，如果需要调试或变更 Orbitaskflow 行为，应通过更新模板 + 重新生成 `orbitaskflow.conf` 的方式，而不是直接编辑系统全局 `nginx.conf`。

### 6.2 配置生成流程（Deploy Scripts）

Nginx 配置建议由部署脚本自动生成并落盘：

- 从 `deploy_config.toml` 的 `[nginx]` 段读取配置；
- 渲染模板生成 `orbitaskflow.conf`；
- 生成后必须执行语法校验（例如 `nginx -t`）并以原子方式 reload。

NOTE：具体脚本名称、不同操作系统的路径布局与命令细节属于运维/部署文档（例如 `docs/technical/release/deployment.md`、`docs/technical/dev/local-development.md`），本文件不展开。

---

## 7. 与可观测性体系的集成 (Observability Integration)

### 7.1 Trace ID 与 Access Log

网关是整个请求链路的起点，应与 `observability-logging.md` 中的日志规范保持一致：

- 在请求进入 Nginx 时生成或提取 `trace_id`（基于 `traceparent` 头），并将其：
  - 写入 Access Log（JSON 格式）中；
  - 透传到下游服务的请求头中，便于 Go / Python 服务继续链路追踪；
- Access Log 字段应至少包含：
  - `ts`（时间戳）、`service="nginx-gateway"`、`component="http.access"`；
  - `trace_id`、`method`、`path`、`status`、`latency_ms`、`remote_ip`、`user_agent` 等；
- Error Log 仅用于记录 Nginx 自身的异常（配置错误、上游不可达等），业务错误应由下游服务记录。

具体 JSON 日志示例、字段约束等以 `observability-logging.md` 为准，本架构文档只负责定义“网关必须参与到统一 Trace 链路中”。

### 7.2 指标与健康检查

- Nginx 层的 QPS、请求延迟、错误率等指标采集方式由后续 `monitoring-spec.md` 定义；
- 架构上要求：
  - Nginx 必须暴露可被外部监控系统探测的健康检查端点（例如 `/healthz`），用于检测网关自身可用性；
  - 对内部服务的健康检查应在 ops 层统一规划（例如通过 Prometheus / blackbox exporter）。
- `/healthz` 必须为无鉴权端点，且仅反映网关自身存活（不代理到 Platform Core / Agent Bridge）；
  - 用于外部监控探测与负载均衡摘除；
  - 下游服务健康检查属于 ops 层策略（例如 blackbox/独立探测），不在本文定义。
---
## 8. 与部署配置的契约（Contract with deploy_config.toml）
`deploy_config.toml` 的 `[nginx]` 段用于声明网关的可部署参数。字段名以实现为准，本文只规定“必须表达的语义”。

### 8.1 最小字段语义（Semantic Requirements）
- `environment`：development/staging/production，用于选择对应模板。
- `listen_port`：对外 HTTP 端口。
- `https_port`：对外 HTTPS 端口（若启用 TLS）。
- `public_base_url`：对外公开 HTTP/HTTPS Base URL（Workspace Web 与集成方依赖）。
- `public_ws_url`：对外公开 WS URL（指向 `/ws/agent`）。
- `upstream_core`：Platform Core 上游地址（host:port）。
- `upstream_agent_bridge`：Agent Bridge 上游地址（host:port）。
- `upstream_workspace_web`：Workspace Web 上游地址（host:port）。

约束：
- URL 一致性：`public_*` 必须与 Nginx 实际监听端口、协议、路径一致。
- 鉴权口径：不得在 `[nginx]` 中引入“执行面共享密钥”来替代 Ticket-only；执行面准入必须以 Ticket 校验为准。

---

## 9. 风险、约束与演进方向 (Risks & Future Work)

### 9.1 当前已知约束
- 标准 Nginx 功能有限；复杂流量治理能力（灰度发布、A/B 测试、动态路由策略等）应通过上游服务的应用层能力或独立流量治理组件实现（不在本文定义）。
- `auth_request` 模式在高 QPS 场景下会对 Platform Core 的鉴权校验端点施加额外压力；是否引入缓存/短路需以 ADR 的性能评估结论为准。 
- Nginx 本身不感知租户（tenant）概念，所有租户隔离与审计需求依赖下游服务和日志体系。

### 9.2 未来演进方向

- 结合 OpenTelemetry 进一步统一网关层的 Trace / Metrics / Logs 上报方式，与 `observability-logging.md` 中的未来规划保持一致；  
- 如有需要，可在 Nginx 前增加托管型 API Gateway（如云厂商 API 网关），当前文档中的 Nginx 角色则更聚焦为内部反代与服务编排；  
- 将来若引入 Envoy 等更强大的网关组件，本文档可作为“网关层角色”的参考基线，仅更换具体实现与配置细节即可。

---
## 10. 变更记录（Change Log）
- 2026-01-27 / Orbitaskflow Team：v0.2
  - 对齐 `api-style-guide.md` 路由边界（Core / Agent Bridge）并移除 site-auth 独立服务口径。
  - 补充 Work Ticket（Ticket-only）在 WebSocket 建连中的约束。
  - 收敛密钥口径：Nginx 不持有 JWT 密钥；删除与共享密钥相关的契约暗示。
  - 移除 blockquote，补齐文档规范字段。


