#!/usr/bin/env python3

"""Linux deployment helper for Orbitaskflow./Orbitaskflow 自动化部署脚本（Linux 版）。

Important operational notes./运行须知：
* The script targets apt/systemctl based Linux distributions (Ubuntu/Debian)./本脚本专为使用 apt 与 systemctl 的 Linux 发行版（如 Ubuntu/Debian）设计。
* Run with sudo so packages and services can be managed./需要使用 sudo 运行，以便安装软件包并管理系统服务。
* `deploy_config.toml` is the default configuration and should be copied per environment./默认读取 `deploy_config.toml`，部署前请复制并按需调整。

The workflow includes package verification, service bootstrapping, and app builds./脚本流程依次检查系统依赖、启动数据库服务并构建后端和前端。"""

import argparse
import os
import sys
import time
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


def check_service_installed(pkg_name: str, repo_path: str) -> bool:
    """Verify a package exists via dpkg output./通过 dpkg 输出验证软件包是否已安装。"""

    print_color(f"检查 {pkg_name} 是否已安装...", "yellow")
    success, output = run_command(
        "dpkg -l | grep -E '^[a-z]i  {pkg_name}'",
        cwd=repo_path,
        capture_output=True,
        use_shell=True,
    )
    # dpkg reports installed packages with a status starting in ``ii``./dpkg 以 ``ii`` 前缀表示软件包已安装。
    return bool(output and pkg_name in output)


def check_service_running(service_name: str, repo_path: str) -> bool:
    """Determine whether a systemd service is active./检测 systemd 服务是否处于活动状态。"""

    print_color(f"检查 {service_name} 是否正在运行...", "yellow")
    success, _ = run_command(f"systemctl is-active --quiet {service_name}", cwd=repo_path)
    # systemctl exits with 0 when the target service is active./当服务处于活跃状态时 systemctl 以 0 退出。
    return success


def wait_for_postgres(repo_path: str, env: Dict[str, str], config: DeployConfig) -> None:
    """Block until PostgreSQL is responsive./等待 PostgreSQL 就绪。"""

    print_color("等待 PostgreSQL 启动...", "yellow")

    if not check_executable("pg_isready"):
        print_color("'pg_isready' 未找到，跳过等待检查。请确保 postgresql-client 已正确安装。", "yellow")
        time.sleep(10)
        return

    for _ in range(20):
        # Use pg_isready to probe readiness with credentials./使用 pg_isready 携带凭据探测数据库就绪状态。
        cmd = (
            "pg_isready -h {host} -p {port} -U {user} -d {db}".format(
                host=config.get("database", "host"),
                port=config.get("database", "port"),
                user=config.get("database", "user"),
                db=config.get("database", "db_name"),
            )
        )

        env_with_pass = env.copy()
        env_with_pass["PGPASSWORD"] = config.get("database", "password")

        print_color(f"正在尝试: {cmd}", "yellow")
        success, output = run_command(cmd, cwd=repo_path, env=env_with_pass, capture_output=True, use_shell=True)

        if success and "accepting connections" in (output or ""):
            print_color("PostgreSQL 已准备就绪。", "green")
            return

        print_color(f"等待中... (输出: {output})", "yellow")
        time.sleep(1)

    print_color("等待 PostgreSQL 启动超时。", "red")
    raise RuntimeError("PostgreSQL 启动失败或超时")


class LinuxDeployer(DeployWorkflow):
    """Deploy workflow tailored to Linux hosts./面向 Linux 主机的部署流程实现。"""

    @property
    def platform_name(self) -> str:
        """Expose the human-readable platform name./返回用于日志的人类可读平台名称。"""

        return "Linux"

    def ensure_all_dependencies(self, skip_check: bool = False) -> None:
        """Ensure all dependencies (project and system) are installed./确保所有依赖（项目和系统）都已安装。"""
        if skip_check:
            return
        
        print_color("--- 步骤 0: 检查并安装所有依赖 ---", "blue")
        
        # Check permissions first (Linux requires sudo)./首先检查权限（Linux 需要 sudo）。
        if os.geteuid() != 0:
            print_color("错误: 此脚本必须以 sudo 权限运行，以便安装和管理系统依赖。", "red")
            print_color("请尝试: sudo python3 deploy_linux.py ...", "yellow")
            raise RuntimeError("需要 sudo 权限")
        
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
        pg_pkg = self.config.get("linux_packages", "postgres_pkg")
        pg_client_pkg = self.config.get("linux_packages", "postgres_client_pkg")
        redis_pkg = self.config.get("linux_packages", "redis_pkg")
        
        pkgs_to_install = []
        if not check_service_installed(pg_pkg, self.repo_path):
            pkgs_to_install.append(pg_pkg)
        if not check_service_installed(pg_client_pkg, self.repo_path):
            pkgs_to_install.append(pg_client_pkg)
        if not check_service_installed(redis_pkg, self.repo_path):
            pkgs_to_install.append(redis_pkg)
        
        if pkgs_to_install:
            print_color(f"安装系统依赖: {', '.join(pkgs_to_install)}...", "yellow")
            run_command("apt-get update", cwd=self.repo_path, check_sudo=True)
            install_cmd = f"DEBIAN_FRONTEND=noninteractive apt-get -y install {' '.join(pkgs_to_install)}"
            success, _ = run_command(install_cmd, cwd=self.repo_path, check_sudo=True, use_shell=True)
            if not success:
                print_color("系统依赖安装失败。", "red")
                raise RuntimeError("系统依赖安装失败")
            print_color("系统依赖（PostgreSQL/Redis）安装完成。", "green")
        
        # Nginx
        if not check_nginx_installed():
            print_color("安装 Nginx 网关...", "yellow")
            run_command("apt-get update", cwd=self.repo_path, check_sudo=True)
            run_command("DEBIAN_FRONTEND=noninteractive apt-get -y install nginx", cwd=self.repo_path, check_sudo=True, use_shell=True)
            print_color("Nginx 安装完成。", "green")
        
        print_color("所有依赖检查完成。", "green")

    def check_dependencies(self) -> None:
        """Confirm required binaries and privileges exist./确认存在必要的可执行文件与权限。"""

        if os.geteuid() != 0:
            print_color("错误: 此脚本必须以 sudo 权限运行，以便安装和管理系统服务。", "red")
            print_color("请尝试: sudo python3 deploy_linux.py ...", "yellow")
            raise RuntimeError("需要 sudo 权限")

        deps = [
            "python3",
            "node",
            "pnpm",
            "go",
            self.config.get("executables", "migrate_cli_path"),
            "apt-get",
            "systemctl",
            "dpkg",
        ]

        missing = [dep for dep in deps if dep and not check_executable(dep)]
        if missing:
            print_color(f"错误: 缺少以下依赖项: {', '.join(missing)}", "red")
            raise RuntimeError("缺少依赖项")

        print_color("所有依赖项均已满足。", "green")

    def setup_infrastructure(self) -> None:
        """Start PostgreSQL and Redis services (assumes they are already installed)./启动 PostgreSQL 与 Redis 服务（假设已安装）。"""

        print_color("--- 步骤 2: 启动基础设施 (DB 和 Redis) ---", "blue")

        pg_service = self.config.get("linux_packages", "postgres_service_name")
        redis_service = self.config.get("linux_packages", "redis_service_name")

        if not check_service_running(pg_service, self.repo_path):
            # Ensure PostgreSQL is started and enabled on boot./确保 PostgreSQL 已启动并设置为开机自启。
            print_color(f"{pg_service} 未运行，正在启动...", "yellow")
            run_command(f"systemctl start {pg_service}", cwd=self.repo_path, check_sudo=True)
            run_command(f"systemctl enable {pg_service}", cwd=self.repo_path, check_sudo=True)

        if not check_service_running(redis_service, self.repo_path):
            # Bring Redis online and enable auto-start./启动 Redis 并启用自启。 
            print_color(f"{redis_service} 未运行，正在启动...", "yellow")
            run_command(f"systemctl start {redis_service}", cwd=self.repo_path, check_sudo=True)
            run_command(f"systemctl enable {redis_service}", cwd=self.repo_path, check_sudo=True)

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
            setup_nginx_config(self.config, self.repo_path, is_linux=True)
        except Exception as e:
            print_color(f"Nginx 配置失败: {e}", "red")
            raise

        # Test nginx configuration./测试 nginx 配置。
        test_success, test_output = run_command(
            "nginx -t", cwd=self.repo_path, check_sudo=True, capture_output=True, use_shell=True
        )
        if not test_success:
            print_color(f"Nginx 配置测试失败: {test_output}", "red")
            raise RuntimeError("Nginx 配置测试失败")

        # Reload nginx configuration./重新加载 nginx 配置。
        reload_success, _ = run_command(
            "nginx -s reload", cwd=self.repo_path, check_sudo=True, capture_output=True, use_shell=True
        )
        if not reload_success:
            # If reload fails, try starting nginx./如果重新加载失败，尝试启动 nginx。
            service_name = self.config.get("nginx", "service_name", fallback="nginx")
            if not check_service_running(service_name, self.repo_path):
                print_color(f"正在启动 {service_name}...", "yellow")
                run_command(f"systemctl start {service_name}", cwd=self.repo_path, check_sudo=True)
                run_command(f"systemctl enable {service_name}", cwd=self.repo_path, check_sudo=True)

        # Health check./健康检查。
        import time
        time.sleep(2)  # Wait for Nginx to start./等待 Nginx 启动。
        if not check_nginx_health(self.repo_path):
            raise RuntimeError("Nginx 启动失败或健康检查未通过")

        print_color("Nginx 网关准备就绪。", "green")

    def ensure_database_objects(self) -> None:
        """Create database and role if they are missing./在缺失时创建数据库及其角色。"""

        print_color(
            f"确保数据库 '{self.config.get('database', 'db_name')}' 和用户 '{self.config.get('database', 'user')}' 存在...",
            "yellow",
        )

        db_name = self.config.get("database", "db_name")
        db_user = self.config.get("database", "user")
        db_pass = self.config.get("database", "password")

        sql_check_user = f"SELECT 1 FROM pg_roles WHERE rolname='{db_user}'"
        _, user_exists = run_command(
            f"sudo -u postgres psql -tAc \"{sql_check_user}\"",
            cwd=self.repo_path,
            capture_output=True,
            use_shell=True,
        )

        if "1" not in (user_exists or ""):
            print_color(f"用户 '{db_user}' 不存在，正在创建...", "yellow")
            sql_create_user = f"CREATE USER {db_user} WITH PASSWORD '{db_pass}';"
            run_command(f"sudo -u postgres psql -c \"{sql_create_user}\"", cwd=self.repo_path, use_shell=True)

        sql_check_db = f"SELECT 1 FROM pg_database WHERE datname='{db_name}'"
        _, db_exists = run_command(
            f"sudo -u postgres psql -tAc \"{sql_check_db}\"",
            cwd=self.repo_path,
            capture_output=True,
            use_shell=True,
        )

        if "1" not in (db_exists or ""):
            print_color(f"数据库 '{db_name}' 不存在，正在创建...", "yellow")
            sql_create_db = f"CREATE DATABASE {db_name} OWNER {db_user};"
            run_command(f"sudo -u postgres psql -c \"{sql_create_db}\"", cwd=self.repo_path, use_shell=True)

    def pnpm_install_command(self) -> str:
        """Return the pnpm install invocation for Linux./返回 Linux 平台使用的 pnpm install 命令。"""

        return "pnpm install --unsafe-perm"

    def stop_infrastructure(self) -> None:
        """Stop database services to cleanly shut down the stack./停止数据库服务以实现干净关机。"""

        pg_service = self.config.get("linux_packages", "postgres_service_name")
        redis_service = self.config.get("linux_packages", "redis_service_name")

        print_color(f"正在停止 {pg_service}...", "yellow")
        run_command(f"systemctl stop {pg_service}", cwd=self.repo_path, check_sudo=True)

        print_color(f"正在停止 {redis_service}...", "yellow")
        run_command(f"systemctl stop {redis_service}", cwd=self.repo_path, check_sudo=True)

    def stop_command_hint(self) -> str:
        """Provide CLI guidance for stopping services./提供停止服务时的命令提示。"""

        return f"sudo python3 deploy_linux.py --config {self.config_path} --action stop"


def main(config_path: str, action: str, skip_deps_check: bool = False) -> None:
    """Run the Linux deployment workflow according to the action flag./按照动作标志运行 Linux 部署流程。"""

    if not os.path.exists(config_path):
        print_color(f"配置文件未找到: {config_path}", "red")
        sys.exit(1)

    try:
        config = load_deploy_config(config_path)
    except (FileNotFoundError, ValueError, ModuleNotFoundError) as exc:
        print_color(str(exc), "red")
        sys.exit(1)

    deployer = LinuxDeployer(config, config_path)

    if action == "stop":
        # Allow operators to stop services without rebuilding./允许运维人员直接停止服务而无需重新构建。
        deployer.stop(manual=True)
        print_color("服务停止完成。", "green")
        return

    try:
        deployer.start(skip_deps_check=skip_deps_check)
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orbitaskflow 自动化部署脚本 (Linux 版)")
    parser.add_argument(
        "-c",
        "--config",
        default="deploy_config.toml",
        help="指向部署配置文件的路径 (默认: deploy_config.toml)",
    )

    parser.add_argument(
        "-a",
        "--action",
        choices=["start", "stop"],
        default="start",
        help="执行的操作: 'start' (部署) 或 'stop' (停止服务)",
    )
    parser.add_argument(
        "--skip-deps-check",
        action="store_true",
        help="跳过依赖检查和安装（用于 CI/CD 或已知依赖已就绪的场景）",
    )

    args = parser.parse_args()

    main(config_path=args.config, action=args.action, skip_deps_check=args.skip_deps_check)
