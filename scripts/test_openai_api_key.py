#!/usr/bin/env python3
"""
Minimal OpenAI API key checker.

Usage:
  python scripts/test_openai_api_key.py
  python scripts/test_openai_api_key.py --key sk-...
  python scripts/test_openai_api_key.py --model gpt-4o-mini --chat
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_PATH = REPO_ROOT / "backend" / ".env"


def mask_key(value: str) -> str:
    if len(value) <= 10:
        return "*" * len(value)
    return f"{value[:6]}...{value[-4:]}"


def do_request(api_key: str, path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    request = Request(
        url=f"{DEFAULT_BASE_URL}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    with urlopen(request, timeout=30) as response:
        data = response.read().decode("utf-8")
        return response.status, json.loads(data) if data else {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test a raw OpenAI API key.")
    parser.add_argument("--key", help="API key to test. Defaults to OPENAI_API_KEY.")
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_PATH),
        help=f".env file to read first. Default: {DEFAULT_ENV_PATH}",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Model to use for --chat. Default: {DEFAULT_MODEL}")
    parser.add_argument(
        "--chat",
        action="store_true",
        help="Also test a real chat completion after the basic auth check.",
    )
    return parser.parse_args()


def load_env_file(env_path: str) -> dict[str, str]:
    path = Path(env_path)
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        values[key] = value
    return values


def main() -> int:
    args = parse_args()
    env_values = load_env_file(args.env_file)
    api_key = (args.key or env_values.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY", "")).strip()

    if not api_key:
        print("ERROR: no API key provided. Set OPENAI_API_KEY or use --key.", file=sys.stderr)
        return 2

    print(f"Env file: {args.env_file}")
    print(f"Env file found: {'yes' if Path(args.env_file).exists() else 'no'}")
    print(f"Base URL: {DEFAULT_BASE_URL}")
    print(f"Key: {mask_key(api_key)}")

    try:
        status, payload = do_request(api_key, "/models")
        model_count = len(payload.get("data", [])) if isinstance(payload, dict) else 0
        print(f"OK: auth check passed with HTTP {status}. Visible models: {model_count}")
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP ERROR {exc.code} during auth check")
        print(raw)
        return 1
    except URLError as exc:
        print(f"NETWORK ERROR: {exc}")
        return 1
    except Exception as exc:
        print(f"UNEXPECTED ERROR: {exc}")
        return 1

    if not args.chat:
        return 0

    chat_payload = {
        "model": args.model,
        "messages": [
            {"role": "user", "content": "Reply with exactly: ok"}
        ],
        "max_tokens": 5,
    }

    try:
        status, payload = do_request(api_key, "/chat/completions", method="POST", payload=chat_payload)
        content = (
            payload.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        print(f"OK: chat completion passed with HTTP {status}. Response: {content!r}")
        return 0
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP ERROR {exc.code} during chat completion test")
        print(raw)
        return 1
    except URLError as exc:
        print(f"NETWORK ERROR during chat completion test: {exc}")
        return 1
    except Exception as exc:
        print(f"UNEXPECTED ERROR during chat completion test: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
