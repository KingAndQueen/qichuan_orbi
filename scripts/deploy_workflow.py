from __future__ import annotations
"""Abstract deployment workflow shared by platform scripts./供各平台脚本复用的抽象部署流程。"""

import os
import time
from abc import ABC, abstractmethod
from typing import Dict

from .deploy_common import (
    PYTHON_VERSION_REQUIREMENT,
    get_app_env_vars,
    get_migration_env_vars,
    get_python_service_env_vars,
    log_file_path,
    pid_file_path,
    print_color,
    resolve_python_interpreter,
    run_command,
    start_service_daemon,
    stop_pid_file,
)
from .config_loader import DeployConfig


class DeployWorkflow(ABC):
    """Shared deployment workflow for platform scripts./面向不同平台脚本的通用部署流程。"""

    def __init__(self, config: DeployConfig, config_path: str) -> None:
        """Store configuration and initialise state./保存配置并初始化运行状态。"""

        self.config = config
        self.config_path = config_path
        self.repo_path = os.path.abspath(config.get("project_paths", "repo_path"))
        self._infrastructure_ready = False
        self._app_services_started = False

    @property
    @abstractmethod
    def platform_name(self) -> str:
        """Provide platform label for logging./提供用于日志的人类可读平台名称。"""

    @abstractmethod
    def ensure_all_dependencies(self, skip_check: bool = False) -> None:
        """Ensure all dependencies (project and system) are installed./确保所有依赖（项目和系统）都已安装。
        
        Args:
            skip_check: If True, skip dependency checking and installation./如果为 True，跳过依赖检查和安装。
        """

    @abstractmethod
    def check_dependencies(self) -> None:
        """Validate platform prerequisites./验证特定平台的前置条件。"""

    @abstractmethod
    def setup_infrastructure(self) -> None:
        """Start PostgreSQL and Redis services (assumes they are already installed)./启动 PostgreSQL 与 Redis 服务（假设已安装）。"""

    @abstractmethod
    def stop_infrastructure(self) -> None:
        """Stop infrastructure services for the platform./停止平台相关的基础设施服务。"""

    @abstractmethod
    def stop_command_hint(self) -> str:
        """Return CLI guidance for stopping services./返回停止服务时的命令提示。"""

    def setup_nginx(self) -> None:
        """Setup Nginx gateway (optional, can be overridden)./设置 Nginx 网关（可选，可被覆盖）。"""
        # Default implementation does nothing./默认实现不执行任何操作。
        # Platform-specific implementations should override this./平台特定实现应覆盖此方法。
        pass

    def ensure_database_objects(self) -> None:
        """Ensure database user and schema exist before migrations./在迁移前确保数据库用户与库存在。"""

    def configure_migration_env(self, env: Dict[str, str]) -> Dict[str, str]:
        """Allow platforms to adjust migration environment variables./允许平台按需调整迁移所需的环境变量。"""
        return env

    def pnpm_install_command(self) -> str:
        """Return pnpm install command string./返回 pnpm install 命令字符串。"""

        return "pnpm install"

    def start(self, skip_deps_check: bool = False) -> None:
        """Run the full deployment pipeline for the platform./执行平台的完整部署流水线。
        
        Args:
            skip_deps_check: If True, skip dependency checking and installation./如果为 True，跳过依赖检查和安装。
        """

        print_color(f"--- 开始部署 Orbitaskflow ({self.platform_name} 模式) ---", "blue")
        try:
            # Initialize log directories early if logging is configured
            # 如果配置了日志，提前初始化日志目录
            self._ensure_log_directories()
            
            # Step 0: Ensure all dependencies are installed./步骤 0：确保所有依赖都已安装。
            if not skip_deps_check:
                self.ensure_all_dependencies(skip_check=False)
            else:
                print_color("跳过依赖检查（--skip-deps-check）。", "yellow")
            
            # Step 1: Check basic prerequisites and permissions./步骤 1：检查基本前置条件和权限。
            self.check_dependencies()
            
            # Step 2: Start infrastructure services (assumes installed)./步骤 2：启动基础设施服务（假设已安装）。
            self.setup_infrastructure()
            self._infrastructure_ready = True

            # Step 3: Configure Nginx (assumes installed)./步骤 3：配置 Nginx（假设已安装）。
            self.setup_nginx()

            migration_env = get_migration_env_vars(self.config)
            self.run_migrations(migration_env)

            app_env = get_app_env_vars(self.config)
            self.build_frontend(app_env)
            self.build_backend()
            self.prepare_python_service()
            self.start_app_services(app_env)
            self._app_services_started = True

            self.print_success_messages(app_env)
        except Exception as exc:
            print_color("\n--- 部署失败 ---", "red")
            print_color(f"错误: {exc}", "red")
            print_color("部署失败，正在尝试回滚（停止）已启动的应用...", "yellow")
            self.stop()
            raise

    def stop(self, *, manual: bool = False) -> None:
        """Stop services started during deployment./停止部署期间启动的所有服务。"""

        print_color("--- 停止所有已启动的服务 ---", "blue")
        if manual or self._app_services_started:
            self.stop_app_services()
        if manual or self._infrastructure_ready:
            self.stop_infrastructure()

    # --- Shared step implementations -------------------------------------------------

    def run_migrations(self, env: Dict[str, str]) -> None:
        """Execute database migrations for the project./执行项目的数据库迁移。"""

        print_color("--- 步骤 3: 执行数据库迁移 ---", "blue")

        migrations_dir = os.path.join(self.repo_path, "migrations")
        if not os.path.isdir(migrations_dir):
            print_color("未找到 'migrations' 目录，跳过迁移。", "yellow")
            return

        self.ensure_database_objects()

        migrate_cmd = self.config.get("executables", "migrate_cli_path")
        db_url = env["DATABASE_URL"]

        migrate_env = os.environ.copy()
        migrate_env.update(env)
        migrate_env["PGPASSWORD"] = self.config.get("database", "password")
        migrate_env = self.configure_migration_env(migrate_env)

        full_migrate_cmd = f"{migrate_cmd} -path {migrations_dir} -database \"{db_url}\" up"
        print_color("直接调用 migrate CLI...", "yellow")

        success, output = run_command(full_migrate_cmd, cwd=self.repo_path, env=migrate_env, use_shell=True)

        if not success:
            print_color(
                "迁移失败。请确保: \n1. '{migrate_cmd}' 可执行。\n2. 数据库已启动。\n3. 错误: {output}",
                "red",
            )
            raise Exception("数据库迁移失败")

        print_color("数据库迁移成功。", "green")

    def build_frontend(self, env: Dict[str, str]) -> None:
        """Build the Next.js frontend application./构建 Next.js 前端应用。"""

        print_color("--- 步骤 4: 构建前端应用 (Next.js) ---", "blue")

        print_color("安装 pnpm 根依赖...", "yellow")
        success, _ = run_command(self.pnpm_install_command(), cwd=self.repo_path)
        if not success:
            raise Exception("pnpm install 失败")

        frontend_app_dir = self.config.get("project_paths", "frontend_app_dir")
        cache_dir = os.path.join(self.repo_path, frontend_app_dir, ".next")
        print_color(f"清理旧的前端缓存: {cache_dir}", "yellow")
        run_command(f"rm -rf {cache_dir}", cwd=self.repo_path, use_shell=True)

        print_color(f"构建 Next.js 应用 ({frontend_app_dir})...", "yellow")
        build_cmd = f"pnpm -C {frontend_app_dir} build"
        success, _ = run_command(build_cmd, cwd=self.repo_path, env=env)
        if not success:
            raise Exception("Next.js 构建失败")
        print_color("前端应用构建成功。", "green")

    def build_backend(self) -> None:
        """Compile the Go backend service binary./编译 Go 后端服务二进制。"""

        print_color("--- 步骤 5: 构建后端服务 (Go) ---", "blue")
        backend_dir = os.path.join(self.repo_path, self.config.get("project_paths", "backend_service_dir"))
        bin_path = os.path.join(self.repo_path, self.config.get("project_paths", "backend_bin_path"))

        os.makedirs(os.path.dirname(bin_path), exist_ok=True)

        go_proxy = self.config.get("backend_go", "go_proxy", fallback="").strip()

        build_env = os.environ.copy()
        if go_proxy:
            build_env["GOPROXY"] = go_proxy
            print_color(f"使用 Go 代理: {go_proxy}", "yellow")

        build_cmd = f"go build -o {bin_path} ./cmd/server"
        print_color(f"构建 Go 二进制文件到 {bin_path}...", "yellow")

        success, _ = run_command(build_cmd, cwd=backend_dir, env=build_env)
        if not success:
            raise Exception("Go 后端服务构建失败")
        print_color("Go 后端服务构建成功。", "green")

    def prepare_python_service(self) -> None:
        """Prepare Python virtual environment and dependencies./准备 Python 虚拟环境与依赖。"""

        print_color("--- 步骤 6: 准备 Python Agent Bridge 服务 ---", "blue")

        if not self.config.has_option("project_paths", "python_service_dir"):
            print_color("未在配置中找到 Python 服务目录，跳过准备步骤。", "yellow")
            return

        service_dir = os.path.join(self.repo_path, self.config.get("project_paths", "python_service_dir"))
        if not os.path.isdir(service_dir):
            raise Exception(f"未找到 Python Agent Bridge 服务目录: {service_dir}")

        venv_path = os.path.join(self.repo_path, self.config.get("project_paths", "python_venv_path"))
        configured_python = self.config.get("python_agent", "python_bin", fallback="python3").strip()
        python_candidate = configured_python or "python3"
        allow_fallback = python_candidate == "python3"
        python_bin, python_version = resolve_python_interpreter(python_candidate, allow_fallback=allow_fallback)

        requirement_label = ".".join(str(x) for x in PYTHON_VERSION_REQUIREMENT)
        if python_bin != python_candidate:
            print_color(
                f"检测到 '{python_candidate}' 无法满足 Python>={requirement_label}，改用 {python_bin} ({python_version})",
                "yellow",
            )
        else:
            print_color(f"使用 Python 解释器 {python_bin} (版本 {python_version})", "yellow")

        venv_python = os.path.join(venv_path, "bin", "python")
        if not os.path.exists(venv_python):
            os.makedirs(os.path.dirname(venv_path), exist_ok=True)
            print_color(f"创建虚拟环境: {venv_path}", "yellow")
            success, _ = run_command(f"{python_bin} -m venv {venv_path}", cwd=service_dir)
            if not success:
                raise Exception("创建 Python 虚拟环境失败")

        pip_exec = os.path.join(venv_path, "bin", "pip")
        if not os.path.exists(pip_exec):
            raise Exception("未找到虚拟环境中的 pip，可尝试删除后重新部署。")

        print_color("升级 pip...", "yellow")
        success, _ = run_command(f"{pip_exec} install --upgrade pip", cwd=service_dir)
        if not success:
            raise Exception("升级 pip 失败")

        print_color("安装 Agent Bridge 依赖...", "yellow")
        success, _ = run_command(f"{pip_exec} install -e .", cwd=service_dir)
        if not success:
            raise Exception("安装 Agent Bridge 依赖失败")

        print_color("Python Agent Bridge 依赖准备完成。", "green")

    def start_app_services(self, app_env: Dict[str, str]) -> None:
        """Launch backend, Python bridge, and frontend services./启动后端、Python 桥接以及前端服务。"""

        print_color("--- 步骤 7: 启动应用服务 ---", "blue")
        run_dir = os.path.join(self.repo_path, self.config.get("project_paths", "run_dir"))
        os.makedirs(run_dir, exist_ok=True)
        
        # Get unified log directory if configured
        # 获取统一日志目录（如果已配置）
        log_dir = None
        if self.config.has_section("logging"):
            log_dir_config = self.config.get("logging", "log_dir", fallback="").strip()
            if log_dir_config:
                log_dir = os.path.join(self.repo_path, log_dir_config)
                # Log directories should already be created in _ensure_log_directories()
                # 日志目录应该已经在 _ensure_log_directories() 中创建了
            else:
                print_color("警告: logging.log_dir 未配置，日志将写入 run 目录", "yellow")

        backend_bin = os.path.join(self.repo_path, self.config.get("project_paths", "backend_bin_path"))
        backend_dir = os.path.dirname(backend_bin)
        os.chmod(backend_bin, 0o755)

        start_service_daemon(
            cmd=f'"{backend_bin}"',
            cwd=backend_dir,
            env=app_env,
            log_file=log_file_path(run_dir, "backend", log_dir),
            pid_file=pid_file_path(run_dir, "backend"),
            name="Go Backend (site-auth)",
        )

        print_color("等待 Go 后端启动 (3秒)...", "yellow")
        time.sleep(3)

        if not self.config.has_option("project_paths", "python_service_dir"):
            print_color("未配置 Python Agent Bridge 服务目录，跳过启动。", "yellow")
        else:
            python_env = get_python_service_env_vars(self.config)
            venv_path = os.path.join(self.repo_path, self.config.get("project_paths", "python_venv_path"))
            uvicorn_exec = os.path.join(venv_path, "bin", "uvicorn")
            if not os.path.exists(uvicorn_exec):
                raise Exception("未找到 uvicorn 可执行文件，请确认 Python 服务依赖已正确安装。")

            python_service_dir = os.path.join(self.repo_path, self.config.get("project_paths", "python_service_dir"))
            listen_host = self.config.get("python_agent", "listen_host", fallback="0.0.0.0")
            listen_port = self.config.get("python_agent", "listen_port", fallback="8050")

            start_service_daemon(
                cmd=f'"{uvicorn_exec}" agent_bridge.app:app --host {listen_host} --port {listen_port}',
                cwd=python_service_dir,
                env=python_env,
                log_file=log_file_path(run_dir, "agent_bridge", log_dir),
                pid_file=pid_file_path(run_dir, "agent_bridge"),
                name="Python Agent Bridge",
            )

            print_color("等待 Python Agent Bridge 启动 (2秒)...", "yellow")
            time.sleep(2)

        frontend_dir = os.path.join(self.repo_path, self.config.get("project_paths", "frontend_app_dir"))

        start_service_daemon(
            cmd="pnpm start",
            cwd=frontend_dir,
            env=app_env,
            log_file=log_file_path(run_dir, "frontend", log_dir),
            pid_file=pid_file_path(run_dir, "frontend"),
            name="Next.js Frontend (workspace-web)",
        )

    def stop_app_services(self) -> None:
        """Stop all app-level daemonised services./停止所有应用层守护进程服务。"""

        run_dir = os.path.join(self.repo_path, self.config.get("project_paths", "run_dir"))
        stop_pid_file("Go Backend", pid_file_path(run_dir, "backend"), self.repo_path)
        stop_pid_file("Python Agent Bridge", pid_file_path(run_dir, "agent_bridge"), self.repo_path)
        stop_pid_file("Next.js Frontend", pid_file_path(run_dir, "frontend"), self.repo_path)

    def _ensure_log_directories(self) -> None:
        """Ensure log directories exist early in the deployment process.
        在部署过程早期确保日志目录存在。
        """
        if not self.config.has_section("logging"):
            return
        
        # Get log_dir from config and check if it's empty
        # 从配置中获取 log_dir 并检查是否为空
        log_dir_config = self.config.get("logging", "log_dir", fallback="").strip()
        if not log_dir_config:
            print_color("警告: logging.log_dir 未配置，跳过统一日志目录创建", "yellow")
            return
        
        log_dir = os.path.join(self.repo_path, log_dir_config)
        
        # Create base log directory
        # 创建基础日志目录
        os.makedirs(log_dir, exist_ok=True)
        
        # Create all log subdirectories
        # 创建所有日志子目录
        subdirs = [
            "app/backend",
            "app/agent-bridge", 
            "app/frontend",
            "nginx",
            "deploy"
        ]
        
        for subdir in subdirs:
            full_path = os.path.join(log_dir, subdir)
            os.makedirs(full_path, exist_ok=True)
        
        print_color(f"日志目录已创建: {log_dir}", "green")
        
        # Setup log rotation if enabled
        # 如果启用了日志轮转，设置轮转
        if self.config.get("logging", "enable_rotation", fallback="false").lower() == "true":
            self._setup_log_rotation(log_dir)
    
    def _setup_log_rotation(self, log_dir: str) -> None:
        """Setup log rotation if enabled./如果启用，设置日志轮转。"""
        try:
            rotate_script = os.path.join(self.repo_path, "scripts", "logs", "rotate.sh")
            if os.path.exists(rotate_script):
                # Make script executable
                # 使脚本可执行
                os.chmod(rotate_script, 0o755)
                print_color("日志轮转已启用", "green")
                print_color(f"  手动运行轮转: bash {rotate_script}", "yellow")
                print_color(f"  设置自动轮转: bash scripts/logs/setup_rotation.sh", "yellow")
        except Exception as e:
            print_color(f"警告: 设置日志轮转时出错: {e}", "yellow")

    def print_success_messages(self, app_env: Dict[str, str]) -> None:
        """Display final deployment endpoints for operators./向运维人员展示部署后的访问端点。"""

        print_color("\n--- 部署成功! ---", "green")
        print_color(f"Go 后端服务应在: {app_env['SITE_AUTH_SERVICE_URL']}", "green")
        frontend_host = self.config.get("frontend_next", "listen_host")
        frontend_port = self.config.get("frontend_next", "listen_port")
        print_color(f"Next.js 前端应在: http://{frontend_host}:{frontend_port}", "green")

        if "NEXT_PUBLIC_AGENT_GATEWAY_WS_URL" in app_env:
            print_color(
                f"Next.js WebSocket 网关应在: {app_env['NEXT_PUBLIC_AGENT_GATEWAY_WS_URL']}",
                "green",
            )

        python_host = self.config.get("python_agent", "listen_host", fallback="0.0.0.0")
        host_display = "localhost" if python_host in ("0.0.0.0", "::") else python_host
        python_port = self.config.get("python_agent", "listen_port", fallback="8050")
        print_color(
            f"Python Agent Bridge 应在: http://{host_display}:{python_port}",
            "green",
        )
        print_color(f"要停止所有服务, 请运行: {self.stop_command_hint()}", "yellow")
