#!/usr/bin/env python3
"""Hourly scheduler for the twice-daily news refresh."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "data" / "scheduler-state.json"
FETCH_SCRIPT = ROOT / "scripts" / "fetch_news.py"


def refresh_hours() -> list[int]:
    raw = os.getenv("NEWS_REFRESH_HOURS", "7,13,19")
    hours: list[int] = []
    for part in raw.split(","):
        value = part.strip()
        if not value:
            continue
        hour = int(value)
        if hour < 0 or hour > 23:
            raise ValueError("NEWS_REFRESH_HOURS must contain hours between 0 and 23.")
        hours.append(hour)
    return sorted(set(hours))


def check_interval_seconds() -> int:
    minutes = int(os.getenv("NEWS_CHECK_EVERY_MINUTES", "60"))
    return max(5, minutes) * 60


def slot_for_hour(hour: int, hours: list[int]) -> str:
    if not hours or hour == hours[0]:
        return "morning"
    if len(hours) > 1 and hour == hours[1]:
        return "evening"
    return "late"


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {"runs": []}
    with STATE_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.open("w", encoding="utf-8") as file:
        json.dump(state, file, ensure_ascii=False, indent=2)
        file.write("\n")


def already_ran(state: dict, key: str) -> bool:
    return key in state.get("runs", [])


def mark_ran(state: dict, key: str) -> None:
    runs = [item for item in state.get("runs", []) if item[:10] >= key[:10]]
    runs.append(key)
    state["runs"] = sorted(set(runs))[-20:]
    save_state(state)


def run_fetch(slot: str) -> int:
    command = [sys.executable, str(FETCH_SCRIPT), "--slot", slot]
    completed = subprocess.run(command, cwd=ROOT)
    return completed.returncode


def tick() -> None:
    hours = refresh_hours()
    current = datetime.now()
    if current.hour not in hours:
        print(f"{current:%Y-%m-%d %H:%M} - no refresh due")
        return

    key = f"{current:%Y-%m-%d}-{current.hour:02d}"
    state = load_state()
    if already_ran(state, key):
        print(f"{current:%Y-%m-%d %H:%M} - this refresh window already ran")
        return

    slot = slot_for_hour(current.hour, hours)
    print(f"{current:%Y-%m-%d %H:%M} - starting refresh: {slot}")
    result = run_fetch(slot)
    if result == 0:
        mark_ran(state, key)
        print(f"{current:%Y-%m-%d %H:%M} - refresh complete")
    else:
        print(f"{current:%Y-%m-%d %H:%M} - refresh failed: {result}", file=sys.stderr)


def main() -> int:
    once = "--once" in sys.argv
    if once:
        tick()
        return 0

    interval = check_interval_seconds()
    print(f"DailySpark scheduler running. Refresh hours: {refresh_hours()}, check interval: {interval // 60} minutes.")
    while True:
        tick()
        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main())
