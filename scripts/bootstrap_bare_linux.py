#!/usr/bin/env python3
"""Bootstrap Orbitaskflow on a bare-bones Linux host.

This script installs all language runtimes and CLI tools that the project
expects to find before running ``deploy_linux.py``.  It targets Debian/Ubuntu
systems using ``apt`` and is safe to re-run: already installed tools are left
untouched, while missing ones are provisioned automatically.
"""

import argparse
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union
from urllib.request import urlretrieve

# Versions for language runtimes / CLIs.
NODE_MAJOR_REQUIRED = 20
GO_VERSION = "1.22.5"
MIGRATE_VERSION = "v4.16.2"

APT_UPDATED = False


class BootstrapError(RuntimeError):
    """Raised when the bootstrap process cannot continue."""


def run(
    cmd: Union[Sequence[str], str],
    *,
    check: bool = True,
    shell: bool = False,
    cwd: Optional[str] = None,
    env: Optional[Dict[str, str]] = None,
) -> subprocess.CompletedProcess:
    """Execute a command and stream its output."""

    if isinstance(cmd, (list, tuple)):
        printable = " ".join(str(part) for part in cmd)
    else:
        printable = str(cmd)
    print(f"$ {printable}")
    result = subprocess.run(cmd, check=check, cwd=cwd, text=True, shell=shell, env=env)
    return result


def check_root() -> None:
    if os.geteuid() != 0:
        raise BootstrapError("此脚本需要 root 权限，请使用 sudo 运行。")


def ensure_apt_packages(packages: Iterable[str]) -> None:
    missing: List[str] = []
    for pkg in packages:
        result = subprocess.run(["dpkg", "-s", pkg], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode != 0:
            missing.append(pkg)
    if not missing:
        print("[OK] 必需的 apt 软件包已就绪。")
        return

    apt_update()
    install_cmd = [
        "apt-get",
        "install",
        "-y",
        *missing,
    ]
    env = os.environ.copy()
    env.setdefault("DEBIAN_FRONTEND", "noninteractive")
    print(f"[INFO] 安装 apt 软件包: {', '.join(missing)}")
    run(install_cmd, check=True, env=env)


def apt_update() -> None:
    global APT_UPDATED
    if APT_UPDATED:
        return
    print("[INFO] 运行 apt-get update ...")
    env = os.environ.copy()
    env.setdefault("DEBIAN_FRONTEND", "noninteractive")
    run(["apt-get", "update"], check=True, env=env)
    APT_UPDATED = True


def parse_semver(version: str) -> Tuple[int, int, int]:
    match = re.findall(r"\d+", version)
    parts = [int(p) for p in match[:3]]
    while len(parts) < 3:
        parts.append(0)
    return parts[0], parts[1], parts[2]


def ensure_node() -> None:
    """Install Node.js >= 20 using NodeSource when necessary."""

    try:
        completed = subprocess.check_output(["node", "-v"], text=True).strip()
        major, _, _ = parse_semver(completed)
        if major >= NODE_MAJOR_REQUIRED:
            print(f"[OK] Node.js {completed} 已满足要求。")
            return
        print(f"[WARN] 检测到 Node.js {completed} 版本过低，将更新至 {NODE_MAJOR_REQUIRED}+.")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("[INFO] 未检测到 Node.js，准备安装 Node 20 LTS。")

    ensure_apt_packages(["ca-certificates", "curl", "gnupg", "software-properties-common"])
    # NodeSource 安装脚本负责配置源并安装 nodejs 包。
    run(
        [
            "bash",
            "-c",
            "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        ],
        check=True,
    )
    apt_update()
    run(["apt-get", "install", "-y", "nodejs"], check=True)
    print("[OK] Node.js 安装完成。")

    # Enable pnpm via corepack if available.
    corepack_path = shutil.which("corepack")
    if corepack_path:
        run([corepack_path, "enable"])
        run([corepack_path, "prepare", "pnpm@9", "--activate"], check=True)
        print("[OK] pnpm@9 已启用。")
    else:
        print("[WARN] 未检测到 corepack，请手动安装 pnpm@9。")


def ensure_go() -> None:
    """Install Go runtime if missing or outdated."""

    needs_install = True
    try:
        output = subprocess.check_output(["go", "version"], text=True).strip()
        match = re.search(r"go(\d+\.\d+(?:\.\d+)?)", output)
        if match:
            current_version = parse_semver(match.group(1))
            required_version = parse_semver(GO_VERSION)
            if current_version >= required_version:
                print(f"[OK] {output} 已满足要求。")
                needs_install = False
            else:
                print(f"[WARN] 检测到 {output} 版本过低，将升级至 Go {GO_VERSION}。");
        else:
            print("[WARN] 无法解析 Go 版本，准备重新安装。")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("[INFO] 未检测到 Go，将安装 Go {0}。".format(GO_VERSION))

    if not needs_install:
        return

    arch = platform.machine().lower()
    if arch in ("x86_64", "amd64"):
        go_arch = "amd64"
    elif arch in ("aarch64", "arm64"):
        go_arch = "arm64"
    else:
        raise BootstrapError(f"暂不支持的架构: {arch}")

    download_url = f"https://go.dev/dl/go{GO_VERSION}.linux-{go_arch}.tar.gz"
    print(f"[INFO] 正在下载 Go {GO_VERSION} ({go_arch}) ...")
    with tempfile.TemporaryDirectory() as tmpdir:
        archive_path = Path(tmpdir) / "go.tar.gz"
        urlretrieve(download_url, archive_path)
        target_dir = Path("/usr/local/go")
        if target_dir.exists():
            print("[INFO] 移除已有的 /usr/local/go ...")
            shutil.rmtree(target_dir)
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(path="/usr/local")
    print("[OK] Go 安装完成。")

    ensure_profile_snippet("/usr/local/go/bin")


def ensure_profile_snippet(path_entry: str) -> None:
    profile_path = Path("/etc/profile.d/work_agent_env.sh")
    line = f"export PATH=\"{path_entry}:$PATH\"\n"
    if profile_path.exists():
        existing = profile_path.read_text()
        if line in existing:
            return
        with profile_path.open("a", encoding="utf-8") as fh:
            fh.write(line)
    else:
        with profile_path.open("w", encoding="utf-8") as fh:
            fh.write("# Added by Orbitaskflow bootstrap script\n")
            fh.write(line)
    print(f"[OK] 已将 {path_entry} 添加到系统 PATH。")


def ensure_python() -> None:
    packages = ["python3", "python3-pip", "python3-venv"]
    ensure_apt_packages(packages)
    run(["python3", "-m", "pip", "install", "--upgrade", "pip"], check=True)
    print("[OK] Python3 运行时与 pip 已准备就绪。")


def ensure_git_and_build_tools() -> None:
    ensure_apt_packages(
        [
            "git",
            "build-essential",
            "pkg-config",
            "libssl-dev",
            "unzip",
            "curl",
        ]
    )


def ensure_migrate_cli() -> None:
    try:
        output = subprocess.check_output(["migrate", "-version"], text=True).strip()
        expected = MIGRATE_VERSION.lstrip("v")
        detected = output.splitlines()[0].strip()
        if parse_semver(detected) >= parse_semver(expected):
            print(f"[OK] golang-migrate CLI {detected} 已满足要求。")
            return
        else:
            print(f"[WARN] 检测到 migrate {detected} 版本过低，将重新安装。")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("[INFO] 未检测到 golang-migrate CLI，将安装最新版本。")

    arch = platform.machine().lower()
    if arch in ("x86_64", "amd64"):
        asset_arch = "linux-amd64"
    elif arch in ("aarch64", "arm64"):
        asset_arch = "linux-arm64"
    else:
        raise BootstrapError(f"暂不支持的架构: {arch}")

    base_name = f"migrate.{asset_arch}.{MIGRATE_VERSION}.tar.gz"
    url = f"https://github.com/golang-migrate/migrate/releases/download/{MIGRATE_VERSION}/{base_name}"
    print(f"[INFO] 正在下载 golang-migrate {MIGRATE_VERSION} ...")
    with tempfile.TemporaryDirectory() as tmpdir:
        archive_path = Path(tmpdir) / base_name
        urlretrieve(url, archive_path)
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(path=tmpdir)
        binary_path = Path(tmpdir) / "migrate"
        if not binary_path.exists():
            raise BootstrapError("下载的 migrate 压缩包不包含可执行文件。")
        target_path = Path("/usr/local/bin/migrate")
        shutil.copy2(binary_path, target_path)
        target_path.chmod(0o755)
    print("[OK] golang-migrate CLI 安装完成。")


def run_otf_install(repo_path: Path) -> None:
    otf_script = repo_path / "scripts" / "otf.py"
    if not otf_script.exists():
        raise BootstrapError(f"未找到 {otf_script}，请确认 --repo 参数指向仓库根目录。")

    cmd = ["python3", str(otf_script), "install"]
    sudo_user = os.environ.get("SUDO_USER")
    if sudo_user and sudo_user != "root":
        print(f"[INFO] 以 {sudo_user} 用户执行 otf.py install ...")
        run(["sudo", "-u", sudo_user, "-H", *cmd], check=True, cwd=str(repo_path))
    else:
        run(cmd, check=True, cwd=str(repo_path))
    print("[OK] 项目依赖已通过 otf.py 安装。")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="在全新 Linux 服务器上初始化 Orbitaskflow 运行环境。")
    parser.add_argument(
        "--repo",
        type=Path,
        default=None,
        help="仓库根目录路径（提供后将自动执行 scripts/otf.py install）",
    )
    parser.add_argument(
        "--skip-project-install",
        action="store_true",
        help="仅安装系统依赖，不执行 scripts/otf.py install。",
    )
    args = parser.parse_args(argv)

    try:
        check_root()
        ensure_git_and_build_tools()
        ensure_python()
        ensure_node()
        ensure_go()
        ensure_migrate_cli()
        ensure_profile_snippet("/usr/local/bin")
        if args.repo and not args.skip_project_install:
            run_otf_install(args.repo.resolve())
        print("\n[完成] 裸机初始化脚本执行完毕。请重新登录或 source /etc/profile.d/work_agent_env.sh 以刷新 PATH。")
        return 0
    except BootstrapError as exc:
        print(f"[错误] {exc}")
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"[错误] 命令执行失败: {exc}")
        return exc.returncode or 1


if __name__ == "__main__":
    sys.exit(main())
