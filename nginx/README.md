# Nginx 网关配置

本文档说明 Nginx 网关的配置和使用。

## 依赖说明

### 必需依赖

1. **Nginx**: 标准 Nginx（不需要 OpenResty）
   - Linux: 通过 `apt-get install nginx` 安装
   - macOS: 通过 `brew install nginx` 安装

### 不需要的依赖

1. **OpenResty**: 不需要
   - 本项目使用标准 Nginx，不需要 OpenResty
   - JWT 验证通过 `auth_request` 模块调用 site-auth 服务完成

2. **APISIX**: 不需要
   - 已迁移到标准 Nginx

## 配置文件

Nginx 使用声明式配置文件作为唯一事实来源（SSOT）：

- `nginx/config/nginx.dev.conf` - 开发环境配置
- `nginx/config/nginx.prod.conf` - 生产环境配置

配置文件通过部署脚本自动部署到 Nginx 配置目录，并注入环境变量（CORS 源等）。

## 路由规则

| 路由 | 上游服务 | 鉴权 | 说明 |
|------|---------|------|------|
| `/api/v1/login` | 127.0.0.1:8080 | 无 | 登录接口 |
| `/api/v1/session` | 127.0.0.1:8080 | JWT (auth_request) | 会话验证 |
| `/api/v1/logout` | 127.0.0.1:8080 | JWT (auth_request) | 登出接口 |
| `/api/v1/agent/ws/tickets` | 127.0.0.1:8080 | JWT (auth_request) | WebSocket 凭证 |
| `/ws/agent` | 127.0.0.1:8080 | Ticket | WebSocket 连接 |
| `/*` | 127.0.0.1:5174 | 无 | 前端静态资源 |

## JWT 鉴权机制

Nginx 使用 `auth_request` 模块实现 JWT 鉴权：

1. 客户端请求到达需要鉴权的路由（如 `/api/v1/session`）
2. Nginx 暂停原始请求，向内部端点 `/_auth_validate` 发起子请求
3. `/_auth_validate` 代理到 `site-auth:8080/api/v1/auth/validate`
4. site-auth 服务验证 JWT token：
   - 检查 token 签名和有效期
   - 检查 token 是否在黑名单中
   - 返回 200（有效）或 401（无效）
5. Nginx 根据验证结果：
   - 收到 200：继续处理原始请求，转发到后端服务
   - 收到 401：直接返回 401 错误给客户端

## 环境变量注入

部署脚本会自动将以下环境变量注入到 Nginx 配置中：

- `${{ALLOWED_ORIGINS}}` - CORS 允许的源地址

JWT 公钥通过环境变量 `JWT_PUBLIC_KEY_PATH` 传递给 site-auth 服务，用于验证端点。

## 配置热重载

Nginx 支持配置热重载。当配置文件更新后，运行：

```bash
# Linux
sudo nginx -s reload

# macOS
nginx -s reload
```

部署脚本会自动执行配置测试和重载。

## 部署

### Linux

通过 `deploy_linux.py` 脚本自动安装和配置：

```bash
sudo python3 deploy_linux.py --config deploy_config.toml --action start
```

### macOS

通过 `deploy_macos.py` 脚本自动安装和配置：

```bash
python3 deploy_macos.py --config deploy_config.toml --action start
```

### 手动安装

参考 [Nginx 官方文档](https://nginx.org/en/docs/) 进行手动安装和配置。

## 健康检查

部署脚本会在启动 Nginx 后执行健康检查，确保服务正常运行。检查方式：

1. 检查 Nginx 进程是否运行
2. 检查配置文件语法是否正确（`nginx -t`）

## 故障排查

如果 Nginx 启动失败：

1. 检查配置文件语法：
   ```bash
   nginx -t
   ```

2. 检查日志：
   ```bash
   # Linux
   tail -f /var/log/nginx/error.log
   
   # macOS
   tail -f /usr/local/var/log/nginx/error.log
   ```

3. 检查端口是否被占用：
   ```bash
   lsof -i :9080
   ```

### JWT 验证失败

1. 确认 site-auth 服务正常运行
2. 确认 `JWT_PUBLIC_KEY_PATH` 环境变量已设置
3. 确认 JWT 公钥文件存在且格式正确（PEM 格式）
4. 检查 site-auth 服务的 `/api/v1/auth/validate` 端点是否可访问

### 内部 Token 验证失败

1. 确认 `agent_bridge_internal_token` 配置正确
2. 确认 site-auth 和 agent-bridge 使用相同的 token
3. 检查环境变量是否正确注入

## 参考

- [Nginx 官方文档](https://nginx.org/en/docs/)
- [Nginx auth_request 模块](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html)
