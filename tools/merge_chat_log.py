#!/usr/bin/env python3
"""Merge an incremental WhatsApp export into the canonical chat log.

The canonical log is kept intact. Only messages after the newest shared message
(or, when there is no shared message, after the canonical log's latest timestamp)
are appended. Exact duplicate message blocks are skipped.
"""

from __future__ import annotations

import argparse
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path

HEADER_RE = re.compile(
    r"^\s*(\d{1,2}/\d{1,2}/\d{2,4}),\s*"
    r"(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+"
)


def read_blocks(path: Path) -> list[list[str]]:
    text = path.read_text(encoding="utf-8-sig")
    lines = text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    blocks: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        if HEADER_RE.match(line):
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            current.append(line)

    if current:
        blocks.append(current)
    if not blocks:
        raise ValueError(f"No WhatsApp message headers found in {path}")
    return blocks


def block_key(block: list[str]) -> tuple[str, ...]:
    # WhatsApp exports contain empty messages with incidental trailing spaces.
    # Ignore those spaces for matching, but preserve the original base log.
    return tuple(line.rstrip() for line in block)


def block_timestamp(block: list[str]) -> datetime | None:
    match = HEADER_RE.match(block[0])
    if not match:
        return None
    date_text, time_text = match.groups()
    day, month, raw_year = (int(part) for part in date_text.split("/"))
    year = raw_year + 2000 if raw_year < 100 else raw_year
    time_parts = [int(part) for part in time_text.split(":")]
    hour, minute = time_parts[:2]
    second = time_parts[2] if len(time_parts) == 3 else 0
    try:
        return datetime(year, month, day, hour, minute, second)
    except ValueError:
        return None


def find_append_start(base: list[list[str]], incoming: list[list[str]]) -> int | None:
    incoming_positions: dict[tuple[str, ...], list[int]] = {}
    for index, block in enumerate(incoming):
        incoming_positions.setdefault(block_key(block), []).append(index)

    for block in reversed(base):
        positions = incoming_positions.get(block_key(block))
        if positions:
            # If the export contains the overlap more than once, continue after
            # its last occurrence so the same history is never appended twice.
            return positions[-1] + 1
    return None


def merge_blocks(base: list[list[str]], incoming: list[list[str]]) -> tuple[list[list[str]], int, int]:
    base_keys = {block_key(block) for block in base}
    append_start = find_append_start(base, incoming)

    if append_start is not None:
        candidates = incoming[append_start:]
    else:
        timestamps = [timestamp for timestamp in map(block_timestamp, base) if timestamp]
        latest = max(timestamps) if timestamps else None
        candidates = []
        for block in incoming:
            timestamp = block_timestamp(block)
            if latest is None or (
                timestamp and (timestamp > latest or (timestamp == latest and block_key(block) not in base_keys))
            ):
                candidates.append(block)

    merged = list(base)
    seen = set(base_keys)
    appended = 0
    skipped = 0
    for block in candidates:
        key = block_key(block)
        if key in seen:
            skipped += 1
            continue
        merged.append(block)
        seen.add(key)
        appended += 1
    return merged, appended, skipped


def serialize(blocks: list[list[str]]) -> bytes:
    return ("\n".join("\n".join(block) for block in blocks) + "\n").encode("utf-8")


def write_atomically(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False) as handle:
            temporary_path = handle.name
            handle.write(content)
        os.replace(temporary_path, path)
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path, help="canonical chat log to preserve")
    parser.add_argument("incoming", type=Path, help="new WhatsApp export to merge")
    parser.add_argument("-o", "--output", type=Path, help="destination; defaults to base")
    args = parser.parse_args()

    base = read_blocks(args.base)
    incoming = read_blocks(args.incoming)
    merged, appended, skipped = merge_blocks(base, incoming)
    output = args.output or args.base
    write_atomically(output, serialize(merged))
    print(f"Preserved {len(base)} messages; appended {appended}; skipped {skipped} duplicates; wrote {output}")


if __name__ == "__main__":
    main()
