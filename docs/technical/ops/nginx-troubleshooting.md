# Nginx 简易排障流程 (Orbitaskflow)

## 0. 排障入口条件

当满足以下任一条件时，进入本流程：

- 访问 `http://localhost:9080` 返回超时 / 连接失败；
- 前端或后端通过 Nginx 访问时出现 502 / 504；
- 部署脚本提示「Nginx 启动成功」，但浏览器无法访问 9080。

---

## 1. Nginx 进程是否存在？

**命令：**

```bash
ps aux | grep nginx | grep -v grep
pgrep -f nginx || echo "NO_NGINX_PROCESS"
```

**判断：**

- 如果输出包含 `nginx: master process` 或 `pgrep` 返回非空 → 进程存在，进入步骤 2。
- 如果 `pgrep` 返回空 / 打印 `NO_NGINX_PROCESS` → 说明 Nginx 未启动，执行启动命令：

  - macOS 推荐（不依赖 brew services）：

    ```bash
    sudo nginx
    ```

  - Linux：

    ```bash
    sudo systemctl start nginx
    ```

  启动后回到本步骤重试；若仍无进程，记录错误日志（见步骤 4）。

---

## 2. 9080 端口是否被 Nginx 监听？

**命令：**

```bash
lsof -i :9080 || netstat -an | grep 9080 || echo "PORT_9080_NOT_LISTENING"
```

**判断：**

- 如果看到 `nginx` 进程占用 `0.0.0.0:9080` 或 `*:9080` → 端口监听正常，进入步骤 3。
- 如果完全没有结果 / 只有其他进程 → 视为 **9080 未监听**，需要检查配置：

  1. 检查 Nginx 配置文件是否存在：
     - macOS（Apple Silicon）：`/opt/homebrew/etc/nginx/servers/orbitaskflow.conf`
     - macOS（Intel）：`/usr/local/etc/nginx/servers/orbitaskflow.conf`
     - Linux：`/etc/nginx/sites-available/orbitaskflow`

  2. 检查是否包含：

     ```nginx
     listen 9080;
     ```

  3. 语法测试并重载：

     ```bash
     nginx -t
     sudo nginx -s reload || sudo systemctl restart nginx
     ```

  然后回到本步骤重试 `lsof -i :9080`。

---

## 3. 后端 / 前端是否正常监听？

即使 Nginx 在监听 9080，如果 upstream 目标挂了，仍然会 502/504。

**命令：**

```bash
# Go 后端 (8080)
lsof -i :8080 || echo "BACKEND_8080_DOWN"

# Workspace Web 前端 (5174)
lsof -i :5174 || echo "FRONTEND_5174_DOWN"
```

**判断：**

- 如果 `BACKEND_8080_DOWN` 出现 → 说明后端没启动；Agent 应调用「启动后端服务」相关脚本或提示人类启动，再重试访问。
- 如果 `FRONTEND_5174_DOWN` 出现 → 说明前端没启动；同理启动前端后再重试。
- 两者都在监听 → 进入步骤 4。

---

## 4. 检查 Nginx 配置语法与错误日志

### 4.1 语法测试

**命令：**

```bash
nginx -t || echo "NGINX_CONFIG_ERROR"
```

- 如果返回 `syntax is ok` / `test is successful` → 配置语法正确，继续 4.2。
- 如果包含 `NGINX_CONFIG_ERROR` 或错误信息 → 记录错误输出，提示需要修复配置文件（路径同步骤 2）。

### 4.2 查看错误日志

**命令（按环境依次尝试）：**

```bash
# 统一规范路径（生产 / 宿主机）
tail -50 /var/log/orbitaskflow/nginx/nginx-error.log 2>/dev/null || echo "NO_ORBITASKFLOW_NGINX_ERROR_LOG"

# Homebrew 默认路径（本地）
tail -50 /usr/local/var/log/nginx/error.log 2>/dev/null || \
 tail -50 /opt/homebrew/var/log/nginx/error.log 2>/dev/null || \
 echo "NO_HOMEBREW_NGINX_ERROR_LOG"
```

**AI 行为建议：**

- 解析最近 50 行日志，重点识别：
  - `bind() to 0.0.0.0:8080 failed` → 见步骤 5「监听错误端口」。
  - `permission denied` → 提示需要用 `sudo` 启动或修正端口/文件权限。
  - `no such file or directory` → 配置引用的文件/证书路径错误。

---

## 5. 是否错误地监听了 8080 端口？

如果错误日志中有类似：

```text
bind() to 0.0.0.0:8080 failed (48: Address already in use)
```

说明 Nginx 主配置尝试监听 `8080`，与后端冲突。

**检查主配置：**

```bash
# Apple Silicon
NGINX_PREFIX="/opt/homebrew/etc/nginx"
# Intel
# NGINX_PREFIX="/usr/local/etc/nginx"

grep -n "listen 8080" "$NGINX_PREFIX/nginx.conf" || echo "NO_LISTEN_8080_IN_MAIN_CONF"
```

**修复思路（给人类或自动修复脚本）：**

- 将主配置中的 `listen 8080;` 注释掉；
- 确保 `http {}` 中有：

  ```nginx
  include servers/*.conf;
  ```

- `servers/orbitaskflow.conf` 使用 `listen 9080;` 并代理到后端 `8080`。

修复后再次执行：

```bash
nginx -t
sudo nginx -s reload
lsof -i :9080
```

---

## 6. 配置 / CORS 是否指向正确的网关端口？

如果 Nginx 和后端/前端都正常，但前端仍报 CORS / 连接错误，检查配置文件：

**查看 `deploy_config.toml` 中的 nginx 段：**

```toml
[nginx]
listen_port   = 9080
https_port    = 9443
public_base_url = "http://localhost:9080"
public_ws_url   = "ws://localhost:9080/ws/agent"
```

**查看后端 CORS 配置：**

```toml
[backend_go]
allowed_origins = "http://localhost:9080"
```

- 如果 `public_base_url` 或 `allowed_origins` 指向 `http://localhost:5174` 或其他端口 → 需要改为 `9080`，保持和 Nginx 网关对齐。

---

## 7. 排障结束判定

当满足以下条件时，可以认为 Nginx 网关工作正常：

- `ps aux` 中有 Nginx 主/worker 进程；
- `lsof -i :9080` 显示 Nginx 正在监听；
- 后端 `8080` 与前端 `5174` 端口都在监听；
- `nginx -t` 语法检测通过；
- 最近错误日志无新的致命错误；
- `curl http://localhost:9080/healthz` 返回 200 或预期内容。