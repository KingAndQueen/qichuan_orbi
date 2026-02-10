#!/usr/bin/env bash
set -euo pipefail

trap 'echo "\n[ERROR] 依赖安装失败，请检查网络或配置 PIP_INDEX_URL/PIP_TRUSTED_HOST 后重试。" >&2' ERR

# Resolve repository root and service directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/agent-bridge"
VENV_DIR="${AGENT_BRIDGE_VENV:-$SERVICE_DIR/.venv}"

if [ ! -d "$SERVICE_DIR" ]; then
  echo "\n[ERROR] 未找到 Agent Bridge 服务目录：$SERVICE_DIR" >&2
  exit 1
fi

python_bin="${PYTHON_BIN:-python}"
if ! command -v "$python_bin" >/dev/null 2>&1; then
  echo "\n[ERROR] 未找到 python3，请先安装 Python 3.10+。" >&2
  exit 1
fi

echo "\n[INFO] 使用虚拟环境目录：$VENV_DIR"
"$python_bin" -m venv "$VENV_DIR"
# shellcheck disable=SC1090xq
source "$VENV_DIR/bin/activate"

pip install --upgrade pip
pip install -e "${SERVICE_DIR}[dev]"

trap - ERR

echo "\n[INFO] 安装完成，可使用以下命令激活虚拟环境："
echo "source $VENV_DIR/bin/activate"
