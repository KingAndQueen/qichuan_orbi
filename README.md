# Work-Agent

基于 AI Native 架构的智能工作流编排与执行平台。

## 核心能力

- **多账号管理 (Site Auth)**: 企业级主账号/子账号隔离体系，支持多主账号数据安全与权限治理
- **LLM 桥接与流式响应 (Agent Bridge)**: 统一的 Agent 编排层，支持 SSE 流式输出、工具调用与任务管理
- **沉浸式工作台 (Workspace Web)**: AI Native 的企业协同工作界面，支持 Generative UI 动态渲染

---

## 架构与技术栈

### 核心技术选型

| 层级 | 技术栈 | 说明 |
|------|--------|------|
| **Frontend** | Next.js 14 (App Router), TailwindCSS, Radix UI | 响应式工作台，支持 Server-Driven UI |
| **Backend (Identity)** | Go (Chi), PostgreSQL | 身份认证、会话管理、业务 CRUD |
| **Backend (Agent)** | Python (FastAPI), Server-Sent Events (SSE) | LLM 编排、流式交互、异步任务 |
| **Infrastructure** | Nginx (Gateway), Docker, Redis | 流量入口、WebSocket 升级、缓存与队列 |

### 架构分层

本项目采用 **模块化单体仓库 (Modular Monorepo)** 结构，分为以下层级：

```
┌─────────────────────────────────────────────────────────────────┐
│                        Edge Layer                               │
│                    (Nginx Gateway)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Workspace    │    │  Platform     │    │  Agent        │
│  Web (Next.js)│    │  Core (Go)    │    │  Bridge (Py)  │
│  [Apps]       │    │  [Services]   │    │  [Services]   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌───────────────────┐
                    │   Data Layer      │
                    │  PostgreSQL/Redis │
                    └───────────────────┘
```

- **Apps**: 面向用户的前端应用（如 `workspace-web`）
- **Services**: 后端微服务（如 `site-auth`, `agent-bridge`）

---

## 项目结构

```
Work-Agent/
├── apps/                          # 前端应用
│   └── workspace-web/             # Next.js 主工作台
│       ├── src/
│       │   ├── app/               # App Router 页面
│       │   ├── components/        # React 组件
│       │   └── lib/               # 工具函数
│       └── package.json
│
├── services/                      # 后端服务
│   ├── site-auth/                 # Go 身份认证服务
│   │   ├── cmd/server/            # 服务入口
│   │   ├── internal/              # 内部模块
│   │   └── go.mod
│   └── agent-bridge/              # Python Agent 桥接服务
│       ├── agent_bridge/          # 核心模块
│       ├── tests/                 # 测试用例
│       └── pyproject.toml
│
├── migrations/                    # 数据库迁移文件 (SQL)
│   ├── 0001_init_extensions.up.sql
│   ├── 0002_users_and_auth.up.sql
│   └── ...
│
├── scripts/                       # 开发与部署脚本
│   ├── setup_local_db.sh          # 本地数据库初始化
│   ├── generate_keys.sh           # JWT 密钥生成
│   ├── dev_backend.sh             # 启动后端服务
│   ├── dev_web.sh                 # 启动前端服务
│   └── otf.py                     # 统一 CLI 工具
│
├── nginx/                         # Nginx 网关配置
├── docs/                          # 项目文档
│   ├── technical/                 # 技术文档
│   │   ├── architecture/          # 架构设计
│   │   ├── data/                  # 数据模型
│   │   ├── api/                   # API 规范
│   │   └── dev/                   # 开发指南
│   ├── features/                  # PRD 产品需求
│   ├── test/                      # 测试计划
│   └── standards/                 # 规范标准
│
├── deploy_config.toml             # 部署配置
├── docker-compose.db.yml          # 数据库 Docker 配置
├── package.json                   # pnpm workspace 配置
├── turbo.json                     # Turborepo 配置
└── README.md
```

---

## 快速开始

### 环境要求 (Prerequisites)

| 工具 | 版本要求 | 用途 |
|------|----------|------|
| Docker | 20.10+ | 容器化数据库服务 |
| Node.js | 18+ (推荐 20 LTS) | 前端开发 |
| pnpm | 9+ | 包管理器 |
| Go | 1.21+ | 后端身份服务 |
| Python | 3.10+ | Agent Bridge 服务 |
| PostgreSQL | 16+ | 主数据库 |
| Redis | 7+ | 缓存与队列 |

### 安装与启动

#### Step 1: 环境初始化

```bash
# 1. 克隆仓库并安装依赖
git clone <repository-url>
cd Work-Agent

# 2. 安装所有依赖（前端、Go、Python）
python3 scripts/otf.py install

# 3. 初始化本地数据库
bash scripts/setup_local_db.sh

# 4. 生成 JWT 密钥与内部通信 Token
bash scripts/generate_keys.sh

# 5. 执行数据库迁移
python3 scripts/otf.py migrate up
```

#### Step 2: 启动服务

在不同的终端窗口中分别启动：

```bash
# 终端 1: 启动后端身份服务 (Go)
bash scripts/dev_backend.sh

# 终端 2: 启动 Agent Bridge (Python)
bash scripts/dev_agent.sh

# 终端 3: 启动前端工作台 (Next.js)
bash scripts/dev_web.sh
```

或使用统一脚本检查依赖：

```bash
# 快速检查环境
python3 scripts/otf.py check

# 全面检查所有依赖
python3 scripts/otf.py check-deps
```

---

## 开发指南

### TDD First (测试驱动开发)

本项目采用 **测试驱动开发 (TDD)** 模式。在编写任何功能代码之前，请务必：

1. **阅读测试总纲**: [`docs/test/qa-master-plan.md`](docs/test/qa-master-plan.md)
2. **遵循测试命名规范**: 测试用例需标注 PRD 引用（如 `[WS-PRD F2.1.1]`）
3. **运行测试命令**:
   ```bash
   # 前端测试
   pnpm -C apps/workspace-web test

   # Go 后端测试
   cd services/site-auth && go test ./...

   # Python 测试
   cd services/agent-bridge && pytest
   ```

### 数据库变更规范

所有 Schema 变更必须通过迁移文件进行管理：

1. **迁移文件位置**: `migrations/` 目录
2. **命名规范**: `{序号}_{描述}.up.sql` / `{序号}_{描述}.down.sql`
3. **数据模型文档**: [`docs/technical/data/database-design.md`](docs/technical/data/database-design.md)
4. **执行迁移**:
   ```bash
   # 应用所有迁移
   python3 scripts/otf.py migrate up

   # 回滚一个版本
   python3 scripts/otf.py migrate down 1
   ```

### 日志控制

| 服务 | 环境变量 | 默认值 | 说明 |
|------|----------|--------|------|
| Agent Bridge | `AGENT_BRIDGE_LOG_LEVEL` | `INFO` | 支持 `DEBUG/INFO/WARNING/ERROR` |
| Site Auth | `SITE_AUTH_LOG_LEVEL` | `info` | 支持 `debug/info/warn/error` |

---

## 文档索引

### 架构与设计

| 文档 | 说明 |
|------|------|
| [`docs/technical/architecture/fullstack-architecture.md`](docs/technical/architecture/fullstack-architecture.md) | 全栈架构设计 |
| [`docs/technical/data/database-design.md`](docs/technical/data/database-design.md) | 数据库设计与 ER 图 |
| [`docs/technical/protocols/interaction-protocol.md`](docs/technical/protocols/interaction-protocol.md) | WebSocket 交互协议 |

### API 规范

| 文档 | 说明 |
|------|------|
| [`docs/technical/api/core-service.md`](docs/technical/api/core-service.md) | Core Service API |
| [`docs/technical/api/agent-bridge.md`](docs/technical/api/agent-bridge.md) | Agent Bridge API |
| [`docs/standards/api-style-guide.md`](docs/standards/api-style-guide.md) | API 风格指南 |

### 测试计划

| 文档 | 说明 |
|------|------|
| [`docs/test/qa-master-plan.md`](docs/test/qa-master-plan.md) | QA 测试总纲 |
| [`docs/test/frontend-testing.md`](docs/test/frontend-testing.md) | 前端测试计划 |
| [`docs/test/backend-testing.md`](docs/test/backend-testing.md) | 后端测试计划 |
| [`docs/test/agent-bridge-testing.md`](docs/test/agent-bridge-testing.md) | Agent Bridge 测试 |

### 开发与运维

| 文档 | 说明 |
|------|------|
| [`docs/technical/dev/local-development.md`](docs/technical/dev/local-development.md) | 本地开发指南 |
| [`docs/technical/release/deployment.md`](docs/technical/release/deployment.md) | 部署指南 |
| [`docs/technical/ops/nginx-gateway-arch.md`](docs/technical/ops/nginx-gateway-arch.md) | Nginx 网关配置 |
| [`docs/standards/contributing.md`](docs/standards/contributing.md) | 贡献规范 |

### 产品需求 (PRD)

| 文档 | 说明 |
|------|------|
| [`docs/features/platform-overview.md`](docs/features/platform-overview.md) | 平台总体概览 |
| [`docs/features/prd-identity-access.md`](docs/features/prd-identity-access.md) | 身份与访问控制 |
| [`docs/features/prd-wokrspace.md`](docs/features/prd-wokrspace.md) | 工作台交互 |
| [`docs/features/prd-marketplace.md`](docs/features/prd-marketplace.md) | 工作流市场 |
| [`docs/features/prd-insights.md`](docs/features/prd-insights.md) | 数据洞察 |

---

## 服务与组件概览

| 模块 | 语言 | 说明 | 启动命令 |
|------|------|------|----------|
| `apps/workspace-web` | TypeScript / Next.js | 主工作空间前端 | `pnpm -C apps/workspace-web dev` |
| `services/site-auth` | Go 1.22 | 账号登录 + Session 管理 | `go run ./services/site-auth/cmd/server` |
| `services/agent-bridge` | Python / FastAPI | LLM 桥接与流式交互 | `uvicorn agent_bridge.app:app` |
| `scripts/otf.py` | Python | 统一 CLI 工具 | `python3 scripts/otf.py --help` |

---

## 许可证

Private - All Rights Reserved
