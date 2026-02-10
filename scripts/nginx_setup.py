"""Nginx setup and configuration helpers./Nginx 安装和配置辅助函数。"""

from __future__ import annotations

import os
import shutil
from typing import Dict, Tuple

from .config_loader import DeployConfig
from .deploy_common import check_executable, print_color, run_command


def check_nginx_installed() -> bool:
    """Check if Nginx is installed./检查 Nginx 是否已安装。"""
    return check_executable("nginx")


def check_nginx_health(repo_path: str, timeout: int = 30, max_retries: int = 3) -> bool:
    """Check if Nginx is healthy./检查 Nginx 是否健康。"""
    import time

    for attempt in range(max_retries):
        # Check if Nginx process is running./检查 Nginx 进程是否运行。
        success, _ = run_command(
            "pgrep -f nginx", cwd=repo_path, capture_output=True, use_shell=True
        )
        if success:
            # Check if configuration file exists./检查配置文件是否存在。
            # Test nginx configuration./测试 nginx 配置。
            test_success, _ = run_command(
                "nginx -t", cwd=repo_path, capture_output=True, use_shell=True
            )
            if test_success:
                return True

        if attempt < max_retries - 1:
            time.sleep(2)

    return False


def setup_nginx_config(
    config: DeployConfig, repo_path: str, is_linux: bool
) -> Tuple[str, str]:
    """Setup Nginx configuration file./设置 Nginx 配置文件。

    Returns:
        Tuple of (config_source_path, config_target_path)
    """
    env = config.get("nginx", "environment", fallback="development")
    env_lower = env.lower()
    # Map environment value to config suffix: "development" -> "dev", "production" -> "prod"
    # 将环境值映射到配置后缀："development" -> "dev"，"production" -> "prod"
    env_suffix = {
        "development": "dev",
        "dev": "dev",
        "production": "prod",
        "prod": "prod",
    }.get(env_lower, env_lower)
    config_source = os.path.join(repo_path, "nginx", "config", f"nginx.{env_suffix}.conf")

    if not os.path.exists(config_source):
        raise FileNotFoundError(f"Nginx config file not found: {config_source}")

    if is_linux:
        config_target = config.get("nginx", "config_dir_linux", fallback="/etc/nginx/sites-available/orbitaskflow")
        config_enabled = config.get("nginx", "config_enabled_linux", fallback="/etc/nginx/sites-enabled/orbitaskflow")
    else:
        config_target = config.get("nginx", "config_dir_macos", fallback="/usr/local/etc/nginx/servers/orbitaskflow.conf")
        config_enabled = config_target  # macOS typically doesn't use sites-enabled

    # Fix main Nginx configuration first to avoid port conflicts
    # 首先修复 Nginx 主配置文件以避免端口冲突
    fix_nginx_main_config(is_linux)
    
    # Ensure target directory exists./确保目标目录存在。
    target_dir = os.path.dirname(config_target)
    if not os.path.exists(target_dir):
        print_color(f"创建 Nginx 配置目录: {target_dir}", "yellow")
        run_command(f"mkdir -p {target_dir}", cwd=repo_path, check_sudo=is_linux, use_shell=True)

    # Read source config and replace environment variables./读取源配置并替换环境变量。
    with open(config_source, "r", encoding="utf-8") as f:
        config_content = f.read()

    # Replace ALLOWED_ORIGINS./替换 ALLOWED_ORIGINS。
    allowed_origins = config.get("backend_go", "allowed_origins", fallback="http://localhost:5174")
    config_content = config_content.replace("${{ALLOWED_ORIGINS}}", allowed_origins)

    # Replace frontend upstream host/port to avoid hardcoded 127.0.0.1:5174./
    # 使用配置的前端主机和端口替换硬编码的 127.0.0.1:5174。
    frontend_host = config.get("frontend_next", "listen_host", fallback="127.0.0.1")
    frontend_port = config.get("frontend_next", "listen_port", fallback="5174")

    # Normalize wildcard hosts to localhost for Nginx upstreams./
    # 将 0.0.0.0 或 :: 归一化为 localhost，供 Nginx 访问。
    if frontend_host in ("0.0.0.0", "::"):
        frontend_host = "127.0.0.1"

    upstream_endpoint = f"{frontend_host}:{frontend_port}"
    config_content = config_content.replace("127.0.0.1:5174", upstream_endpoint)
    
    # Replace log paths with absolute paths from config./使用配置中的绝对路径替换日志路径。
    if config.has_section("logging"):
        # Get nginx_log_dir from config
        # 从配置中获取 nginx_log_dir
        nginx_log_dir_config = config.get("logging", "nginx_log_dir", fallback="./logs/nginx").strip()
        if nginx_log_dir_config:
            # Convert to absolute path if relative
            # 如果是相对路径，转换为绝对路径
            if not os.path.isabs(nginx_log_dir_config):
                nginx_log_dir = os.path.join(repo_path, nginx_log_dir_config)
            else:
                nginx_log_dir = nginx_log_dir_config
            
            # Ensure nginx log directory exists (and parent directories)
            # 确保 nginx 日志目录存在（包括父目录）
            os.makedirs(nginx_log_dir, exist_ok=True)
            print_color(f"Nginx 日志目录: {nginx_log_dir}", "green")
            
            # Replace relative log paths with absolute paths
            # 将相对日志路径替换为绝对路径
            abs_access_log = os.path.join(nginx_log_dir, "access.log")
            abs_error_log = os.path.join(nginx_log_dir, "error.log")
            
            # Replace logs/nginx/access.log with absolute path
            # 将 logs/nginx/access.log 替换为绝对路径
            config_content = config_content.replace(
                "logs/nginx/access.log",
                abs_access_log
            )
            config_content = config_content.replace(
                "logs/nginx/error.log",
                abs_error_log
            )
        else:
            print_color("警告: logging.nginx_log_dir 未配置，Nginx 将使用默认日志路径", "yellow")

    # Write to target location./写入目标位置。
    temp_config = os.path.join(repo_path, "run", "nginx.conf.tmp")
    os.makedirs(os.path.dirname(temp_config), exist_ok=True)
    with open(temp_config, "w", encoding="utf-8") as f:
        f.write(config_content)

    # Copy to final location with sudo if needed./如果需要，使用 sudo 复制到最终位置。
    copy_cmd = f"cp {temp_config} {config_target}"
    run_command(copy_cmd, cwd=repo_path, check_sudo=is_linux, use_shell=True)

    # On Linux, create symlink in sites-enabled if it doesn't exist./在 Linux 上，如果不存在，在 sites-enabled 中创建符号链接。
    if is_linux and config_enabled != config_target:
        enabled_dir = os.path.dirname(config_enabled)
        if not os.path.exists(enabled_dir):
            run_command(f"mkdir -p {enabled_dir}", cwd=repo_path, check_sudo=is_linux, use_shell=True)
        
        # Remove existing symlink if it exists./如果存在，删除现有符号链接。
        if os.path.exists(config_enabled) or os.path.islink(config_enabled):
            run_command(f"rm -f {config_enabled}", cwd=repo_path, check_sudo=is_linux, use_shell=True)
        
        # Create symlink./创建符号链接。
        symlink_cmd = f"ln -s {config_target} {config_enabled}"
        run_command(symlink_cmd, cwd=repo_path, check_sudo=is_linux, use_shell=True)

    print_color(f"Nginx 配置文件已部署: {config_target}", "green")
    return config_source, config_target


def fix_nginx_main_config(is_linux: bool) -> None:
    """Fix Nginx main configuration to ensure it uses our server configs and doesn't conflict with port 8080.
    修复 Nginx 主配置文件，确保使用我们的服务器配置且不与 8080 端口冲突。
    
    This function:
    - Ensures the main config includes servers directory
    - Comments out any default listen 8080 configurations
    - Creates a minimal main config if it doesn't exist
    """
    # Find Nginx prefix based on platform
    # 根据平台查找 Nginx 前缀
    if is_linux:
        nginx_prefix = "/etc/nginx"
    else:
        # Try Apple Silicon first, then Intel
        # 先尝试 Apple Silicon，然后 Intel
        if os.path.exists("/opt/homebrew/etc/nginx"):
            nginx_prefix = "/opt/homebrew/etc/nginx"
        elif os.path.exists("/usr/local/etc/nginx"):
            nginx_prefix = "/usr/local/etc/nginx"
        else:
            print_color("警告: 未找到 Nginx 配置目录，跳过主配置文件修复", "yellow")
            return
    
    main_conf = os.path.join(nginx_prefix, "nginx.conf")
    servers_dir = os.path.join(nginx_prefix, "servers")
    
    if os.path.isdir(nginx_prefix):
        command_cwd = nginx_prefix
    else:
        command_cwd = os.getcwd()

    # Ensure servers directory exists
    # 确保 servers 目录存在
    if not os.path.exists(servers_dir):
        print_color(f"创建 Nginx servers 目录: {servers_dir}", "yellow")
        run_command(
            f"mkdir -p {servers_dir}",
            cwd=command_cwd,
            check_sudo=is_linux,
            use_shell=True,
        )
    
    # Backup main config if it exists
    # 如果主配置文件存在，先备份
    if os.path.exists(main_conf):
        backup_conf = f"{main_conf}.bak"
        if not os.path.exists(backup_conf):
            print_color(f"备份主配置文件: {backup_conf}", "yellow")
            run_command(
                f"cp {main_conf} {backup_conf}",
                cwd=command_cwd,
                check_sudo=is_linux,
                use_shell=True,
            )
        
        # Read current config
        # 读取当前配置
        with open(main_conf, "r", encoding="utf-8") as f:
            config_content = f.read()
        
        # Comment out any listen 8080 directives in the main config
        # 注释掉主配置文件中任何监听 8080 的指令
        import re
        original_content = config_content
        # Match lines with "listen 8080" (with optional whitespace)
        # 匹配包含 "listen 8080" 的行（允许可选空白）
        config_content = re.sub(
            r'^(\s*)listen\s+8080\s*;',
            r'\1# listen 8080;  # Commented out to avoid conflict with backend service',
            config_content,
            flags=re.MULTILINE
        )
        
        if config_content != original_content:
            print_color("已注释掉主配置文件中监听 8080 的配置", "yellow")
        
        # Ensure servers directory is included
        # 确保包含 servers 目录
        if "include servers" not in config_content and "include servers/*.conf" not in config_content:
            print_color("在主配置文件中添加 servers 目录配置", "yellow")
            # Try to find http block and add include
            # 尝试找到 http 块并添加 include
            if "http {" in config_content:
                # Add after http { or after first include
                # 在 http { 之后或第一个 include 之后添加
                if "include" in config_content:
                    # Add after first include line
                    # 在第一个 include 行之后添加
                    config_content = re.sub(
                        r'(include\s+[^;]+;)',
                        r'\1\n    include servers/*.conf;',
                        config_content,
                        count=1
                    )
                else:
                    # Add after http {
                    # 在 http { 之后添加
                    config_content = config_content.replace(
                        "http {",
                        "http {\n    include servers/*.conf;"
                    )
            else:
                # No http block, add it
                # 没有 http 块，添加它
                config_content += "\nhttp {\n    include servers/*.conf;\n}\n"
        
        # Write back the modified config
        # 写回修改后的配置
        temp_main_conf = os.path.join(os.path.dirname(main_conf), "nginx.conf.tmp")
        with open(temp_main_conf, "w", encoding="utf-8") as f:
            f.write(config_content)
        
        run_command(
            f"cp {temp_main_conf} {main_conf}",
            cwd=command_cwd,
            check_sudo=is_linux,
            use_shell=True,
        )
        os.remove(temp_main_conf)
        print_color(f"主配置文件已修复: {main_conf}", "green")
    else:
        # Create minimal main config if it doesn't exist
        # 如果主配置文件不存在，创建最小化配置
        print_color(f"创建最小化主配置文件: {main_conf}", "yellow")
        minimal_config = """worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    # Include server configurations
    include servers/*.conf;
}
"""
        temp_main_conf = os.path.join(os.path.dirname(main_conf), "nginx.conf.tmp")
        with open(temp_main_conf, "w", encoding="utf-8") as f:
            f.write(minimal_config)
        
        run_command(
            f"cp {temp_main_conf} {main_conf}",
            cwd=command_cwd,
            check_sudo=is_linux,
            use_shell=True,
        )
        os.remove(temp_main_conf)
        print_color(f"已创建主配置文件: {main_conf}", "green")


def get_nginx_env_vars(config: DeployConfig) -> Dict[str, str]:
    """Get environment variables for Nginx./获取 Nginx 的环境变量。"""
    env = {}
    # Nginx doesn't typically need env vars, but we can set them if needed./Nginx 通常不需要环境变量，但我们可以根据需要设置它们。
    return env
