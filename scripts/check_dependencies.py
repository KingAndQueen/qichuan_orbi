#!/usr/bin/env python3
"""Comprehensive dependency checker for Orbitaskflow project.
全面的依赖检查工具，扫描并报告所有外部依赖的状态。"""

import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

REPO_ROOT = Path(__file__).parent.parent

# Add repo root to path for imports
sys.path.insert(0, str(REPO_ROOT))


class DependencyChecker:
    """Check all project dependencies./检查所有项目依赖。"""
    
    def __init__(self):
        self.missing = []
        self.installed = []
        self.warnings = []
    
    def check_executable(self, name: str, version_flag: str = '--version') -> Tuple[bool, str]:
        """Check if an executable exists and get its version./检查可执行文件是否存在并获取版本。"""
        try:
            result = subprocess.run(
                [name, version_flag],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0]
                return True, version
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        return False, ""
    
    def check_node_dependencies(self):
        """Check Node.js and pnpm./检查 Node.js 和 pnpm。"""
        print("检查 Node.js 依赖...")
        
        node_ok, node_ver = self.check_executable('node', '-v')
        if node_ok:
            print(f"  ✓ Node.js: {node_ver}")
            self.installed.append(('Node.js', node_ver))
        else:
            print("  ✗ Node.js: 未安装")
            self.missing.append(('Node.js', '需要 Node.js 20+'))
        
        pnpm_ok, pnpm_ver = self.check_executable('pnpm', '-v')
        if pnpm_ok:
            print(f"  ✓ pnpm: {pnpm_ver}")
            self.installed.append(('pnpm', pnpm_ver))
        else:
            print("  ✗ pnpm: 未安装")
            self.missing.append(('pnpm', '需要 pnpm 9+'))
    
    def check_go_dependencies(self):
        """Check Go and Go modules./检查 Go 和 Go 模块。"""
        print("\n检查 Go 依赖...")
        
        go_ok, go_ver = self.check_executable('go', 'version')
        if go_ok:
            print(f"  ✓ Go: {go_ver}")
            self.installed.append(('Go', go_ver))
            
            # Check Go services
            go_services = ['services/site-auth']
            for service_dir in go_services:
                service_path = REPO_ROOT / service_dir
                go_mod = service_path / 'go.mod'
                if go_mod.exists():
                    print(f"  ✓ {service_dir}: go.mod 存在")
                    # Try to verify dependencies
                    try:
                        result = subprocess.run(
                            ['go', 'list', '-m', 'all'],
                            cwd=service_path,
                            capture_output=True,
                            text=True,
                            timeout=10,
                        )
                        if result.returncode == 0:
                            deps_count = len([l for l in result.stdout.strip().split('\n') if l])
                            print(f"    → 已安装 {deps_count} 个 Go 模块")
                    except Exception:
                        print(f"    → 警告: 无法验证 Go 模块状态")
        else:
            print("  ✗ Go: 未安装")
            self.missing.append(('Go', '需要 Go 1.22+'))
    
    def check_python_dependencies(self):
        """Check Python and Python packages./检查 Python 和 Python 包。"""
        print("\n检查 Python 依赖...")
        
        python_ok, python_ver = self.check_executable('python3', '--version')
        if python_ok:
            print(f"  ✓ Python3: {python_ver}")
            self.installed.append(('Python3', python_ver))
            
            # Check Python services
            python_services = ['services/agent-bridge']
            for service_dir in python_services:
                service_path = REPO_ROOT / service_dir
                pyproject = service_path / 'pyproject.toml'
                if pyproject.exists():
                    print(f"  ✓ {service_dir}: pyproject.toml 存在")
                    venv_path = service_path / '.venv'
                    if venv_path.exists():
                        print(f"    → 虚拟环境存在: {venv_path}")
                        pip_exec = venv_path / 'bin' / 'pip'
                        if pip_exec.exists():
                            try:
                                result = subprocess.run(
                                    [str(pip_exec), 'list'],
                                    capture_output=True,
                                    text=True,
                                    timeout=10,
                                )
                                if result.returncode == 0:
                                    # Count installed packages (skip header lines)
                                    lines = [l for l in result.stdout.strip().split('\n') if l and not l.startswith('-')]
                                    deps_count = max(0, len(lines) - 2)  # Subtract header
                                    print(f"    → 已安装 {deps_count} 个 Python 包")
                            except Exception:
                                print(f"    → 警告: 无法验证 Python 包状态")
                    else:
                        print(f"    → 警告: 虚拟环境不存在，需要创建")
                        self.warnings.append(f'{service_dir} 虚拟环境不存在')
        else:
            print("  ✗ Python3: 未安装")
            self.missing.append(('Python3', '需要 Python 3.10+'))
    
    def check_system_dependencies(self):
        """Check system-level dependencies./检查系统级依赖。"""
        print("\n检查系统依赖...")
        
        # PostgreSQL
        pg_ok, pg_ver = self.check_executable('psql', '--version')
        if pg_ok:
            print(f"  ✓ PostgreSQL client: {pg_ver}")
            self.installed.append(('PostgreSQL client', pg_ver))
        else:
            print("  ✗ PostgreSQL client: 未安装（可选，用于数据库管理）")
            self.warnings.append('PostgreSQL client 未安装（可选）')
        
        # Redis
        redis_ok, redis_ver = self.check_executable('redis-cli', '--version')
        if redis_ok:
            print(f"  ✓ Redis client: {redis_ver}")
            self.installed.append(('Redis client', redis_ver))
        else:
            print("  ✗ Redis client: 未安装（可选，用于 Redis 管理）")
            self.warnings.append('Redis client 未安装（可选）')
        
        # Nginx - Always required for gateway functionality
        # Nginx - 网关功能必需
        nginx_ok, nginx_ver = self.check_executable('nginx', '-v')
        
        if nginx_ok:
            print(f"  ✓ Nginx: {nginx_ver}")
            self.installed.append(('Nginx', nginx_ver))
        else:
            print("  ✗ Nginx: 未安装（必需，部署时会自动安装）")
            # Don't add to missing list since deployment script will install it
            self.warnings.append('Nginx 未安装（部署脚本会自动安装，Linux 通过 apt-get，macOS 通过 Homebrew）')
        
        # Docker (optional)
        docker_ok, docker_ver = self.check_executable('docker', '--version')
        if docker_ok:
            print(f"  ✓ Docker: {docker_ver}")
            self.installed.append(('Docker', docker_ver))
        else:
            print("  ✗ Docker: 未安装（可选，用于容器化部署）")
            self.warnings.append('Docker 未安装（可选）')
    
    def check_file_dependencies(self):
        """Check dependency files exist./检查依赖文件是否存在。"""
        print("\n检查依赖配置文件...")
        
        files_to_check = [
            ('package.json', '前端依赖配置'),
            ('pnpm-lock.yaml', '前端依赖锁定文件'),
            ('services/site-auth/go.mod', 'Go 服务依赖配置'),
            ('services/agent-bridge/pyproject.toml', 'Python 服务依赖配置'),
        ]
        
        for file_path, description in files_to_check:
            full_path = REPO_ROOT / file_path
            if full_path.exists():
                print(f"  ✓ {description}: {file_path}")
            else:
                print(f"  ✗ {description}: {file_path} 不存在")
                self.warnings.append(f'{description} 文件不存在')
    
    def run(self):
        """Run all dependency checks./运行所有依赖检查。"""
        print("=== 依赖检查报告 ===\n")
        
        self.check_node_dependencies()
        self.check_go_dependencies()
        self.check_python_dependencies()
        self.check_system_dependencies()
        self.check_file_dependencies()
        
        print("\n" + "=" * 50)
        print("检查结果汇总:")
        print(f"  ✓ 已安装: {len(self.installed)} 项")
        if self.missing:
            print(f"  ✗ 缺失: {len(self.missing)} 项")
            for name, requirement in self.missing:
                print(f"    - {name}: {requirement}")
        if self.warnings:
            print(f"  ⚠ 警告: {len(self.warnings)} 项")
            for warning in self.warnings:
                print(f"    - {warning}")
        
        if self.missing:
            print("\n建议执行以下命令安装缺失的依赖:")
            print("  python3 scripts/otf.py install")
            return 1
        else:
            print("\n✅ 所有必需依赖已安装！")
            return 0


def main():
    """Main entry point./主入口。"""
    checker = DependencyChecker()
    sys.exit(checker.run())


if __name__ == '__main__':
    main()
