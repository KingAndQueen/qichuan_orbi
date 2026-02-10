# 本地开发指南

## 前端（apps/workspace-web）快速启动

```bash
# 1) 环境检查 / Environment check
python scripts/otf.py check

# 2) 全面依赖检查（可选）/ Comprehensive dependency check (optional)
python scripts/otf.py check-deps

# 3) 安装所有依赖 / Install all dependencies
python scripts/otf.py install

# 或手动安装 / Or install manually:
# pnpm install  # 前端依赖
# cd services/site-auth && go mod download && go mod tidy  # Go 依赖
# cd services/agent-bridge && pip install -e .[dev]  # Python 依赖

# 3) 启动前端（默认 5173 端口）/ Start dev server
pnpm -C apps/workspace-web dev
# 或使用一键脚本（支持 host/port 覆盖）
python scripts/otf.py dev web --host 0.0.0.0 --port 5173

# 4) 质量校验 / Quality checks
pnpm -C apps/workspace-web lint
pnpm -C apps/workspace-web typecheck
pnpm -C apps/workspace-web test

# 5) 覆盖率报告 / Test coverage report
pnpm -C apps/workspace-web test:coverage
# 生成目录 apps/workspace-web/coverage 下的 html 与 text 报告
```

> 提示：本仓库采用 ESLint v9 + ts-eslint v8 的 Flat Config，请确保本地 ESLint 插件为最新版本。

## "3+1" 轻量化开发脚本（Backend / Agent / Web + 配置桥）

在日常开发中无需再依赖 `deploy_macos.py`，可以使用下列脚本按需启动单个服务：

```bash
# 预加载环境变量（会输出 export 语句，可用于 eval）
python3 scripts/export_env.py

# 启动 Go 后端（Site-Auth）
scripts/dev_backend.sh

# 启动 Python Agent Bridge
scripts/dev_agent.sh

# 启动前端 Workspace Web
scripts/dev_web.sh
```

> 所有脚本都基于根目录的 `deploy_config.toml`，会自动映射数据库、Redis 以及各服务端口（BACKEND/AGENT/FRONTEND）。

## 一键启动完整开发栈（`otf.py dev`）

如果需要一条命令启动前端、Go 登录服务、Python agent、以及 Nginx 日志监听，可使用新增的 `dev` 子命令。该模式会在启动前检查 PostgreSQL/Redis 连接，并把配置文件中的键值注入到子进程环境变量中，便于本地联调。

### 准备配置文件

1. 参考 `deploy_config.toml` 创建一个专用的开发配置（例如 `dev.toml`），必须包含数据库、Redis 与 Nginx 日志路径（推荐与 `[logging]` 段保持一致，如 `./logs/nginx`）：

   ```toml
   [services]
   SITE_AUTH_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/orbitaskflow?sslmode=disable"
   SITE_AUTH_REDIS_ADDR = "127.0.0.1:6379"
   # 一键完整栈模式下，浏览器通过 Nginx 访问：http://localhost:9080
   # 因此 Go 服务允许的前端 Origin 也应为 9080，而不是前端裸端口 5173
   SITE_AUTH_ALLOWED_ORIGINS = "http://localhost:9080"

   [nginx]
   # 本地开发环境下的 Nginx 日志目录，需与 [logging].nginx_log_dir 保持一致
   access_log = "./logs/nginx/access.log"
   error_log = "./logs/nginx/error.log"
   listen = "0.0.0.0:9080"
   ```

2. 确保 PostgreSQL 与 Redis 服务已经启动，并与配置中的连接字符串一致。

### 启动命令

```bash
python3 scripts/otf.py dev --config dev.toml
```

- 成功后，Nginx 将监听 `http://localhost:9080`（可根据配置调整），终端会实时输出带前缀的 Web/Auth/Agent 以及 Nginx 日志。
- 按下 `Ctrl+C` 会同时停止所有子进程，避免残留。

## Python 脚本与数据库（Docker / 非 Docker 双路径）

项目提供 `scripts/otf.py` 脚本来统一处理开发环境、数据库和迁移任务。以下两种流程等价，可根据习惯选择。

### A) Docker 本地环境（推荐）

```bash
# 1) 环境检查 / Environment check
python scripts/otf.py check

# 2) 复制环境变量模板并按需修改
cp .env.example .env

# 3) (重要) 配置数据库与 Redis（供 docker-compose 使用）
# POSTGRES_PASSWORD=your_strong_db_password
# REDIS_URL=redis://redis:6379/0

# 4) 启动 Postgres + Redis（Docker）
python scripts/otf.py db up

# 5) 迁移数据库至最新（使用 migrate 容器）
python scripts/otf.py migrate up

# 6) 导入账号（CSV/JSON，支持可选 email/phone 字段）
SITE_AUTH_DATABASE_URL=postgres://postgres:postgres@localhost:5432/orbitaskflow?sslmode=disable \
  SITE_AUTH_REDIS_ADDR=127.0.0.1:6379 \
  go run ./services/site-auth/cmd/importer --file ./accounts.csv --format csv

# 7) 启动 Go 登录服务（开发模式）
SITE_AUTH_DATABASE_URL=postgres://postgres:postgres@localhost:5432/orbitaskflow?sslmode=disable \
  SITE_AUTH_REDIS_ADDR=127.0.0.1:6379 \
  SITE_AUTH_ALLOWED_ORIGINS=http://localhost:5173 \
  go run ./services/site-auth/cmd/server

# 8) 配置前端开发环境变量 (apps/workspace-web/.env.local)
SITE_AUTH_SERVICE_URL=http://127.0.0.1:8080
NEXT_PUBLIC_APP_ENV=development
```

### B) 本机原生环境

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

# 8) 配置前端环境变量（apps/workspace-web/.env.local）
SITE_AUTH_SERVICE_URL=http://127.0.0.1:8080
NEXT_PUBLIC_APP_ENV=production

# 9) 构建并启动前端
pnpm -C apps/workspace-web build
pnpm -C apps/workspace-web start
```

> 登录页面使用统一输入框，自动识别邮箱 / 手机号 / 用户名。Go 服务暴露的 `/api/v1/*` 接口可供其他内部系统复用。
