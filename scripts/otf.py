#!/usr/bin/env python3
"""
Orbitaskflow Tooling (otf.py)
Cross-platform project tooling: check/setup/dev/ci/db/migrate
跨平台工具脚本：环境检查 / 一键初始化 / 开发 / 本地CI / 本地数据库 / 迁移

Usage / 用法:
   python scripts/otf.py check
   python scripts/otf.py install [--scope frontend|go|python]
   python scripts/otf.py setup [--skip-guards]
   python scripts/otf.py dev --config <path-to-dev.toml>
   python scripts/otf.py lint|typecheck|build|test [--scope @orbitaskflow/workspace-web]
   python scripts/otf.py ci

   # DB (Docker 优先，无 Docker 时提示手动启动)
   python scripts/otf.py db up|down|logs|psql

   # Migrate（Docker 优先；无 Docker 时调用本机 migrate，缺失则给出指导）
   python scripts/otf.py migrate up
   python scripts/otf.py migrate down [steps]
   python scripts/otf.py migrate version
   python scripts/otf.py migrate force <version>
   python scripts/otf.py migrate create <name>
   python scripts/otf.py migrate reset
"""
import argparse
import asyncio
import contextlib
import os
import platform
import shutil
import signal
import subprocess
import sys
import time
from contextlib import closing
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if REPO_ROOT not in sys.path:
    # Ensure local scripts/ is importable even if a site-package named "scripts" exists.
    sys.path.insert(0, REPO_ROOT)

import psycopg2
import redis

from scripts import config_loader
from scripts.check_dependencies import DependencyChecker
from scripts.deploy_common import get_app_env_vars, get_python_service_env_vars
from scripts.nginx_setup import check_nginx_installed, check_nginx_health, setup_nginx_config
WORKSPACE_WEB = '@orbitaskflow/workspace-web'


def run(cmd: List[str], cwd: str = REPO_ROOT, check: bool = True):
    """Run a subprocess command rooted in the repository./在仓库根目录运行子进程命令。"""

    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=cwd, check=check)


def which(name: str) -> bool:
    """Check whether an executable exists in PATH./检查可执行文件是否存在于 PATH 中。"""

    return shutil.which(name) is not None


def env_or_default(key: str, default: str) -> str:
    """Fetch environment variable with fallback default./读取环境变量，若缺失则返回默认值。"""

    return os.environ.get(key, default)


def compose_base() -> Optional[List[str]]:
    """Return docker compose invocation or docker-compose fallback./返回 docker compose 或 docker-compose 命令。"""
    if which('docker'):
        try:
            compose_version = subprocess.run(
                ['docker', 'compose', 'version'],
                capture_output=True,
                text=True,
                check=False,
            )
            output = compose_version.stdout.strip() or compose_version.stderr.strip()
            if compose_version.returncode == 0 and output:
                return ['docker', 'compose', '-f', 'docker-compose.db.yml']
        except Exception:
            pass # docker compose not available
        # docker-compose (v1)
        if which('docker-compose'):
            return ['docker-compose', '-f', 'docker-compose.db.yml']
    return None


def docker_available() -> bool:
    """Check if docker compose/docker-compose is available./检查 docker compose 是否可用。"""
    return compose_base() is not None


def _find_value(data: object, target_key: str) -> Optional[object]:
    """Recursively search for a key in nested dictionaries."""

    if not isinstance(data, dict):
        return None
    for key, value in data.items():
        if key == target_key:
            return value
        if isinstance(value, dict):
            found = _find_value(value, target_key)
            if found is not None:
                return found
    return None

def _ensure_node_dependencies() -> None:
    """Ensure Node.js and pnpm exist using the shared dependency checker."""

    checker = DependencyChecker()
    checker.check_node_dependencies()
    if checker.missing:
        missing_labels = ", ".join(name for name, _ in checker.missing)
        raise RuntimeError(f"[ERROR] 缺少 Node.js 相关依赖: {missing_labels}。请先运行 `python scripts/otf.py install`. ")


def _preflight_checks(env_vars: Dict[str, str]):
    """Validate external dependencies, attempting to start them if on macOS."""

    db_url = env_vars.get("SITE_AUTH_DATABASE_URL")
    redis_addr = env_vars.get("SITE_AUTH_REDIS_ADDR")
    redis_pass = env_vars.get("SITE_AUTH_REDIS_PASSWORD")

    if not db_url:
        raise RuntimeError(
            "[ERROR] 配置缺少 SITE_AUTH_DATABASE_URL，用于检查 PostgreSQL 连接。请在配置文件中添加该键或补齐 [database] 段。"
        )
    if not redis_addr:
        raise RuntimeError(
            "[ERROR] 配置缺少 SITE_AUTH_REDIS_ADDR，用于检查 Redis 连接。请在配置文件中添加该键或补齐 [redis] 段。"
        )

    # 2. Check PostgreSQL
    try:
        with closing(psycopg2.connect(str(db_url), connect_timeout=3)) as conn:
            conn.cursor().execute("SELECT 1")
        print("[INFO] PostgreSQL 连接成功。")
    except Exception:
        print("[WARN] PostgreSQL 连接失败。")
        if platform.system() == "Darwin" and which("brew"):
            print("[INFO] 正在尝试使用 'brew services start postgresql' 启动服务...")
            subprocess.run(["brew", "services", "start", "postgresql"], capture_output=True)
            time.sleep(5)  # Give PostgreSQL time to start
            try:
                with closing(psycopg2.connect(str(db_url), connect_timeout=3)) as conn:
                    conn.cursor().execute("SELECT 1")
                print("[INFO] PostgreSQL 自动启动成功。")
            except Exception as exc:
                print(f"[ERROR] 自动启动后 PostgreSQL 仍无法连接 (URL: {db_url})。请检查配置或手动启动。")
                raise RuntimeError(f"PostgreSQL connection failed: {exc}") from exc
        else:
            raise RuntimeError("[ERROR] 无法连接到 PostgreSQL。请在运行 'dev' 之前确保数据库已启动。")

    try:
        redis_host, redis_port = str(redis_addr).split(":", 1)
    except ValueError as exc:  # noqa: PERF203 - defensive guard for malformed configs
        raise RuntimeError(
            f"[ERROR] Redis 地址格式错误: {redis_addr}，请检查 SITE_AUTH_REDIS_ADDR。"
        ) from exc

    # 3. Check Redis
    try:
        redis_client = redis.Redis(host=redis_host, port=int(redis_port), password=redis_pass, socket_connect_timeout=3)
        redis_client.ping()
        print("[INFO] Redis 连接成功。")
    except Exception:
        print("[WARN] Redis 连接失败。")
        if platform.system() == "Darwin" and which("brew"):
            print("[INFO] 正在尝试使用 'brew services start redis' 启动服务...")
            subprocess.run(["brew", "services", "start", "redis"], capture_output=True)
            time.sleep(2)  # Redis is fast
            try:
                redis_client = redis.Redis(host=redis_host, port=int(redis_port), password=redis_pass, socket_connect_timeout=3)
                redis_client.ping()
                print("[INFO] Redis 自动启动成功。")
            except Exception as exc:
                print(f"[ERROR] 自动启动后 Redis 仍无法连接 (Addr: {redis_addr})。请检查配置或手动启动。")
                raise RuntimeError(f"Redis connection failed: {exc}") from exc
        else:
            raise RuntimeError("[ERROR] 无法连接到 Redis。请在运行 'dev' 之前确保 Redis 已启动。")


def _resolve_path(base_dir: str, value: Optional[str], default: str) -> str:
    """Resolve relative path values against base_dir."""

    path_value = value or default
    return os.path.abspath(path_value) if os.path.isabs(path_value) else os.path.abspath(
        os.path.join(base_dir, path_value)
    )


async def _stream_output(name: str, stream: asyncio.StreamReader, color: str):
    """Prefix and forward subprocess stream output."""

    prefix = f"[{name}] "
    reset = "\033[0m"
    async for line in stream:
        text = line.decode(errors="ignore").rstrip("\n")
        print(f"{color}{prefix}{text}{reset}")


async def _terminate_process(proc: asyncio.subprocess.Process):
    """Terminate a subprocess and its children."""

    if proc.returncode is not None:
        return
    if proc.pid:
        try:
            # Use os.killpg to kill the entire process group, ensuring children (like pnpm's node) die
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return # Process already dead
    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        if proc.pid:
            print(f"[WARN] 进程 {proc.pid} 未能在 5 秒内终止，强制终止...")
            os.killpg(proc.pid, signal.SIGKILL)


# 【修复点 1：恢复丢失的辅助函数定义】
def _resolve_nginx_logs(config: config_loader.DeployConfig, repo_root_resolved: str) -> Tuple[Path, Path]:
    """Resolve Nginx access/error log paths using shared deploy config semantics."""

    access_log_cfg = config.get("nginx", "access_log", fallback="") if config.has_section("nginx") else ""
    error_log_cfg = config.get("nginx", "error_log", fallback="") if config.has_section("nginx") else ""

    log_dir_cfg = ""
    if not access_log_cfg or not error_log_cfg:
        if config.has_section("logging"):
            log_dir_cfg = config.get("logging", "nginx_log_dir", fallback="") or config.get("logging", "log_dir", fallback="")

    base_log_dir = Path(log_dir_cfg or os.path.join(repo_root_resolved, "logs/nginx"))
    if not base_log_dir.is_absolute():
        base_log_dir = Path(repo_root_resolved) / base_log_dir
    access_log_path = Path(access_log_cfg) if access_log_cfg else base_log_dir / "access.log"
    error_log_path = Path(error_log_cfg) if error_log_cfg else base_log_dir / "error.log"

    if not access_log_cfg or not error_log_cfg:
        print(f"[WARN] Nginx 日志路径未在 [nginx] 节中明确配置，将回退到: {base_log_dir}")

    if not access_log_path.is_absolute():
        access_log_path = Path(repo_root_resolved) / access_log_path
    if not error_log_path.is_absolute():
        error_log_path = Path(repo_root_resolved) / error_log_path

    access_log_path.parent.mkdir(parents=True, exist_ok=True)
    error_log_path.parent.mkdir(parents=True, exist_ok=True)
    access_log_path.touch(exist_ok=True)
    error_log_path.touch(exist_ok=True)

    print(f"[INFO] 正在监控 Nginx access log: {access_log_path}")
    print(f"[INFO] 正在监控 Nginx error log: {error_log_path}")

    return access_log_path, error_log_path
# 【修复点 1 结束】


async def run_dev(config_path: str):
    """Launch full development stack using provided TOML config."""

    checker = DependencyChecker()
    if checker.run() != 0:
        raise RuntimeError("[ERROR] 依赖检查未通过，无法启动 dev 模式。")

    deploy_config = config_loader.load_deploy_config(config_path)
    config_data = deploy_config._data  # noqa: SLF001 - 使用标准化后的配置字典

    project_paths_cfg = _find_value(config_data, "project_paths") or {}

    repo_path_cfg = project_paths_cfg.get("repo_path") or "."
    repo_root_resolved = (
        os.path.abspath(repo_path_cfg)
        if os.path.isabs(repo_path_cfg)
        else os.path.abspath(os.path.join(REPO_ROOT, repo_path_cfg))
    )

    env_vars: Dict[str, str] = get_app_env_vars(deploy_config)
    env_vars.update(get_python_service_env_vars(deploy_config))

    for key in ("JWT_PRIVATE_KEY_PATH", "JWT_PUBLIC_KEY_PATH"):
        path_value = env_vars.get(key)
        if path_value:
            resolved_path = _resolve_path(repo_root_resolved, path_value, path_value)
            env_vars[key] = resolved_path
            if not os.path.exists(resolved_path):
                raise RuntimeError(
                    f"[ERROR] {key} 对应的密钥文件不存在: {resolved_path}。请更新配置或运行 scripts/generate_keys.sh 生成密钥。"
                )

    os.environ.update(env_vars)

    _preflight_checks(env_vars)

    nginx_cfg = _find_value(config_data, "nginx") or {}

    # 【修复点 2：调用现在已定义的函数】
    access_log, error_log = _resolve_nginx_logs(deploy_config, repo_root_resolved)

    frontend_dir = _resolve_path(repo_root_resolved, project_paths_cfg.get("frontend_app_dir"), "apps/workspace-web")
    backend_service_dir = _resolve_path(repo_root_resolved, project_paths_cfg.get("backend_service_dir"), "services/site-auth")
    python_service_dir = _resolve_path(repo_root_resolved, project_paths_cfg.get("python_service_dir"), "services/agent-bridge")
    python_venv_dir = _resolve_path(
        repo_root_resolved,
        project_paths_cfg.get("python_venv_path"),
        os.path.join("services", "agent-bridge", ".venv"),
    )
    py_executable = os.path.join(python_venv_dir, "bin", "python")

    python_host = deploy_config.get("python_agent", "listen_host", fallback="0.0.0.0")
    python_port = str(deploy_config.get("python_agent", "listen_port", fallback="8050"))

    # 7. 配置并重载 Nginx，使 upstream 与配置保持一致
    if check_nginx_installed():
        is_linux = platform.system() == "Linux"
        try:
            setup_nginx_config(deploy_config, repo_root_resolved, is_linux=is_linux)
            run(["nginx", "-t"], cwd=repo_root_resolved)
            # reload may fail if nginx is not running; ignore failure but log
            reload_result = subprocess.run(
                ["nginx", "-s", "reload"], cwd=repo_root_resolved, capture_output=True, text=True
            )
            if reload_result.returncode != 0:
                print(
                    f"[WARN] nginx -s reload 失败（可能未运行），stderr: {reload_result.stderr.strip()}。尝试启动 nginx..."
                )
                service_name = nginx_cfg.get("service_name") if isinstance(nginx_cfg, dict) else None
                # 尝试启动已安装的 nginx，若失败则继续，让用户查看日志
                subprocess.run([service_name or "nginx"], cwd=repo_root_resolved, check=False)
            
            # 【BUG FIX：确保 Nginx 稳定启动】
            # 将同步的 time.sleep(1) 替换为异步的 asyncio.sleep(2)，确保 Nginx 端口完全开启。
            print("[INFO] 等待 Nginx 服务稳定 (2s)...")
            await asyncio.sleep(2) # <--- 修复后的代码
            
            if not check_nginx_health(repo_root_resolved):
                print("[WARN] Nginx 健康检查未通过，请检查 nginx 日志。")
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] Nginx 配置或重载失败: {exc}")
    else:
        print("[WARN] 本机未安装 Nginx，跳过网关配置和日志合并。")

    commands: List[Tuple[str, List[str], str, Optional[str]]] = [
        ("WEB", ["pnpm", "-C", frontend_dir, "dev"], "\033[95m", repo_root_resolved),
        ("AUTH", ["go", "run", "./cmd/server"], "\033[94m", backend_service_dir),
        (
            "AGENT",
            [
                py_executable,
                "-m",
                "uvicorn",
                "agent_bridge.app:app",
                "--host",
                python_host,
                "--port",
                python_port,
            ],
            "\033[92m",
            python_service_dir,
        ),
        ("NGINX_A", ["tail", "-F", str(access_log)], "\033[93m", repo_root_resolved),
        ("NGINX_E", ["tail", "-F", str(error_log)], "\033[91m", repo_root_resolved),
    ]

    # 6. 启动并管理进程
    processes = []
    stream_tasks = []
    stop_event = asyncio.Event()

    def _handle_sigint():
        print("\n[INFO] 收到中断信号，正在停止所有进程...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    try:
        loop.add_signal_handler(signal.SIGINT, _handle_sigint)
    except NotImplementedError:
        pass # Windows 不支持 add_signal_handler

    env = os.environ.copy()

    try:
        for name, cmd, color, cwd in commands:
            print(f"[INFO] 正在启动 [{name}]... $ {' '.join(cmd)}")
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd or REPO_ROOT,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                # start_new_session=True (POSIX) or CREATE_NEW_PROCESS_GROUP (Windows)
                # 'preexec_fn=os.setsid' on Unix is the key to killing process groups
                preexec_fn=os.setsid if platform.system() != "Windows" else None,
            )
            processes.append(proc)
            if proc.stdout:
                stream_tasks.append(asyncio.create_task(_stream_output(name, proc.stdout, color)))
            if proc.stderr:
                stream_tasks.append(asyncio.create_task(_stream_output(name, proc.stderr, color)))

        print("[SUCCESS] 所有服务已启动。正在合并日志... (按 Ctrl+C 停止)")
        await stop_event.wait()

    finally:
        print("[INFO] 正在关闭所有服务...")
        await asyncio.gather(*[_terminate_process(proc) for proc in processes], return_exceptions=True)
        for task in stream_tasks:
            task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.gather(*stream_tasks, return_exceptions=True)
        print("[INFO] 所有服务已关闭。")


def install_dependencies(scope: Optional[str] = None):
    """Install all project dependencies (Node.js, Go, Python)./安装所有项目依赖（Node.js、Go、Python）。"""
    
    print('[INFO] 开始安装项目依赖...\n')
    
    install_frontend = scope is None or scope == 'frontend'
    install_go = scope is None or scope == 'go'
    install_python = scope is None or scope == 'python'
    
    step_num = 1
    total_steps = sum([install_frontend, install_go, install_python])
    
    # 1. Frontend dependencies (pnpm)
    if install_frontend:
        print(f'[{step_num}/{total_steps}] 安装前端依赖 (pnpm)...')
        step_num += 1
        try:
            _ensure_node_dependencies()
        except RuntimeError as exc:
            print(exc)
            print('[WARN] 前端环境检查未通过，跳过前端依赖安装')
        else:
            run(['pnpm', 'install'])
            # husky
            run(['pnpm', 'dlx', 'husky', 'install'], check=False)
            print('[OK] 前端依赖安装完成')
    
    # 2. Go dependencies (go mod)
    if install_go:
        print(f'\n[{step_num}/{total_steps}] 安装 Go 依赖 (go mod)...')
        step_num += 1
        if not which('go'):
            print('[WARN] Go not found, skip go dependencies')
        else:
            run(['go', 'mod', 'download'], cwd=os.path.join(REPO_ROOT, 'services', 'site-auth'))
            print('[OK] Go 依赖安装完成')
            
    # 3. Python dependencies (pip)
    if install_python:
        print(f'\n[{step_num}/{total_steps}] 安装 Python 依赖 (pip)...')
        step_num += 1
        if not which('python3'):
            print('[WARN] Python 3 not found, skip python dependencies')
        else:
            py_root = os.path.join(REPO_ROOT, 'services', 'agent-bridge')
            
            # *** FIX: 使用 .venv ***
            venv_path = os.path.join(py_root, '.venv')
            
            # 强制检查：如果我们是在旧版的 python3.9 生成的环境中，把它删了重新生成，否则包依赖全乱了
            if os.path.exists(venv_path) and os.path.exists(os.path.join(venv_path, 'lib', 'python3.9')):
                print('[WARN] 检测到旧版的 Python 3.9 venv，正在清理并使用您的新版 Python 重新创建...')
                shutil.rmtree(venv_path)

            if not os.path.exists(venv_path):
                print('[INFO] Creating Python virtual environment at .venv ...')
                run(['python3', '-m', 'venv', '.venv'], cwd=py_root)
            
            # *** FIX: 使用 .venv/bin/pip ***
            pip_executable = os.path.join(venv_path, 'bin', 'pip')
            # 升级 pip 以避免较旧的 pip (比如 Python 3.9 自带的 21.x) 无法识别 pyproject.toml 导致 Editable Mode 报错
            run([pip_executable, 'install', '--upgrade', 'pip'], cwd=py_root)
            run([pip_executable, 'install', '-e', '.'], cwd=py_root)
            # 安装 dev 依赖 (psycopg2, redis)
            run([pip_executable, 'install', 'psycopg2-binary', 'redis'], cwd=py_root)
            print('[OK] Python 依赖安装完成')
            
    print('\n[SUCCESS] 依赖安装完毕。')


def db_up():
    """Start database containers (docker compose)./启动数据库容器 (docker compose)。"""
    
    cmd = compose_base()
    if not cmd:
        print('[WARN] Docker not found. 请手动启动 PostgreSQL (5432) 和 Redis (6379)。')
        return
        
    print('[INFO] 启动 PostgreSQL (5432) 和 Redis (6379) 容器...')
    run(cmd + ['up', '-d'])


def db_down():
    """Stop database containers (docker compose)./停止数据库容器 (docker compose)。"""
    
    cmd = compose_base()
    if not cmd:
        print('[WARN] Docker not found.')
        return
        
    print('[INFO] 停止数据库容器...')
    run(cmd + ['down'])


def db_logs():
    """Show database container logs (docker compose)./查看数据库容器日志 (docker compose)。"""
    
    cmd = compose_base()
    if not cmd:
        print('[ERROR] Docker not found.')
        return
        
    print('[INFO] 查看数据库日志 (Ctrl+C 退出)...')
    try:
        run(cmd + ['logs', '-f'])
    except KeyboardInterrupt:
        pass


def db_psql():
    """Connect to dockerized PostgreSQL via psql./通过 psql 连接到 Docker 中的 PostgreSQL。"""
    
    cmd = compose_base()
    if not cmd:
        print('[ERROR] Docker not found.')
        return
        
    print('[INFO] 连接到 PostgreSQL 容器 (输入 \\q 退出)...')
    # Use default credentials from docker-compose.db.yml
    run(cmd + ['exec', '-u', 'postgres', 'db', 'psql', '-d', 'orbitaskflow_dev'])


def _get_migrate_cmd() -> Optional[List[str]]:
    """Determine migrate command (docker or local)./确定 migrate 命令（docker 或本地）。"""
    
    # 1. Docker
    if docker_available():
        print('[INFO] 使用 Docker (migrate/migrate) 执行迁移...')
        cmd = compose_base()
        if not cmd:
            return None # Should not happen if docker_available() is true
        
        db_url = env_or_default("SITE_AUTH_DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/orbitaskflow?sslmode=disable")
        # Ensure we connect to the isolated docker service "postgres" rather than external localhost/db
        db_url = db_url.replace("@localhost:", "@postgres:").replace("@127.0.0.1:", "@postgres:").replace("@db:", "@postgres:")
        
        # Mount /migrations, set PG URL, run
        return cmd + [
            'run', '--rm',
            '-v', f'{REPO_ROOT}/migrations:/migrations',
            '--entrypoint', 'migrate',
            'migrate',
            '-database', db_url,
            '-path', '/migrations'
        ]
        
    # 2. Local
    if which('migrate'):
        print('[INFO] 使用本机 (migrate) 执行迁移...')
        if not os.environ.get('SITE_AUTH_DATABASE_URL'):
            print('[ERROR] 未找到 migrate。请设置 SITE_AUTH_DATABASE_URL 环境变量。')
            return None
        return [
            'migrate',
            '-database', os.environ['SITE_AUTH_DATABASE_URL'],
            '-path', f'{REPO_ROOT}/migrations'
        ]
        
    # 3. Fail
    print('[ERROR] 未找到 migrate。请安装 golang-migrate CLI 或 Docker。')
    print('  (macOS: brew install golang-migrate)')
    return None


def migrate_run(action: str, arg: str = ''):
    """Run a migration command (up/down/version)./执行迁移命令 (up/down/version)。"""
    
    cmd_base = _get_migrate_cmd()
    if not cmd_base:
        sys.exit(1)
        
    if action == 'up':
        run(cmd_base + ['up'])
    elif action == 'down':
        cmd = cmd_base + ['down']
        if arg:
            cmd.append(arg)
        run(cmd)
    elif action == 'version':
        run(cmd_base + ['version'])


def migrate_docker(action: str, force_version: str = '', steps: str = ''):
    """Run migration via Docker (force/reset/down)./通过 Docker 执行迁移 (force/reset/down)。"""
    
    cmd_base = _get_migrate_cmd()
    if not cmd_base or not docker_available():
        print('[ERROR] Docker 运行 migrate 失败。')
        sys.exit(1)

    if action == 'force':
        if not force_version:
            print('[ERROR] migrate force <version> is required')
            sys.exit(1)
        print(f'[WARN] 强制迁移版本至 {force_version}...')
        run(cmd_base + ['force', force_version])
    elif action == 'reset':
        print('[WARN] 重置数据库 (down all)...')
        run(cmd_base + ['down', '-all'])
        print('[INFO] 重新应用所有迁移 (up all)...')
        run(cmd_base + ['up'])
    elif action == 'down':
        cmd = cmd_base + ['down']
        if steps:
            cmd.append(steps)
        run(cmd)
    else:
        run(cmd_base + [action])


def migrate_reset():
    """Reset database (down all, up all)./重置数据库（全 down，全 up）。"""
    
    if not os.environ.get('CI'):
        confirm = input('[DANGER] 确定要重置数据库吗？所有数据将丢失！(y/N): ')
        if confirm.lower() != 'y':
            print('取消。')
            return
            
    cmd_base = _get_migrate_cmd()
    if not cmd_base:
        sys.exit(1)
        
    print('[WARN] 重置数据库 (down all)...')
    run(cmd_base + ['down', '-all'])
    print('[INFO] 重新应用所有迁移 (up all)...')
    run(cmd_base + ['up'])


def migrate_create_skeleton(name: str):
    """Create new migration skeleton files (up/down)./创建新迁移骨架文件 (up/down)。"""
    
    if not which('migrate'):
        print('[ERROR] 需要本机安装 golang-migrate (brew install golang-migrate) 才能创建迁移文件。')
        sys.exit(1)
        
    print(f'[INFO] 创建迁移骨架: {name}...')
    # We don't use _get_migrate_cmd() because create doesn't need DB URL
    run(['migrate', 'create', '-ext', 'sql', '-dir', f'{REPO_ROOT}/migrations', name])


def setup(skip_guards: bool = False):
    """Run full setup: install + db + migrate./执行完整安装：安装 + 数据库 + 迁移。"""
    
    # 1. Install dependencies
    install_dependencies()
    
    # 2. Run CI checks (unless skipped)
    if not skip_guards:
        print('\n[INFO] 运行 CI 检查 (lint/typecheck/build)...')
        run_ci()
        
    # 3. Start DB
    print('\n[INFO] 启动（或确认）数据库...')
    db_up()
    
    # 4. Run migrations
    print('\n[INFO] 运行数据库迁移...')
    # Ensure local migrate has DB URL if docker is not used
    if not docker_available() and not os.environ.get('SITE_AUTH_DATABASE_URL'):
        print('[WARN] 检测到本地 migrate，但缺少 SITE_AUTH_DATABASE_URL 环境变量')
        print('       设置默认值: postgresql://postgres:mysecretpassword@localhost:5432/orbitaskflow_dev?sslmode=disable')
        os.environ['SITE_AUTH_DATABASE_URL'] = 'postgresql://postgres:mysecretpassword@localhost:5432/orbitaskflow_dev?sslmode=disable'
        
    migrate_run('up')
    
    print('\n[SUCCESS] 新智流 (Orbitaskflow) 本地环境设置完毕!')
    print('  - 运行 `python scripts/otf.py dev --config <config.toml>` 启动所有服务')
    print('  - 运行 `python scripts/otf.py db psql` 连接数据库')


def run_turbo(cmd: str, scope: str):
    """Run a turbo command (lint/typecheck/build/test)./执行 turbo 命令。"""

    try:
        _ensure_node_dependencies()
    except RuntimeError as exc:
        print(exc)
        sys.exit(1)
    run(['pnpm', 'dlx', 'turbo', 'run', cmd, f'--filter={scope}'])


def run_ci():
    """Run local CI workflow including lint/typecheck/build./执行包含 lint/typecheck/build 的本地 CI 工作流。"""

    try:
        _ensure_node_dependencies()
    except RuntimeError as exc:
        print(exc)
        sys.exit(1)
    # mimic CI: lint/typecheck/build (incremental) + depcheck for web
    run(['pnpm', 'dlx', 'turbo', 'run', 'lint', 'typecheck', 'build', '--filter=...[HEAD]'], check=False)
    run(['pnpm', 'dlx', 'depcheck', 'apps/workspace-web', '--skip-missing=true'], check=False)
    print('[OK] local CI finished')


def main():
    """Parse CLI arguments and dispatch to tooling commands./解析命令行参数并分发工具命令。"""

    parser = argparse.ArgumentParser(description='Orbitaskflow Tooling')
    sub = parser.add_subparsers(dest='cmd', required=True)

    sub.add_parser('check', help='Check environment prerequisites (Node.js, pnpm)')
    sub.add_parser('check-deps', help='Comprehensive dependency checker (all languages and system deps)')
    p_install = sub.add_parser('install', help='Install all project dependencies (Node.js, Go, Python)')
    p_install.add_argument('--scope', default=None, help='Scope to specific service (e.g., frontend, go, python)')
    p_setup = sub.add_parser('setup')
    p_setup.add_argument('--skip-guards', action='store_true', help='Skip lint/typecheck/build preflight')

    p_dev = sub.add_parser('dev', help='Run all services in dev mode with unified log')
    p_dev.add_argument('--config', required=True, help='Path to dev TOML config file')

    # db commands
    p_db = sub.add_parser('db')
    p_db.add_argument('action', choices=['up', 'down', 'logs', 'psql'])

    # migrate commands
    p_mig = sub.add_parser('migrate')
    p_mig.add_argument('action', choices=['up', 'down', 'version', 'force', 'create', 'reset'])
    p_mig.add_argument('arg', nargs='?', default='')  # steps for down, version for force, name for create

    for t in ['lint', 'typecheck', 'build', 'test']:
        pt = sub.add_parser(t)
        pt.add_argument('--scope', default=WORKSPACE_WEB)

    sub.add_parser('ci')

    args = parser.parse_args()

    if args.cmd == 'check':
        sys.exit(DependencyChecker().run())
    elif args.cmd == 'check-deps':
        sys.exit(DependencyChecker().run())
    elif args.cmd == 'install':
        install_dependencies(args.scope)
    elif args.cmd == 'setup':
        setup(args.skip_guards)
    elif args.cmd == 'dev':
        try:
            asyncio.run(run_dev(args.config))
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            sys.exit(1)
        except KeyboardInterrupt:
            print("\n[INFO] Dev server stopped.")
    elif args.cmd == 'db':
        if args.action == 'up':
            db_up()
        elif args.action == 'down':
            db_down()
        elif args.action == 'logs':
            db_logs()
        elif args.action == 'psql':
            db_psql()
    elif args.cmd == 'migrate':
        action = args.action
        try:
            if action == 'create':
                if not args.arg:
                    print('[ERROR] migrate create <name> is required')
                    sys.exit(1)
                migrate_create_skeleton(args.arg)
                return
            if action == 'reset':
                migrate_reset()
                return
            
            # Set default DB URL for local migrate if docker is not used
            if not docker_available() and not os.environ.get('SITE_AUTH_DATABASE_URL'):
                 print('[WARN] 检测到本地 migrate，但缺少 SITE_AUTH_DATABASE_URL 环境变量')
                 print('       设置默认值: postgresql://postgres:mysecretpassword@localhost:5432/orbitaskflow_dev?sslmode=disable')
                 os.environ['SITE_AUTH_DATABASE_URL'] = 'postgresql://postgres:mysecretpassword@localhost:5432/orbitaskflow_dev?sslmode=disable'

            if docker_available():
                if action == 'force':
                    migrate_docker('force', force_version=args.arg)
                elif action == 'down':
                    migrate_docker('down', steps=args.arg)
                elif action == 'reset':
                    migrate_docker('reset')
                else:
                    migrate_docker(action)
            else:
                # local migrate
                if action == 'force':
                    print('[ERROR] "force" is only supported via Docker to prevent accidents.')
                    sys.exit(1)
                elif action == 'reset':
                    print('[ERROR] "reset" is only supported via Docker to prevent accidents.')
                    sys.exit(1)
                else:
                    migrate_run(action, args.arg)
        except Exception as e:
            print(f'[ERROR] Migration failed: {e}')
            sys.exit(1)
    elif args.cmd in ['lint', 'typecheck', 'build', 'test']:
        run_turbo(args.cmd, args.scope)
    elif args.cmd == 'ci':
        run_ci()


if __name__ == '__main__':
    # Ensure script root is in path for 'scripts.config_loader' import
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    main()
