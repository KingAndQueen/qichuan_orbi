#!/usr/bin/env python3

"""macOS deployment helper for Orbitaskflow./Orbitaskflow 自动化部署脚本（macOS 版）。

Overview of responsibilities./功能概述：
* Target platform: macOS with Homebrew (`brew`)./目标平台：依赖 Homebrew (`brew`) 的 macOS。
* Default config path is `deploy_config.toml`, copy per environment./默认配置为 `deploy_config.toml`，请根据环境复制调整。
* Automates prerequisite checks, package installation, and app builds./自动执行依赖检测、软件包安装以及应用构建。"""

import argparse
import os
import subprocess
import sys
import time
import urllib.parse
from typing import Dict

from scripts.deploy_common import (
    check_executable,
    get_migration_env_vars,
    print_color,
    run_command,
)
from scripts.config_loader import DeployConfig, load_deploy_config
from scripts.deploy_workflow import DeployWorkflow
from scripts.nginx_setup import (
    check_nginx_health,
    check_nginx_installed,
    setup_nginx_config,
)


def install_homebrew(repo_path: str) -> None:
    """Install Homebrew when not detected./在未检测到 Homebrew 时执行安装。"""

    print_color("未找到 Homebrew (brew)。正在尝试自动安装...", "yellow")
    cmd = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'

    print_color("请按照 Homebrew 安装提示进行操作（可能需要您输入密码）...", "bold")

    return_code = subprocess.run(
        cmd,
        shell=True,
        cwd=repo_path,
        encoding="utf-8",
    ).returncode

    if return_code != 0:
        print_color("Homebrew 安装失败。请手动安装 Homebrew 后重试。", "red")
        sys.exit(1)

    print_color("Homebrew 安装成功。", "green")
    print_color("!! 重要: 请根据 Homebrew 的提示，将 'brew' 添加到您的 shell 配置文件 (如 .zprofile) 中。", "bold")
    print_color("完成后，请重新运行此脚本。", "yellow")
    sys.exit(0)


def check_brew_installed(formula: str, repo_path: str) -> bool:
    """Check whether a brew formula exists locally./检查指定的 brew formula 是否已安装。"""

    print_color(f"检查 {formula} 是否已安装...", "yellow")
    success, _ = run_command(f"brew list {formula}", cwd=repo_path, capture_output=True, use_shell=True)
    return success


def check_brew_service_running(formula: str, repo_path: str) -> bool:
    """Determine if a brew service is active./判断 brew 服务是否处于运行状态。"""

    print_color(f"检查 {formula} 是否正在运行...", "yellow")
    success, output = run_command(
        f"brew services list | grep {formula}",
        cwd=repo_path,
        capture_output=True,
        use_shell=True,
    )
    return success and "started" in (output or "")


def wait_for_postgres(repo_path: str, env: Dict[str, str], config: DeployConfig) -> None:
    """Poll PostgreSQL readiness using pg_isready./通过 pg_isready 轮询 PostgreSQL 的就绪状态。"""

    print_color("等待 PostgreSQL 启动...", "yellow")

    if not check_executable("pg_isready"):
        print_color("错误: 'pg_isready' 未找到。无法确认 PostgreSQL 状态。", "red")
        print_color(
            f"请手动安装: brew install {config.get('macos_packages', 'postgres_formula')}",
            "yellow",
        )
        raise RuntimeError("'pg_isready' not found")

    for _ in range(20):
        # Use pg_isready to validate the brew-managed cluster status./使用 pg_isready 检查由 brew 管理的集群状态。
        cmd = (
            "pg_isready -h {host} -p {port} -U {user}".format(
                host=config.get("database", "host"),
                port=config.get("database", "port"),
                user=config.get("database", "user"),
            )
        )

        env_with_pass = env.copy()
        env_with_pass["PGPASSWORD"] = config.get("database", "password")

        success, output = run_command(cmd, cwd=repo_path, env=env_with_pass, capture_output=True)
        if success and "accepting connections" in (output or ""):
            print_color("PostgreSQL 已准备就绪。", "green")
            return
        time.sleep(1)

    print_color("等待 PostgreSQL 启动超时。", "red")
    raise RuntimeError("PostgreSQL 启动失败或超时")


class MacOSDeployer(DeployWorkflow):
    """macOS deployment workflow implementation./面向 macOS 平台的部署流程实现。"""

    @property
    def platform_name(self) -> str:
        """Return human friendly platform name./返回用于日志的人类可读平台名称。"""

        return "macOS"

    def ensure_all_dependencies(self, skip_check: bool = False) -> None:
        """Ensure all dependencies (project and system) are installed./确保所有依赖（项目和系统）都已安装。"""
        if skip_check:
            return
        
        print_color("--- 步骤 0: 检查并安装所有依赖 ---", "blue")
        
        # Check if Homebrew is installed./检查 Homebrew 是否已安装。
        if not check_executable("brew"):
            install_homebrew(self.repo_path)
        
        # Import dependency checker./导入依赖检查器。
        import sys
        sys.path.insert(0, self.repo_path)
        from scripts.check_dependencies import DependencyChecker
        
        # Run comprehensive dependency check./运行全面的依赖检查。
        print_color("正在检查所有依赖...", "yellow")
        checker = DependencyChecker()
        checker.check_node_dependencies()
        checker.check_go_dependencies()
        checker.check_python_dependencies()
        checker.check_system_dependencies()
        checker.check_file_dependencies()
        
        # Display detailed results./显示详细结果。
        print_color("\n" + "=" * 50, "blue")
        print_color("依赖检查结果汇总:", "blue")
        print_color(f"  ✓ 已安装: {len(checker.installed)} 项", "green")
        for name, version in checker.installed:
            print_color(f"    - {name}: {version}", "green")
        
        if checker.missing:
            print_color(f"  ✗ 缺失: {len(checker.missing)} 项", "red")
            for name, requirement in checker.missing:
                print_color(f"    - {name}: {requirement}", "red")
        
        if checker.warnings:
            print_color(f"  ⚠ 警告: {len(checker.warnings)} 项", "yellow")
            for warning in checker.warnings:
                print_color(f"    - {warning}", "yellow")
        
        # Install missing project dependencies./安装缺失的项目依赖。
        if checker.missing:
            print_color("\n开始安装缺失的依赖...", "yellow")
            
            # Install project dependencies via otf.py./通过 otf.py 安装项目依赖。
            print_color("安装项目依赖（Node.js/Go/Python 包）...", "yellow")
            otf_script = os.path.join(self.repo_path, "scripts", "otf.py")
            success, output = run_command(
                f"python3 {otf_script} install",
                cwd=self.repo_path,
                capture_output=True,
            )
            if not success:
                print_color("项目依赖安装失败。", "red")
                print_color("请手动运行: python3 scripts/otf.py install", "yellow")
                raise RuntimeError("项目依赖安装失败")
            print_color("项目依赖安装完成。", "green")
        
        # Install missing system dependencies./安装缺失的系统依赖。
        # PostgreSQL and Redis
        pg_formula = self.config.get("macos_packages", "postgres_formula")
        redis_formula = self.config.get("macos_packages", "redis_formula")
        
        formulas_to_install = []
        if not check_brew_installed(pg_formula, self.repo_path):
            formulas_to_install.append(pg_formula)
        if not check_brew_installed(redis_formula, self.repo_path):
            formulas_to_install.append(redis_formula)
        
        if formulas_to_install:
            print_color(f"安装系统依赖: {', '.join(formulas_to_install)}...", "yellow")
            run_command("brew update", cwd=self.repo_path)
            install_cmd = f"brew install {' '.join(formulas_to_install)}"
            success, _ = run_command(install_cmd, cwd=self.repo_path)
            if not success:
                print_color("系统依赖安装失败。", "red")
                print_color("如果某些操作需要 sudo 权限，请使用 sudo 运行整个脚本。", "yellow")
                raise RuntimeError("系统依赖安装失败")
            print_color("系统依赖（PostgreSQL/Redis）安装完成。", "green")
        
        # Nginx
        if not check_nginx_installed():
            print_color("安装 Nginx 网关...", "yellow")
            run_command("brew install nginx", cwd=self.repo_path, check_sudo=False)
            print_color("Nginx 安装完成。", "green")
        
        print_color("所有依赖检查完成。", "green")

    def check_dependencies(self) -> None:
        """Verify brew and runtime tooling is present./验证 brew 及运行时工具是否已经安装。"""

        if not check_executable("brew"):
            install_homebrew(self.repo_path)

        deps = [
            "python3",
            "node",
            "pnpm",
            "go",
            self.config.get("executables", "migrate_cli_path"),
            "brew",
        ]

        if not check_executable("pg_isready"):
            pg_formula = self.config.get("macos_packages", "postgres_formula")
            print_color(f"未找到 'pg_isready'。将在安装 {pg_formula} 后再次检查。", "yellow")
        else:
            deps.append("pg_isready")

        missing = [dep for dep in deps if dep and not check_executable(dep)]
        if missing:
            print_color(f"错误: 缺少以下依赖项: {', '.join(missing)}", "red")
            print_color("请运行 'brew install go node pnpm' 或安装缺失的工具。", "yellow")
            raise RuntimeError("缺少依赖项")

        print_color("所有依赖项均已满足。", "green")

    def setup_infrastructure(self) -> None:
        """Start PostgreSQL/Redis services (assumes they are already installed)./启动 PostgreSQL 与 Redis 服务（假设已安装）。"""

        print_color("--- 步骤 2: 启动基础设施 (DB 和 Redis) ---", "blue")

        pg_formula = self.config.get("macos_packages", "postgres_formula")
        redis_formula = self.config.get("macos_packages", "redis_formula")

        if not check_brew_service_running(pg_formula, self.repo_path):
            print_color(f"{pg_formula} 未运行，正在启动 (brew services)...", "yellow")
            run_command(f"brew services start {pg_formula}", cwd=self.repo_path)

        if not check_brew_service_running(redis_formula, self.repo_path):
            print_color(f"{redis_formula} 未运行，正在启动 (brew services)...", "yellow")
            run_command(f"brew services start {redis_formula}", cwd=self.repo_path)

        wait_for_postgres(self.repo_path, get_migration_env_vars(self.config), self.config)
        print_color("基础设施准备就绪。", "green")

    def setup_nginx(self) -> None:
        """Configure Nginx gateway (assumes it is already installed)./配置 Nginx 网关（假设已安装）。"""
        print_color("--- 步骤 3: 配置 Nginx 网关 ---", "blue")

        # Verify Nginx is installed./验证 Nginx 是否已安装。
        if not check_nginx_installed():
            print_color("错误: Nginx 未安装。请先运行依赖检查安装 Nginx。", "red")
            raise RuntimeError("Nginx 未安装")
        
        print_color("Nginx 已安装，开始配置...", "green")

        # Setup configuration./设置配置。
        try:
            setup_nginx_config(self.config, self.repo_path, is_linux=False)
        except Exception as e:
            print_color(f"Nginx 配置失败: {e}", "red")
            raise

        # Test nginx configuration./测试 nginx 配置。
        test_success, test_output = run_command(
            "nginx -t", cwd=self.repo_path, check_sudo=False, capture_output=True, use_shell=True
        )
        if not test_success:
            print_color(f"Nginx 配置测试失败: {test_output}", "red")
            raise RuntimeError("Nginx 配置测试失败")

        # Start Nginx directly (not using brew services to avoid launchctl issues)
        # 直接启动 Nginx（不使用 brew services 以避免 launchctl 问题）
        print_color("启动 Nginx 服务...", "yellow")
        
        # Check if nginx is already running
        # 检查 nginx 是否已在运行
        nginx_running, _ = run_command(
            "pgrep -f nginx", cwd=self.repo_path, capture_output=True, use_shell=True
        )
        
        if nginx_running:
            # If already running, reload configuration./如果已在运行，重新加载配置。
            print_color("Nginx 已在运行，重新加载配置...", "yellow")
            reload_success, reload_output = run_command(
                "nginx -s reload", cwd=self.repo_path, check_sudo=False, capture_output=True, use_shell=True
            )
            if not reload_success:
                print_color(f"警告: Nginx 配置重新加载失败: {reload_output}", "yellow")
                print_color("尝试停止并重新启动 Nginx...", "yellow")
                run_command("nginx -s stop", cwd=self.repo_path, check_sudo=False, capture_output=True, use_shell=True)
                time.sleep(1)
                start_success, start_output = run_command(
                    "nginx", cwd=self.repo_path, check_sudo=False, capture_output=True, use_shell=True
                )
                if not start_success:
                    print_color(f"Nginx 启动失败: {start_output}", "red")
                    raise RuntimeError("Nginx 启动失败")
        else:
            # Start nginx directly
            # 直接启动 nginx
            start_success, start_output = run_command(
                "nginx", cwd=self.repo_path, check_sudo=False, capture_output=True, use_shell=True
            )
            if not start_success:
                # Try with sudo if direct start fails
                # 如果直接启动失败，尝试使用 sudo
                print_color("尝试使用 sudo 启动 Nginx...", "yellow")
                start_success, start_output = run_command(
                    "sudo nginx", cwd=self.repo_path, check_sudo=False, capture_output=True, use_shell=True
                )
                if not start_success:
                    print_color(f"Nginx 启动失败: {start_output}", "red")
                    raise RuntimeError("Nginx 启动失败")
        
        print_color("Nginx 服务已启动", "green")

        # Health check./健康检查。
        import time
        time.sleep(2)  # Wait for Nginx to start./等待 Nginx 启动。
        if not check_nginx_health(self.repo_path):
            print_color("警告: Nginx 健康检查未通过，但继续部署。", "yellow")
            print_color("请手动检查 Nginx 服务状态。", "yellow")

        print_color("Nginx 网关配置完成。", "green")

    def ensure_database_objects(self) -> None:
        """Create roles and databases if they do not exist./在缺失时创建角色与数据库。"""

        print_color(
            f"确保数据库 '{self.config.get('database', 'db_name')}' 和用户 '{self.config.get('database', 'user')}' 存在...",
            "yellow",
        )

        db_name = self.config.get("database", "db_name")
        db_user = self.config.get("database", "user")

        sql_check_user = f"SELECT 1 FROM pg_roles WHERE rolname='{db_user}'"
        _, user_exists = run_command(
            f"psql -U $(whoami) -d postgres -tAc \"{sql_check_user}\"",
            cwd=self.repo_path,
            capture_output=True,
            use_shell=True,
        )

        if "1" not in (user_exists or ""):
            print_color(f"用户 '{db_user}' 不存在，正在创建...", "yellow")
            sql_create_user = (
                f"CREATE USER {db_user} WITH PASSWORD '{self.config.get('database', 'password')}' SUPERUSER;"
            )
            run_command(
                f"psql -U $(whoami) -d postgres -c \"{sql_create_user}\"",
                cwd=self.repo_path,
                use_shell=True,
            )

        sql_check_db = f"SELECT 1 FROM pg_database WHERE datname='{db_name}'"
        _, db_exists = run_command(
            f"psql -U $(whoami) -d postgres -tAc \"{sql_check_db}\"",
            cwd=self.repo_path,
            capture_output=True,
            use_shell=True,
        )

        if "1" not in (db_exists or ""):
            print_color(f"数据库 '{db_name}' 不存在，正在创建...", "yellow")
            sql_create_db = f"CREATE DATABASE {db_name} OWNER {db_user};"
            run_command(
                f"psql -U $(whoami) -d postgres -c \"{sql_create_db}\"",
                cwd=self.repo_path,
                use_shell=True,
            )

    def configure_migration_env(self, env: Dict[str, str]) -> Dict[str, str]:
        """Augment environment variables with brew PostgreSQL paths./使用 brew 的 PostgreSQL 路径补充环境变量。"""

        try:
            _, brew_prefix = run_command("brew --prefix", cwd=self.repo_path, capture_output=True)
            if brew_prefix:
                pg_brew_bin = os.path.join(
                    brew_prefix,
                    "opt",
                    self.config.get("macos_packages", "postgres_formula"),
                    "bin",
                )
                pg_brew_lib = os.path.join(
                    brew_prefix,
                    "opt",
                    self.config.get("macos_packages", "postgres_formula"),
                    "lib",
                )

                if os.path.isdir(pg_brew_bin):
                    env["PATH"] = f"{pg_brew_bin}:{env.get('PATH', '')}"
                if os.path.isdir(pg_brew_lib):
                    env["DYLD_LIBRARY_PATH"] = f"{pg_brew_lib}:{env.get('DYLD_LIBRARY_PATH', '')}"

                print_color(f"已将 {pg_brew_bin} 添加到 PATH 供 migrate 使用", "yellow")
        except Exception:
            print_color("无法获取 brew prefix，migrate 可能会失败（如果 libpq 不在 PATH 中）", "yellow")

        return env

    def stop_infrastructure(self) -> None:
        """Stop brew services started during deployment./停止部署过程中启动的 brew 服务。"""

        pg_formula = self.config.get("macos_packages", "postgres_formula")
        redis_formula = self.config.get("macos_packages", "redis_formula")

        print_color(f"正在停止 {pg_formula} (brew services)...", "yellow")
        run_command(f"brew services stop {pg_formula}", cwd=self.repo_path)

        print_color(f"正在停止 {redis_formula} (brew services)...", "yellow")
        run_command(f"brew services stop {redis_formula}", cwd=self.repo_path)

    def stop_command_hint(self) -> str:
        """Return CLI instructions for stopping services./返回停止服务的命令提示。"""

        return f"python3 deploy_macos.py --config {self.config_path} --action stop"


def run_setup_tasks(config: DeployConfig) -> None:
    """Run setup workflow including migrations and data import./运行包含迁移和数据导入的初始化流程。"""

    host = config.get("database", "host")
    port = config.get("database", "port")
    user = config.get("database", "user")
    password = urllib.parse.quote(config.get("database", "password"), safe="")
    db_name = config.get("database", "db_name")
    migrate_cli_path = config.get("executables", "migrate_cli_path")
    repo_path = config.get("project_paths", "repo_path")

    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db_name}?sslmode=disable"
    migration_path = os.path.join(repo_path, "migrations")

    print("[SETUP] 1/2: 正在执行数据库迁移...")
    migrate_command = [
        migrate_cli_path,
        "-database",
        dsn,
        "-path",
        migration_path,
        "up",
    ]
    migration_result = subprocess.run(
        migrate_command,
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    if migration_result.returncode != 0:
        print(migration_result.stderr)
        raise RuntimeError("数据库迁移失败")

    print("[SETUP] 2/2: 正在导入初始用户...")
    import_command = [
        "go",
        "run",
        "./services/site-auth/cmd/importer/main.go",
        "--file",
        "./services/site-auth/examples/accounts.csv",
    ]
    import_result = subprocess.run(
        import_command,
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    if import_result.returncode != 0:
        print(import_result.stderr)
        raise RuntimeError("初始数据导入失败")

    print("[SETUP] ✅ 环境初始化成功。")


def main(config_path: str, action: str, skip_deps_check: bool = False) -> None:
    """Execute macOS deployment according to the selected action./依据选择的动作执行 macOS 部署。"""

    if not os.path.exists(config_path):
        print_color(f"配置文件未找到: {config_path}", "red")
        sys.exit(1)

    try:
        config = load_deploy_config(config_path)
    except (FileNotFoundError, ValueError, ModuleNotFoundError) as exc:
        print_color(str(exc), "red")
        sys.exit(1)

    if action == "setup":
        try:
            run_setup_tasks(config)
        except Exception:
            sys.exit(1)
        print("[INFO] -----------------------------------")
        print("[INFO] ✅ 初始化 (Setup) 已完成。")
        print("[INFO] 您现在可以运行 'python3 deploy_macos.py --action start' 来启动服务。")
        return

    deployer = MacOSDeployer(config, config_path)

    if action == "stop":
        # Support graceful stop without running full deployment./支持在无需完整部署时优雅停止服务。
        deployer.stop(manual=True)
        print_color("服务停止完成。", "green")
        return

    if action == "start":
        try:
            deployer.start(skip_deps_check=skip_deps_check)
        except Exception:
            sys.exit(1)
    else:
        print_color(f"未知的 action: {action}", "red")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orbitaskflow 自动化部署脚本 (macOS 版)")
    parser.add_argument(
        "-c",
        "--config",
        default="deploy_config.toml",
        help="指向部署配置文件的路径 (默认: deploy_config.toml)",
    )

    parser.add_argument(
        "-a",
        "--action",
        choices=["start", "stop", "setup"],
        default="start",
        help="执行的操作: 'start' (部署)、'stop' (停止服务) 或 'setup' (初始化)",
    )
    parser.add_argument(
        "--skip-deps-check",
        action="store_true",
        help="跳过依赖检查和安装（用于 CI/CD 或已知依赖已就绪的场景）",
    )

    args = parser.parse_args()

    main(config_path=args.config, action=args.action, skip_deps_check=args.skip_deps_check)
