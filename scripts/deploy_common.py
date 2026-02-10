"""Shared helpers for deploy scripts./部署脚本的通用辅助函数。"""

from __future__ import annotations

import contextlib
import os
import shlex
import shutil
import subprocess
import time
from typing import Dict, Optional, Tuple

from .config_loader import DeployConfig


def print_color(text: str, color: str = "green") -> None:
    """Render colored terminal output./以指定颜色在终端输出文本。"""

    colors = {
        "green": "\033[92m",
        "yellow": "\033[93m",
        "red": "\033[91m",
        "blue": "\033[94m",
        "bold": "\033[1m",
        "end": "\033[0m",
    }
    print(f"{colors.get(color, colors['green'])}{text}{colors['end']}")


def check_executable(name: str) -> bool:
    """Check whether a command is available in PATH./检查命令是否可在 PATH 中解析。"""

    if not name:
        return False
    if os.path.isabs(name):
        return os.path.exists(name)
    return shutil.which(name) is not None


def run_command(
    cmd: str,
    cwd: str,
    env: Optional[Dict[str, str]] = None,
    *,
    capture_output: bool = False,
    use_shell: bool = False,
    check_sudo: bool = False,
) -> Tuple[bool, Optional[str]]:
    """Run a shell command and optionally capture output./运行 shell 命令并可选择捕获输出。"""

    if check_sudo and hasattr(os, "geteuid") and os.geteuid() != 0:
        print_color(
            f"命令 '{cmd}' 需要 sudo 权限。请使用 'sudo python3 deploy_linux.py ...' 运行此脚本。",
            "red",
        )
        return False, "Sudo 权限缺失"

    print_color(f"\n[{cwd}]$ {cmd}", "bold")

    process_env = os.environ.copy()
    if env:
        process_env.update(env)

    if not use_shell:
        # Auto-enable shell execution when the command includes redirection tokens./当命令包含重定向符号时自动启用 shell 模式。
        use_shell = any(c in cmd for c in [">", "|", "&"])

    try:
        if capture_output:
            result = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd,
                env=process_env,
                check=True,
                text=True,
                capture_output=True,
                executable="/bin/bash" if use_shell else None,
            )
            return True, result.stdout.strip()

        cmd_list = cmd if use_shell else shlex.split(cmd)
        process = subprocess.Popen(
            cmd_list,
            shell=use_shell,
            cwd=cwd,
            env=process_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            executable="/bin/bash" if use_shell else None,
        )

        output_lines = []
        if process.stdout:
            while True:
                line = process.stdout.readline()
                if not line:
                    break
                print(line.strip())
                output_lines.append(line)

        process.wait()

        if process.returncode != 0:
            print_color(f"命令失败，退出码: {process.returncode}", "red")
            return False, "".join(output_lines)

        return True, "".join(output_lines)

    except FileNotFoundError:
        error_msg = f"命令未找到: {cmd.split()[0]}"
        print_color(error_msg, "red")
        return False, error_msg
    except subprocess.CalledProcessError as e:
        error_msg = f"命令执行失败:\n{e.stderr or e.stdout}"
        print_color(error_msg, "red")
        return False, error_msg
    except Exception as e:  # pragma: no cover - defensive guard
        error_msg = f"执行期间发生未知错误: {e}"
        print_color(error_msg, "red")
        return False, error_msg


PYTHON_VERSION_REQUIREMENT: Tuple[int, int] = (3, 10)


def _format_version(version: Tuple[int, int, int]) -> str:
    """Represent a version triple as a dotted string./将版本三元组格式化为点分字符串。"""


def _get_python_version(python_bin: str) -> Optional[Tuple[int, int, int]]:
    """Return the interpreter version tuple or None./返回解释器的版本三元组，若失败则为 None。"""
    try:
        output = subprocess.check_output(
            [
                python_bin,
                "-c",
                "import sys; print('.'.join(str(x) for x in sys.version_info[:3]))",
            ],
            text=True,
        ).strip()
    except (FileNotFoundError, subprocess.CalledProcessError, OSError):
        return None

    parts = output.split(".")
    try:
        major = int(parts[0])
        minor = int(parts[1])
        micro = int(parts[2]) if len(parts) > 2 else 0
    except (ValueError, IndexError):
        return None

    return major, minor, micro


def resolve_python_interpreter(
    configured_bin: str, *, allow_fallback: bool = True
) -> Tuple[str, str]:
    """Resolve a Python interpreter meeting the minimum requirement./解析满足最低版本要求的 Python 解释器。"""

    requirement_label = ".".join(str(x) for x in PYTHON_VERSION_REQUIREMENT)
    normalized = configured_bin.strip() or "python3"

    candidates = [normalized]
    if allow_fallback:
        for candidate in ("python3.12", "python3.11", "python3.10"):
            if candidate not in candidates:
                candidates.append(candidate)

    attempted_messages = []

    for candidate in candidates:
        if not check_executable(candidate):
            attempted_messages.append(f"{candidate} (未找到)")
            continue

        version_info = _get_python_version(candidate)
        if version_info is None:
            attempted_messages.append(f"{candidate} (无法检测版本)")
            continue

        version_label = _format_version(version_info)
        attempted_messages.append(f"{candidate} ({version_label})")

        if (version_info[0], version_info[1]) >= PYTHON_VERSION_REQUIREMENT:
            return candidate, version_label

    attempted = "; ".join(attempted_messages) or "无有效候选"
    raise RuntimeError(
        "未找到满足 Python>="
        f"{requirement_label} 的解释器。请安装 python{requirement_label}+ 或在配置中更新 python_agent.python_bin。"
        f" 已尝试: {attempted}."
    )


def get_app_env_vars(config: DeployConfig) -> Dict[str, str]:
    """Build environment variables for Go/Next.js apps./生成 Go 与 Next.js 应用所需的环境变量。"""

    db_host = config.get("database", "host")
    redis_host = config.get("redis", "host")

    db_url = (
        f"postgres://{config.get('database', 'user')}:{config.get('database', 'password')}@"
        f"{db_host}:{config.get('database', 'port')}/{config.get('database', 'db_name')}?sslmode=disable"
    )
    redis_addr = f"{redis_host}:{config.get('redis', 'port')}"

    go_listen_addr = config.get("backend_go", "listen_addr")
    host_part, _, port_part = go_listen_addr.rpartition(":")
    site_auth_port = port_part or "8080"

    site_auth_host = host_part.strip() or "127.0.0.1"
    if site_auth_host in ("0.0.0.0", "::"):
        site_auth_host = "127.0.0.1"

    site_auth_service_url = f"http://{site_auth_host}:{site_auth_port}"
    agent_gateway_ws_url = f"ws://{site_auth_host}:{site_auth_port}/ws/agent"

    python_host = config.get("python_agent", "listen_host", fallback="127.0.0.1")
    if python_host in ("0.0.0.0", "::"):
        python_host = "127.0.0.1"
    python_port = config.get("python_agent", "listen_port", fallback="8050")
    agent_bridge_url = f"http://{python_host}:{python_port}"

    go_log_level = config.get("backend_go", "go_log_level", fallback="info").strip()

    env_vars = {
        "SITE_AUTH_DATABASE_URL": db_url,
        "SITE_AUTH_REDIS_ADDR": redis_addr,
        "SITE_AUTH_REDIS_PASSWORD": config.get("redis", "password"),
        "SITE_AUTH_SESSION_TTL": config.get("backend_go", "session_ttl"),
        "SITE_AUTH_BCRYPT_COST": config.get("backend_go", "bcrypt_cost"),
        "SITE_AUTH_ALLOWED_ORIGINS": config.get("backend_go", "allowed_origins"),
        "SITE_AUTH_LISTEN_ADDR": go_listen_addr,
        "SITE_AUTH_SERVICE_URL": site_auth_service_url,
        "SITE_AUTH_AGENT_BRIDGE_URL": agent_bridge_url,
        "SITE_AUTH_LOG_LEVEL": go_log_level,
        "NEXT_PUBLIC_APP_ENV": config.get("frontend_next", "app_env"),
        "NEXT_PUBLIC_AGENT_GATEWAY_WS_URL": agent_gateway_ws_url,
        "PORT": config.get("frontend_next", "listen_port"),
        "HOST": config.get("frontend_next", "listen_host"),
    }

    # Add JWT and internal token if Nginx section exists./如果存在 Nginx 配置段，添加 JWT 和内部 token。
    if config.has_section("nginx"):
        jwt_private_key_path = config.get("nginx", "jwt_private_key_path", fallback="")
        if jwt_private_key_path:
            env_vars["JWT_PRIVATE_KEY_PATH"] = jwt_private_key_path

        jwt_public_key_path = config.get("nginx", "jwt_public_key_path", fallback="")
        if jwt_public_key_path:
            env_vars["JWT_PUBLIC_KEY_PATH"] = jwt_public_key_path

        internal_token = config.get("nginx", "agent_bridge_internal_token", fallback="")
        if internal_token:
            env_vars["AGENT_BRIDGE_INTERNAL_TOKEN"] = internal_token

        # Add Nginx public URLs for frontend./为前端添加 Nginx 公共 URL。
        nginx_base_url = config.get("nginx", "public_base_url", fallback="")
        nginx_ws_url = config.get("nginx", "public_ws_url", fallback="")
        if nginx_base_url:
            env_vars["PUBLIC_NGINX_BASE_URL"] = nginx_base_url
            # Keep backward compatibility with deprecated APISIX env var names./保持与已废弃的 APISIX 环境变量名的向后兼容性。
            # Note: PUBLIC_APISIX_* variables are deprecated, use PUBLIC_NGINX_* instead.
            # 注意：PUBLIC_APISIX_* 变量已废弃，请使用 PUBLIC_NGINX_*。
            env_vars["PUBLIC_APISIX_BASE_URL"] = nginx_base_url
        if nginx_ws_url:
            env_vars["PUBLIC_NGINX_WS_URL"] = nginx_ws_url
            # Keep backward compatibility with deprecated APISIX env var names./保持与已废弃的 APISIX 环境变量名的向后兼容性。
            # Note: PUBLIC_APISIX_* variables are deprecated, use PUBLIC_NGINX_* instead.
            # 注意：PUBLIC_APISIX_* 变量已废弃，请使用 PUBLIC_NGINX_*。
            env_vars["PUBLIC_APISIX_WS_URL"] = nginx_ws_url

    return env_vars


def get_python_service_env_vars(config: DeployConfig) -> Dict[str, str]:
    """Assemble environment variables for the Python agent./为 Python Agent Bridge 服务组装环境变量。"""

    env: Dict[str, str] = {}

    if config.has_section("coze"):
        api_key = config.get("coze", "api_key", fallback="").strip()
        if api_key:
            env["AGENT_BRIDGE_API_KEY"] = api_key

        bot_id = config.get("coze", "bot_id", fallback="").strip()
        if bot_id:
            env["AGENT_BRIDGE_BOT_ID"] = bot_id

        api_base = config.get("coze", "base_url", fallback="").strip()
        if api_base:
            env["AGENT_BRIDGE_API_BASE"] = api_base

    if config.has_section("python_agent"):
        log_level = config.get("python_agent", "log_level", fallback="").strip()
        if log_level:
            env["AGENT_BRIDGE_LOG_LEVEL"] = log_level

    # Add internal token if Nginx section exists./如果存在 Nginx 配置段，添加内部 token。
    if config.has_section("nginx"):
        internal_token = config.get("nginx", "agent_bridge_internal_token", fallback="")
        if internal_token:
            env["AGENT_BRIDGE_INTERNAL_TOKEN"] = internal_token

    return env


def get_migration_env_vars(config: DeployConfig) -> Dict[str, str]:
    """Expose DATABASE_URL for local migrations./为本地数据库迁移提供 DATABASE_URL。"""

    db_host = config.get("database", "host")
    db_url = (
        f"postgres://{config.get('database', 'user')}:{config.get('database', 'password')}@"
        f"{db_host}:{config.get('database', 'port')}/{config.get('database', 'db_name')}?sslmode=disable"
    )
    return {"DATABASE_URL": db_url}


def pid_file_path(run_dir: str, name: str) -> str:
    """Construct PID file path for service tracking./构造用于跟踪服务的 PID 文件路径。"""

    return os.path.join(run_dir, f"{name}.pid")


def log_file_path(run_dir: str, name: str, log_dir: Optional[str] = None) -> str:
    """Derive log file path, enforcing .log suffix./派生日志文件路径并确保 .log 后缀。
    
    Args:
        run_dir: Legacy run directory (for PID files and backward compatibility)
        name: Log file name (without extension)
        log_dir: Optional unified log directory (if None, uses run_dir for backward compatibility)
    """
    filename = name if name.endswith(".log") else f"{name}.log"
    
    # Use unified log directory if provided, otherwise fall back to run_dir
    # 如果提供了统一日志目录则使用，否则回退到 run_dir
    if log_dir:
        # Determine subdirectory based on service name
        # 根据服务名称确定子目录
        if "backend" in name.lower() or "site-auth" in name.lower():
            service_dir = os.path.join(log_dir, "app", "backend")
        elif "agent" in name.lower() or "bridge" in name.lower():
            service_dir = os.path.join(log_dir, "app", "agent-bridge")
        elif "frontend" in name.lower() or "web" in name.lower():
            service_dir = os.path.join(log_dir, "app", "frontend")
        else:
            service_dir = os.path.join(log_dir, "app")
        
        return os.path.join(service_dir, filename)
    
    return os.path.join(run_dir, filename)


def _pid_is_running(pid: int) -> bool:
    """Check whether a PID belongs to a live process./检查指定 PID 是否仍然存活。"""

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    else:
        return True


def start_service_daemon(
    cmd: str,
    cwd: str,
    log_file: str,
    pid_file: str,
    name: str,
    *,
    env: Optional[Dict[str, str]] = None,
    health_check_timeout: float = 3.0,
    health_check_interval: float = 0.5,
) -> None:
    """Launch background service and confirm it stays alive./启动后台服务并确认其持续运行。"""

    print_color(f"正在后台启动 {name}...", "yellow")
    print_color(f"  日志文件: {log_file}", "yellow")
    print_color(f"  PID 文件: {pid_file}", "yellow")

    process_env = os.environ.copy()
    if env:
        process_env.update(env)

    if cmd.startswith("./") and not os.path.isabs(cmd):
        cmd = os.path.join(cwd, cmd)

    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    os.makedirs(os.path.dirname(pid_file), exist_ok=True)

    full_cmd = f"nohup {cmd} > {log_file} 2>&1 & echo $!"

    success, pid_output = run_command(
        full_cmd,
        cwd=cwd,
        env=process_env,
        capture_output=True,
        use_shell=True,
    )

    if not (success and pid_output and pid_output.isdigit()):
        print_color(f"启动 {name} 失败或未能获取 PID。", "red")
        print_color(f"命令输出:\n{pid_output}", "red")
        print_color(f"请检查日志: {log_file}", "yellow")
        raise RuntimeError(f"启动 {name} 失败")

    pid = int(pid_output)
    with open(pid_file, "w") as handle:
        handle.write(str(pid))

    # Perform simple health checks to catch immediate failures./执行简单健康检查以捕捉启动瞬间的失败。
    deadline = time.monotonic() + max(health_check_timeout, 0)
    while time.monotonic() < deadline:
        if _pid_is_running(pid):
            time.sleep(health_check_interval)
        else:
            break

    if not _pid_is_running(pid):
        print_color(f"{name} 在启动后异常退出。", "red")
        with contextlib.suppress(FileNotFoundError):
            os.remove(pid_file)
        raise RuntimeError(
            f"{name} 未能保持运行。请检查日志: {log_file}"
        )

    print_color(f"{name} 已启动，PID: {pid}", "green")


def stop_pid_file(name: str, pid_file: str, repo_path: str) -> None:
    """Stop a process tracked via PID file./根据 PID 文件停止进程。"""

    if not os.path.exists(pid_file):
        print_color(f"未找到 {name} 的 PID 文件 ({pid_file})，跳过。", "yellow")
        return

    try:
        with open(pid_file, "r") as handle:
            pid = handle.read().strip()

        if not pid.isdigit():
            print_color(f"{name} 的 PID 文件无效。", "red")
            os.remove(pid_file)
            return

        print_color(f"正在停止 {name} (PID: {pid})...", "yellow")
        try:
            os.kill(int(pid), 0)
        except OSError:
            print_color(f"{name} (PID: {pid}) 已经停止。", "green")
            os.remove(pid_file)
            return

        success, _ = run_command(f"kill {pid}", cwd=repo_path)
        time.sleep(2)

        try:
            os.kill(int(pid), 0)
            print_color(
                f"优雅停止 {name} (PID: {pid}) 失败，尝试 kill -9...",
                "red",
            )
            success, _ = run_command(f"kill -9 {pid}", cwd=repo_path)
        except OSError:
            success = True

        if success:
            print_color(f"{name} (PID: {pid}) 已停止。", "green")
            os.remove(pid_file)
        else:
            print_color(f"停止 {name} (PID: {pid}) 失败。", "red")

    except Exception as exc:  # pragma: no cover - defensive guard
        print_color(f"停止 {name} 时出错: {exc}", "red")
