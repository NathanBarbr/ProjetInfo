"""
Minimal .env loader for the backend.

For sensitive runtime settings like API keys, the backend can also read
backend/.env directly to avoid stale values from the parent process.
"""

from __future__ import annotations

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_ENV_FILE = BACKEND_DIR / ".env"


def read_backend_env(env_file: Path | None = None) -> dict[str, str]:
    path = env_file or DEFAULT_ENV_FILE
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def load_backend_env(env_file: Path | None = None) -> None:
    for key, value in read_backend_env(env_file).items():
        os.environ.setdefault(key, value)


def get_backend_env(key: str, default: str = "", prefer_env_file: bool = True) -> str:
    if prefer_env_file:
        env_values = read_backend_env()
        if key in env_values:
            return env_values[key]
    return os.getenv(key, default)
