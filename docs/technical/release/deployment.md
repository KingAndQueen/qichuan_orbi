# 部署指南

## 裸机初始化（Ubuntu / Debian）

对于刚安装完操作系统的服务器，可优先运行 `scripts/bootstrap_bare_linux.py`：

```bash
sudo python3 scripts/bootstrap_bare_linux.py --repo /path/to/Work-Agent
```

该脚本会：

- 检测并按需安装 Node.js 20 LTS（通过 NodeSource 仓库）并启用 pnpm 9；
- 下载并配置 Go 1.22.5 官方二进制发行版；
- 安装 Python 3、pip、虚拟环境支持以及 git/build-essential 等基础工具；
- 下载 `golang-migrate` v4.16.2 CLI 到 `/usr/local/bin`；
- （可选）在仓库目录执行 `scripts/otf.py install` 来同步前端、Go、Python 项目依赖。

执行完毕后建议重新登录 shell 或 `source /etc/profile.d/work_agent_env.sh` 以加载更新的 PATH。

## 一键部署脚本（Linux / macOS）

仓库根目录提供两份自动化脚本：

| 操作系统 | 脚本 | 备注 |
| --- | --- | --- |
| Ubuntu / Debian 等基于 apt 的发行版 | `deploy_linux.py` | 需使用 `sudo` 运行，脚本会调用 `apt` 与 `systemctl` 安装/启动 PostgreSQL、Redis。|
| macOS (基于 Homebrew) | `deploy_macos.py` | 若未安装 Homebrew 会提示安装；使用 `brew install` / `brew services` 管理 PostgreSQL、Redis。|

### 1. 准备配置文件

1. 复制根目录示例配置：
   ```bash
   cp deploy_config.toml deploy.local.toml
   ```
2. 根据目标环境调整以下字段：
   - `[project_paths]`：仓库路径、Go 可执行文件输出路径、日志目录等。
   - `[logging]`：统一日志目录配置（**重要**）：
     - `log_dir`：统一日志根目录（默认 `./logs`）
     - `nginx_log_dir`：Nginx 日志目录（默认 `./logs/nginx`）
     - `enable_rotation`：是否启用日志轮转（生产环境建议启用）
   - `[database]` 与 `[redis]`：数据库/缓存主机、端口、账号密码。
   - `[backend_go]`：Go 服务监听地址、允许的前端域名、会话 TTL 等。
   - `[frontend_next]`：Next.js 生产服务的监听地址与环境标识。
   - `[nginx]`：Nginx 网关配置（见下方"Nginx 配置"章节）。
   - `[executables]`：`migrate_cli_path` 需指向已安装的 [golang-migrate](https://github.com/golang-migrate/migrate) CLI。

> **注意**：`deploy.local.toml` 已被添加到 `.gitignore`，不会被提交到版本控制，可安全存储本地敏感配置。

> 使用 Python 3.10 及以下版本运行部署脚本时，请先安装 `tomli`：`python3 -m pip install tomli`。

> Postgres/Redis 默认使用本机服务。如果数据库位于远程主机，修改 `host` 与 `port` 即可。

### 日志管理

部署脚本会自动创建统一的日志目录结构：

```
workspace/
├── logs/                      # 统一日志根目录
│   ├── app/                   # 应用服务日志
│   │   ├── backend/          # Go 后端服务日志
│   │   ├── agent-bridge/     # Python Agent 日志
│   │   └── frontend/         # Next.js 前端日志
│   ├── nginx/                 # Nginx 网关日志
│   └── deploy/                # 部署脚本日志（预留）
└── run/                       # PID 文件
```

- 日志目录会在部署开始时自动创建，无需手动创建；本地开发默认使用 `deploy_config.toml` 中 `[logging]` 段配置的相对路径（如 `./logs`）。
- 可通过 `[logging]` 配置段自定义日志目录路径，例如：
  ```toml
  [logging]
  log_dir = "./logs"              # 本地开发默认值
  app_log_dir = "./logs/app"      # 应用服务日志
  nginx_log_dir = "./logs/nginx"  # Nginx 网关日志
  deploy_log_dir = "./logs/deploy"# 部署脚本日志
  ```
- **生产环境推荐做法**：将 `log_dir` 指向 `/var/log/orbitaskflow`，并按照《日志与可观测性标准 (Observability & Logging Standards)》9.2 节的目录结构进行部署：
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
- 生产环境建议启用日志轮转（`enable_rotation = true`），并在操作系统层面结合 `logrotate` 或容器日志 driver，具体规则以《日志与可观测性标准》10.1 节为准。

### 2. 执行一键部署

```bash
# Linux (需 sudo)
sudo python3 deploy_linux.py --config deploy.local.toml --action start

# macOS
python3 deploy_macos.py --config deploy.local.toml --action start
```

脚本会依次完成依赖检测、安装/启动 PostgreSQL 与 Redis、安装/配置 Nginx 网关、执行数据库迁移、构建 Next.js 与 Go 服务，并在 `run/` 目录生成日志与 PID 文件。

服务启动后：
- Nginx 网关运行在配置的端口（默认映射到主机的 80/443）。
- Go 登录服务运行在 `SITE_AUTH_LISTEN_ADDR` 指定的地址（如 `http://127.0.0.1:8080`）。
- Next.js 前端运行在 `http://<listen_host>:<listen_port>`（如 `http://0.0.0.0:5174`）。

如需停止所有进程：

```bash
# Linux
sudo python3 deploy_linux.py --config deploy.local.toml --action stop

# macOS
python3 deploy_macos.py --config deploy.local.toml --action stop
```

### 3. 常见依赖要求

- Go 1.22+、Node.js 20+、pnpm 9、Python 3.8+。
- `deploy_linux.py` 需要 `apt-get`、`systemctl`、`pg_isready`；脚本会自动安装 `postgresql-client` 以确保 `pg_isready` 可用。
- `deploy_macos.py` 需要 Homebrew，并会安装 `postgresql@16`、`redis`，验证 `pg_isready` 与 `brew services`。

## Nginx 网关配置

### 前置准备

1. **生成 JWT 密钥对（RS256）**：
   ```bash
   # 使用脚本自动生成（推荐）
   bash scripts/generate_keys.sh
   
   # 或手动生成
   mkdir -p keys
   openssl genrsa -out keys/jwt_private.pem 2048
   openssl rsa -in keys/jwt_private.pem -pubout -out keys/jwt_public.pem
   ```

2. **生成内部服务通信 Token**：
   ```bash
   # 生成 32 字节（256 位）随机字符串
   openssl rand -hex 32
   ```

3. **更新 `deploy_config.toml` 中的 `[nginx]` 配置段**：
   ```toml
   [nginx]
   environment = "development"  # 或 "production"
   jwt_private_key_path = "/absolute/path/to/keys/jwt_private.pem"
   jwt_public_key_path = "/absolute/path/to/keys/jwt_public.pem"
   agent_bridge_internal_token = "your-32-byte-random-string-here"
   public_base_url = "http://localhost:9080"  # 开发环境
   public_ws_url = "ws://localhost:9080/ws/agent"  # 开发环境
   ```

### 部署说明

- **Linux**：部署脚本会自动通过 `apt-get` 安装 Nginx。
- **macOS**：部署脚本会通过 `brew install nginx` 安装。
- **配置文件**：部署脚本会根据 `environment` 配置，将对应的 `nginx.{env}.conf` 复制到 Nginx 配置目录，并注入环境变量（CORS 源等）。
- **健康检查**：部署脚本会在启动 Nginx 后执行健康检查，确保服务正常运行。

### 路由规则

Nginx 配置了以下路由：
- `/api/v1/login` → site-auth:8080（无需鉴权）
- `/api/v1/session` → site-auth:8080（需要 JWT）
- `/api/v1/logout` → site-auth:8080（需要 JWT）
- `/api/v1/agent/ws/tickets` → site-auth:8080（需要 JWT，用于签发 WebSocket Ticket）
- `/ws/agent` → agent-bridge（WebSocket，携带内部鉴权头 `X-Internal-Agent-Token`，由 `agent_bridge_internal_token` 校验）
- `/*` → workspace-web:5174（前端静态资源与前后端同源入口）

> 更多关于 Nginx 日志路径与结构化日志字段（`service` / `component` / `trace_id` 等）的说明，参见：
> - 《日志与可观测性标准 (Observability & Logging Standards)》第 4、9、10 章；
> - 《Nginx 运维与排障指南 (Orbitaskflow)》（位于 `docs/technical/ops/nginx-troubleshooting.md`）。

## 手动部署流程

```bash
# 1) 安装依赖：Node.js 20+、pnpm 9、Go 1.22、PostgreSQL 16+、Redis 7+
# 2) 获取代码：git clone && cd Work-Agent
# 3) 安装前端依赖
pnpm install

# 4) 配置 Go 登录服务环境变量（可写入 systemd 或 .env.production）：
# SITE_AUTH_DATABASE_URL=postgres://<user>:<password>@<host>:5432/<db>?sslmode=disable
# SITE_AUTH_REDIS_ADDR=<redis-host>:6379
# SITE_AUTH_REDIS_PASSWORD=<可选，默认空>
# SITE_AUTH_SESSION_TTL=24h            # 可选，默认 24 小时
# SITE_AUTH_ALLOWED_ORIGINS=https://app.example.com
# SITE_AUTH_LISTEN_ADDR=:8080          # 可选，默认 :8080

# 5) 执行数据库迁移
python scripts/otf.py migrate up

# 6) 批量导入账号（使用 Go 导入工具，支持 CSV/JSON 标题行）
SITE_AUTH_DATABASE_URL=postgres://postgres:postgres@localhost:5432/orbitaskflow?sslmode=disable \
  SITE_AUTH_REDIS_ADDR=127.0.0.1:6379 \
  go run ./services/site-auth/cmd/importer --file ./accounts.csv --format csv

# 7) 启动 Go 登录服务
SITE_AUTH_DATABASE_URL=... SITE_AUTH_REDIS_ADDR=... SITE_AUTH_ALLOWED_ORIGINS=https://app.example.com \
  go run ./services/site-auth/cmd/server

# 8) 配置前端环境变量（apps/workspace-web/.env.production）
SITE_AUTH_SERVICE_URL=http://127.0.0.1:8080
NEXT_PUBLIC_APP_ENV=production

# 9) 构建并启动前端
pnpm -C apps/workspace-web build
pnpm -C apps/workspace-web start
```

> 登录页面统一为单一账号输入框，支持自动识别邮箱 / 手机号 / 用户名。Go 服务暴露的 `/api/v1/*` 接口可被其他内部系统复用。

## 前端构建与环境变量注意

Next.js 的 `NEXT_PUBLIC_` 环境变量是在 **构建时 (Build Time)** 被替换为静态字符串的。

* **隐患**: 如果在 CI/CD 或 Docker 构建阶段定义了 `NEXT_PUBLIC_API_URL=http://localhost:8080`，那么生成的 Docker 镜像内部将永远包含这个 localhost 地址。即使你在生产环境启动容器时传入了新的环境变量，浏览器运行的代码**依然会尝试连接 localhost**。
* **解决方案**: 本项目采用 **Nginx 反向代理 + 相对路径** 的方案。前端代码中不应包含任何 `process.env.NEXT_PUBLIC_API_URL` 的引用。
