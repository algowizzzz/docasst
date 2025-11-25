"""Configuration management."""

import os
from pathlib import Path
from typing import Any, Dict

import yaml
from dotenv import load_dotenv

# Load .env file if it exists
env_file = Path(__file__).parent.parent / '.env'
if env_file.exists():
    load_dotenv(env_file)


def load_config() -> Dict[str, Any]:
    """Load configuration from YAML file and environment variables."""
    config_file = Path(__file__).parent.parent / 'config' / 'config.yaml'
    
    # Load from YAML
    if config_file.exists():
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f) or {}
    else:
        config = {}
    
    # Override with environment variables
    config['SECRET_KEY'] = os.getenv('SECRET_KEY', config.get('secret_key', 'dev-secret-key-change-in-production'))
    config['ANTHROPIC_API_KEY'] = os.getenv('ANTHROPIC_API_KEY', config.get('anthropic_api_key', ''))
    config['DATA_DIR'] = os.getenv('DATA_DIR', config.get('data_dir', 'data/documents'))
    config['UPLOAD_DIR'] = os.getenv('UPLOAD_DIR', config.get('upload_dir', 'data/uploads'))
    config['MAX_UPLOAD_SIZE'] = int(os.getenv('MAX_UPLOAD_SIZE', config.get('max_upload_size', 50 * 1024 * 1024)))
    config['DEBUG'] = os.getenv('DEBUG', 'false').lower() == 'true' or config.get('debug', False)
    
    return config


def get_config() -> Dict[str, Any]:
    """Get current configuration."""
    return load_config()
