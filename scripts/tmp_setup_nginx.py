import sys
import os
sys.path.append(os.getcwd())
from scripts.config_loader import load_deploy_config
from scripts.nginx_setup import setup_nginx_config

config = load_deploy_config('deploy_config.toml')
# Force macOS path for Homebrew on Apple Silicon
config._data.setdefault('nginx', {})
config._data['nginx']['config_dir_macos'] = '/opt/homebrew/etc/nginx/servers/orbitaskflow.conf'

try:
    setup_nginx_config(config, os.getcwd(), is_linux=False)
except Exception as e:
    print("Error:", e)
